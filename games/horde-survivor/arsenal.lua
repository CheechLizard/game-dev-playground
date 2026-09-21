-- The game's side of the Modular Weapon System.
--
-- Three jobs, and nothing else:
--   * teach the framework's module types the concepts this game has and the
--     specification does not -- crit, knockback, pierce
--   * load and save weapon graphs, built-in defaults under saved overrides
--   * build the host adapter a runtime talks to, which is the only place that
--     knows both what a strike is and what an enemy is
--
-- Everything above this line is generic MWS; everything below it is
-- horde-survivor. Keeping the seam here is what lets shared/framework/mws stay
-- a readable implementation of the specification.

local config = require("framework.config")
local fs = require("lib.fs")
local json = require("lib.json")
local mws = require("framework.mws")
local graphs = require("weapongraphs")

local G = mws.graph
local mods = mws.modules

local arsenal = {}

arsenal.dir = "config/weapons"
arsenal.status = nil

-- ------------------------------------------------------------- module extras
--
-- The specification's PAYLOAD knows about damage and an effect. This game also
-- has crits and knockback, and its STRIKER needs pierce because its enemies
-- come in crowds. Bolted on here rather than edited into the shared list, so
-- the framework keeps saying exactly what the specification says.

local registered = false

function arsenal.registerModules()
  if registered then return end
  registered = true

  mods.extend("payload", {
    { name = "critChance", label = "Crit chance", type = "number",
      default = 0.05, min = 0, max = 1, format = "%.2f",
      help = "On top of the player's own crit chance." },
    { name = "knockback", label = "Knockback", type = "number",
      default = 40, min = 0, max = 400,
      help = "Push along the strike's heading." },
  })

  mods.extend("striker", {
    { name = "pierce", label = "Pierce", type = "int",
      default = 0, min = 0, max = 20,
      help = "Extra enemies a consumable strike passes through before it ends." },
    { name = "retriggerInterval", label = "Retrigger interval", type = "number",
      default = 0.35, min = 0.02, max = 4, unit = "s", format = "%.2f",
      help = "Retriggerable strikes only: how often one target can be hit "
        .. "again by the same strike." },
  })
end

-- -------------------------------------------------------------- persistence

local function graphPath(id)
  return arsenal.dir .. "/" .. id .. ".json"
end

