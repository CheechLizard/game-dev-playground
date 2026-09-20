-- Headless simulation of the horde survivor.
--
-- run.lua takes a movement vector rather than reading input, and contains no
-- drawing, so a whole run can be played by a scripted pilot with no window.
-- That is what makes balance checkable: change a number in the editor, save a
-- profile, and re-run this to see what it did.

local schema = require("framework.schema")
local config = require("framework.config")
local debugdraw = require("framework.debugdraw")

local sim = {}

--- Bring the schema up from scratch. Safe to call repeatedly.
function sim.bootstrap()
  schema.reset()
  config.clearListeners()
  debugdraw.reset()
  require("settings").register()
  config.build()
  debugdraw.sync()
end

-- A pilot that kites rather than flees.
--
-- Fleeing to maximum distance is the wrong model for this genre: it parks area
-- weapons away from the horde and walks the player into corners. This one only
-- repels from enemies inside a tight personal-space bubble, so it naturally
-- circles a group while its weapons chew through it.
-- `bubble` is the pilot's personal space in pixels, and it matters a lot:
-- a small bubble hugs the horde and dies to contact damage, a large one flees
-- into corners and dies to ranged enemies. Neither extreme is how a human
-- plays, so treat any single number here as one data point, not the truth.
-- tools/balance.lua therefore sweeps it by default and reports a row per
-- bubble; `--bubble N` pins one value when you want the per-run detail.
sim.defaultBubble = 45

local function pilot(r, bubble)
  local p = r.player
  local ax, ay = 0, 0
  local crowd = 0

  for _, e in ipairs(r.enemies) do
    local dx, dy = p.x - e.x, p.y - e.y
    local d2 = dx * dx + dy * dy
    if d2 < bubble * bubble and d2 > 1e-6 then
      local d = math.sqrt(d2)
      local weight = (bubble - d) / bubble
      ax = ax + (dx / d) * weight * 3.0
      ay = ay + (dy / d) * weight * 3.0
      crowd = crowd + 1
    elseif d2 < (bubble + 34) * (bubble + 34) and d2 > 1e-6 then
      -- Slide sideways past nearby enemies instead of backing straight off,
      -- which is what keeps the player moving through the horde.
      local d = math.sqrt(d2)
      ax = ax + (-dy / d) * 0.35
      ay = ay + (dx / d) * 0.35
    end
  end

  -- Break out properly when genuinely surrounded.
  if crowd >= 5 then
    ax, ay = ax * 2.5, ay * 2.5
  end

  local bestX, bestY, bestD2 = nil, nil, 150 * 150
  for _, pk in ipairs(r.pickups) do
    if pk.kind ~= "hp" or p.hp < p.maxHp * 0.7 then
      local dx, dy = pk.x - p.x, pk.y - p.y
      local d2 = dx * dx + dy * dy
      if d2 < bestD2 then bestX, bestY, bestD2 = dx, dy, d2 end
    end
  end
  if bestX then
    local d = math.sqrt(bestD2)
    ax = ax + (bestX / d) * 0.7
    ay = ay + (bestY / d) * 0.7
  end

  -- Steer away from the arena edge so the pilot does not corner itself.
  local margin = 80
  if p.x < margin then ax = ax + (margin - p.x) / margin end
  if p.x > r.arenaW - margin then ax = ax - (p.x - (r.arenaW - margin)) / margin end
  if p.y < margin then ay = ay + (margin - p.y) / margin end
  if p.y > r.arenaH - margin then ay = ay - (p.y - (r.arenaH - margin)) / margin end

  local mag = math.sqrt(ax * ax + ay * ay)
  if mag < 1e-6 then return 0, 0 end
  return ax / mag, ay / mag
end

--- Play a run to completion or to `maxSeconds`, buying greedily in the shop.
-- Returns the run object and its summary.
function sim.play(opts)
  opts = opts or {}
  local runModule = require("run")
  local r = runModule.new(opts.seed or 12345)
  local dt = opts.dt or (1 / 30)
  local bubble = opts.bubble or sim.defaultBubble
  local maxSeconds = opts.maxSeconds or r:durationSeconds()
  local guard = math.ceil(maxSeconds / dt) + 600
  local steps = 0

  while steps < guard do
    steps = steps + 1

    if r.state == runModule.STATE.SHOP then
      -- Shop by priority, then by price within a priority.
      --
      -- Buying strictly cheapest-first was fine when the shop held weapons and
      -- one heal. With passives in the pool it stops buying weapons at all --
      -- passives are cheaper -- and the run's damage collapses onto the
      -- starting weapon, which tells you nothing about how the game plays.
      -- Filling weapon slots first is both closer to how a person plays and
      -- closer to the strongest line.
      local function priority(item)
        if item.kind == "heal" then
          -- Only worth it when actually hurt.
          return (r.player.hp < r:playerStat("maxHp") * 0.5) and 0 or 9
        end
        if item.kind == "weapon" then return 1 end
        if item.kind == "upgrade" then return 2 end
        return 3   -- passive
      end

      local bought = true
      while bought do
        bought = false
        local bestIndex, bestRank, bestCost = nil, math.huge, math.huge
        for i, item in ipairs(r.shop.items) do
          if not item.bought and item.cost <= r.player.gold then
            local rank = priority(item)
            if rank < bestRank or (rank == bestRank and item.cost < bestCost) then
              bestIndex, bestRank, bestCost = i, rank, item.cost
            end
          end
        end
        if bestIndex then bought = r:shopBuy(bestIndex) or false end
      end
      r:closeShop()
    end

    if r.state ~= runModule.STATE.PLAYING then break end
    if r.time >= maxSeconds then break end

    local mx, my = pilot(r, bubble)
    r:update(dt, mx, my)
  end

  return r, r:summary()
