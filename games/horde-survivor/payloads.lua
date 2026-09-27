-- One identity registry for combat, graph tiles and schema-generated colours.
-- Reserved families are presentation vocabulary, not implemented damage rules.
local config = require("framework.config")
local P = {}
P.types = {
  {id="sharp", label="Blade / sharp", colour={0.36,0.88,1,1}, mark="slash", pitch=760},
  {id="impact", label="Impact", colour={1,0.80,0.28,1}, mark="burst", pitch=150},
  {id="plasma", label="Plasma", colour={0.76,0.43,1,1}, mark="ring", pitch=330},
  {id="corrosive", label="Acid (reserved)", colour={0.64,1,0.20,1}, mark="bubble", pitch=240},
  {id="burning", label="Fire (reserved)", colour={1,0.38,0.12,1}, mark="ember", pitch=120},
  {id="freezing", label="Ice (reserved)", colour={0.33,0.52,1,1}, mark="shard", pitch=1100},
  {id="blackhole", label="Void (reserved)", colour={1,0.34,0.77,1}, mark="ring", pitch=80},
  {id="none", label="No payload", colour={0.60,0.64,0.69,1}, mark="ring", pitch=420},
}
P.byId = {}
for _, p in ipairs(P.types) do P.byId[p.id]=p end
function P.get(id) return P.byId[id] or P.byId.none end
function P.colour(id)
  local p=P.get(id)
  return config.get("payloadColour."..p.id) or p.colour
end
function P.node(node)
  if not node or node.type~="payload" then return "none" end
  -- Legacy graphs have no subclass. Their direct damage is Sharp; radius
  -- and effect remain independent from the damage identity.
  return node.props.subclass and P.get(node.props.subclass).id or "sharp"
end
function P.strike(s)
  local ids,seen={},{}
  local nodes=s.payloads
  if not nodes then
    local p=s.runtime and s.runtime.payloadFor and s.runtime.payloadFor[s.node.id]
    nodes=p and {p} or {}
  end
  for _,n in ipairs(nodes) do
    local id=P.node(n)
    if not seen[id] then ids[#ids+1]=id seen[id]=true end
  end
  if #ids==0 then ids[1]="none" end
  return ids
end
function P.icon(id,x,y,size)
  local g=love.graphics local mark=P.get(id).mark
  if mark=="slash" then
    g.polygon("line",x-size,y+size,x-size*0.2,y-size*0.3,
      x+size,y-size,x+size*0.3,y+size*0.2)
    g.line(x-size*0.6,y+size*0.6,x+size*0.5,y-size*0.5)
  elseif mark=="burst" then
    for i=0,5 do
      local a=i*math.pi/3
      g.line(x+math.cos(a)*size*0.45,y+math.sin(a)*size*0.45,
        x+math.cos(a)*size,y+math.sin(a)*size)
    end
    g.circle("fill",x,y,size*0.2)
  else
    g.circle("line",x,y,size) g.circle("line",x,y,size*0.5)
  end
end
function P.nodeStyle(node)
  if node.type~="payload" then return nil end
  local id=P.node(node)
  return {colour=P.colour(id),label=P.get(id).label,
    icon=function(x,y,size) P.icon(id,x,y,size) end}
end
function P.registerSettings(schema)
  local settings={}
  for i,p in ipairs(P.types) do
    settings[#settings+1]={key="payloadColour."..p.id,label=p.label,
      type="color",default=p.colour,order=i}
  end
  schema.register{page="Render",section="Payload colours",order=90,sectionOrder=25,settings=settings}
end
return P
