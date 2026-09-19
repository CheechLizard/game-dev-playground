-- The run simulation.
--
-- This file contains no love.graphics calls and never reads input directly:
-- run.update takes a movement vector. That keeps the whole simulation runnable
-- headless, which is what tools/simsuite.lua uses to check balance without a
-- window.

local config = require("framework.config")
local content = require("content")

local run = {}
run.__index = run

local STATE = { PLAYING = "playing", SHOP = "shop", DEAD = "dead", WON = "won" }
run.STATE = STATE

-- ------------------------------------------------------------------- rng
-- Own generator so a seed reproduces a run exactly, in tests and in the game.

local function makeRng(seed)
  local state = (seed or 1) % 2147483647
  if state <= 0 then state = state + 2147483646 end
  return {
    next = function()
      state = (state * 16807) % 2147483647
      return (state - 1) / 2147483646
    end,
  }
end

-- --------------------------------------------------------------- helpers

local function len(x, y) return math.sqrt(x * x + y * y) end

local function normalise(x, y)
  local l = len(x, y)
  if l < 1e-6 then return 0, 0, 0 end
  return x / l, y / l, l
end

local C = config

--- A weapon's value for a field at a given level: base plus per-level growth.
function run.weaponValue(weaponId, field, level)
  local base = C.get("weapon." .. weaponId .. "." .. field)
  if base == nil then return nil end
  local growth = C.get("weapon." .. weaponId .. ".perLevel." .. field) or 0
  return base + growth * ((level or 1) - 1)
end

--- Enemy stat scaling for a wave. Player level contributes only when
-- scale.playerLevelWeight is turned up from its default of zero.
function run.waveScale(wave, playerLevel)
  local w = math.max(0, wave - 1)
  local weight = C.values.scale.playerLevelWeight or 0
  local effective = w + weight * math.max(0, (playerLevel or 1) - 1)
  local s = C.values.scale
  return {
    hp = (1 + s.hpPerWave) ^ effective,
    damage = (1 + s.damagePerWave) ^ effective,
    speed = (1 + s.speedPerWave) ^ effective,
    lp = (1 + s.lpPerWave) ^ effective,
  }
end

-- ------------------------------------------------------------------ init

function run.new(seed)
  local self = setmetatable({}, run)
  self.rng = makeRng(seed or os.time())
  self.seed = seed
  self:reset()
  return self
end

function run:reset()
  local c = C.values
  self.state = STATE.PLAYING
  self.time = 0
  self.wave = 1
  self.waveTime = 0
  self.spawnTimer = 0
  self.shakeAmount = 0
  self.shopVisits = 0
  self.pendingShop = false
  self.events = {}

  self.arenaW = c.run.arenaWidth
  self.arenaH = c.run.arenaHeight

  self.player = {
    x = self.arenaW / 2, y = self.arenaH / 2,
    vx = 0, vy = 0,
    hp = c.player.maxHp,
    maxHp = c.player.maxHp,
    level = 1,
    lp = 0,
    lpNext = c.level.baseRequirement,
    gold = c.economy.startingGold,
    iframe = 0,
    facingX = 0, facingY = 1,
    hitFlash = 0,
    -- Level-up bonuses accumulate here rather than mutating config, so the
    -- editor keeps showing the base values you typed.
    bonus = { maxHp = 0, damage = 0, attackSpeed = 0, moveSpeed = 0,
              pickupRange = 0, area = 0, crit = 0, goldFind = 0 },
    -- passive id -> how many times it has been bought, for pricing and caps
    passives = {},
    weapons = {},
  }

  self.enemies = {}
  self.projectiles = {}
  self.enemyShots = {}
  self.pickups = {}

  self.stats = {
    kills = 0, killsByType = {}, damageDealt = 0, damageTaken = 0,
    goldEarned = 0, lpCollected = 0, levelUps = 0, elitesKilled = 0,
    byWeapon = {}, damageTakenBy = {}, peakAlive = 0, shopSpend = 0,
  }
  self.killedBy = nil
  self.shop = nil

  -- After stats: addWeapon records into stats.byWeapon.
  self:addWeapon(c.player.startingWeapon)
end

--- Stacks a passive onto the player. Raising max HP heals by the same amount,
-- so buying Plating mid-fight is not a downgrade in effective health.
function run:addPassive(id)
  local def = content.passiveById[id]
  if not def then return false, "no such passive" end
  local owned = self.player.passives[id] or 0
  if owned >= C.get("passive." .. id .. ".maxStacks") then
    return false, "maxed out"
  end
  local amount = C.get("passive." .. id .. ".amount")
  self.player.bonus[def.stat] = (self.player.bonus[def.stat] or 0) + amount
  if def.stat == "maxHp" then
    self.player.maxHp = self:playerStat("maxHp")
    self.player.hp = self.player.hp + amount
  end
  self.player.passives[id] = owned + 1
  return true
end

--- What the next stack of a passive costs, given how many are already owned.
function run:passiveCost(id, priceMult)
  local owned = self.player.passives[id] or 0
  local base = C.get("passive." .. id .. ".cost")
  local growth = C.get("passive." .. id .. ".costGrowth")
  return math.ceil(base * (1 + growth * owned) * (priceMult or 1))
