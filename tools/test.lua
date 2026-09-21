-- Headless tests for the framework's pure-Lua parts.
-- Run from the repo root:  luajit tools/test.lua
--
-- These cover the config/profile machinery and the game simulation, all of
-- which are deliberately free of love.graphics so they can run without LÖVE.

package.path = "shared/?.lua;shared/?/init.lua;games/horde-survivor/?.lua;" .. package.path

local passed, failed = 0, 0
local currentSuite = ""

local function suite(name)
  currentSuite = name
  io.write("\n", name, "\n")
end

local function check(label, ok, detail)
  if ok then
    passed = passed + 1
    io.write("  ok    ", label, "\n")
  else
    failed = failed + 1
    io.write("  FAIL  ", label, detail and ("  -- " .. tostring(detail)) or "", "\n")
  end
end

local function eq(label, actual, expected)
  check(label, actual == expected, string.format("expected %s, got %s",
    tostring(expected), tostring(actual)))
end

local function near(label, actual, expected, tol)
  tol = tol or 1e-9
  check(label, type(actual) == "number" and math.abs(actual - expected) <= tol,
    string.format("expected ~%s, got %s", tostring(expected), tostring(actual)))
end

-- ------------------------------------------------------------------ json

local json = require("lib.json")

suite("json")
do
  local round = { a = 1, b = "two", c = true, d = { 1, 2, 3 }, e = { nested = 0.5 } }
  local decoded = json.decode(json.encode(round))
  eq("number survives", decoded.a, 1)
  eq("string survives", decoded.b, "two")
  eq("bool survives", decoded.c, true)
  eq("array survives", decoded.d[3], 3)
  eq("nested float survives", decoded.e.nested, 0.5)

  eq("escapes round-trip", json.decode(json.encode({ s = 'a"b\\c\nd' })).s, 'a"b\\c\nd')
  eq("empty object", json.encode({}), "{}")

  -- Key order must be stable or profile files churn in git.
  eq("keys sorted", json.encode({ z = 1, a = 2 }), '{\n  "a": 2,\n  "z": 1\n}')

  local bad, err = json.decode("{ nope }")
  check("rejects malformed input", bad == nil and err ~= nil, err)
  eq("negative numbers", json.decode("[-4.25]")[1], -4.25)
end

-- ---------------------------------------------------------------- schema

local schema = require("framework.schema")
local config = require("framework.config")

