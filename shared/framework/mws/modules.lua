-- MWS module types: the single source of truth for what a module *is*.
--
-- A weapon graph has variable topology, so a node's properties cannot be
-- schema settings -- `schema.register` needs a fixed key, and node 7's fire
-- rate has no fixed key. This table plays the same role the schema plays for
-- config, and the same role `content.enemyFields` plays for enemies: the
-- inspector, the node defaults and the graph JSON are all generated from it.
--
-- Add a property here and it appears in the inspector, gets a default on every
-- node, and round-trips through JSON. Delete it and it vanishes from all three
-- and is pruned off graphs on load. There is no second list.
--
-- Property descriptors use the same shape as content.*Fields, so the editor's
-- own widgets draw them:
--   { name, label, type, default, min, max, unit, format, values, help }

local mods = {}

mods.types = {}       -- ordered array of type records
mods.byId = {}        -- id -> type record

--- Declare a module type. Called once per type at load time.
-- @param def { id, name, blurb, outputs, terminal, root, props = { ... } }
local function define(def)
  assert(type(def.id) == "string", "mws.modules: a type needs an id")
  assert(not mods.byId[def.id], "mws.modules: duplicate type " .. def.id)
  def.props = def.props or {}
  def.outputs = def.outputs or 1     -- how many downstream ports it may hold
  def.terminal = def.terminal or false
  mods.types[#mods.types + 1] = def
  mods.byId[def.id] = def
  return def
end

--- Add properties to a type from game code.
--
-- The framework declares the seven modules the specification defines. A game
-- with concepts the specification has no opinion on -- this one has crit,
-- knockback and pierce -- bolts them on here rather than editing the shared
-- list, so the framework stays the specification and the game stays the game.
function mods.extend(typeId, props)
  local t = assert(mods.byId[typeId], "mws.modules: no such type " .. tostring(typeId))
  for _, prop in ipairs(props) do
    for _, existing in ipairs(t.props) do
      assert(existing.name ~= prop.name,
        "mws.modules: duplicate property " .. typeId .. "." .. prop.name)
    end
    t.props[#t.props + 1] = prop
  end
end

--- Every property of a type, in declaration order.
function mods.props(typeId)
  local t = mods.byId[typeId]
  return t and t.props or {}
end

--- A fresh property table for a new node: every declared default, nothing else.
function mods.defaults(typeId)
  local out = {}
  for _, prop in ipairs(mods.props(typeId)) do
    out[prop.name] = prop.default
  end
  return out
end

--- Force a value into the shape a property declares, as schema.coerce does.
function mods.coerce(prop, value)
  local t = prop.type
  if t == "number" or t == "int" then
    local n = tonumber(value)
    if not n then return prop.default end
    if t == "int" then n = math.floor(n + 0.5) end
    if prop.min and n < prop.min then n = prop.min end
    if prop.max and n > prop.max then n = prop.max end
    return n
  elseif t == "bool" then
    if type(value) ~= "boolean" then return prop.default end
    return value
  elseif t == "enum" then
    for _, v in ipairs(prop.values) do
      if v == value then return value end
    end
    return prop.default
  elseif t == "string" then
    if type(value) ~= "string" then return prop.default end
    return value
  end
  return prop.default
end

-- ===================================================================== types
--
-- Seven modules, in the order the specification lists them. `outputs` is how
-- many downstream ports a node of this type may hold: one for everything but
-- BARREL, which is the only branch point in the system.

define{
  id = "battery", name = "BATTERY", short = "BAT",
  blurb = "Adds energy per second to the path downstream of it.",
  props = {
    { name = "energyPerSecond", label = "Energy/sec", type = "number",
      default = 60, min = 0, max = 600, unit = "e/s",
      help = "Batteries on one path stack. A battery after a barrel port "
        .. "powers only that port." },
  },
}

define{
  id = "trigger", name = "TRIGGER", short = "TRG",
  root = true,
  blurb = "Starts strikes, from firing input or from an upstream payload.",
  props = {
    { name = "condition", label = "Condition", type = "enum",
      default = "player_hold",
      values = { "player_hold", "player_press", "on_start", "on_hit", "on_miss", "on_stop" },
      help = "player_* react to the wielder firing. on_* react to an upstream "
        .. "payload, which is how a hit spawns a follow-up strike." },
  },
}

define{
  id = "repeater", name = "REPEATER", short = "REP",
  blurb = "Turns one open firing window into strikes at a fixed cadence.",
  props = {
    { name = "fireRate", label = "Fire rate", type = "number",
      default = 2, min = 0.05, max = 40, unit = "/s", format = "%.2f" },
    { name = "generationTime", label = "Regen per strike", type = "number",
      default = 0.5, min = 0.01, max = 10, unit = "s", format = "%.2f" },
    { name = "capacity", label = "Capacity", type = "int",
      default = 0, min = 0, max = 60,
      help = "Stored strikes. 0 is infinite: no magazine, no reload. "
        .. "Full reload is regen x capacity." },
  },
}

define{
  id = "barrel", name = "BARREL", short = "BRL",
  outputs = 8,
  blurb = "Sets aim, spread and range, and is the only module that branches.",
  props = {
    { name = "barrelCount", label = "Barrels", type = "int",
      default = 1, min = 1, max = 16,
      help = "Angle divisions, not output ports. Five barrels down one port "
        .. "is a shotgun; three barrels down three ports is three guns." },
    { name = "routing", label = "Routing", type = "enum",
      default = "round_robin", values = { "round_robin", "all" },
      help = "round_robin fires one barrel per event and advances. "
        .. "all fires every barrel at once." },
    { name = "aimMode", label = "Aim", type = "enum",
      default = "nearest", values = { "nearest", "heading", "random", "fixed" },
      help = "Where weapon_aim comes from. The specification assumes a player "
        .. "aiming a shmup; this game fires itself, so aim is a property." },
    { name = "angle", label = "Angle offset", type = "number",
      default = 0, min = -180, max = 180, unit = "deg" },
    { name = "spread", label = "Spread arc", type = "number",
      default = 0, min = 0, max = 360, unit = "deg",
      help = "Total arc the barrels are spaced evenly across, centred on the "
        .. "angle offset." },
    { name = "spreadVariance", label = "Spread variance", type = "number",
      default = 0, min = 0, max = 180, unit = "deg",
      help = "Random wobble added per shot, on top of the barrel angle." },
    { name = "rangeMax", label = "Max range", type = "number",
      default = 260, min = 0, max = 2000, unit = "px",
      help = "Applied only when it is tighter than the range already set." },
  },
}

define{
  id = "striker", name = "STRIKER", short = "STK",
  blurb = "Simulates the strike, and becomes the parent of everything below it.",
  props = {
    { name = "triggerBehavior", label = "Behaviour", type = "enum",
      default = "consumable", values = { "consumable", "retriggerable" },
      help = "consumable ends on its first hit. retriggerable keeps hitting "
        .. "for its lifetime, which is how beams and blades work." },
    { name = "durable", label = "Durable", type = "bool", default = false,
      help = "Ignores the Stop the wielder sends on releasing fire." },
    { name = "expires", label = "Sends Miss", type = "bool", default = true,
      help = "Off, a strike that runs out of life ends silently and its "
        .. "payload never fires." },
    { name = "motionType", label = "Motion", type = "enum",
      default = "linear", values = { "linear", "gravity", "sine", "orbit" } },
    { name = "baseSpeed", label = "Speed", type = "number",
      default = 190, min = 0, max = 900, unit = "px/s" },
    { name = "speedVariance", label = "Speed variance", type = "number",
      default = 0, min = 0, max = 400, unit = "px/s" },
    { name = "speedMultiplier", label = "Speed x", type = "number",
      default = 1, min = 0.05, max = 8, format = "%.2f" },
    { name = "acceleration", label = "Acceleration", type = "number",
      default = 0, min = -800, max = 800, unit = "px/s2" },
    { name = "gravity", label = "Gravity", type = "number",
      default = 0, min = -600, max = 600, unit = "px/s2" },
    { name = "waveAmplitude", label = "Wave amplitude", type = "number",
      default = 0, min = 0, max = 120, unit = "px",
      help = "Sine motion only: how far it weaves off its heading." },
    { name = "waveFrequency", label = "Wave frequency", type = "number",
      default = 4, min = 0.1, max = 30, unit = "/s", format = "%.2f" },
    { name = "orbitRadius", label = "Orbit radius", type = "number",
      default = 26, min = 0, max = 200, unit = "px",
      help = "Orbit motion only: it circles its parent at this distance "
        .. "instead of flying away." },
    { name = "orbitSpeed", label = "Orbit speed", type = "number",
      default = 180, min = -720, max = 720, unit = "deg/s" },
    { name = "lifetimeMax", label = "Lifetime", type = "number",
      default = 1.6, min = 0.05, max = 30, unit = "s", format = "%.2f" },
    { name = "collisionSize", label = "Collision radius", type = "number",
      default = 2, min = 0.5, max = 60, unit = "px" },
    { name = "visual", label = "Visual", type = "enum",
      default = "bullet",
      values = { "bullet", "bolt", "blade", "spark", "orb", "field" } },
  },
}

define{
  id = "payload", name = "PAYLOAD", short = "PAY",
  blurb = "Applies damage and an effect on Hit or Miss, then starts the chain.",
  props = {
    { name = "damagePower", label = "Damage", type = "number",
      default = 7, min = 0, max = 800,
      help = "Also read upstream by the striker, which stamps it onto the "
        .. "strike at launch." },
    { name = "damageRadius", label = "Splash radius", type = "number",
      default = 0, min = 0, max = 240, unit = "px",
      help = "0 hits only what was struck." },
    { name = "effect", label = "Effect", type = "enum",
      default = "spark",
      values = { "none", "spark", "burst", "shock", "ring", "shatter" } },
  },
}

define{
  id = "emitter", name = "EMITTER", short = "EMT",
  terminal = true, outputs = 0,
  blurb = "Throws particles and forgets them. Nothing downstream, nothing tracked.",
  props = {
    { name = "effect", label = "Effect", type = "enum",
      default = "spark",
      values = { "spark", "burst", "shock", "ring", "shatter" } },
    { name = "count", label = "Particles", type = "int",
      default = 6, min = 1, max = 80 },
    { name = "speed", label = "Speed", type = "number",
      default = 70, min = 0, max = 500, unit = "px/s" },
    { name = "spread", label = "Spread", type = "number",
      default = 45, min = 0, max = 360, unit = "deg" },
    { name = "lifetime", label = "Lifetime", type = "number",
      default = 0.5, min = 0.05, max = 6, unit = "s", format = "%.2f" },
  },
}

--- Which module types may start a graph: the ones that create strikes unasked.
function mods.isRoot(typeId)
  local t = mods.byId[typeId]
  return t and t.root == true
end

return mods
