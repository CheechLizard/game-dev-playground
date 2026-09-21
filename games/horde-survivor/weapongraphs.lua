-- The built-in weapon graphs, as code.
--
-- These play the part the schema plays for settings: they are the defaults.
-- A graph edited in the bench is saved to `config/weapons/<id>.json` and
-- overrides the default from then on, exactly as a profile overrides schema
-- defaults -- and "Revert to built-in" throws the override away.
--
-- Positions are set by hand rather than auto-laid-out, because the shape of a
-- weapon on the canvas is part of how it reads: a straight chain is a simple
-- gun, and a fork is visibly two things happening.

local graphs = {}

local G = require("framework.mws.graph")

local COL = 84       -- horizontal stride between modules
local ROW = 148      -- vertical stride, for wrapped rows and branches

--- Wire a straight chain of modules and return them by name.
--
-- `spec` is an array of { type, props }. It is laid left to right and wrapped
-- every `perRow` modules, because the bench's panel is tall and narrow: a
-- six-module chain in one row only fits by shrinking the boxes past the point
-- their text is readable.
local function chain(g, spec, x, y, perRow)
  perRow = perRow or 24
  local made, previous = {}, nil
  for i, step in ipairs(spec) do
    local col = (i - 1) % perRow
    local row = math.floor((i - 1) / perRow)
    local node = G.addNode(g, step.type, x + col * COL, y + row * ROW)
    for name, value in pairs(step.props or {}) do node.props[name] = value end
    if previous then assert(G.connect(g, previous.id, 1, node.id)) end
    made[#made + 1] = node
    if step.name then made[step.name] = node end
    previous = node
  end
  return made
end

graphs.chain = chain

-- --------------------------------------------------------------------- list
--
-- One builder per weapon. Keyed by the graph id the content table names.

graphs.builders = {}

--- Blaster: the starting gun, and the parity check against the old system.
--
--   TRIGGER -> BATTERY -> REPEATER -> BARREL -> STRIKER -> PAYLOAD
--
-- This is the specification's own first example, and it is deliberately the
-- most boring graph the system can express. If the Blaster does not feel like
-- the Blaster did before, the runtime is wrong.
graphs.builders.blaster = function()
  local g = G.new("blaster", "Blaster")
  chain(g, {
    { type = "trigger",  props = { condition = "player_hold" } },
    { type = "battery",  props = { energyPerSecond = 46 } },
    { type = "repeater", props = { fireRate = 1.82, capacity = 0 } },
    -- OPEN: the old Blaster's `spread = 8` only fanned across multiple
    -- projectiles, so at one projectile it was dead accurate. Translating it
    -- to `spread` (the arc) rather than `spreadVariance` (per-shot wobble)
    -- measures far worse in piloted runs, which should not be possible and
    -- means something else is wrong. Left on the value that matches until the
    -- bench can show what the shots are actually doing.
    { type = "barrel",   props = { barrelCount = 1, aimMode = "nearest",
                                   spread = 8, spreadVariance = 8,
                                   rangeMax = 260, routing = "all" } },
    { type = "striker",  props = { baseSpeed = 190, lifetimeMax = 1.6,
                                   collisionSize = 2, pierce = 0,
                                   visual = "bullet" } },
    { type = "payload",  props = { damagePower = 7, critChance = 0.05,
                                   knockback = 40, effect = "spark" } },
  }, 40, 40)
  return g
end

--- Build a graph from its id, or nil when nothing declares it.
function graphs.build(id)
  local prototype=require("weaponprototypes").builders[id]
  if prototype then return (prototype()) end
  local builder = graphs.builders[id]
  if not builder then return nil end
  return builder()
end

return graphs
