-- Playable v2 subset. This registry alone declares its editable properties.
-- Unsupported subclasses are intentionally absent from the palette.
local triggers = require("framework.mws.triggers")
local legacy = require("framework.mws.modules")
local M = { types = {}, byId = {}, coerce = legacy.coerce }

local function number(name, label, default, min, max, unit)
  return { name=name, label=label, type="number", default=default,
    min=min, max=max, unit=unit, format="%.1f" }
end
local function int(name, label, default, min, max)
  return { name=name, label=label, type="int", default=default, min=min, max=max }
end
local function define(id, short, blurb, subclasses, default, props, outputs)
  local t = { id=id, name=id:upper(), short=short, blurb=blurb,
    outputs=outputs or 1, root=id=="trigger", props=props,
    subclass={name="subclass", label="Subclass", type="enum",
      default=default, values=subclasses} }
  M.types[#M.types+1], M.byId[id] = t, t
end

local triggerIds = {}
for _, t in ipairs(triggers.types) do triggerIds[#triggerIds+1] = t.id end
define("trigger", "TRG", "Transform the signal; no energy is spent here.",
  triggerIds, "single", {})
define("battery", "BAT", "One independent reservoir per sequence. All batteries add.",
  {"infinite"}, "infinite", {
    {name="tier",label="Tier",type="enum",default="common",
      values={"trash","common","rare","legendary","celestial"}},
    number("capacity", "Base capacity", 60, 0, 500, "e"),
    number("fillRate", "Base refill", 20, 0, 200, "e/s"),
    number("initialCharge", "Initial charge", 1, 0, 1, "fraction"),
  })
define("barrel", "BRL", "Transform incoming direction; order matters.",
  {"forward","directional","spread","multi","alternating","blind",
    "seeking","weakling","bossling","rotating","bounce","refract"},
  "forward", {
    number("angle", "Angle offset", 0, -180, 180, "deg"),
    int("count", "Directions", 3, 2, 8),
    number("spread", "Spread arc", 30, 0, 360, "deg"),
    number("rotationSpeed", "Rotation", 90, -720, 720, "deg/s"),
  }, 8)
define("striker", "STK", "Creates colliders and emits Hit / Complete; requires energy.",
  {"ranged","piercing","stab","sweep","area","orbit"}, "ranged", {
    number("startupCost", "Startup energy", 8, 0.1, 200, "e"),
    number("draw", "Continuing draw", 4, 0, 200, "e/s"),
    number("distanceCost", "Travel energy", 0.02, 0, 1, "e/px"),
    number("sizeCost", "Size energy", 0.03, 0, 1, "e/r2"),
    number("weight", "Weight", 1, 0.1, 10, "x"),
    number("speed", "Speed", 150, 0, 500, "px/s"),
    number("range", "Range / reach", 180, 5, 500, "px"),
    number("duration", "Max duration", 3, 0.05, 20, "s"),
    number("radius", "Collider radius", 3, 1, 60, "px"),
    int("hitLimit", "Piercing hit limit", 4, 2, 30),
    number("arc", "Sweep / area arc", 120, 1, 360, "deg"),
    number("orbitRadius", "Orbit radius", 35, 2, 120, "px"),
    number("orbitSpeed", "Orbit speed", 180, -720, 720, "deg/s"),
    {name="releaseEnds",label="Release ends strike",type="bool",default=true},
  }, 8)
define("payload", "PAY", "Ordered effects, funded by this sequence's rail.",
  {"sharp","impact","plasma"}, "sharp", {
    number("energy", "Impact energy / DPS draw", 4, 0.1, 100, "e or e/s"),
    number("efficiency", "Damage per energy", 2, 0, 10, "HP/e"),
    {name="effect",label="Effect",type="enum",default="spark",
      values={"none","spark","burst","ring","shock"}},
  })

-- Explicit prototype tuning, not the final balance table.
M.tierScale = { trash=0.5, common=1, rare=1.5, legendary=2, celestial=3 }
M.triggerTier = {name="tier",label="Tier",type="enum",default="common",
  values={"trash","common","rare","legendary","celestial"}}

function M.props(typeId, subclass)
  local t = M.byId[typeId]
  if not t then return {} end
  local out = { t.subclass }
  for _, p in ipairs(t.props) do out[#out+1]=p end
  if typeId=="trigger" then
    local def=triggers.byId[subclass or t.subclass.default]
    for _, p in ipairs(def and def.props or {}) do out[#out+1]=p end
    if subclass=="repeater" then out[#out+1]=M.triggerTier end
    if subclass=="proximity" then
      -- Geometry has no meaning before a collider exists, so sensing gets
      -- an explicit radius in this prototype rather than guessing a payload.
      out[#out+1]=M.sensorRadius
    end
  end
  return out
end
M.sensorRadius=number("sensorRadius","Sensor radius",60,1,300,"px")

function M.defaults(typeId, subclass)
  local out={}
  for _, p in ipairs(M.props(typeId,subclass)) do out[p.name]=p.default end
  if subclass then out.subclass=subclass end
  return out
end
function M.set(node, name, value)
  local old=node.props
  if name=="subclass" then
    value=M.coerce(M.byId[node.type].subclass,value)
    local props=M.defaults(node.type,value)
    for _, p in ipairs(M.props(node.type,value)) do
      if p.name~="subclass" and old[p.name]~=nil then props[p.name]=old[p.name] end
    end
    node.props=props
  else
    for _, p in ipairs(M.props(node.type,old.subclass)) do
      if p.name==name then node.props[name]=M.coerce(p,value) break end
    end
  end
end
function M.isRoot(id) return id=="trigger" end
function M.triggerProps(node)
  local props={}
  for _, p in ipairs(triggers.byId[node.props.subclass].props) do
    props[p.name]=node.props[p.name] or p.default
  end
  if node.props.subclass=="repeater" then
    props.periodTicks=math.max(2,math.floor(props.periodTicks /
      (M.tierScale[node.props.tier or "common"] or 1)+0.5))
    props.pulseTicks=math.min(props.periodTicks-1,props.pulseTicks)
  end
  return props
end
return M
