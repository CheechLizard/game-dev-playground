-- Game content: enemies, weapons, shop items and the wave table.
--
-- Everything tunable lives in a `tune` table on each definition. settings.lua
-- walks these definitions and registers a schema entry per field, so adding an
-- enemy here gives it a section in the editor, and deleting one takes its
-- settings out of the editor and out of saved profiles. Nothing to keep in
-- sync by hand.

local content = {}

-- Field descriptors shared by every enemy, so the editor gets sane ranges
-- without repeating them per enemy.
content.enemyFields = {
  { name = "hp",         label = "HP",              type = "number", min = 1,   max = 2000, order = 1 },
  { name = "speed",      label = "Speed",           type = "number", min = 0,   max = 300,  order = 2, unit = "px/s" },
  { name = "damage",     label = "Contact damage",  type = "number", min = 0,   max = 200,  order = 3 },
  { name = "radius",     label = "Radius",          type = "number", min = 1,   max = 40,   order = 4, unit = "px" },
  { name = "lp",         label = "LP dropped",      type = "number", min = 0,   max = 100,  order = 5 },
  { name = "goldChance", label = "Gold drop chance",type = "number", min = 0,   max = 1,    order = 6, format = "%.2f" },
  { name = "hpChance",   label = "Health drop chance", type = "number", min = 0, max = 1,   order = 7, format = "%.2f" },
  { name = "knockback",  label = "Knockback taken",  type = "number", min = 0,  max = 4,    order = 8, format = "%.2f" },
  { name = "weight",     label = "Spawn weight",     type = "number", min = 0,  max = 20,   order = 9, format = "%.1f" },
}

-- Behaviour-specific fields, only registered for enemies using that behaviour.
content.behaviourFields = {
  charge = {
    { name = "chargeRange",    label = "Charge range",    type = "number", min = 20, max = 400, order = 20, unit = "px" },
    { name = "chargeSpeed",    label = "Charge speed",    type = "number", min = 20, max = 600, order = 21, unit = "px/s" },
    { name = "chargeWindup",   label = "Windup",          type = "number", min = 0,  max = 3,   order = 22, unit = "s", format = "%.2f" },
    { name = "chargeDuration", label = "Charge duration", type = "number", min = 0.1, max = 3,  order = 23, unit = "s", format = "%.2f" },
    { name = "chargeCooldown", label = "Charge cooldown", type = "number", min = 0.1, max = 8,  order = 24, unit = "s", format = "%.2f" },
  },
  shoot = {
    { name = "shootRange",    label = "Preferred range", type = "number", min = 20, max = 400, order = 20, unit = "px" },
    { name = "shootCooldown", label = "Shot cooldown",   type = "number", min = 0.2, max = 8,  order = 21, unit = "s", format = "%.2f" },
    { name = "shotSpeed",     label = "Shot speed",      type = "number", min = 10, max = 400, order = 22, unit = "px/s" },
    { name = "shotDamage",    label = "Shot damage",     type = "number", min = 0,  max = 100, order = 23 },
    { name = "shotRadius",    label = "Shot radius",     type = "number", min = 1,  max = 12,  order = 24, unit = "px" },
    { name = "shotLife",      label = "Shot lifetime",   type = "number", min = 0.1, max = 8,  order = 25, unit = "s", format = "%.2f" },
  },
  orbit = {
    { name = "orbitRadius", label = "Orbit radius", type = "number", min = 10, max = 200, order = 20, unit = "px" },
    { name = "orbitSpeed",  label = "Orbit speed",  type = "number", min = 0,  max = 400, order = 21, unit = "px/s" },
  },
}

-- ------------------------------------------------------------------ enemies
-- `shape` picks the sprite; `palette` picks which of the three foreground
-- colours it draws in.