suite("schema + config")
do
  schema.reset()
  config.clearListeners()
  schema.register{
    page = "Player", section = "Movement", order = 10,
    settings = {
      { key = "player.moveSpeed", label = "Speed", type = "number",
        default = 120, min = 0, max = 600 },
      { key = "player.dashes", label = "Dashes", type = "int",
        default = 1, min = 0, max = 5 },
      { key = "player.godMode", label = "God", type = "bool", default = false },
      { key = "player.aim", label = "Aim", type = "enum",
        default = "nearest", values = { "nearest", "random" } },
      { key = "player.tint", label = "Tint", type = "color", default = { 1, 1, 1, 1 } },
      { key = "player.engine", label = "Engine", type = "number",
        default = 2, min = 0, max = 10, live = false },
    },
  }
  config.build()

  eq("default reaches flat store", config.get("player.moveSpeed"), 120)
  eq("default reaches nested tree", config.values.player.moveSpeed, 120)
  eq("page registered", schema.pages[1].name, "Player")
  eq("section registered", schema.pages[1].sections[1].name, "Movement")

  check("set returns changed", config.set("player.moveSpeed", 200) == true)
  eq("nested tree updated", config.values.player.moveSpeed, 200)
  check("setting the same value is a no-op", config.set("player.moveSpeed", 200) == false)

  eq("numbers clamp high", select(1, config.set("player.moveSpeed", 9999)) and config.get("player.moveSpeed"), 600)
  config.set("player.moveSpeed", -50)
  eq("numbers clamp low", config.get("player.moveSpeed"), 0)

  config.set("player.dashes", 2.6)
  eq("ints round", config.get("player.dashes"), 3)

  local ok, reason = config.set("player.godMode", "yes")
  check("type mismatch rejected", ok == false and reason ~= nil, reason)

  local ok2 = config.set("player.aim", "sideways")
  check("enum value outside the list rejected", ok2 == false)

  local ok3, reason3 = config.set("player.nonexistent", 1)
  check("unknown key rejected", ok3 == false and reason3 ~= nil, reason3)

  config.set("player.engine", 5)
  check("non-live setting flags a restart", config.needsRestart())
  config.clearRestartPending()
  check("restart flag clears", not config.needsRestart())

  local heard = {}
  config.listen("player.dashes", function(k, v) heard[#heard + 1] = v end)
  config.set("player.dashes", 4)
  eq("listener fired with the new value", heard[1], 4)

  local diff = config.diffFromDefaults()
  eq("diff holds the changed value", diff["player.dashes"], 4)
  check("diff omits untouched settings", diff["player.godMode"] == nil)

  config.resetAll()
  eq("resetAll restores defaults", config.get("player.moveSpeed"), 120)
  check("diff is empty after reset", next(config.diffFromDefaults()) == nil)

  config.set("player.tint", { 0.5, 0.25, 0, 1 })
  near("colours store channels", config.values.player.tint[2], 0.25)
  check("colour diff detected", config.diffFromDefaults()["player.tint"] ~= nil)
  config.resetKey("player.tint")
  check("colour resets", config.diffFromDefaults()["player.tint"] == nil)

  local dupOk = pcall(schema.register, {
    page = "Player", settings = {
      { key = "player.moveSpeed", label = "Dup", type = "number",
        default = 1, min = 0, max = 2 },
    },
  })
  check("duplicate keys are rejected", dupOk == false)

  local badOk = pcall(schema.register, {
    page = "Player", settings = {
      { key = "player.noRange", label = "Bad", type = "number", default = 1 },
    },
  })
  check("numeric settings must declare min/max", badOk == false)
end

-- -------------------------------------------------------- profile diffing

local profiles = require("framework.profiles")

suite("profiles")
do
  schema.reset()
  config.clearListeners()
  schema.register{
    page = "Waves",
    settings = {
      { key = "wave.count", label = "Waves", type = "int", default = 15, min = 1, max = 60 },
      { key = "wave.length", label = "Length", type = "number", default = 60, min = 5, max = 300 },
    },
  }
  config.build()

  profiles.dir = os.getenv("TMPDIR") or "/tmp"
  profiles.dir = profiles.dir .. "/hs-profile-test"
  os.execute('rm -rf "' .. profiles.dir .. '"')

  config.set("wave.length", 30)
  check("save writes a profile", profiles.save("fast", "shorter waves"))

  config.set("wave.length", 99)
  eq("value changed before reload", config.get("wave.length"), 99)
  check("load restores the saved value", profiles.load("fast"))
  eq("loaded value applied", config.get("wave.length"), 30)
  eq("untouched setting stays at its default", config.get("wave.count"), 15)

  -- The point of diff-based profiles: a setting added after the profile was
  -- written picks up its new default instead of breaking the load.
  schema.register{
    page = "Waves",
    settings = {
      { key = "wave.newSetting", label = "New", type = "int", default = 7, min = 0, max = 9 },
    },
  }
  config.build()
  profiles.load("fast")
  eq("old profile still loads", config.get("wave.length"), 30)
  eq("newly added setting uses its default", config.get("wave.newSetting"), 7)

  -- And a setting deleted from the schema is reported, then pruned on save.
  local stalePath = profiles.dir .. "/stale.json"
  local f = assert(io.open(stalePath, "w"))
  f:write(json.encode({ name = "stale", values = { ["wave.length"] = 20, ["wave.gone"] = 3 } }))
  f:close()
  profiles.load("stale")
  eq("stale key reported", profiles.orphans[1], "wave.gone")
  eq("valid keys still applied", config.get("wave.length"), 20)
  profiles.pruneOrphans()
  local reread = json.decode(assert(io.open(stalePath)):read("*a"))
  check("stale key pruned on save", reread.values["wave.gone"] == nil)
  eq("real key kept after prune", reread.values["wave.length"], 20)

  profiles.refresh()
  local found = {}
  for _, n in ipairs(profiles.list) do found[n] = true end
  check("refresh discovers profiles on disk", found.fast and found.stale)
  check("default is always listed", found.default)

  profiles.setStartup("fast")
  profiles.refresh()
  eq("startup profile persists", profiles.startup, "fast")

  os.execute('rm -rf "' .. profiles.dir .. '"')
end

-- ---------------------------------------------------------------- capture

local capture = require("framework.capture")

suite("capture")
do
  check("no --capture means no plan", capture.parse({ "--game", "x" }) == nil)

  local plan = capture.parse({ "--capture", "captures/a.png" })
  eq("path survives", plan.path, "captures/a.png")
  eq("default warm-up", plan.at, 2)
  eq("does not hold by default", plan.hold, false)
  eq("single captures preserve the requested filename",capture.outputPath(plan,1),"captures/a.png")
  local series=capture.parse({"--capture","/tmp/beam.png","--frames","4","--every","0.2"})
  eq("series uses ordered output filenames",capture.outputPath(series,3),"/tmp/beam-003.png")
  eq("series preserves frame count",series.frames,4)
  near("series interval follows simulation ticks",series.every,12/60)
  check("fractional frame count is refused",not capture.parse({"--capture","a","--frames","1.5"}))
  check("unbounded frame count is refused",not capture.parse({"--capture","a","--frames","121"}))
  check("sub-tick intervals are refused",not capture.parse({"--capture","a","--every","0.001"}))

  eq("bare name lands in captures/",
    capture.parse({ "--capture", "hud" }).path, "captures/hud.png")
  eq("a path is left alone",
    capture.parse({ "--capture", "/tmp/x" }).path, "/tmp/x.png")

  plan = capture.parse({ "--capture", "a", "--at", "8", "--seed", "7",
    "--mode", "zoo", "--profile", "fast", "--overlays", "--perf", "--hold" })
  eq("--at", plan.at, 8)
  eq("--seed", plan.seed, 7)
  eq("--mode", plan.mode, "zoo")
  eq("--profile", plan.profile, "fast")
  check("--overlays", plan.overlays)
  check("--perf", plan.perf)
  check("--hold", plan.hold)

  plan = capture.parse({ "--capture", "a", "--set", "debug.godMode=true",
    "--set", "run.length=4" })
  eq("--set repeats", #plan.sets, 2)
  eq("--set key", plan.sets[1].key, "debug.godMode")
  eq("--set value", plan.sets[2].raw, "4")

  plan = capture.parse({ "--capture", "a", "--do", "Open shop",
    "--press", "next", "--press", "next" })
  eq("--do", plan.actions[1], "Open shop")
  eq("--press repeats", #plan.presses, 2)

  -- --editor takes an optional page, so it must not eat the next flag.
  plan = capture.parse({ "--capture", "a", "--editor", "--perf" })
  check("--editor alone", plan.editor and plan.editorPage == nil)
  check("--editor does not eat the next flag", plan.perf)
  eq("--editor page", capture.parse({ "--capture", "a", "--editor", "Debug" }).editorPage,
    "Debug")
  eq("--dropdown widget", capture.parse({"--capture","a","--dropdown","mws.n1.subclass"}).dropdown,
    "mws.n1.subclass")
  check("--dropdown requires an id",not capture.parse({"--capture","a","--dropdown"}))
  check("--dropdown requires a capture",not capture.parse({"--dropdown","test"}))

  -- The launcher passes its own flags through the same table.
  plan = capture.parse({ "--game", "horde-survivor", "--capture", "a", "--at", "3" })
  eq("ignores unrelated flags", plan.at, 3)

  local bad, err = capture.parse({ "--capture" })
  check("--capture needs a value", bad == nil and err ~= nil, err)
  bad, err = capture.parse({ "--capture", "a", "--at", "soon" })
  check("--at rejects nonsense", bad == nil and err ~= nil, err)
  bad, err = capture.parse({ "--capture", "a", "--mode", "kitchen" })
  check("--mode rejects an unknown level", bad == nil and err ~= nil, err)
  bad, err = capture.parse({ "--capture", "a", "--set", "godMode" })
  check("--set needs key=value", bad == nil and err ~= nil, err)
  bad, err = capture.parse({ "--at", "3" })
  check("a capture flag without --capture is an error", bad == nil and err ~= nil, err)

  -- A command line only carries strings; the schema types do the rest.
  eq("bool from true", capture.coerceSet({ type = "bool" }, "true"), true)
  eq("bool from 0", capture.coerceSet({ type = "bool" }, "0"), false)
  check("bool rejects nonsense", capture.coerceSet({ type = "bool" }, "maybe") == nil)
  eq("number is left for the schema to coerce",
    capture.coerceSet({ type = "number" }, "2.5"), "2.5")
  local colour = capture.coerceSet({ type = "color" }, "1,0.5,0")
  check("colour splits on commas",
    colour and colour[1] == 1 and colour[2] == 0.5 and colour[3] == 0)
  check("colour needs three parts",
    capture.coerceSet({ type = "color" }, "1,0") == nil)
  check("unknown setting", capture.coerceSet(nil, "1") == nil)
end

-- ------------------------------------------------------------------- mws

local uiOk,uiErr=pcall(function()
  require("tools.uisuite").run(suite,check,eq,near)
end)
if not uiOk then suite("ui") check("widget suite completed",false,uiErr) end

local v2Ok,v2Err=pcall(function()
  require("tools.mwsv2suite").run(suite,check,eq,near)
end)
if not v2Ok then suite("mws v2 runtime") check("sequence suite completed",false,v2Err) end

local triggersOk, triggersErr = pcall(function()
  require("tools.triggersuite").run(suite, check, eq)
end)
if not triggersOk then
  suite("mws v2 triggers")
  check("trigger suite completed", false, triggersErr)
end

local mwsOk, mwsErr = pcall(function()
  local mwssuite = require("tools.mwssuite")
  mwssuite.run(suite, check, eq, near)
end)
if not mwsOk then
  suite("mws")
  check("mws suite loaded", false, mwsErr)
end

-- ------------------------------------------------------------- simulation

local simOk, simErr = pcall(function()
  local sim = require("tools.simsuite")
  sim.run(suite, check, eq, near)
end)
if not simOk then
  suite("simulation")
  check("simulation suite loaded", false, simErr)
end

-- ------------------------------------------------------------------ done

io.write(string.format("\n%d passed, %d failed\n", passed, failed))
os.exit(failed == 0 and 0 or 1)
