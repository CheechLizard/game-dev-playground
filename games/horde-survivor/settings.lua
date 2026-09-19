-- Every tunable in the game, declared once.
--
-- Hand-written settings are grouped by page and section below. Content-derived
-- settings (one section per enemy, one per weapon) are generated from
-- content.lua, so the editor's contents always match the content that exists.

local schema = require("framework.schema")
local debugdraw = require("framework.debugdraw")
local content = require("content")
local sandbox = require("sandbox")

local M = {}

-- Pages are ordered by these numbers rather than alphabetically, so the IA
-- reads roughly in the order you would tune a run: shape the run, then the
-- player, then what fights the player, then what it all costs.
local PAGE = {
  Run = 10, Player = 20, Leveling = 30, Weapons = 40, Passives = 45,
  Enemies = 50, Waves = 60, Economy = 70, Levels = 80, Render = 90,
  Overlays = 95, Debug = 99,
}

local function register(page, section, sectionOrder, settings)
  schema.register{
    page = page, section = section,
    order = PAGE[page], sectionOrder = sectionOrder,
    settings = settings,
  }
end

function M.register()
  -- ------------------------------------------------------------------ Run
  register("Run", "Length", 10, {
    { key = "run.durationMinutes", label = "Run length", type = "number",
      default = 15, min = 1, max = 60, unit = "min", live = false,
      help = "Survive this long to win the run." },
    { key = "run.waveSeconds", label = "Wave length", type = "number",
      default = 15, min = 5, max = 180, unit = "s",
      help = "A wave is a block of spawning. Run length / wave length = wave count." },
    { key = "run.wavesPerShop", label = "Waves per shop", type = "int",
      default = 2, min = 1, max = 10,
      help = "The shop opens after every Nth wave." },
    { key = "run.shopPausesClock", label = "Shop pauses the clock", type = "bool",
      default = true },
    { key = "run.pauseWithEditor", label = "Pause while the editor is open", type = "bool",
      default = true,
      help = "Off lets you watch a value take effect on the live horde." },
  })

  register("Run", "Arena", 20, {
    { key = "run.arenaWidth", label = "Arena width", type = "number",
      default = 1200, min = 300, max = 4000, unit = "px", live = false },
    { key = "run.arenaHeight", label = "Arena height", type = "number",
      default = 900, min = 300, max = 4000, unit = "px", live = false },
    { key = "run.cameraLerp", label = "Camera follow", type = "number",
      default = 8, min = 0.5, max = 30, format = "%.1f",
      help = "Higher is snappier. Low values drift behind the player." },
  })

  -- --------------------------------------------------------------- Player
  register("Player", "Survival", 10, {
    { key = "player.maxHp", label = "Max HP", type = "number",
      default = 100, min = 1, max = 2000 },
    { key = "player.hpRegen", label = "HP regen", type = "number",
      default = 0, min = 0, max = 20, unit = "/s", format = "%.2f" },
    { key = "player.armor", label = "Armor", type = "number",
      default = 0, min = 0, max = 100,
      help = "Flat damage reduction, applied before the minimum of 1." },
    { key = "player.iframes", label = "Invulnerability", type = "number",
      default = 0.5, min = 0, max = 3, unit = "s", format = "%.2f",
      help = "After being hit. Contact damage is one hit, not per second." },
  })

  register("Player", "Movement", 20, {
    { key = "player.moveSpeed", label = "Move speed", type = "number",
      default = 82, min = 10, max = 400, unit = "px/s" },
    { key = "player.aimLead", label = "Aim prediction", type = "number",
      default = 1, min = 0, max = 1, format = "%.2f",
      help = "How far weapons lead a moving target. At zero they fire at "
        .. "where it is, which never hits anything crossing your line." },
    { key = "player.accel", label = "Acceleration", type = "number",
      default = 1400, min = 100, max = 6000, unit = "px/s2",
      help = "How fast the player reaches top speed. High feels instant." },
    { key = "player.friction", label = "Friction", type = "number",
      default = 1200, min = 100, max = 6000, unit = "px/s2" },
    { key = "player.radius", label = "Collision radius", type = "number",
      default = 4, min = 1, max = 20, unit = "px" },
  })

  register("Player", "Offence", 30, {
    { key = "player.damageMult", label = "Damage", type = "number",
      default = 1, min = 0.1, max = 10, format = "%.2f", unit = "x" },
    { key = "player.attackSpeedMult", label = "Attack speed", type = "number",
      default = 1, min = 0.1, max = 8, format = "%.2f", unit = "x" },
    { key = "player.areaMult", label = "Area", type = "number",
      default = 1, min = 0.2, max = 6, format = "%.2f", unit = "x" },
    { key = "player.projectileSpeedMult", label = "Projectile speed", type = "number",
      default = 1, min = 0.2, max = 5, format = "%.2f", unit = "x" },
    { key = "player.critChance", label = "Bonus crit chance", type = "number",
      default = 0, min = 0, max = 1, format = "%.2f",
      help = "Added on top of each weapon's own crit chance." },
    { key = "player.critMult", label = "Crit multiplier", type = "number",
      default = 2, min = 1, max = 10, format = "%.2f", unit = "x" },
  })

  register("Player", "Utility", 40, {
    { key = "player.pickupRange", label = "Pickup range", type = "number",
      default = 26, min = 4, max = 300, unit = "px",
      help = "LP and other drops inside this radius fly to the player." },
    { key = "player.pickupSpeed", label = "Pickup travel speed", type = "number",
      default = 220, min = 20, max = 900, unit = "px/s" },
    { key = "player.goldFind", label = "Gold find", type = "number",
      default = 1, min = 0, max = 8, format = "%.2f", unit = "x" },
    { key = "player.luck", label = "Luck", type = "number",
      default = 1, min = 0, max = 8, format = "%.2f", unit = "x",
      help = "Multiplies every drop chance." },
    { key = "player.startingWeapon", label = "Starting weapon", type = "enum",
      default = "blaster", values = (function()
        local ids = {}
        for _, w in ipairs(content.weapons) do ids[#ids + 1] = w.id end
        return ids
      end)(), live = false },
    { key = "player.weaponSlots", label = "Weapon slots", type = "int",
      default = 6, min = 1, max = 10 },
  })

  -- ------------------------------------------------------------- Leveling
  register("Leveling", "LP curve", 10, {
    { key = "level.baseRequirement", label = "LP for level 2", type = "number",
      default = 5, min = 1, max = 200 },
    { key = "level.growth", label = "Requirement growth", type = "number",
      default = 1.28, min = 1, max = 3, format = "%.3f", unit = "x",
      help = "Each level needs this much more LP than the last." },
    { key = "level.flatGrowth", label = "Flat growth", type = "number",
      default = 2, min = 0, max = 50,
      help = "Added on top of the multiplier, to keep early levels from being instant." },
  })

  -- Player levels are pure upside: enemies scale on wave, not on player level.
  register("Leveling", "Level-up bonus", 20, {
    { key = "level.bonusMaxHp", label = "+ Max HP", type = "number",
      default = 4, min = 0, max = 100 },
    { key = "level.bonusHealOnLevel", label = "Heal on level", type = "number",
      default = 3, min = 0, max = 200 },
    { key = "level.bonusDamage", label = "+ Damage", type = "number",
      default = 0.05, min = 0, max = 1, format = "%.3f", unit = "x" },
    { key = "level.bonusAttackSpeed", label = "+ Attack speed", type = "number",
      default = 0.025, min = 0, max = 1, format = "%.3f", unit = "x" },
    { key = "level.bonusMoveSpeed", label = "+ Move speed", type = "number",
      default = 0.8, min = 0, max = 20, unit = "px/s" },
    { key = "level.bonusPickupRange", label = "+ Pickup range", type = "number",
      default = 0.6, min = 0, max = 20, unit = "px" },
    { key = "level.bonusArea", label = "+ Area", type = "number",
      default = 0.012, min = 0, max = 0.5, format = "%.3f", unit = "x" },
  })

  -- ------------------------------------------------------------ Economy
  register("Economy", "Gold", 10, {
    { key = "economy.startingGold", label = "Starting gold", type = "number",
      default = 0, min = 0, max = 500 },
    { key = "economy.goldPerDrop", label = "Gold per drop", type = "number",
      default = 4, min = 1, max = 100 },
    -- The shop is the only place the player makes choices, so it has to be
    -- able to fund 25-35 purchases across a run. Gold income is sized against
    -- the enemy HP curve on the Waves page; move one and re-check the other.
    { key = "economy.goldPerWave", label = "Gold per wave cleared", type = "number",
      default = 6.5, min = 0, max = 400 },
    { key = "economy.goldWaveGrowth", label = "Wave gold growth", type = "number",
      default = 0.75, min = 0, max = 100,
      help = "Added per wave index, so later waves pay more." },
  })

  register("Economy", "Drops", 20, {
    { key = "economy.healthDropAmount", label = "Health pickup heals", type = "number",
      default = 12, min = 1, max = 200 },
    { key = "economy.weaponDropChance", label = "Weapon drop chance", type = "number",
      default = 0.004, min = 0, max = 0.5, format = "%.4f",
      help = "Per enemy killed. A free weapon, if you have a spare slot." },
    { key = "economy.dropLifetime", label = "Drop lifetime", type = "number",
      default = 20, min = 1, max = 120, unit = "s",
      help = "How long gold and health sit on the ground. LP never expires." },
  })

  register("Economy", "Shop", 30, {
    { key = "shop.itemCount", label = "Items offered", type = "int",
      default = 8, min = 1, max = 12,
      help = "The shop lays out as a grid, so this reads best at 4, 6 or 8." },
    { key = "shop.rerollCost", label = "Reroll cost", type = "number",
      default = 10, min = 0, max = 200 },
    { key = "shop.rerollGrowth", label = "Reroll cost growth", type = "number",
      default = 5, min = 0, max = 100,
      help = "Added to the reroll cost each time you reroll in one visit." },
    { key = "shop.priceWaveGrowth", label = "Price growth per wave", type = "number",
      default = 0.015, min = 0, max = 1, format = "%.3f", unit = "x",
      help = "Prices rise with the wave number so late gold is not free power." },
    { key = "shop.healCost", label = "Heal cost", type = "number",
      default = 18, min = 0, max = 300 },
    { key = "shop.healAmount", label = "Heal amount", type = "number",
      default = 25, min = 1, max = 500 },
  })

  -- --------------------------------------------------------------- Waves
  register("Waves", "Spawning", 10, {
    { key = "wave.tickStart", label = "Spawn tick (wave 1)", type = "number",
      default = 2.5, min = 0.1, max = 10, unit = "s", format = "%.2f",
      help = "Seconds between spawn pulses at the start of the run." },
    { key = "wave.tickEnd", label = "Spawn tick (final wave)", type = "number",
      default = 0.9, min = 0.05, max = 10, unit = "s", format = "%.2f" },
    { key = "wave.countStart", label = "Enemies per pulse (wave 1)", type = "number",
      default = 2, min = 1, max = 40 },
    { key = "wave.countEnd", label = "Enemies per pulse (final)", type = "number",
      default = 6, min = 1, max = 60,
      help = "Spawn rate and enemy HP both push the same way. Raising either "
        .. "without raising player damage makes the horde outgrow the player's "
        .. "kill rate, which is unwinnable rather than hard." },
    { key = "wave.spawnTelegraph", label = "Spawn warning", type = "number",
      default = 0.7, min = 0, max = 3, unit = "s", format = "%.2f",
      help = "A ring closes on the spot before an enemy appears there, so a "
        .. "spawn can be walked away from. Zero spawns with no warning." },
    { key = "wave.packSpread", label = "Pack spread", type = "number",
      default = 26, min = 0, max = 200, unit = "px",
      help = "How far apart a pack lands. Wide enough not to overlap, tight "
        .. "enough to still read as one group." },
    { key = "wave.maxAlive", label = "Max alive", type = "int",
      default = 320, min = 10, max = 2000,
      help = "Hard cap. Spawning stalls rather than tanking the frame rate." },
    { key = "wave.spawnMargin", label = "Off-screen spawn margin", type = "number",
      default = 24, min = 0, max = 200, unit = "px",
      help = "How far outside the view enemies appear." },
  })

  -- The whole difficulty curve. Player level deliberately contributes nothing
  -- by default: scaling on player level punishes picking up LP.
  register("Waves", "Scaling", 20, {
    { key = "scale.hpPerWave", label = "Enemy HP per wave", type = "number",
      default = 0.017, min = 0, max = 2, format = "%.3f", unit = "x",
      help = "Compounding multiplier per wave index. Keep this BELOW the rate "
        .. "player damage grows, or clear speed falls every wave while spawn "
        .. "rate climbs, and the run becomes unwinnable rather than hard." },
    { key = "scale.damagePerWave", label = "Enemy damage per wave", type = "number",
      default = 0.024, min = 0, max = 2, format = "%.3f", unit = "x" },
    { key = "scale.speedPerWave", label = "Enemy speed per wave", type = "number",
      default = 0.003, min = 0, max = 0.5, format = "%.3f", unit = "x" },
    { key = "scale.lpPerWave", label = "LP value per wave", type = "number",
      default = 0.015, min = 0, max = 2, format = "%.3f", unit = "x" },
    { key = "scale.playerLevelWeight", label = "Player level weight", type = "number",
      default = 0, min = 0, max = 1, format = "%.3f",
      help = "Off by default. Above 0, enemies also scale with player level, "
        .. "which makes ignoring LP a viable strategy. Try it, but know why it is off." },
    { key = "scale.eliteChance", label = "Elite chance", type = "number",
      default = 0.03, min = 0, max = 1, format = "%.3f",
      help = "Elites are bigger, tougher and drop more." },
    { key = "scale.eliteHpMult", label = "Elite HP", type = "number",
      default = 4, min = 1, max = 40, format = "%.1f", unit = "x" },
    { key = "scale.eliteSpeedMult", label = "Elite speed", type = "number",
      default = 1.15, min = 0.2, max = 3, format = "%.2f", unit = "x",
      help = "Elites move faster than their base type. Without this a big "
        .. "enemy is a slow bullet sponge you simply walk away from." },
    { key = "scale.eliteRewardMult", label = "Elite reward", type = "number",
      default = 5, min = 1, max = 40, format = "%.1f", unit = "x" },
  })

  -- -------------------------------------------------------------- Render
  register("Render", "Resolution", 10, {
    { key = "render.width", label = "Canvas width", type = "int",
      default = 384, min = 160, max = 1920, live = false },
    { key = "render.height", label = "Canvas height", type = "int",
      default = 216, min = 90, max = 1080, live = false },
  })

  -- Three foreground colours on a dark background, as specified. They are
  -- settings rather than constants so a profile can restyle the whole game.
  register("Render", "Palette", 20, {
    { key = "palette.background", label = "Background", type = "color",
      default = { 0.043, 0.047, 0.078, 1 } },
    { key = "palette.player", label = "Player / UI", type = "color",
      default = { 0.925, 0.918, 0.847, 1 } },
    { key = "palette.enemy", label = "Enemies", type = "color",
      default = { 0.851, 0.259, 0.310, 1 } },
    { key = "palette.accent", label = "Accent / pickups", type = "color",
      default = { 0.361, 0.831, 0.639, 1 } },
  })

  register("Render", "Feel", 30, {
    { key = "render.screenShake", label = "Screen shake", type = "number",
      default = 1, min = 0, max = 4, format = "%.2f", unit = "x" },
    { key = "render.hitFlash", label = "Hit flash", type = "number",
      default = 0.08, min = 0, max = 0.6, unit = "s", format = "%.3f" },
    { key = "render.damageNumbers", label = "Damage numbers", type = "bool",
      default = false },
    { key = "render.showGrid", label = "Background grid", type = "bool",
      default = true },
    { key = "render.gridSize", label = "Grid size", type = "number",
      default = 32, min = 4, max = 200, unit = "px" },
  })

  register("Render", "Overlay", 40, {
    { key = "perf.show", label = "Perf overlay (F2)", type = "bool", default = false },
  })

  -- --------------------------------------------------------------- Debug
  -- Debug values live here with every other setting so they exist in headless
  -- runs too; the Debug page's buttons are registered in game.lua, because
  -- they act on the live run rather than on a value.
  register("Debug", "Simulation", 10, {
    { key = "debug.timeScale", label = "Time scale", type = "number",
      default = 1, min = 0, max = 5, format = "%.2f", unit = "x",
      help = "0 freezes the simulation. Handy for inspecting a busy moment." },
    { key = "debug.godMode", label = "God mode", type = "bool", default = false },
    { key = "debug.freezeEnemies", label = "Freeze enemies", type = "bool",
      default = false },
    { key = "debug.freezeSpawns", label = "Stop spawning", type = "bool",
      default = false },
    { key = "debug.showRunState", label = "Show run state readout", type = "bool",
      default = false },
  })

  -- ------------------------------------------------- generated: enemies
  for i, def in ipairs(content.enemies) do
    local settings = {}
    for _, field in ipairs(content.enemyFields) do
      local value = def.tune[field.name]
      if value == nil then value = field.fallback end
      if value ~= nil then
        settings[#settings + 1] = {
          key = "enemy." .. def.id .. "." .. field.name,
          label = field.label, type = field.type,
          default = value, min = field.min, max = field.max,
          unit = field.unit, format = field.format, order = field.order,
        }
      end
    end
    for _, field in ipairs(content.behaviourFields[def.behaviour] or {}) do
      local value = def.tune[field.name]
      if value ~= nil then
        settings[#settings + 1] = {
          key = "enemy." .. def.id .. "." .. field.name,
          label = field.label, type = field.type,
          default = value, min = field.min, max = field.max,
          unit = field.unit, format = field.format, order = field.order,
        }
      end
    end
    register("Enemies", def.name, i * 10, settings)
  end

  -- ------------------------------------------------- generated: weapons
  for i, def in ipairs(content.weapons) do
    local settings = {}
    local fields = {}
    for _, f in ipairs(content.weaponFields) do fields[#fields + 1] = f end
    for _, f in ipairs(content.weaponTypeFields[def.kind] or {}) do
      fields[#fields + 1] = f
    end

    for _, field in ipairs(fields) do
      local value = def.tune[field.name]
      if value ~= nil then
        settings[#settings + 1] = {
          key = "weapon." .. def.id .. "." .. field.name,
          label = field.label, type = field.type,
          default = value, min = field.min, max = field.max,
          unit = field.unit, format = field.format, order = field.order,
        }
      end
    end

    -- Per-level growth sits under the same section, ordered after the base
    -- values, so a weapon reads as "what it is" then "how it grows".
    for _, field in ipairs(fields) do
      local growth = def.perLevel and def.perLevel[field.name]
      if growth ~= nil then
        local span = math.max(math.abs(growth) * 6, (field.max - field.min) * 0.25)
        settings[#settings + 1] = {
          key = "weapon." .. def.id .. ".perLevel." .. field.name,
          label = field.label .. " / level", type = "number",
          default = growth, min = -span, max = span,
          format = "%.3f", order = 100 + (field.order or 0),
        }
      end
    end

    settings[#settings + 1] = {
      key = "weapon." .. def.id .. ".cost", label = "Shop cost", type = "number",
      default = def.cost, min = 0, max = 999, order = 200,
    }
    settings[#settings + 1] = {
      key = "weapon." .. def.id .. ".upgradeCost", label = "Upgrade cost", type = "number",
      default = def.upgradeCost, min = 0, max = 999, order = 201,
    }
    settings[#settings + 1] = {
      key = "weapon." .. def.id .. ".maxLevel", label = "Max level", type = "int",
      default = 5, min = 1, max = 20, order = 202,
    }

    register("Weapons", def.name, i * 10, settings)
  end

  -- ------------------------------------------------ generated: passives
  for i, def in ipairs(content.passives) do
    local settings = {}
    for _, field in ipairs(content.passiveFields) do
      local value = def.tune[field.name]
      if value ~= nil then
        settings[#settings + 1] = {
          key = "passive." .. def.id .. "." .. field.name,
          label = field.label, type = field.type,
          default = value, min = field.min, max = field.max,
          unit = field.unit, format = field.format, order = field.order,
        }
      end
    end
    register("Passives", def.name, i * 10, settings)
  end

  -- ---------------------------------------------------------- the levels
  sandbox.registerSettings(schema)

  -- ------------------------------------------------------------ overlays
  -- Registered as bool settings on the Overlays page, so they save into
  -- profiles like anything else.
  debugdraw.register{ id = "colliders", label = "Colliders", group = "Collision",
    default = false, color = { 0.95, 0.35, 0.40, 0.9 },
    help = "Enemy, player and projectile collision circles." }
  debugdraw.register{ id = "hitAreas", label = "Weapon hit areas", group = "Collision",
    default = false, color = { 0.98, 0.78, 0.30, 0.9 },
    help = "Aura radius, orbit paths and projectile sweeps." }
  debugdraw.register{ id = "pickupRange", label = "Pickup range", group = "Player",
    default = false, color = { 0.36, 0.83, 0.64, 0.8 } }
  debugdraw.register{ id = "playerAim", label = "Aim lines", group = "Player",
    default = false, color = { 0.55, 0.75, 1.0, 0.7 },
    help = "Which enemy each weapon is targeting." }
  debugdraw.register{ id = "enemyState", label = "Enemy state", group = "Enemies",
    default = false, color = { 1.0, 0.85, 0.55, 0.9 },
    help = "Behaviour state and HP above each enemy." }
  debugdraw.register{ id = "enemyPaths", label = "Movement vectors", group = "Enemies",
    default = false, color = { 0.75, 0.55, 0.95, 0.8 } }
  debugdraw.register{ id = "spawnRing", label = "Spawn boundary", group = "World",
    default = false, color = { 0.45, 0.60, 0.95, 0.7 } }
  debugdraw.register{ id = "arenaBounds", label = "Arena bounds", group = "World",
    default = false, color = { 0.40, 0.45, 0.55, 0.8 } }
  debugdraw.register{ id = "grid", label = "Spatial hash grid", group = "World",
    default = false, color = { 0.30, 0.34, 0.42, 0.6 },
    help = "The broadphase buckets. Useful when collision cost spikes." }
  debugdraw.register{ id = "pickups", label = "Pickup markers", group = "World",
    default = false, color = { 0.36, 0.83, 0.64, 0.9 } }
end

return M