content.enemies = {
  {
    id = "grunt", name = "Grunt", shape = "blob", palette = "enemy",
    behaviour = "chase",
    blurb = "Walks straight at you. The backbone of every wave.",
    tune = { hp = 12, speed = 30, damage = 8, radius = 4, lp = 1,
             goldChance = 0.06, hpChance = 0.01, knockback = 1, weight = 10 },
  },
  {
    id = "swarmer", name = "Swarmer", shape = "dot", palette = "enemy",
    behaviour = "chase",
    blurb = "Fast, fragile, and never alone.",
    tune = { hp = 5, speed = 58, damage = 4, radius = 3, lp = 1,
             goldChance = 0.02, hpChance = 0.004, knockback = 1.8, weight = 8 },
  },
  {
    id = "brute", name = "Brute", shape = "block", palette = "enemy",
    behaviour = "chase",
    blurb = "Slow, heavy, hits like a truck.",
    tune = { hp = 70, speed = 19, damage = 22, radius = 7, lp = 4,
             goldChance = 0.35, hpChance = 0.05, knockback = 0.25, weight = 3 },
  },
  {
    id = "spitter", name = "Spitter", shape = "diamond", palette = "accent",
    behaviour = "shoot",
    blurb = "Keeps its distance and shoots. Punishes standing still.",
    -- shotLife x shotSpeed must stay close to shootRange, or the Spitter
    -- snipes from outside the view and becomes the only thing that kills you.
    tune = { hp = 18, speed = 26, damage = 6, radius = 4, lp = 3,
             goldChance = 0.15, hpChance = 0.03, knockback = 1.2, weight = 4,
             shootRange = 100, shootCooldown = 2.4, shotSpeed = 88,
             shotDamage = 6, shotRadius = 2, shotLife = 1.5 },
  },
  {
    id = "lancer", name = "Lancer", shape = "arrow", palette = "accent",
    behaviour = "charge",
    blurb = "Winds up, then dashes through your position.",
    tune = { hp = 26, speed = 34, damage = 16, radius = 5, lp = 3,
             goldChance = 0.18, hpChance = 0.02, knockback = 0.8, weight = 4,
             chargeRange = 120, chargeSpeed = 260, chargeWindup = 0.55,
             chargeDuration = 0.45, chargeCooldown = 2.6 },
  },
  {
    id = "orbiter", name = "Orbiter", shape = "ring", palette = "accent",
    behaviour = "orbit",
    blurb = "Circles you at range and closes in slowly.",
    tune = { hp = 34, speed = 40, damage = 12, radius = 5, lp = 4,
             goldChance = 0.22, hpChance = 0.03, knockback = 0.9, weight = 3,
             orbitRadius = 64, orbitSpeed = 120 },
  },
}

-- ------------------------------------------------------------------ weapons
-- Each weapon declares its own tunables, including how each one grows per
-- upgrade level. `perLevel` values are added on top of the base each level.

content.weaponFields = {
  { name = "damage",    label = "Damage",       type = "number", min = 0,    max = 500, order = 1 },
  { name = "cooldown",  label = "Cooldown",     type = "number", min = 0.05, max = 6,   order = 2, unit = "s", format = "%.2f" },
  { name = "critChance",label = "Crit chance",  type = "number", min = 0,    max = 1,   order = 8, format = "%.2f" },
  { name = "knockback", label = "Knockback",    type = "number", min = 0,    max = 400, order = 9 },
}

content.weaponTypeFields = {
  projectile = {
    { name = "speed",    label = "Projectile speed", type = "number", min = 20, max = 800, order = 3, unit = "px/s" },
    { name = "count",    label = "Projectiles",      type = "int",    min = 1,  max = 12,  order = 4 },
    { name = "spread",   label = "Spread",           type = "number", min = 0,  max = 180, order = 5, unit = "deg" },
    { name = "pierce",   label = "Pierce",           type = "int",    min = 0,  max = 10,  order = 6 },
    { name = "lifetime", label = "Lifetime",         type = "number", min = 0.1, max = 5,  order = 7, unit = "s", format = "%.2f" },
    { name = "radius",   label = "Projectile radius",type = "number", min = 1,  max = 20,  order = 10, unit = "px" },
  },
  orbit = {
    { name = "count",       label = "Blades",        type = "int",    min = 1,  max = 10,  order = 3 },
    { name = "orbitRadius", label = "Orbit radius",  type = "number", min = 8,  max = 120, order = 4, unit = "px" },
    { name = "orbitSpeed",  label = "Orbit speed",   type = "number", min = 0,  max = 720, order = 5, unit = "deg/s" },
    { name = "radius",      label = "Blade radius",  type = "number", min = 1,  max = 20,  order = 6, unit = "px" },
  },
  aura = {
    { name = "radius", label = "Aura radius", type = "number", min = 8, max = 160, order = 3, unit = "px" },
  },
}