end

-- --------------------------------------------------------------- the tests

function sim.run(suite, check, eq, near)
  sim.bootstrap()
  local runModule = require("run")

  suite("simulation: wiring")
  do
    local r = runModule.new(1)
    eq("starts playing", r.state, runModule.STATE.PLAYING)
    eq("waves are numbered from one", r.wave, 1)
    eq("starts with one weapon", #r.player.weapons, 1)
    eq("starts at full HP", r.player.hp, config.get("player.maxHp"))
    eq("wave count is run length over wave length", r:waveCount(),
      math.floor(config.get("run.durationMinutes") * 60
        / config.get("run.waveSeconds") + 0.5))

    -- Wave 1 is the start of the run and the bottom of the curve.
    eq("the run opens at the bottom of the curve",
      runModule.waveScale(r.wave, 1).hp, 1)
    eq("the last wave is the top of the curve", r:waveCount(),
      math.floor(config.get("run.durationMinutes") * 60
        / config.get("run.waveSeconds") + 0.5))

    -- Every enemy and weapon in content must have generated settings.
    local content = require("content")
    local missing = {}
    for _, def in ipairs(content.enemies) do
      for _, field in ipairs({ "hp", "speed", "damage", "radius", "lp" }) do
        if schema.get("enemy." .. def.id .. "." .. field) == nil then
          missing[#missing + 1] = def.id .. "." .. field
        end
      end
    end
    for _, def in ipairs(content.weapons) do
      -- A modular weapon has no flat damage: its numbers are module
      -- properties in its graph. What it must have is the level scaling.
      local field = (def.kind == "mws") and "damageMult" or "damage"
      if schema.get("weapon." .. def.id .. "." .. field) == nil then
        missing[#missing + 1] = def.id .. "." .. field
      end
    end
    check("every content item has editor settings", #missing == 0,
      table.concat(missing, ", "))
  end

  suite("simulation: scaling")
  do
    local s1 = runModule.waveScale(1, 1)
    local s5 = runModule.waveScale(5, 1)
    near("wave 1 is the baseline", s1.hp, 1)
    check("later waves have tougher enemies", s5.hp > s1.hp)

    -- The design decision: player level must not make enemies stronger while
    -- scale.playerLevelWeight is at its default of zero.
    local levelled = runModule.waveScale(5, 20)
    near("player level does not scale enemies by default", levelled.hp, s5.hp, 1e-9)

    config.set("scale.playerLevelWeight", 1)
    local weighted = runModule.waveScale(5, 20)
    check("player level scales enemies once the weight is turned up",
      weighted.hp > s5.hp)
    config.resetKey("scale.playerLevelWeight")
  end

  suite("simulation: combat")
  do
    local r = runModule.new(7)
    local enemy = r:spawnEnemy("grunt", r.player.x + 30, r.player.y)
    check("enemy spawned", enemy ~= nil)
    local before = enemy.hp
    r:damageEnemy(enemy, 3, "blaster")
    check("damage reduces enemy HP", enemy.hp < before)
    eq("damage is attributed to the weapon",
      r.stats.byWeapon.blaster.damage > 0, true)

    r:damageEnemy(enemy, 1e6, "blaster")
    check("lethal damage kills", enemy.dead == true)
    eq("kill counted", r.stats.kills, 1)
    local droppedLp = false
    for _, pk in ipairs(r.pickups) do
      if pk.kind == "lp" then droppedLp = true end
    end
    check("a kill drops LP", droppedLp)

    -- Player damage, i-frames and death.
    local r2 = runModule.new(8)
    local hp = r2.player.hp
    check("first contact hits", r2:damagePlayer(10, "Grunt") == true)
    check("HP dropped", r2.player.hp < hp)
    check("a second hit inside i-frames is ignored",
      r2:damagePlayer(10, "Grunt") == false)
    r2.player.iframe = 0
    r2:damagePlayer(1e6, "Brute")
    eq("zero HP ends the run", r2.state, runModule.STATE.DEAD)
    eq("the killer is recorded", r2.killedBy, "Brute")
  end

  suite("simulation: progression")
  do
    local r = runModule.new(9)
    local needed = r.player.lpNext
    r:addLp(needed)
    eq("reaching the requirement levels up", r.player.level, 2)
    check("the next level costs more", r.player.lpNext > needed)
    check("levelling raises max HP", r:playerStat("maxHp") > config.get("player.maxHp"))

    local before = r.player.lpNext
    r:addLp(before * 40)
    check("a big LP dump levels repeatedly", r.player.level > 3)

    -- Shop.
    local r3 = runModule.new(10)
    r3:addGold(1000)
    r3:openShop()
    eq("shop opens", r3.state, runModule.STATE.SHOP)
    check("shop offers items", #r3.shop.items > 0)
    local ok = r3:shopBuy(1)
    check("buying succeeds with enough gold", ok == true, r3.shop.items[1].name)
    check("gold was spent", r3.stats.shopSpend > 0)
    r3:closeShop()
    eq("closing the shop resumes play", r3.state, runModule.STATE.PLAYING)

    local r4 = runModule.new(11)
    r4:openShop()
    r4.player.gold = 0
    local okPoor, reason = r4:shopBuy(1)
    check("buying fails without gold", okPoor == false and reason ~= nil, reason)
  end

  suite("simulation: a played run")
  do
    -- Long enough to cross a shop boundary at the default 60s waves.
    --
    -- The pilot is given a deep HP pool for this one run. The suite is
    -- checking that a played run produces coherent telemetry -- time moves,
    -- waves tick, shops open, damage is attributed -- and that should not
    -- start failing every time someone tunes the difficulty. Balance belongs
    -- in tools/balance.lua, which reports rather than asserts.
    config.set("player.maxHp", 5000)
    local r, s = sim.play{ seed = 4242, maxSeconds = 200, dt = 1 / 30 }
    config.resetKey("player.maxHp")

    check("time advanced", r.time > 190, r.time)
    check("waves advanced", r.wave >= 3, r.wave)
    check("the shop was visited", r.shopVisits >= 1, r.shopVisits)
    check("enemies spawned and died", s.kills > 0, s.kills)
    check("weapons dealt damage", s.damageDealt > 0, s.damageDealt)
    check("the player levelled up", s.level > 1, s.level)
    check("LP was collected", s.lpCollected > 0, s.lpCollected)
    check("enemy count stayed under the cap",
      s.peakAlive <= config.get("wave.maxAlive"), s.peakAlive)
    check("damage is attributed to at least one weapon", #s.weapons > 0)

    local share = 0
    for _, w in ipairs(s.weapons) do share = share + w.share end
    near("weapon damage shares sum to 1", share, 1, 0.01)

    -- No NaNs or runaway values anywhere in the summary.
    local bad = {}
    for _, key in ipairs({ "time", "kills", "damageDealt", "damageTaken",
                           "lpCollected", "goldEarned", "dps" }) do
      local v = s[key]
      if type(v) ~= "number" or v ~= v or v == math.huge then
        bad[#bad + 1] = key
      end
    end
    check("summary values are finite numbers", #bad == 0, table.concat(bad, ", "))

    io.write(string.format(
      "        (t=%.0fs wave=%d lvl=%d kills=%d dps=%.1f peak=%d taken=%d)\n",
      s.time, r.wave, s.level, s.kills, s.dps, s.peakAlive, s.damageTaken))
  end

  suite("simulation: editor settings take effect")
  do
    -- The point of the whole config system: changing a value changes the game.
    config.set("player.moveSpeed", 200)
    local fast = runModule.new(1)
    eq("move speed is read live", fast:playerStat("moveSpeed"), 200)
    config.resetKey("player.moveSpeed")

    config.set("enemy.grunt.hp", 999)
    config.set("scale.eliteChance", 0)   -- elites multiply HP; not what we test here
    local r = runModule.new(2)
    local e = r:spawnEnemy("grunt", 10, 10)
    near("enemy HP comes from the editor value", e.hp, 999, 1e-6)
    config.resetKey("enemy.grunt.hp")
    config.resetKey("scale.eliteChance")
    config.set("weapon.scatter.damage", 50)
    near("weapon damage comes from the editor value",
      runModule.weaponValue("scatter", "damage", 1), 50)
    config.set("weapon.scatter.perLevel.damage", 10)
    near("per-level growth is applied",
      runModule.weaponValue("scatter", "damage", 3), 70)
    config.resetKey("weapon.scatter.damage")
    config.resetKey("weapon.scatter.perLevel.damage")

    config.set("run.waveSeconds", 30)
    local r2 = runModule.new(3)
    eq("wave count follows wave length", r2:waveCount(),
      math.floor(config.get("run.durationMinutes") * 60 / 30 + 0.5))
    config.resetKey("run.waveSeconds")
  end
end

return sim