--- The graph for a weapon: a saved override if there is one, otherwise the
-- built-in. Returns the graph plus "saved" or "builtin".
function arsenal.load(id)
  local data = fs.read(graphPath(id))
  if data then
    local ok, decoded = pcall(json.decode, data)
    if ok and type(decoded) == "table" then
      local g, dropped = G.fromTable(decoded)
      g.id = id
      if #dropped > 0 then
        arsenal.status = string.format("%s: dropped %d unknown field(s)",
          id, #dropped)
      end
      return g, "saved"
    end
    arsenal.status = "could not read " .. graphPath(id)
  end
  local built = graphs.build(id)
  if built then return built, "builtin" end
  return nil
end

function arsenal.save(id, g)
  local payload = G.toTable(g)
  payload.id = id
  local ok, location = fs.write(graphPath(id), json.encode(payload) .. "\n")
  arsenal.status = ok
    and ("Saved " .. graphPath(id) .. (location == "save" and " (save dir)" or ""))
    or ("Could not save " .. graphPath(id))
  return ok
end

--- Throw away the saved override and go back to the built-in graph.
function arsenal.revert(id)
  fs.remove(graphPath(id))
  arsenal.status = "Reverted " .. id .. " to its built-in graph"
  return arsenal.load(id)
end

function arsenal.hasOverride(id)
  return fs.exists(graphPath(id))
end

-- -------------------------------------------------------------------- energy

--- What one module costs to run, per strike. Module types are a fixed list,
-- unlike nodes, so these are ordinary schema settings and live in the editor
-- with everything else.
function arsenal.cost(node)
  local value = config.get("mws.cost." .. node.type)
  return value or 0
end

-- ------------------------------------------------------------------ modifier
--
-- The one place weapon level and player bonuses reach into a graph. The graph
-- itself is never rewritten -- the bench is editing the same table the run is
-- firing, and it should stay that way.

local function levelValue(weaponId, field, level)
  local base = config.get("weapon." .. weaponId .. "." .. field)
  if base == nil then return nil end
  local growth = config.get("weapon." .. weaponId .. ".perLevel." .. field) or 0
  return base + growth * ((level or 1) - 1)
end

--- Build the property modifier for one held weapon.
-- @param r       the run, for the player's accumulated bonuses
-- @param weapon  the player's weapon entry, for its level
function arsenal.modifier(r, weapon)
  return function(node, name, value)
    if type(value) ~= "number" then return value end
    local id, level = weapon.id, weapon.level

    if node.type == "payload" then
      if name == "damagePower" then
        return value * (levelValue(id, "damageMult", level) or 1)
          * r:playerStat("damageMult")
      elseif name == "damageRadius" then
        return value * r:playerStat("areaMult")
      end

    elseif node.type == "repeater" then
      if name == "fireRate" then
        return value * (levelValue(id, "fireRateMult", level) or 1)
          * r:playerStat("attackSpeedMult")
      end

    elseif node.type == "barrel" then
      if name == "barrelCount" then
        return math.max(1, math.floor(
          value + (levelValue(id, "barrelBonus", level) or 0) + 0.5))
      elseif name == "rangeMax" then
        return value * r:playerStat("areaMult")
      end

    elseif node.type == "striker" then
      if name == "collisionSize" or name == "orbitRadius" then
        return value * r:playerStat("areaMult")
      elseif name == "baseSpeed" then
        return value * config.values.player.projectileSpeedMult
      elseif name == "pierce" then
        return math.floor(value + (levelValue(id, "pierceBonus", level) or 0) + 0.5)
      end

    elseif node.type == "battery" then
      if name == "energyPerSecond" then
        return value * (levelValue(id, "energyMult", level) or 1)
      end
    end

    return value
  end
end

-- ---------------------------------------------------------------- host
--
-- What the runtime calls into. This is the whole contract between a weapon
-- graph and this game: five functions and no shared state.

local function normalise(x, y)
  local l = math.sqrt(x * x + y * y)
  if l < 1e-6 then return 0, 0 end
  return x / l, y / l
end

function arsenal.host(r, weapon)
  return {
    --- Where a weapon-domain strike comes from, and where it is pointed.
    wielder = function()
      local p = r.player
      return { x = p.x, y = p.y, vx = p.vx, vy = p.vy,
               aimX = p.facingX, aimY = p.facingY }
    end,

    --- BARREL's "nearest" aim. Leads the target by the same rule every other
    -- weapon in the game uses, so an MWS gun is not quietly better at aiming.
    aim = function(x, y, range)
      local target = r:nearestEnemy(x, y, range)
      if not target then return nil end
      local ax, ay = r:aimPoint(target, x, y,
        config.values.player.projectileSpeedMult * 200)
      return normalise(ax - x, ay - y)
    end,

    -- The cosmetic stream, not the run's: see run.fxRng.
    random = function() return r.fxRng.next() end,

    --- A STRIKER has decided on a strike. Put it in the world.
    spawn = function(strike)
      r:addStrike(strike, weapon)
    end,

    despawn = function(strike)
      strike.dead = true
    end,

    --- PAYLOAD fired. Direct damage is applied by the collision that caused
    -- the Hit; this is the splash and the terrain damage the game has no
    -- terrain for.
    payload = function(node, event, wasHit, ctx)
      r:applyPayload(weapon, node, event, wasHit)
    end,

    effect = function(name, x, y, node)
      r:addEffect(name, x, y, node)
    end,

    emit = function(node, x, y, state)
      r:addEmission(node, x, y, state, weapon)
    end,
  }
end

--- Make a live weapon from a graph the run should fire.
function arsenal.instance(r, weapon, g)
  if g.version==2 then
    local host=arsenal.host(r,weapon)
    host.enemies=function() return r.enemies end
    host.random=function() return r.rng.next() end
    host.damage=function(_,target,damage) r:damageEnemy(target,damage,weapon.id,0,0,0) end
    return mws.v2runtime.new(g,host)
  end
  return mws.runtime.new(g, arsenal.host(r, weapon), {
    cost = arsenal.cost,
    buffer = config.values.mws.energyBuffer,
    modifier = arsenal.modifier(r, weapon),
  })
end

-- ------------------------------------------------------------------ settings

--- The handful of MWS tunables that *are* fixed: one energy cost per module
-- type, and the burst window. Node properties are not settings -- the graph
-- has variable topology, so they live in the graph and are edited in the
-- bench.
function arsenal.registerSettings(schema)
  local costs = {}
  for i, t in ipairs(mods.types) do
    costs[#costs + 1] = {
      key = "mws.cost." .. t.id,
      label = t.name, type = "number",
      default = ({ trigger = 0, battery = 0, repeater = 0, barrel = 2,
                   striker = 8, payload = 4, emitter = 3 })[t.id] or 1,
      min = 0, max = 200, order = i,
      help = t.blurb,
    }
  end

  schema.register{
    page = "Weapons", section = "Energy cost per module", order = 55,
    sectionOrder = 1, settings = costs,
  }

  schema.register{
    page = "Weapons", section = "Energy", order = 55, sectionOrder = 2,
    settings = {
      { key = "mws.energyBuffer", label = "Burst window", type = "number",
        default = 2, min = 0, max = 20, unit = "s", format = "%.2f",
        help = "How many seconds of supply a trigger may bank. Larger lets a "
          .. "weapon open with a volley before settling to what its batteries "
          .. "actually sustain." },
      { key = "mws.showEnergy", label = "Show energy on the HUD", type = "bool",
        default = true },
    },
  }

  schema.register{
    page = "Levels", section = "Bench", order = 80, sectionOrder = 20,
    settings = {
      { key="bench.prototype",label="Prototype",type="enum",default="v2_pulse",
        values=(function()
          local ids={} for _,d in ipairs(require("weaponprototypes").list) do ids[#ids+1]=d.id end
          return ids
        end)(),help="V2 test weapon to open in the bench." },
      { key="bench.holdFire",label="Hold fire (v2)",type="bool",default=false,
        help="Supply a held fire action to v2 prototypes. Z or controller X fires manually." },
      { key = "bench.arenaFraction", label = "Arena height", type = "number",
        default = 0.42, min = 0.2, max = 0.8, format = "%.2f",
        help = "How much of the screen the player and the dummies get. The "
          .. "rest is the graph." },
      { key = "bench.population", label = "Dummies", type = "int",
        default = 5, min = 0, max = 40,
        help = "How many targets the bench keeps alive to shoot at." },
      { key = "bench.dummy", label = "Dummy enemy", type = "enum",
        default = "grunt", values = (function()
          local content = require("content")
          local ids = {}
          for _, e in ipairs(content.enemies) do ids[#ids + 1] = e.id end
          return ids
        end)() },
      { key = "bench.dummyStill", label = "Dummies hold still", type = "bool",
        default = true,
        help = "Stationary targets: no AI movement, attacks, crowd separation or knockback. "
          .. "Turn off to test normal enemy behavior." },
    },
  }
end

return arsenal
