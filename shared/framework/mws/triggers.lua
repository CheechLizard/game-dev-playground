-- v2 Trigger subclasses: pure signal processing, once per simulation tick.
-- No input bindings, energy, clocks, collision queries, or strike creation.
-- These definitions own the v2 properties/defaults; an editor should read
-- them rather than maintain another list. The v2 graph registry imports these
-- declarations; legacy graphs retain their original module definitions.

local triggers = { types = {}, byId = {} }
local Instance = {}
Instance.__index = Instance

local function bit(value)
  if value == true or value == 1 then return 1 end
  if value == false or value == 0 then return 0 end
  error("mws.triggers: expected a boolean or 0/1 signal", 3)
end

local function define(def)
  def.class = "trigger"
  def.props = def.props or {}
  assert(not triggers.byId[def.id], "duplicate trigger subclass")
  triggers.types[#triggers.types + 1] = def
  triggers.byId[def.id] = def
end

define{
  id = "inverter", name = "Inverter",
  evaluate = function(_, input) return 1 - input end,
}

define{
  id = "single", name = "Single",
  evaluate = function(self, input)
    return input == 1 and self.previous == 0 and 1 or 0
  end,
}

define{
  id = "toggle", name = "Toggle",
  evaluate = function(self, input)
    if input == 1 and self.previous == 0 then self.latched = 1 - self.latched end
    return self.latched
  end,
}

define{
  id = "delay", name = "Delay",
  props = {
    { name = "delayTicks", label = "Delay", type = "int", default = 1,
      min = 0, max = 36000, unit = "ticks",
      help = "Echo both hot and cold bits after this many simulation ticks." },
  },
  evaluate = function(self, input)
    local delay = self.props.delayTicks
    if delay == 0 then return input end
    -- A bounded signal history is the Delay's behavior, not an application
    -- input replay queue. Cold input replaces a bit; it never cancels history.
    local index = self.tick % delay + 1
    local output = self.history[index] or 0
    self.history[index] = input
    return output
  end,
}

define{
  id = "repeater", name = "Repeater",
  props = {
    { name = "periodTicks", label = "Pulse period", type = "int", default = 6,
      min = 2, max = 36000, unit = "ticks",
      help = "Start-to-start pulse interval. Tier rates are content policy." },
    { name = "pulseTicks", label = "Pulse width", type = "int", default = 1,
      min = 1, max = 35999, unit = "ticks",
      help = "Hot ticks per pulse; must leave at least one cold tick per period." },
  },
  validate = function(props)
    -- Prototype policy: discrete pulses must have a cold interval so another
    -- Single/Toggle can distinguish them. See MWS_Implementation.md.
    assert(props.pulseTicks < props.periodTicks,
      "mws.triggers: pulseTicks must be smaller than periodTicks")
  end,
  evaluate = function(self, input)
    if input == 0 then
      self.phase = 0
      return 0
    end
    local output = self.phase < self.props.pulseTicks and 1 or 0
    self.phase = (self.phase + 1) % self.props.periodTicks
    return output
  end,
}

define{
  id = "proximity", name = "Proximity",
  evaluate = function(_, _, observation)
    -- The host provides the result of its area query. This primitive reports
    -- that result directly; upstream gating and geometry remain open design.
    if observation.proximity == nil then return 0 end
    return bit(observation.proximity)
  end,
}

local function eventBit(kind, event, zeroHitsOnly)
  if not event or event.kind ~= kind then return 0 end
  if kind == "complete" then
    assert(type(event.hitCount) == "number" and event.hitCount >= 0
      and event.hitCount < math.huge and event.hitCount == math.floor(event.hitCount),
      "mws.triggers: Complete requires a nonnegative integer hitCount")
    if zeroHitsOnly and event.hitCount ~= 0 then return 0 end
  end
  return 1
end

define{
  id = "hit", name = "Hit",
  evaluate = function(_, _, observation)
    return eventBit("hit", observation.event)
  end,
}

define{
  id = "miss", name = "Miss",
  evaluate = function(_, _, observation)
    return eventBit("complete", observation.event, true)
  end,
}

define{
  id = "complete", name = "Complete",
  evaluate = function(_, _, observation)
    return eventBit("complete", observation.event)
  end,
}

--- Create one independently configured trigger instance, initially cold.
-- Times are integer simulation ticks in this foundation; seconds-to-ticks
-- conversion and numerical rarity rates are deliberately not guessed here.
function triggers.new(subclass, props)
  local def = assert(triggers.byId[subclass],
    "mws.triggers: unknown subclass " .. tostring(subclass))
  props = props or {}
  local values, known = {}, {}
  for _, prop in ipairs(def.props) do
    known[prop.name] = true
    local value = props[prop.name]
    if value == nil then value = prop.default end
    assert(type(value) == "number" and value == math.floor(value)
      and value >= prop.min and value <= prop.max,
      "mws.triggers: invalid " .. prop.name)
    values[prop.name] = value
  end
  for name in pairs(props) do
    assert(known[name], "mws.triggers: unknown property " .. tostring(name))
  end
  if def.validate then def.validate(values) end
  return setmetatable({
    subclass = subclass, props = values, definition = def,
    previous = 0, latched = 0, phase = 0, tick = 0, history = {},
  }, Instance)
end

--- Evaluate exactly one simulation tick. Always returns the integer 0 or 1.
-- observation is tick-local host data: { proximity = boolean/bit, event =
-- { kind = "hit"|"complete", hitCount = N, ... } }. Events are not retained.
-- Multiple-event batches are intentionally not supported until their signal
-- encoding is settled; the caller must not silently coalesce striker events.
function Instance:step(input, observation)
  input = bit(input)
  observation = observation or {}
  assert(observation.events == nil,
    "mws.triggers: event batches need a defined signal policy")
  local output = self.definition.evaluate(self, input, observation)
  self.previous = input
  self.tick = self.tick + 1
  return output
end

return triggers