end

function run:durationSeconds()
  return C.values.run.durationMinutes * 60
end

-- A run is its length divided by the wave length. The wave number is both the
-- player's progress and its position on the difficulty curve; there is no
-- offset between the two.
function run:waveCount()
  return math.max(1, math.floor(
    self:durationSeconds() / C.values.run.waveSeconds + 0.5))
end

function run:log(kind, text)
  self.events[#self.events + 1] = { time = self.time, kind = kind, text = text }
  if #self.events > 40 then table.remove(self.events, 1) end
end

-- --------------------------------------------------------------- weapons

function run:addWeapon(id)
  local def = content.weaponById[id]
  if not def then return nil end
  for _, w in ipairs(self.player.weapons) do
    if w.id == id then return nil, "already owned" end
  end
  if #self.player.weapons >= C.values.player.weaponSlots then
    return nil, "no free slot"
  end
  local weapon = {
    id = id, def = def, level = 1, timer = 0, angle = 0,
    slot = #self.player.weapons + 1,
  }
  self.player.weapons[#self.player.weapons + 1] = weapon
  self.stats.byWeapon[id] = self.stats.byWeapon[id]
    or { damage = 0, kills = 0, hits = 0, level = 1, name = def.name }
  return weapon
end

function run:upgradeWeapon(id)
  for _, w in ipairs(self.player.weapons) do
    if w.id == id then
      local max = C.get("weapon." .. id .. ".maxLevel")
      if w.level >= max then return false, "at max level" end
      w.level = w.level + 1
      self.stats.byWeapon[id].level = w.level
      return true
    end
  end
  return false, "not owned"
end

function run:hasWeapon(id)
  for _, w in ipairs(self.player.weapons) do
    if w.id == id then return w end
  end
  return nil
end

-- ------------------------------------------------------------ derived stats

function run:playerStat(name)
  local p = self.player
  local c = C.values.player
  if name == "moveSpeed" then return c.moveSpeed + p.bonus.moveSpeed end
  if name == "maxHp" then return c.maxHp + p.bonus.maxHp end
  if name == "damageMult" then return c.damageMult + p.bonus.damage end
  if name == "attackSpeedMult" then return c.attackSpeedMult + p.bonus.attackSpeed end
  if name == "areaMult" then return c.areaMult + p.bonus.area end
  if name == "pickupRange" then return c.pickupRange + p.bonus.pickupRange end
  if name == "critChance" then return c.critChance + p.bonus.crit end
  if name == "goldFind" then return c.goldFind + p.bonus.goldFind end
  return c[name]
end

-- ------------------------------------------------------------------ spawn

function run:spawnEnemy(id, x, y)
  local def = content.enemyById[id]
  if not def then return nil end
  local scale = run.waveScale(self.wave, self.player.level)
  local key = "enemy." .. id .. "."
  local elite = self.rng.next() < C.values.scale.eliteChance

  local hp = C.get(key .. "hp") * scale.hp * (elite and C.values.scale.eliteHpMult or 1)
  local enemy = {
    id = id, def = def,
    x = x, y = y, vx = 0, vy = 0,
    hp = hp, maxHp = hp,
    radius = C.get(key .. "radius") * (elite and 1.7 or 1),
    speed = C.get(key .. "speed") * scale.speed
      * (elite and C.values.scale.eliteSpeedMult or 1),
    damage = C.get(key .. "damage") * scale.damage,
    lp = C.get(key .. "lp") * scale.lp * (elite and C.values.scale.eliteRewardMult or 1),
    knockback = C.get(key .. "knockback"),
    elite = elite,
    behaviour = def.behaviour,
    stateTimer = 0, phase = "approach",
    hitFlash = 0,
    hitCooldowns = {},
    orbitDir = self.rng.next() < 0.5 and -1 or 1,
  }
  if def.behaviour == "shoot" then
    -- Stagger initial cooldowns so a spawned group does not volley in unison.
    enemy.shootTimer = C.get(key .. "shootCooldown") * self.rng.next()
  elseif def.behaviour == "charge" then
    enemy.stateTimer = C.get(key .. "chargeCooldown") * self.rng.next()
  end
  self.enemies[#self.enemies + 1] = enemy
  return enemy
end

--- A point just outside the visible area, in a random direction.
function run:offscreenPoint()
  local margin = C.values.wave.spawnMargin
  local halfW = C.values.render.width / 2 + margin
  local halfH = C.values.render.height / 2 + margin
  local p = self.player
  local angle = self.rng.next() * math.pi * 2
  -- Project the angle onto the rectangle around the view so enemies appear
  -- evenly around the edge rather than bunching at the corners.
  local dx, dy = math.cos(angle), math.sin(angle)
  local tx = math.abs(dx) > 1e-6 and (halfW / math.abs(dx)) or math.huge
  local ty = math.abs(dy) > 1e-6 and (halfH / math.abs(dy)) or math.huge
  local t = math.min(tx, ty)
  local x = p.x + dx * t
  local y = p.y + dy * t
  return math.max(4, math.min(self.arenaW - 4, x)),
         math.max(4, math.min(self.arenaH - 4, y))
end

local function pickWeighted(rng, ids)
  local total = 0
  local weights = {}
  for i, id in ipairs(ids) do
    local w = C.get("enemy." .. id .. ".weight") or 1
    weights[i] = w
    total = total + w
  end
  if total <= 0 then return ids[1] end
  local roll = rng.next() * total
  for i, id in ipairs(ids) do
    roll = roll - weights[i]
    if roll <= 0 then return id end
  end
  return ids[#ids]
end

function run:updateSpawning(dt)
  local waveCount = self:waveCount()
  -- Interpolate spawn pressure from wave 1 to the last wave.
  local t = (waveCount > 1) and ((self.wave - 1) / (waveCount - 1)) or 1
  t = math.max(0, math.min(1, t))
  local c = C.values.wave
  local interval = c.tickStart + (c.tickEnd - c.tickStart) * t
  local perPulse = c.countStart + (c.countEnd - c.countStart) * t

  self.spawnTimer = self.spawnTimer - dt
  if self.spawnTimer > 0 then return end
  self.spawnTimer = self.spawnTimer + math.max(0.05, interval)

  if #self.enemies >= c.maxAlive then return end

  local ids = content.unlockedAt(self.wave)
  local count = math.floor(perPulse + self.rng.next())
  for _ = 1, count do
    if #self.enemies >= c.maxAlive then break end
    local x, y = self:offscreenPoint()
    self:spawnEnemy(pickWeighted(self.rng, ids), x, y)
  end
end

-- ------------------------------------------------------------------ waves

function run:advanceWave()
  local c = C.values
  local gold = c.economy.goldPerWave + c.economy.goldWaveGrowth * (self.wave - 1)
  self:addGold(gold)
  self:log("wave", string.format("Wave %d cleared (+%d gold)", self.wave, math.floor(gold)))

  if self.wave % c.run.wavesPerShop == 0 then
    self.pendingShop = true
  end
  self.wave = self.wave + 1
  self.waveTime = 0

  if self.pendingShop then
    self:openShop()
  end
end

-- ------------------------------------------------------------------- shop

--- Build the shop offer. New weapons the player can hold, upgrades for what
-- they already have, plus a heal. Priced against the current wave.
function run:rollShop()
  local c = C.values
  local priceMult = 1 + c.shop.priceWaveGrowth * (self.wave - 1)
  local candidates = {}

  for _, def in ipairs(content.weapons) do
    local owned = self:hasWeapon(def.id)
    if owned then
      local max = C.get("weapon." .. def.id .. ".maxLevel")
      if owned.level < max then
        candidates[#candidates + 1] = {
          kind = "upgrade", weaponId = def.id,
          name = def.name .. " Lv" .. (owned.level + 1),
          blurb = def.blurb,
          cost = math.ceil(C.get("weapon." .. def.id .. ".upgradeCost")
            * priceMult * (1 + 0.25 * (owned.level - 1))),
        }
      end
    elseif #self.player.weapons < c.player.weaponSlots then
      candidates[#candidates + 1] = {
        kind = "weapon", weaponId = def.id, name = def.name,
        blurb = def.blurb,
        cost = math.ceil(math.max(1, C.get("weapon." .. def.id .. ".cost")) * priceMult),
      }
    end
  end

  for _, def in ipairs(content.passives) do
    local owned = self.player.passives[def.id] or 0
    if owned < C.get("passive." .. def.id .. ".maxStacks") then
      candidates[#candidates + 1] = {
        kind = "passive", passiveId = def.id,
        name = owned > 0 and (def.name .. " x" .. (owned + 1)) or def.name,
        blurb = def.blurb,
        cost = self:passiveCost(def.id, priceMult),
      }
    end
  end

  candidates[#candidates + 1] = {
    kind = "heal",
    name = "Field Repair (+" .. math.floor(c.shop.healAmount) .. " HP)",
    blurb = "Patch yourself up.",
    cost = math.ceil(c.shop.healCost * priceMult),
  }

  -- Shuffle, then take the first N.
  for i = #candidates, 2, -1 do
    local j = math.floor(self.rng.next() * i) + 1
    candidates[i], candidates[j] = candidates[j], candidates[i]
  end
  local items = {}
  for i = 1, math.min(c.shop.itemCount, #candidates) do items[i] = candidates[i] end
  return items
end

function run:openShop()
  self.state = STATE.SHOP
  self.pendingShop = false
  self.shopVisits = self.shopVisits + 1
  self.shop = {
    items = self:rollShop(),
    rerollCost = C.values.shop.rerollCost,
    rerolls = 0,
    cursor = 1,
  }
end

function run:shopBuy(index)
  local shop = self.shop
  if not shop then return false, "shop is closed" end
  local item = shop.items[index]
  if not item or item.bought then return false, "nothing there" end
  if self.player.gold < item.cost then return false, "not enough gold" end

  if item.kind == "weapon" then
    local ok, err = self:addWeapon(item.weaponId)
    if not ok then return false, err end
  elseif item.kind == "upgrade" then
    local ok, err = self:upgradeWeapon(item.weaponId)
    if not ok then return false, err end
  elseif item.kind == "heal" then
    self.player.hp = math.min(self:playerStat("maxHp"),
      self.player.hp + C.values.shop.healAmount)
  elseif item.kind == "passive" then
    local ok, err = self:addPassive(item.passiveId)
    if not ok then return false, err end
  end

  self.player.gold = self.player.gold - item.cost
  self.stats.shopSpend = self.stats.shopSpend + item.cost
  item.bought = true
  return true
end

function run:shopReroll()
  local shop = self.shop
  if not shop then return false end
  if self.player.gold < shop.rerollCost then return false, "not enough gold" end
  self.player.gold = self.player.gold - shop.rerollCost
  self.stats.shopSpend = self.stats.shopSpend + shop.rerollCost
  shop.rerolls = shop.rerolls + 1
  shop.rerollCost = shop.rerollCost + C.values.shop.rerollGrowth
  shop.items = self:rollShop()
  return true
end

function run:closeShop()
  self.shop = nil
  if self.state == STATE.SHOP then self.state = STATE.PLAYING end
end

-- ------------------------------------------------------------------ level

function run:addGold(amount)
  amount = amount * self:playerStat("goldFind")
  self.player.gold = self.player.gold + amount
  self.stats.goldEarned = self.stats.goldEarned + amount
end

function run:addLp(amount)
  local p = self.player
  p.lp = p.lp + amount
  self.stats.lpCollected = self.stats.lpCollected + amount
  local guard = 0
  while p.lp >= p.lpNext and guard < 50 do
    guard = guard + 1
    p.lp = p.lp - p.lpNext
    self:levelUp()
  end
end

function run:levelUp()
  local p = self.player
  local c = C.values.level
  p.level = p.level + 1
  self.stats.levelUps = self.stats.levelUps + 1

  p.bonus.maxHp = p.bonus.maxHp + c.bonusMaxHp
  p.bonus.damage = p.bonus.damage + c.bonusDamage
  p.bonus.attackSpeed = p.bonus.attackSpeed + c.bonusAttackSpeed
  p.bonus.moveSpeed = p.bonus.moveSpeed + c.bonusMoveSpeed
  p.bonus.pickupRange = p.bonus.pickupRange + c.bonusPickupRange
  p.bonus.area = p.bonus.area + c.bonusArea

  p.hp = math.min(self:playerStat("maxHp"), p.hp + c.bonusHealOnLevel)
  -- Requirement grows multiplicatively plus a flat term, so early levels are
  -- quick without late levels becoming unreachable.
  p.lpNext = p.lpNext * c.growth + c.flatGrowth
  self:log("level", "Level " .. p.level)
end

-- ----------------------------------------------------------------- damage

function run:damageEnemy(enemy, amount, weaponId, kx, ky)
  if enemy.dead then return end
  local crit = false
  if weaponId then
    local chance = (run.weaponValue(weaponId, "critChance", self:weaponLevel(weaponId)) or 0)
      + self:playerStat("critChance")
    if self.rng.next() < chance then
      crit = true
      amount = amount * C.values.player.critMult
    end
  end

  enemy.hp = enemy.hp - amount
  enemy.hitFlash = C.values.render.hitFlash
  self.stats.damageDealt = self.stats.damageDealt + amount

  if weaponId then
    local ws = self.stats.byWeapon[weaponId]
    if ws then
      ws.damage = ws.damage + amount
      ws.hits = ws.hits + 1
      if crit then ws.crits = (ws.crits or 0) + 1 end
    end
  end

  if kx and ky and enemy.knockback > 0 then
    enemy.vx = enemy.vx + kx * enemy.knockback
    enemy.vy = enemy.vy + ky * enemy.knockback
  end

  if enemy.hp <= 0 then
    self:killEnemy(enemy, weaponId)
  end
  return crit
end

function run:weaponLevel(id)
  local w = self:hasWeapon(id)
  return w and w.level or 1
end

function run:killEnemy(enemy, weaponId)
  enemy.dead = true
  self.stats.kills = self.stats.kills + 1
  self.stats.killsByType[enemy.id] = (self.stats.killsByType[enemy.id] or 0) + 1
  if enemy.elite then self.stats.elitesKilled = self.stats.elitesKilled + 1 end
  if weaponId and self.stats.byWeapon[weaponId] then
    self.stats.byWeapon[weaponId].kills = self.stats.byWeapon[weaponId].kills + 1
  end

  local luck = C.values.player.luck
  local rewardMult = enemy.elite and C.values.scale.eliteRewardMult or 1

  self:addPickup("lp", enemy.x, enemy.y, enemy.lp)

  if self.rng.next() < (C.get("enemy." .. enemy.id .. ".goldChance") * luck) then
    self:addPickup("gold", enemy.x, enemy.y,
      C.values.economy.goldPerDrop * rewardMult)
  end
  if self.rng.next() < (C.get("enemy." .. enemy.id .. ".hpChance") * luck) then
    self:addPickup("hp", enemy.x, enemy.y, C.values.economy.healthDropAmount)
  end
  if self.rng.next() < (C.values.economy.weaponDropChance * luck) then
    local missing = {}
    for _, def in ipairs(content.weapons) do
      if not self:hasWeapon(def.id) then missing[#missing + 1] = def.id end
    end
    if #missing > 0 and #self.player.weapons < C.values.player.weaponSlots then
      local pick = missing[math.floor(self.rng.next() * #missing) + 1]
      self:addPickup("weapon", enemy.x, enemy.y, 0, pick)
    end
  end
end

function run:damagePlayer(amount, sourceName)
  local p = self.player
  if p.iframe > 0 or self.state ~= STATE.PLAYING then return false end

  local reduced = math.max(1, amount - C.values.player.armor)
  p.hp = p.hp - reduced
  p.iframe = C.values.player.iframes
  p.hitFlash = C.values.render.hitFlash * 2
  self.stats.damageTaken = self.stats.damageTaken + reduced
  if sourceName then
    self.stats.damageTakenBy[sourceName] =
      (self.stats.damageTakenBy[sourceName] or 0) + reduced
  end
  self.shakeAmount = math.min(6, self.shakeAmount + 2.5)

  if p.hp <= 0 then
    p.hp = 0
    self.state = STATE.DEAD
    self.killedBy = sourceName or "something"
    self:log("death", "Killed by " .. self.killedBy)
  end
  return true
end

-- ---------------------------------------------------------------- pickups

function run:addPickup(kind, x, y, value, payload)
  self.pickups[#self.pickups + 1] = {
    kind = kind, x = x, y = y, value = value or 0, payload = payload,
    vx = (self.rng.next() - 0.5) * 30, vy = (self.rng.next() - 0.5) * 30,
    life = (kind == "lp") and math.huge or C.values.economy.dropLifetime,
    homing = false,
  }
end

function run:updatePickups(dt)
  local p = self.player
  local range = self:playerStat("pickupRange")
  local rangeSq = range * range
  local speed = C.values.player.pickupSpeed
  local alive = {}

  for _, pk in ipairs(self.pickups) do
    pk.life = pk.life - dt
    local dx, dy = p.x - pk.x, p.y - pk.y
    local distSq = dx * dx + dy * dy

    if distSq < rangeSq then pk.homing = true end

    if pk.homing then
      local nx, ny = normalise(dx, dy)
      -- Accelerate as it closes, so collection feels snappy rather than floaty.
      local pull = speed * (1 + (1 - math.min(1, math.sqrt(distSq) / math.max(1, range))))
      pk.x = pk.x + nx * pull * dt
      pk.y = pk.y + ny * pull * dt
    else
      pk.x = pk.x + pk.vx * dt
      pk.y = pk.y + pk.vy * dt
      pk.vx = pk.vx * 0.86
      pk.vy = pk.vy * 0.86
    end

    local collectRadius = C.values.player.radius + 3
    if distSq < collectRadius * collectRadius then
      if pk.kind == "lp" then
        self:addLp(pk.value)
      elseif pk.kind == "gold" then
        self:addGold(pk.value)
      elseif pk.kind == "hp" then
        p.hp = math.min(self:playerStat("maxHp"), p.hp + pk.value)
      elseif pk.kind == "weapon" then
        local ok = self:addWeapon(pk.payload)
        if ok then
          self:log("pickup", "Picked up " .. content.weaponById[pk.payload].name)
        end
      end
    elseif pk.life > 0 then
      alive[#alive + 1] = pk
    end
  end
  self.pickups = alive
end

-- ------------------------------------------------------------------ enemy

local function seekPlayer(enemy, p, speed, dt)
  local nx, ny = normalise(p.x - enemy.x, p.y - enemy.y)
  enemy.vx = enemy.vx + (nx * speed - enemy.vx) * math.min(1, dt * 8)
  enemy.vy = enemy.vy + (ny * speed - enemy.vy) * math.min(1, dt * 8)
end

function run:updateEnemies(dt)
  local p = self.player
  local alive = {}

  for _, e in ipairs(self.enemies) do
    if not e.dead then
      e.hitFlash = math.max(0, e.hitFlash - dt)
      local key = "enemy." .. e.id .. "."

      if e.behaviour == "chase" then
        seekPlayer(e, p, e.speed, dt)

      elseif e.behaviour == "shoot" then
        local dx, dy = p.x - e.x, p.y - e.y
        local _, _, dist = normalise(dx, dy)
        local preferred = C.get(key .. "shootRange")
        -- Close in when far, back off when too close: a soft standoff band.
        local sign = (dist > preferred * 1.1) and 1 or (dist < preferred * 0.75 and -1 or 0)
        local nx, ny = normalise(dx, dy)
        e.vx = e.vx + (nx * e.speed * sign - e.vx) * math.min(1, dt * 6)
        e.vy = e.vy + (ny * e.speed * sign - e.vy) * math.min(1, dt * 6)

        e.shootTimer = (e.shootTimer or 0) - dt
        if e.shootTimer <= 0 and dist < preferred * 1.6 then
          e.shootTimer = C.get(key .. "shootCooldown")
          local sx, sy = normalise(dx, dy)
          self.enemyShots[#self.enemyShots + 1] = {
            x = e.x, y = e.y,
            vx = sx * C.get(key .. "shotSpeed"),
            vy = sy * C.get(key .. "shotSpeed"),
            radius = C.get(key .. "shotRadius"),
            damage = C.get(key .. "shotDamage")
              * run.waveScale(self.wave, p.level).damage,
            life = C.get(key .. "shotLife"), source = e.def.name,
          }
        end

      elseif e.behaviour == "charge" then
        local dx, dy = p.x - e.x, p.y - e.y
        local _, _, dist = normalise(dx, dy)
        e.stateTimer = e.stateTimer - dt
        if e.phase == "approach" then
          seekPlayer(e, p, e.speed, dt)
          if dist < C.get(key .. "chargeRange") and e.stateTimer <= 0 then
            e.phase = "windup"
            e.stateTimer = C.get(key .. "chargeWindup")
          end
        elseif e.phase == "windup" then
          -- Stand still and telegraph, then commit to a fixed direction.
          e.vx, e.vy = e.vx * 0.82, e.vy * 0.82
          if e.stateTimer <= 0 then
            local cx, cy = normalise(dx, dy)
            e.chargeX, e.chargeY = cx, cy
            e.phase = "charging"
            e.stateTimer = C.get(key .. "chargeDuration")
          end
        elseif e.phase == "charging" then
          local cs = C.get(key .. "chargeSpeed")
          e.vx = e.chargeX * cs
          e.vy = e.chargeY * cs
          if e.stateTimer <= 0 then
            e.phase = "approach"
            e.stateTimer = C.get(key .. "chargeCooldown")
          end
        end

      elseif e.behaviour == "orbit" then
        local dx, dy = p.x - e.x, p.y - e.y
        local nx, ny, dist = normalise(dx, dy)
        local target = C.get(key .. "orbitRadius")
        local radial = (dist - target) * 2
        local tangentX, tangentY = -ny * e.orbitDir, nx * e.orbitDir
        local orbitSpeed = C.get(key .. "orbitSpeed")
        local desiredX = nx * math.max(-e.speed, math.min(e.speed, radial)) + tangentX * orbitSpeed
        local desiredY = ny * math.max(-e.speed, math.min(e.speed, radial)) + tangentY * orbitSpeed
        e.vx = e.vx + (desiredX - e.vx) * math.min(1, dt * 5)
        e.vy = e.vy + (desiredY - e.vy) * math.min(1, dt * 5)
      end

      e.x = e.x + e.vx * dt
      e.y = e.y + e.vy * dt

      -- Contact damage.
      local dx, dy = p.x - e.x, p.y - e.y
      local reach = e.radius + C.values.player.radius
      if dx * dx + dy * dy < reach * reach then
        self:damagePlayer(e.damage, e.def.name)
      end

      alive[#alive + 1] = e
    end
  end
  self.enemies = alive
  if #alive > self.stats.peakAlive then self.stats.peakAlive = #alive end
end

--- Push overlapping enemies apart so packs spread into a ring rather than
-- stacking into a single high-damage point. One relaxation pass is enough.
function run:separateEnemies(dt)
  local enemies = self.enemies
  local n = #enemies
  if n < 2 then return end

  local cell = 16
  local buckets = {}
  for i = 1, n do
    local e = enemies[i]
    local key = math.floor(e.x / cell) * 73856093 + math.floor(e.y / cell) * 19349663
    local bucket = buckets[key]
    if not bucket then bucket = {} ; buckets[key] = bucket end
    bucket[#bucket + 1] = i
  end

  for _, bucket in pairs(buckets) do
    for a = 1, #bucket do
      for b = a + 1, #bucket do
        local ea, eb = enemies[bucket[a]], enemies[bucket[b]]
        local dx, dy = eb.x - ea.x, eb.y - ea.y
        local minDist = ea.radius + eb.radius
        local d2 = dx * dx + dy * dy
        if d2 > 1e-6 and d2 < minDist * minDist then
          local d = math.sqrt(d2)
          local push = (minDist - d) * 0.5
          local nx, ny = dx / d, dy / d
          ea.x = ea.x - nx * push
          ea.y = ea.y - ny * push
          eb.x = eb.x + nx * push
          eb.y = eb.y + ny * push
        end
      end
    end
  end
end

function run:updateEnemyShots(dt)
  local p = self.player
  local alive = {}
  for _, s in ipairs(self.enemyShots) do
    s.x = s.x + s.vx * dt
    s.y = s.y + s.vy * dt
    s.life = s.life - dt
    local dx, dy = p.x - s.x, p.y - s.y
    local reach = s.radius + C.values.player.radius
    if dx * dx + dy * dy < reach * reach then
      self:damagePlayer(s.damage, s.source)
    elseif s.life > 0 then
      alive[#alive + 1] = s
    end
  end
  self.enemyShots = alive
end

-- --------------------------------------------------------------- targeting

function run:nearestEnemy(x, y, maxRange)
  local best, bestDist = nil, (maxRange or 1e9) ^ 2
  for _, e in ipairs(self.enemies) do
    local dx, dy = e.x - x, e.y - y
    local d2 = dx * dx + dy * dy
    if d2 < bestDist then
      best, bestDist = e, d2
    end
  end
  return best, math.sqrt(bestDist)
end

-- ----------------------------------------------------------------- weapons

function run:fireWeapon(weapon, dt)
  local p = self.player
  local id = weapon.id
  local level = weapon.level
  local damage = run.weaponValue(id, "damage", level) * self:playerStat("damageMult")
  local area = self:playerStat("areaMult")

  if weapon.def.kind == "projectile" then
    local target, dist = self:nearestEnemy(p.x, p.y, 260)
    local dirX, dirY
    if weapon.def.targeting == "heading" then
      dirX, dirY = p.facingX, p.facingY
    elseif target then
      dirX, dirY = normalise(target.x - p.x, target.y - p.y)
    end
    weapon.target = target
    if not dirX then return false end

    local count = math.max(1, math.floor(run.weaponValue(id, "count", level) + 0.5))
    local spread = math.rad(run.weaponValue(id, "spread", level) or 0)
    local speed = run.weaponValue(id, "speed", level)
      * C.values.player.projectileSpeedMult
    local baseAngle = math.atan2(dirY, dirX)

    for i = 1, count do
      local offset = (count == 1) and 0
        or (spread * ((i - 1) / (count - 1) - 0.5))
      local a = baseAngle + offset
      self.projectiles[#self.projectiles + 1] = {
        x = p.x, y = p.y,
        vx = math.cos(a) * speed, vy = math.sin(a) * speed,
        radius = run.weaponValue(id, "radius", level) * area,
        damage = damage,
        pierce = math.floor(run.weaponValue(id, "pierce", level) + 0.5),
        life = run.weaponValue(id, "lifetime", level),
        knockback = run.weaponValue(id, "knockback", level),
        weaponId = id,
        hitSet = {},
      }
    end
    return true

  elseif weapon.def.kind == "aura" then
    local radius = run.weaponValue(id, "radius", level) * area
    local r2 = radius * radius
    local hit = false
    for _, e in ipairs(self.enemies) do
      local dx, dy = e.x - p.x, e.y - p.y
      if dx * dx + dy * dy < r2 then
        self:damageEnemy(e, damage, id)
        hit = true
      end
    end
    return hit
  end
  return false
end

--- Orbit weapons do not "fire"; their blades damage on contact, rate-limited
-- per enemy so a blade parked on a brute does not delete it instantly.
function run:updateOrbit(weapon, dt)
  local p = self.player
  local id = weapon.id
  local level = weapon.level
  local area = self:playerStat("areaMult")
  local count = math.max(1, math.floor(run.weaponValue(id, "count", level) + 0.5))
  local orbitRadius = run.weaponValue(id, "orbitRadius", level) * area
  local bladeRadius = run.weaponValue(id, "radius", level) * area
  local damage = run.weaponValue(id, "damage", level) * self:playerStat("damageMult")
  local cooldown = math.max(0.05,
    run.weaponValue(id, "cooldown", level) / self:playerStat("attackSpeedMult"))

  weapon.angle = (weapon.angle + math.rad(run.weaponValue(id, "orbitSpeed", level)) * dt)
    % (math.pi * 2)
  weapon.blades = weapon.blades or {}

  for i = 1, count do
    local a = weapon.angle + (i - 1) * (math.pi * 2 / count)
    local bx = p.x + math.cos(a) * orbitRadius
    local by = p.y + math.sin(a) * orbitRadius
    weapon.blades[i] = { x = bx, y = by, r = bladeRadius }

    for _, e in ipairs(self.enemies) do
      local dx, dy = e.x - bx, e.y - by
      local reach = e.radius + bladeRadius
      if dx * dx + dy * dy < reach * reach then
        local last = e.hitCooldowns[weapon.slot] or -1e9
        if self.time - last >= cooldown then
          e.hitCooldowns[weapon.slot] = self.time
          local kx, ky = normalise(dx, dy)
          local kb = run.weaponValue(id, "knockback", level)
          self:damageEnemy(e, damage, id, kx * kb, ky * kb)
        end
      end
    end
  end
  for i = count + 1, #weapon.blades do weapon.blades[i] = nil end
end

function run:updateWeapons(dt)
  local attackSpeed = self:playerStat("attackSpeedMult")
  for _, weapon in ipairs(self.player.weapons) do
    if weapon.def.kind == "orbit" then
      self:updateOrbit(weapon, dt)
    else
      weapon.timer = weapon.timer - dt
      local cooldown = math.max(0.03,
        run.weaponValue(weapon.id, "cooldown", weapon.level) / attackSpeed)
      if weapon.timer <= 0 then
        local fired = self:fireWeapon(weapon, dt)
        -- Retry soon rather than idling a whole cooldown when nothing was in
        -- range, so the weapon feels responsive when enemies arrive.
        weapon.timer = fired and cooldown or math.min(0.1, cooldown)
      end
    end
  end
end

function run:updateProjectiles(dt)
  local alive = {}
  for _, pr in ipairs(self.projectiles) do
    pr.x = pr.x + pr.vx * dt
    pr.y = pr.y + pr.vy * dt
    pr.life = pr.life - dt
    local spent = false

    for _, e in ipairs(self.enemies) do
      if not e.dead and not pr.hitSet[e] then
        local dx, dy = e.x - pr.x, e.y - pr.y
        local reach = e.radius + pr.radius
        if dx * dx + dy * dy < reach * reach then
          pr.hitSet[e] = true
          local kx, ky = normalise(pr.vx, pr.vy)
          self:damageEnemy(e, pr.damage, pr.weaponId, kx * pr.knockback, ky * pr.knockback)
          if pr.pierce <= 0 then spent = true break end
          pr.pierce = pr.pierce - 1
        end
      end
    end

    if not spent and pr.life > 0
       and pr.x > -40 and pr.x < self.arenaW + 40
       and pr.y > -40 and pr.y < self.arenaH + 40 then
      alive[#alive + 1] = pr
    end
  end
  self.projectiles = alive
end

-- ------------------------------------------------------------------ player

function run:updatePlayer(dt, moveX, moveY)
  local p = self.player
  local c = C.values.player
  local speed = self:playerStat("moveSpeed")

  if moveX ~= 0 or moveY ~= 0 then
    p.facingX, p.facingY = moveX, moveY
    p.vx = p.vx + moveX * c.accel * dt
    p.vy = p.vy + moveY * c.accel * dt
  else
    local sp = len(p.vx, p.vy)
    if sp > 0 then
      local drop = math.min(sp, c.friction * dt)
      p.vx = p.vx - (p.vx / sp) * drop
      p.vy = p.vy - (p.vy / sp) * drop
    end
  end

  local sp = len(p.vx, p.vy)
  if sp > speed then
    p.vx = p.vx / sp * speed
    p.vy = p.vy / sp * speed
  end

  p.x = math.max(c.radius, math.min(self.arenaW - c.radius, p.x + p.vx * dt))
  p.y = math.max(c.radius, math.min(self.arenaH - c.radius, p.y + p.vy * dt))

  p.iframe = math.max(0, p.iframe - dt)
  p.hitFlash = math.max(0, p.hitFlash - dt)
  p.maxHp = self:playerStat("maxHp")
  if c.hpRegen > 0 and p.hp > 0 then
    p.hp = math.min(p.maxHp, p.hp + c.hpRegen * dt)
  end
end

-- ------------------------------------------------------------------ update

function run:update(dt, moveX, moveY)
  if self.state == STATE.DEAD or self.state == STATE.WON then return end
  if self.state == STATE.SHOP then
    -- The clock optionally keeps running while shopping.
    if not C.values.run.shopPausesClock then self.time = self.time + dt end
    return
  end

  self.time = self.time + dt
  self.waveTime = self.waveTime + dt
  self.shakeAmount = math.max(0, self.shakeAmount - dt * 12)

  self:updatePlayer(dt, moveX or 0, moveY or 0)
  -- Sandbox runs (the zoo and the range) drive their own spawning and have no
  -- wave clock, so the run is a plain simulation of player, enemies and
  -- weapons. Everything else behaves exactly as it does in a real run, which
  -- is the point: what you test there is what you get.
  if not self.sandbox then self:updateSpawning(dt) end
  self:updateEnemies(dt)
  self:separateEnemies(dt)
  self:updateWeapons(dt)
  self:updateProjectiles(dt)
  self:updateEnemyShots(dt)
  self:updatePickups(dt)

  if self.sandbox then return end

  if self.waveTime >= C.values.run.waveSeconds then
    self:advanceWave()
  end

  if self.time >= self:durationSeconds() and self.state == STATE.PLAYING then
    self.state = STATE.WON
    self:log("win", "Survived the full run")
  end
end

-- ----------------------------------------------------------------- summary

--- Everything the death/victory screen shows. Sorted so the biggest
-- contributors read first.
function run:summary()
  local weapons = {}
  for id, s in pairs(self.stats.byWeapon) do
    local owned = self:hasWeapon(id)
    weapons[#weapons + 1] = {
      id = id, name = s.name, level = owned and owned.level or s.level,
      damage = s.damage, kills = s.kills, hits = s.hits, crits = s.crits or 0,
      dps = s.damage / math.max(1, self.time),
      share = 0,
    }
  end
  table.sort(weapons, function(a, b) return a.damage > b.damage end)
  local total = math.max(1, self.stats.damageDealt)
  for _, w in ipairs(weapons) do w.share = w.damage / total end

  local threats = {}
  for name, amount in pairs(self.stats.damageTakenBy) do
    threats[#threats + 1] = { name = name, damage = amount }
  end
  table.sort(threats, function(a, b) return a.damage > b.damage end)

  local kills = {}
  for id, n in pairs(self.stats.killsByType) do
    local def = content.enemyById[id]
    kills[#kills + 1] = { id = id, name = def and def.name or id, count = n }
  end
  table.sort(kills, function(a, b) return a.count > b.count end)

  return {
    outcome = self.state,
    killedBy = self.killedBy,
    time = self.time,
    wave = self.wave,
    level = self.player.level,
    gold = self.player.gold,
    goldEarned = self.stats.goldEarned,
    shopSpend = self.stats.shopSpend,
    kills = self.stats.kills,
    elites = self.stats.elitesKilled,
    damageDealt = self.stats.damageDealt,
    damageTaken = self.stats.damageTaken,
    lpCollected = self.stats.lpCollected,
    peakAlive = self.stats.peakAlive,
    dps = self.stats.damageDealt / math.max(1, self.time),
    weapons = weapons,
    threats = threats,
    killsByType = kills,
  }
end

return run
