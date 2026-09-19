-- Headless balance report.
--
--   luajit tools/balance.lua                      full run, default profile
--   luajit tools/balance.lua --runs 8             average over 8 seeds
--   luajit tools/balance.lua --profile glass      load a config profile first
--   luajit tools/balance.lua --seconds 300        stop early
--   luajit tools/balance.lua --csv waves.csv      per-run rows for a spreadsheet
--   luajit tools/balance.lua --bubble 60          how close the pilot plays
--
-- The pilot is competent but not optimal, so treat the numbers as a relative
-- signal between two profiles rather than as an absolute difficulty rating.

package.path = "shared/?.lua;shared/?/init.lua;games/horde-survivor/?.lua;" .. package.path

local config = require("framework.config")
local profiles = require("framework.profiles")
local sim = require("tools.simsuite")

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

local totals = {
  survived = 0, time = 0, wave = 0, level = 0, kills = 0,
  dps = 0, taken = 0, peak = 0, gold = 0,
}
local weaponShare = {}
local threatShare = {}
local csvRows = {}

for i = 1, opts.runs do
  local r, s = sim.play{
    seed = 1000 + i * 7919,
    maxSeconds = opts.seconds or (config.get("run.durationMinutes") * 60),
    dt = 1 / 30,
    bubble = opts.bubble,
  }

  totals.time = totals.time + s.time
  totals.wave = totals.wave + s.wave
  totals.level = totals.level + s.level
  totals.kills = totals.kills + s.kills
  totals.dps = totals.dps + s.dps
  totals.taken = totals.taken + s.damageTaken
  totals.peak = totals.peak + s.peakAlive
  totals.gold = totals.gold + s.goldEarned
  if s.outcome == runModule.STATE.WON then totals.survived = totals.survived + 1 end

  for _, w in ipairs(s.weapons) do
    weaponShare[w.name] = (weaponShare[w.name] or 0) + w.share
  end
  for _, t in ipairs(s.threats) do
    threatShare[t.name] = (threatShare[t.name] or 0) + t.damage
  end

  csvRows[#csvRows + 1] = string.format("%d,%s,%.1f,%d,%d,%d,%.2f,%d,%d",
    i, s.outcome, s.time, s.wave, s.level, s.kills, s.dps, s.damageTaken, s.peakAlive)

  print(string.format(
    "run %2d  %-7s  t=%5.0fs  wave=%2d  lvl=%2d  kills=%4d  dps=%6.1f  taken=%5d  peak=%3d  killedBy=%s",
    i, s.outcome, s.time, s.wave, s.level, s.kills, s.dps,
    s.damageTaken, s.peakAlive, tostring(s.killedBy)))
end

local n = opts.runs
print("")
print(string.format("%d run(s), %d survived (%.0f%%)",
  n, totals.survived, totals.survived / n * 100))
print(string.format("mean: time %.0fs  wave %.1f  level %.1f  kills %.0f  dps %.1f  taken %.0f  peak alive %.0f  gold %.0f",
  totals.time / n, totals.wave / n, totals.level / n, totals.kills / n,
  totals.dps / n, totals.taken / n, totals.peak / n, totals.gold / n))

local function ranked(map, label, format)
  local rows = {}
  for name, value in pairs(map) do rows[#rows + 1] = { name = name, value = value } end
  table.sort(rows, function(a, b) return a.value > b.value end)
  print("")
  print(label)
  for _, row in ipairs(rows) do
    print(string.format("  %-18s %s", row.name, format(row.value / n)))
  end
end

ranked(weaponShare, "damage share by weapon",
  function(v) return string.format("%5.1f%%", v * 100) end)
ranked(threatShare, "damage taken by source",
  function(v) return string.format("%7.0f", v) end)

if opts.csv then
  local f = assert(io.open(opts.csv, "w"))
  f:write("run,outcome,time,wave,level,kills,dps,damageTaken,peakAlive\n")
  f:write(table.concat(csvRows, "\n"), "\n")
  f:close()
  print("\nwrote " .. opts.csv)
end
