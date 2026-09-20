-- Screenshots, scriptable from the command line.
--
-- Every pixel here is drawn rather than loaded, and every editor surface is
-- generated from the schema, so "does this look right?" can only be answered
-- by looking. An agent working in a worktree cannot look, so it needs a way to
-- ask for a PNG and get one back at a known path:
--
--     love . --capture captures/hud.png --at 8 --seed 7
--
-- The run settles for a few frames so the window and the GL context are real,
-- fast-forwards the simulation in fixed 1/60 steps -- deterministic given a
-- seed, and far quicker than waiting in real time -- applies whatever the
-- flags asked for, draws one frame, writes the PNG into the checkout and
-- quits.
--
-- The flags deliberately bottom out in things that already exist: --set takes
-- any schema key, --do takes any registered editor action, --press takes any
-- input action. There is no list of capturable states to keep in sync.

local fs = require("lib.fs")

local capture = {}

capture.dir = "captures"

local FIXED_DT = 1 / 60
local SETTLE_FRAMES = 3     -- frames drawn before the first shot is asked for
local DEFAULT_AT = 2        -- simulated seconds to fast-forward through

local plan = nil            -- parsed command line, nil when none was asked for
local phase = "idle"        -- settle -> warm -> ready -> shooting -> done
local settled = 0
local queue = {}            -- paths waiting for a frame
local inflight = 0          -- shots handed to LÖVE, not yet written

capture.status = nil        -- last human-readable result

-- --------------------------------------------------------------- parsing

local MODES = { run = true, zoo = true, range = true, bench = true }

local function needsValue(flag, value)
  if value == nil or value:sub(1, 2) == "--" then
    return nil, flag .. " needs a value"
  end
  return value
end

