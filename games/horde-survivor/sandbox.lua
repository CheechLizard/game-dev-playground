-- The zoo and the range: two inspection levels built on the same room grid.
--
--   zoo    one cage per enemy. Walk in and it spawns and fights you for real.
--   range  one room per weapon. Walk in and you are handed that weapon, with
--          enemies to shoot at.
--
-- Both run the ordinary simulation with `run.sandbox` set, so behaviour here is
-- the behaviour in a real run -- there is no second copy of how a Brute chases
-- or how the Scattergun spreads. What differs is only who decides to spawn.
--
-- Stats come from `config`, not from the content tables, so a value you change
-- in the editor shows up here immediately. The field lists come from
-- content.*Fields, so a new tunable appears without being listed again here.

local config = require("framework.config")
local content = require("content")
local fonts = require("framework.fonts")
local render = require("render")
local runModule = require("run")
local schema = require("framework.schema")
local editor = require("framework.editor")
local ui = require("framework.ui")

local sandbox = {}

local CAGE_W, CAGE_H = 200, 140
local GAP = 58
local COLS = 3

-- ------------------------------------------------------------------ layout

local function buildRooms(entries)
  local rooms = {}
  local rows = math.ceil(#entries / COLS)
  for i, entry in ipairs(entries) do
    local col = (i - 1) % COLS
    local row = math.floor((i - 1) / COLS)
    rooms[i] = {
      index = i,
      def = entry,
      x = GAP + col * (CAGE_W + GAP),
      y = GAP + row * (CAGE_H + GAP),
      w = CAGE_W, h = CAGE_H,
    }
  end
  local arenaW = GAP + COLS * (CAGE_W + GAP)
  local arenaH = GAP + rows * (CAGE_H + GAP)
  return rooms, arenaW, arenaH
end

local function roomAt(rooms, x, y)
  for _, room in ipairs(rooms) do
    if x >= room.x and x <= room.x + room.w
       and y >= room.y and y <= room.y + room.h then
      return room
    end
  end
  return nil
end

--- The room nearest the point but not containing it, within `range`.
-- Distance is measured to the cage wall, not its centre, so a wide cage does
-- not read as further away than a narrow one at the same standing distance.
local function nearestRoom(rooms, x, y, range)
  local best, bestDist
  for _, room in ipairs(rooms) do
    local dx = math.max(room.x - x, 0, x - (room.x + room.w))
    local dy = math.max(room.y - y, 0, y - (room.y + room.h))
    local dist = math.sqrt(dx * dx + dy * dy)
    if dist <= range and (not bestDist or dist < bestDist) then
      best, bestDist = room, dist
    end
  end
  return best
end

local function randomPointIn(room, rng, margin)
  margin = margin or 18
  return room.x + margin + rng.next() * (room.w - margin * 2),
         room.y + margin + rng.next() * (room.h - margin * 2)
end

-- -------------------------------------------------------------------- init

--- Create a sandbox. `mode` is "zoo" or "range".
function sandbox.new(mode)
  local entries = (mode == "range") and content.weapons or content.enemies
  local rooms, arenaW, arenaH = buildRooms(entries)

  -- Draw the sandbox's seed from LÖVE's generator rather than the clock, so
  -- that seeding that generator -- which a screenshot capture does -- makes
  -- the zoo and the range reproducible too. os.time is the headless fallback.
  local seed = (love and love.math and love.math.random(1, 2147483646))
    or os.time()
  local r = runModule.new(seed)
  r.sandbox = true
  r.arenaW, r.arenaH = arenaW, arenaH
  -- Start in the corridor above the first room, so nothing is live on entry.
  r.player.x = rooms[1].x + rooms[1].w / 2
  r.player.y = math.max(12, rooms[1].y - GAP / 2)
  r.player.vx, r.player.vy = 0, 0

  local s = {
    mode = mode,
    run = r,
    rooms = rooms,
    active = nil,
    -- zoo: which weapon the player is holding. range: which enemy spawns.
    selection = 1,
  }

  if mode == "zoo" then
    sandbox.equip(s, 1)
  else
    r.player.weapons = {}
  end
  return s
end

--- Zoo only: hold exactly one weapon, so what you see is that weapon's doing.
function sandbox.equip(s, index)
  local defs = content.weapons
  s.selection = ((index - 1) % #defs) + 1
  local r = s.run
  r.player.weapons = {}
  r:addWeapon(defs[s.selection].id)
end

--- The , and . keys. Cycles weapons in the zoo, spawn type on the range.
function sandbox.cycle(s, direction)
  if s.mode == "zoo" then
    sandbox.equip(s, s.selection + direction)
  else
    s.selection = ((s.selection - 1 + direction) % #content.enemies) + 1
    -- Retire the current occupants so the change is visible at once.
    if s.active then s.run.enemies = {} end
  end
end

--- What the , and . keys are currently selecting, for the overlay.
function sandbox.selectionName(s)
  if s.mode == "zoo" then
    return content.weapons[s.selection].name
  end
  return content.enemies[s.selection].name
end

-- ------------------------------------------------------------------ update

local function targetPopulation(s)
  return math.max(1, math.floor(config.values.sandbox.population))
end

function sandbox.update(s, dt, moveX, moveY)
  local r = s.run
  local c = config.values

  -- A standing flag, not a pumped iframe. Refreshing iframe every frame kept
  -- the player permanently inside its post-hit blink, which reads as a fault.
  r.player.invulnerable = c.sandbox.invulnerable
  if c.sandbox.invulnerable then
    r.player.hp = r:playerStat("maxHp")
    r.state = runModule.STATE.PLAYING
  end

  local was = s.active
  s.active = roomAt(s.rooms, r.player.x, r.player.y)

  -- Read the placard from the corridor; step inside and it gets out of the
  -- way, because once the room is live the thing itself is the information.
  s.preview = (not s.active)
    and nearestRoom(s.rooms, r.player.x, r.player.y, c.sandbox.previewRange)
    or nil

  -- Leaving a room clears it: the zoo should be quiet when you are in the
  -- corridor, or every cage you have visited follows you around.
  if was and was ~= s.active then
    r.enemies = {}
    r.pendingSpawns = {}
    r.enemyShots = {}
    r.projectiles = {}
    r.pickups = {}
    if s.mode == "range" then r.player.weapons = {} end
  end

  if s.active then
    -- Range: entering a room hands you that room's weapon and nothing else.
    if s.mode == "range" then
      local wanted = s.active.def.id
      local holding = r.player.weapons[1]
      if not holding or holding.id ~= wanted then
        r.player.weapons = {}
        r:addWeapon(wanted)
      end
    end

    -- Top the room up to its population, spawning inside the walls.
    local spawnId = (s.mode == "zoo") and s.active.def.id
      or content.enemies[s.selection].id
    s.spawnTimer = (s.spawnTimer or 0) - dt
    local incoming = #r.enemies + #r.pendingSpawns
    local target = targetPopulation(s)
    if s.spawnTimer <= 0 and incoming < target then
      s.spawnTimer = math.max(0.05, c.sandbox.spawnInterval)
      local cage = s.active
      local x, y = randomPointIn(cage, r.rng)
      -- Through the run's own pack spawner, not a second copy: a pack enemy
      -- that arrived alone in its cage would make the zoo lie about it.
      r:spawnPack(spawnId, x, y, target - incoming,
        function(e) e.cage = cage end)
    end
  end

  r:update(dt, moveX, moveY)

  -- Cage the occupants. Without this a Lancer charges straight through a wall
  -- and the zoo becomes a single room with everything in it.
  for _, e in ipairs(r.enemies) do
    local cage = e.cage
    if cage then
      local lo, hi = cage.x + e.radius, cage.x + cage.w - e.radius
      if e.x < lo then e.x, e.vx = lo, 0 elseif e.x > hi then e.x, e.vx = hi, 0 end
      lo, hi = cage.y + e.radius, cage.y + cage.h - e.radius
      if e.y < lo then e.y, e.vy = lo, 0 elseif e.y > hi then e.y, e.vy = hi, 0 end
    end
  end
end

-- -------------------------------------------------------------------- draw

local function palette(name)
  local c = config.values.palette[name]
  return c[1], c[2], c[3], c[4] or 1
end

--- World-space: the rooms themselves, their specimens and their name plates.
function sandbox.draw(s)
  local g = love.graphics
  local r = s.run
  local pr, pg, pb = palette("player")

  for _, room in ipairs(s.rooms) do
    local live = (room == s.active)

    g.setColor(0.09, 0.09, 0.13, 1)
    g.rectangle("fill", room.x, room.y, room.w, room.h)
    if live then
      g.setColor(pr, pg, pb, 0.55)
    else
      g.setColor(pr, pg, pb, 0.22)
    end
    g.rectangle("line", room.x + 0.5, room.y + 0.5, room.w - 1, room.h - 1)

    -- The specimen: what this room is about, shown while the room is idle.
    -- Once it is live the real enemies are on screen and this would double up.
    local cx = room.x + room.w / 2
    local cy = room.y + room.h / 2
    if not live then
      if s.mode == "zoo" then
        local def = room.def
        local col = { palette(def.palette or "enemy") }
        g.setColor(col[1], col[2], col[3], 0.9)
        render.drawShape(def.shape, cx, cy,
          config.get("enemy." .. def.id .. ".radius") * 2.2)
      else
        render.drawWeaponIcon(room.def.id, cx, cy, 42)
      end
    end

    -- Name plate, in the world so every room is labelled at a glance.
    g.setFont(fonts.get("pixel", 8))
    g.setColor(pr, pg, pb, live and 1 or 0.7)
    g.printf(room.def.name:upper(), room.x, room.y + 5, room.w, "center")
  end
  g.setColor(1, 1, 1, 1)
end

-- ------------------------------------------------------------------ overlay

local function enemyFields(def)
  local fields = {}
  for _, f in ipairs(content.enemyFields) do fields[#fields + 1] = f end
  for _, f in ipairs(content.behaviourFields[def.behaviour] or {}) do
    fields[#fields + 1] = f
  end
  return fields
end

local function weaponFields(def)
  local fields = {}
  for _, f in ipairs(content.weaponFields) do fields[#fields + 1] = f end
  for _, f in ipairs(content.weaponTypeFields[def.kind] or {}) do
    fields[#fields + 1] = f
  end
  return fields
end

--- Screen-space: the detail panel for the room you are standing in, plus a
-- one-line status bar. Both are state, not instructions.
function sandbox.drawOverlay(s, scale, ox, oy)
  local g = love.graphics
  local c = config.values
  local viewW = c.render.width * scale
  local viewH = c.render.height * scale

  local title = fonts.role("heading")
  local small = fonts.role("small")
  local pad = 14

  -- Status bar: where you are and what , / . is pointed at.
  g.setFont(small)
  g.setColor(1, 1, 1, 0.75)
  g.print((s.mode == "zoo" and "ZOO" or "RANGE"), ox + pad, oy + pad)
  g.setColor(1, 1, 1, 0.5)
  local label = (s.mode == "zoo" and "weapon: " or "spawning: ") .. sandbox.selectionName(s)
  g.printf(label, ox, oy + pad, viewW - pad, "right")

  local room = s.preview
  if not room then return end

  local def = room.def
  local fields = (s.mode == "zoo") and enemyFields(def) or weaponFields(def)
  local prefix = (s.mode == "zoo") and ("enemy." .. def.id .. ".")
    or ("weapon." .. def.id .. ".")

  -- Panel sized to the rows it actually holds. The meta line wraps, so its
  -- height is measured rather than assumed to be one line -- guessing put it
  -- on top of the first stat row and ran the rows out of the panel.
  local panelW = math.min(viewW * 0.40, 380)
  local innerW = panelW - pad * 2

  local metaText = (s.mode == "zoo")
    and ("behaviour: " .. tostring(def.behaviour))
    or ("type: " .. tostring(def.kind) .. "   targeting: " .. tostring(def.targeting))
  local _, metaLines = small:getWrap(metaText, innerW)

  local entries = {}
  for _, field in ipairs(fields) do
    local entry = schema.get(prefix .. field.name)
    if entry and config.get(entry.key) ~= nil then entries[#entries + 1] = entry end
  end

  local headerH = title:getHeight() + 3
    + #metaLines * small:getHeight() + 8
  -- Editable rows are far taller than the readouts they replace, so the panel
  -- takes what it needs up to the view and the rest scrolls.
  local rowH = ui.unit * 9
  local wantH = pad * 0.6 + headerH + #entries * rowH + pad * 0.6
  local panelH = math.min(wantH, viewH - pad * 2)
  local px = ox + pad
  local py = oy + viewH - pad - panelH

  g.setColor(ui.theme.background)
  g.rectangle("fill", px, py, panelW, panelH)
  g.setColor(ui.theme.line)
  g.rectangle("line", px + 0.5, py + 0.5, panelW - 1, panelH - 1)

  local x = px + pad
  local w = panelW - pad * 2
  local y = py + pad * 0.6

  g.setFont(title)
  g.setColor(1, 1, 1, 0.98)
  g.print(def.name, x, y)
  y = y + title:getHeight() + 3

  g.setFont(small)
  g.setColor(1, 1, 1, 0.45)
  g.printf(metaText, x, y, w, "left")
  y = y + #metaLines * small:getHeight() + 8

  -- The stats are the real settings, drawn with the editor's own widgets, so
  -- a room can be tuned from the corridor and tested by stepping into it.
  local listY = y
  local listH = py + panelH - listY - pad * 0.6
  local innerWidth = ui.beginScroll("sandbox.placard", px, listY, panelW, listH)
  g.setFont(small)
  for _, entry in ipairs(entries) do
    editor.drawSetting(entry, innerWidth, { showHelp = false })
  end
  ui.endScroll("sandbox.placard", px, listY, panelW, listH)

  -- An open dropdown draws last or it is clipped by the panel it came from.
  ui.drawDeferred()
  g.setColor(1, 1, 1, 1)
end

--- Settings for the two levels. Registered like any other schema block.
function sandbox.registerSettings(schema)
  schema.register{
    page = "Levels", section = "Zoo and range", order = 80, sectionOrder = 10,
    settings = {
      { key = "sandbox.population", label = "Occupants per room", type = "int",
        default = 6, min = 1, max = 60,
        help = "How many spawn in the room you are standing in." },
      { key = "sandbox.spawnInterval", label = "Respawn interval", type = "number",
        default = 0.6, min = 0.05, max = 6, unit = "s", format = "%.2f" },
      { key = "sandbox.invulnerable", label = "Invulnerable", type = "bool",
        default = true,
        help = "Off to feel how hard a room actually hits." },
      { key = "sandbox.previewRange", label = "Placard range", type = "number",
        default = 40, min = 0, max = 200, unit = "px",
        help = "How close to a room you stand before its details appear. "
          .. "They hide again once you step inside." },
    },
  }
end

return sandbox