content.weapons = {
  {
    id = "blaster", name = "Blaster", kind = "projectile", targeting = "nearest",
    blurb = "Fires at the nearest enemy. Reliable, unexciting, always taken.",
    tune = { damage = 7, cooldown = 0.55, speed = 190, count = 1, spread = 8,
             pierce = 0, lifetime = 1.6, radius = 2, critChance = 0.05, knockback = 40 },
    perLevel = { damage = 3, cooldown = -0.045, count = 0.34, pierce = 0.25 },
    cost = 0, upgradeCost = 22,
  },
  {
    id = "scatter", name = "Scattergun", kind = "projectile", targeting = "nearest",
    blurb = "A wide, short-range cone. Brutal up close, useless at range.",
    tune = { damage = 4, cooldown = 0.95, speed = 150, count = 5, spread = 52,
             pierce = 0, lifetime = 0.55, radius = 2, critChance = 0.05, knockback = 90 },
    perLevel = { damage = 2, cooldown = -0.06, count = 1, spread = 2 },
    cost = 35, upgradeCost = 26,
  },
  {
    id = "lance", name = "Rail Lance", kind = "projectile", targeting = "heading",
    blurb = "Slow, piercing shot along the way you are moving.",
    tune = { damage = 22, cooldown = 1.5, speed = 300, count = 1, spread = 0,
             pierce = 6, lifetime = 1.4, radius = 3, critChance = 0.15, knockback = 60 },
    perLevel = { damage = 9, cooldown = -0.1, pierce = 0.5 },
    cost = 55, upgradeCost = 38,
  },
  {
    id = "orbiter", name = "Orbit Blades", kind = "orbit", targeting = "none",
    blurb = "Blades circling you. No aiming, constant pressure.",
    tune = { damage = 9, cooldown = 0.35, count = 2, orbitRadius = 26,
             orbitSpeed = 180, radius = 3, critChance = 0.05, knockback = 70 },
    perLevel = { damage = 4, count = 0.5, orbitRadius = 3, orbitSpeed = 14 },
    cost = 45, upgradeCost = 32,
  },
  {
    id = "aura", name = "Static Field", kind = "aura", targeting = "none",
    blurb = "Damages everything near you, every tick. Scales with area.",
    tune = { damage = 4, cooldown = 0.5, radius = 34, critChance = 0.02, knockback = 0 },
    perLevel = { damage = 2.2, radius = 4, cooldown = -0.03 },
    cost = 50, upgradeCost = 30,
  },
}

-- ------------------------------------------------------------- wave table
-- Which enemies are allowed to spawn from each wave onward. The spawner picks
-- from every unlocked entry using the enemies' spawn weights, so later waves
-- stay varied instead of only showing the newest type.

content.waveTable = {
  { wave = 1,  unlock = { "grunt" } },
  { wave = 2,  unlock = { "swarmer" } },
  { wave = 4,  unlock = { "spitter" } },
  { wave = 6,  unlock = { "brute" } },
  { wave = 8,  unlock = { "lancer" } },
  { wave = 11, unlock = { "orbiter" } },
}

content.enemyById = {}
for _, def in ipairs(content.enemies) do content.enemyById[def.id] = def end

content.weaponById = {}
for _, def in ipairs(content.weapons) do content.weaponById[def.id] = def end

--- Enemy ids unlocked by the given wave number.
function content.unlockedAt(wave)
  local ids = {}
  for _, row in ipairs(content.waveTable) do
    if wave >= row.wave then
      for _, id in ipairs(row.unlock) do
        if content.enemyById[id] then ids[#ids + 1] = id end
      end
    end
  end
  if #ids == 0 then ids[1] = content.enemies[1].id end
  return ids
end

--- The wave at which an enemy first appears, for the editor and the summary.
function content.unlockWave(id)
  for _, row in ipairs(content.waveTable) do
    for _, unlocked in ipairs(row.unlock) do
      if unlocked == id then return row.wave end
    end
  end
  return nil
end

return content