--- Parse LÖVE's `arg` table. Returns a plan, or nil plus an error. Returns
-- nil with no error when --capture was not asked for, which is the normal
-- case: this is a pure function so the tests can cover it without LÖVE.
function capture.parse(args)
  local p = {
    at = DEFAULT_AT, sets = {}, actions = {}, presses = {}, hold = false,
  }
  local i = 1
  while args and args[i] do
    local a = args[i]
    local function value()
      local v, err = needsValue(a, args[i + 1])
      i = i + 1
      return v, err
    end

    if a == "--capture" then
      local v, err = value()
      if not v then return nil, err end
      p.path = v
    elseif a == "--at" then
      local v, err = value()
      if not v then return nil, err end
      local n = tonumber(v)
      if not n or n < 0 then return nil, "--at needs a number of seconds" end
      p.at = n
    elseif a == "--seed" then
      local v, err = value()
      if not v then return nil, err end
      local n = tonumber(v)
      if not n then return nil, "--seed needs a number" end
      p.seed = math.floor(n)
    elseif a == "--mode" then
      local v, err = value()
      if not v then return nil, err end
      if not MODES[v] then return nil, "--mode must be run, zoo or range" end
      p.mode = v
    elseif a == "--profile" then
      local v, err = value()
      if not v then return nil, err end
      p.profile = v
    elseif a == "--set" then
      local v, err = value()
      if not v then return nil, err end
      local key, raw = v:match("^([^=]+)=(.*)$")
      if not key then return nil, "--set needs key=value, got '" .. v .. "'" end
      p.sets[#p.sets + 1] = { key = key, raw = raw }
    elseif a == "--do" then
      local v, err = value()
      if not v then return nil, err end
      p.actions[#p.actions + 1] = v
    elseif a == "--press" then
      local v, err = value()
      if not v then return nil, err end
      p.presses[#p.presses + 1] = v
    elseif a == "--editor" then
      p.editor = true
      local next = args[i + 1]
      if next and next:sub(1, 2) ~= "--" then
        p.editorPage = next
        i = i + 1
      end
    elseif a == "--overlays" then
      p.overlays = true
    elseif a == "--perf" then
      p.perf = true
    elseif a == "--hold" then
      p.hold = true
    end
    i = i + 1
  end

  if not p.path then
    -- Catch the flags that only mean something alongside --capture rather
    -- than silently ignoring a command line that asked for a screenshot.
    for _, flag in ipairs({ "--at", "--seed", "--mode", "--set", "--do",
        "--press", "--editor", "--overlays", "--perf", "--hold" }) do
      for _, a in ipairs(args or {}) do
        if a == flag then
          return nil, flag .. " only means something with --capture"
        end
      end
    end
    return nil
  end

  if not p.path:match("%.png$") then p.path = p.path .. ".png" end
  if not p.path:match("[/\\]") then p.path = capture.dir .. "/" .. p.path end
  return p
end

--- Turn a --set string into a value of the type the schema declares. Strings
-- are the only thing a command line can carry, so bools and colours need
-- spelling out; everything else `schema.coerce` already handles.
function capture.coerceSet(entry, raw)
  if not entry then return nil, "unknown setting" end
  if entry.type == "bool" then
    if raw == "true" or raw == "1" or raw == "yes" then return true end
    if raw == "false" or raw == "0" or raw == "no" then return false end
    return nil, "not a boolean"
  elseif entry.type == "color" then
    local out = {}
    for part in raw:gmatch("[^,]+") do out[#out + 1] = tonumber(part) end
    if #out < 3 then return nil, "colour needs r,g,b[,a]" end
    return out
  end
  return raw
end

-- ------------------------------------------------------------ the request

local function note(text)
  capture.status = text
  print("capture: " .. text)
end

--- Ask for a screenshot on the next drawn frame. Used by the F7 key as well
-- as by the command line.
function capture.shot(path)
  if not path then
    path = string.format("%s/shot-%s.png", capture.dir, os.date("%Y%m%d-%H%M%S"))
  end
  queue[#queue + 1] = path
  return path
end

function capture.active()
  return plan ~= nil and phase ~= "done"
end

--- True while the world must not move. A capture is only reproducible if the
-- only time that passes is the fixed-step warm-up: the frames spent settling
-- the window, and the frame the shot is taken on, each run at whatever dt the
-- machine happened to hand them. So the simulation is frozen for the whole
-- run, and the warm-up is the only thing that advances it.
function capture.frozen()
  return plan ~= nil and phase ~= "done"
end

-- ------------------------------------------------------------------ setup

--- Apply everything the plan asked for that can be applied at load time.
-- `ctx` carries the pieces capture is not allowed to require itself: the game
-- module, and the framework modules the launcher already holds.
function capture.begin(args, ctx)
  local parsed, err = capture.parse(args)
  if err then
    print("capture: " .. err)
    love.event.quit(1)
    return
  end
  if not parsed then return end
  plan = parsed
  phase = "settle"

  local config, schema = ctx.config, ctx.schema
  local game = ctx.game

  -- Nothing in the draw path had ever been rendered before this existed, so a
  -- capture hitting an error is a normal outcome. LÖVE's error screen would
  -- sit there until something killed the process; an unattended run wants the
  -- error on stderr and a non-zero exit instead.
  function love.errorhandler(message)
    io.stderr:write("capture: crashed: " .. tostring(message) .. "\n",
      debug.traceback("", 2), "\n")
    return function() return 1 end
  end

  -- A capture run must not touch the repo beyond its PNG. --set would
  -- otherwise dirty the active profile and autosave would write it out.
  config.set("profiles.autosave", false, true)

  if plan.profile then
    local ok = ctx.profiles.load(plan.profile)
    note(ok and ("profile " .. plan.profile) or
      ("no such profile: " .. plan.profile))
  end

  for _, s in ipairs(plan.sets) do
    local entry = schema.get(s.key)
    local value, reason = capture.coerceSet(entry, s.raw)
    if value == nil then
      note("cannot set " .. s.key .. ": " .. tostring(reason))
    else
      local ok, why = config.set(s.key, value, true)
      if not ok and why then note("cannot set " .. s.key .. ": " .. why) end
    end
  end

  if plan.seed then
    -- The run has its own generator, but the camera shake and the inspection
    -- levels draw on LÖVE's. Both have to be pinned or the same command line
    -- produces a slightly different PNG each time.
    love.math.setRandomSeed(plan.seed)
    if game.restart then game.restart(plan.seed) end
  end
  if plan.mode and game.setMode then game.setMode(plan.mode) end
  if plan.overlays then ctx.debugdraw.setAll(true) end
  if plan.perf then config.set("perf.show", true, true) end
end

--- Run the editor actions the plan named, by the label the editor shows.
local function runActions(editor)
  for _, label in ipairs(plan.actions) do
    local found = false
    for _, sections in pairs(editor.actions) do
      for _, list in pairs(sections) do
        for _, action in ipairs(list) do
          if action.label == label then
            action.fn()
            found = true
          end
        end
      end
    end
    if not found then note("no editor action called '" .. label .. "'") end
  end
end

-- ----------------------------------------------------------------- frames

--- Fast-forward the simulation, then apply the presses and the editor state
-- the plan asked for. Called from love.update; does its work once, on the
-- first update after the window has settled, and is a no-op otherwise.
-- `step` advances the game by a fixed dt.
function capture.advance(step, ctx)
  if phase ~= "warm" then return false end
  phase = "ready"

  for _ = 1, math.floor(plan.at * 60 + 0.5) do step(FIXED_DT) end

  runActions(ctx.editor)

  -- One step per press: two --press next cycles twice, where pressing both
  -- in the same frame would collapse into one.
  for _, action in ipairs(plan.presses) do
    ctx.input.press(action)
    step(FIXED_DT)
  end

  if plan.editor then
    ctx.editor.toggle()
    if plan.editorPage then
      local names = ctx.editor.pageNames()
      local ok = false
      for _, name in ipairs(names) do
        if name == plan.editorPage then ok = true break end
      end
      if ok then
        ctx.editor.page = plan.editorPage
      else
        note("no editor page called '" .. plan.editorPage .. "', pages are: "
          .. table.concat(names, ", "))
      end
    end
  end
  return true
end

local function write(path, imageData)
  local ok, encoded = pcall(imageData.encode, imageData, "png")
  if not ok then
    note("could not encode " .. path .. ": " .. tostring(encoded))
    return
  end
  local written, where = fs.write(path, encoded:getString())
  if written then
    -- The location matters: "save" means the io write failed and the PNG
    -- landed in the LÖVE save directory instead of the checkout.
    note(where == "repo" and ("wrote " .. path)
      or ("wrote " .. path .. " to the save directory (" ..
        love.filesystem.getSaveDirectory() .. ")"))
  else
    note("could not write " .. path .. ": " .. tostring(where))
  end
end

--- Called at the end of love.draw: this is the point at which a frame is
-- finished, so it is the point at which a screenshot of it can be asked for.
function capture.afterDraw()
  if plan then
    if phase == "settle" then
      settled = settled + 1
      if settled >= SETTLE_FRAMES then phase = "warm" end
    elseif phase == "ready" then
      capture.shot(plan.path)
      phase = "shooting"
    elseif phase == "shooting" and inflight == 0 and #queue == 0 then
      phase = "done"
      if not plan.hold then love.event.quit() end
    end
  end

  for i = #queue, 1, -1 do
    local path = queue[i]
    queue[i] = nil
    inflight = inflight + 1
    love.graphics.captureScreenshot(function(imageData)
      write(path, imageData)
      inflight = inflight - 1
    end)
  end
end

return capture
