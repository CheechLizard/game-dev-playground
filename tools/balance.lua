-- Headless balance report.
--
--   luajit tools/balance.lua                      full run, default profile
--   luajit tools/balance.lua --runs 8             average over 8 seeds
--   luajit tools/balance.lua --profile glass      load a config profile first
--   luajit tools/balance.lua --seconds 300        stop early
--   luajit tools/balance.lua --csv waves.csv      per-run rows for a spreadsheet
--   luajit tools/balance.lua --bubble 60          pin the pilot to one bubble
--
-- The pilot is competent but not optimal, so treat the numbers as a relative
-- signal between two profiles rather than as an absolute difficulty rating.
--
-- By default this sweeps the pilot's bubble rather than reporting one value.
-- That is not a nicety: mean survival, which weapon leads on damage, and even
-- which enemy is the top threat all move with the bubble, so a single-bubble
-- verdict mostly measures the pilot. The spread row is the honest signal --
-- a change that only helps at one bubble has not actually changed the balance.
-- `--bubble N` pins one value when you want the detail for a given playstyle.

package.path = "shared/?.lua;shared/?/init.lua;games/horde-survivor/?.lua;" .. package.path

local config = require("framework.config")
local profiles = require("framework.profiles")
local sim = require("tools.simsuite")

local SWEEP = { 45, 70, 95 }

local opts = { runs = 1, profile = nil, seconds = nil, csv = nil, bubble = nil }
do
  local i = 1
  while i <= #arg do
    local flag, value = arg[i], arg[i + 1]
    if flag == "--runs" then opts.runs = tonumber(value) or 1 ; i = i + 2
    elseif flag == "--profile" then opts.profile = value ; i = i + 2
    elseif flag == "--seconds" then opts.seconds = tonumber(value) ; i = i + 2
    elseif flag == "--csv" then opts.csv = value ; i = i + 2
    elseif flag == "--bubble" then opts.bubble = tonumber(value) ; i = i + 2
    else i = i + 1 end
  end
end

sim.bootstrap()
if opts.profile then
  profiles.refresh()
  profiles.load(opts.profile)
  print("profile: " .. tostring(profiles.status))
end

local runModule = require("run")

local bubbles = opts.bubble and { opts.bubble } or SWEEP
local pinned = opts.bubble ~= nil

local csvRows = {}
local pooledWeapons, pooledThreats = {}, {}
local results = {}

--- Play `opts.runs` seeds at one bubble. Returns the averaged summary.
local function measure(bubble)
  local t = {
    survived = 0, time = 0, wave = 0, level = 0, kills = 0,
    dps = 0, taken = 0, peak = 0, gold = 0,
  }

  for i = 1, opts.runs do
    local _, s = sim.play{
      seed = 1000 + i * 7919,
      maxSeconds = opts.seconds or (config.get("run.durationMinutes") * 60),
      dt = 1 / 30,
      bubble = bubble,
    }

    t.time = t.time + s.time
    t.wave = t.wave + s.wave
    t.level = t.level + s.level
    t.kills = t.kills + s.kills
    t.dps = t.dps + s.dps
    t.taken = t.taken + s.damageTaken
    t.peak = t.peak + s.peakAlive
    t.gold = t.gold + s.goldEarned
    if s.outcome == runModule.STATE.WON then t.survived = t.survived + 1 end

    for _, w in ipairs(s.weapons) do
      pooledWeapons[w.name] = (pooledWeapons[w.name] or 0) + w.share
    end
    for _, th in ipairs(s.threats) do
      pooledThreats[th.name] = (pooledThreats[th.name] or 0) + th.damage
    end

    csvRows[#csvRows + 1] = string.format("%d,%d,%s,%.1f,%d,%d,%d,%.2f,%d,%d",
      bubble, i, s.outcome, s.time, s.wave, s.level, s.kills, s.dps,
      s.damageTaken, s.peakAlive)

    -- Per-run detail only when a single bubble is pinned; a sweep would bury
    -- the summary under three times the rows.
    if pinned then
      print(string.format(
        "run %2d  %-7s  t=%5.0fs  wave=%2d  lvl=%2d  kills=%4d  dps=%6.1f  taken=%5d  peak=%3d  killedBy=%s",
        i, s.outcome, s.time, s.wave, s.level, s.kills, s.dps,
        s.damageTaken, s.peakAlive, tostring(s.killedBy)))
    end
  end

  local n = opts.runs
  for key, value in pairs(t) do
    if key ~= "survived" then t[key] = value / n end
  end
  t.bubble = bubble
  t.survivalRate = t.survived / n * 100
  return t
end

for _, bubble in ipairs(bubbles) do
  results[#results + 1] = measure(bubble)
end

local n = opts.runs
print("")
print(string.format("%d seed(s) per bubble, %d min win target",
  n, config.get("run.durationMinutes")))
print("")
print("bubble  survived     time  wave  level  kills     dps  taken  peak   gold")
for _, r in ipairs(results) do
  print(string.format("%6d  %6.0f%%  %6.0fs  %4.1f  %5.1f  %5.0f  %6.1f  %5.0f  %4.0f  %5.0f",
    r.bubble, r.survivalRate, r.time, r.wave, r.level, r.kills,
    r.dps, r.taken, r.peak, r.gold))
end

if #results > 1 then
  local lo, hi = math.huge, -math.huge
  for _, r in ipairs(results) do
    lo, hi = math.min(lo, r.time), math.max(hi, r.time)
  end
  print("")
  print(string.format(
    "survival spread across pilot styles: %.0fs - %.0fs (%.0f%% of the %.0fs target)",
    lo, hi, hi / (config.get("run.durationMinutes") * 60) * 100,
    config.get("run.durationMinutes") * 60))
  print("A change that moves only one row has not moved the balance.")
end

local samples = n * #bubbles

local function ranked(map, label, format)
  local rows = {}
  for name, value in pairs(map) do rows[#rows + 1] = { name = name, value = value } end
  table.sort(rows, function(a, b) return a.value > b.value end)
  print("")
  print(label)
  for _, row in ipairs(rows) do
    print(string.format("  %-18s %s", row.name, format(row.value / samples)))
  end
end

local pooledLabel = pinned and "" or " (pooled across the sweep)"
ranked(pooledWeapons, "damage share by weapon" .. pooledLabel,
  function(v) return string.format("%5.1f%%", v * 100) end)
ranked(pooledThreats, "damage taken by source" .. pooledLabel,
  function(v) return string.format("%7.0f", v) end)

if opts.csv then
  local f = assert(io.open(opts.csv, "w"))
  f:write("bubble,run,outcome,time,wave,level,kills,dps,damageTaken,peakAlive\n")
  f:write(table.concat(csvRows, "\n"), "\n")
  f:close()
  print("\nwrote " .. opts.csv)
end
