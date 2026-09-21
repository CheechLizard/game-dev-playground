-- Editable v2 test content, separate from legacy shop weapon balancing.
local G=require("framework.mws.graph")
local M=require("framework.mws.v2modules")
local P={list={},builders={}}
local function node(g,typeId,sub,x,y,props)
  local n=G.addNode(g,typeId,x,y) M.set(n,"subclass",sub)
  for k,v in pairs(props or {}) do M.set(n,k,v) end return n
end
local function wire(g,from,to,port) assert(G.connect(g,from.id,port or 1,to.id)) end
local function base(id,name,trigger,mode,opts)
  opts=opts or {} local g=G.newV2(id,name)
  local t=node(g,"trigger",trigger,25,35,opts.trigger)
  local b=node(g,"battery","infinite",109,35,opts.battery)
  local a=node(g,"barrel",opts.barrel or "seeking",193,35)
  local s=node(g,"striker",mode,277,35,opts.striker)
  local p=node(g,"payload",opts.payload or "sharp",361,35,opts.effect)
  wire(g,t,b) wire(g,b,a) wire(g,a,s) wire(g,s,p)
  return g,t,b,a,s,p
end
local function add(id,name,builder)
  P.list[#P.list+1]={id=id,name=name,graph=id,prototype=true}
  P.builders[id]=builder
end
add("v2_pulse","V2 / Pulse",function()
  return base("v2_pulse","V2 / Pulse","repeater","ranged",{
    trigger={periodTicks=18,pulseTicks=1},battery={capacity=60,fillRate=35},
    striker={startupCost=8,draw=0,distanceCost=0.01},
  })
end)
add("v2_beam","V2 / Beam exhaustion",function()
  return base("v2_beam","V2 / Beam exhaustion","toggle","stab",{
    battery={capacity=40,fillRate=10},
    striker={startupCost=5,draw=35,distanceCost=0,radius=2,range=180,duration=12,releaseEnds=true},
    payload="plasma",effect={energy=10,efficiency=3},
  })
end)
add("v2_piercing","V2 / Piercing + Miss",function()
  local g,_,_,_,s=base("v2_piercing","V2 / Piercing + Miss","single","piercing",{
    battery={capacity=80,fillRate=30},striker={hitLimit=5,radius=3,speed=130,range=220},
  })
  local t=node(g,"trigger","miss",277,145)
  local b=node(g,"battery","infinite",361,145,{capacity=30,fillRate=10})
  local field=node(g,"striker","area",445,145,{radius=25,arc=360,duration=1,draw=8,releaseEnds=false})
  local p=node(g,"payload","plasma",529,145,{energy=8,efficiency=2,effect="ring"})
  wire(g,s,t,2) wire(g,t,b) wire(g,b,field) wire(g,field,p)
  return g
end)
add("v2_complete","V2 / Complete + Field",function()
  local g,_,_,_,s=base("v2_complete","V2 / Complete + Field","repeater","ranged",{
    trigger={periodTicks=90},striker={range=90,duration=1,speed=130},
  })
  local t=node(g,"trigger","complete",277,145)
  local b=node(g,"battery","infinite",361,145,{capacity=50,fillRate=15})
  local field=node(g,"striker","area",445,145,{radius=28,arc=360,duration=1.2,draw=8,releaseEnds=false})
  local p=node(g,"payload","plasma",529,145,{energy=7,efficiency=3,effect="ring"})
  wire(g,s,t,2) wire(g,t,b) wire(g,b,field) wire(g,field,p)
  return g
end)
add("v2_delay","V2 / Delayed single",function()
  local g,t,b=base("v2_delay","V2 / Delayed single","single","ranged",{
    striker={speed=200,range=250},
  })
  local delay=node(g,"trigger","delay",109,35,{delayTicks=60})
  for _,id in ipairs(g.order) do
    local n=g.nodes[id] if n~=t and n~=delay then n.x=n.x+84 end
  end
  G.disconnect(g,t.id,1) wire(g,t,delay) wire(g,delay,b)
  return g
end)
add("v2_sweep","V2 / Sweep",function()
  return base("v2_sweep","V2 / Sweep","repeater","sweep",{
    trigger={periodTicks=90},striker={radius=4,range=95,arc=160,duration=0.8,releaseEnds=false,draw=10},
    effect={energy=4,efficiency=3},
  })
end)
-- Same settings, different order: compare volley charge and bullet brightness.
local function multiPreset(id,name,split)
  local g,_,b,a,s,p=base(id,name,"repeater","ranged",{
    barrel="multi",trigger={periodTicks=30,pulseTicks=1},
    battery={capacity=36,fillRate=18},
    striker={startupCost=8,sizeCost=0,draw=2,distanceCost=0.01,speed=130,range=180},
    effect={energy=6,efficiency=2,effect="none"},
  })
  M.set(a,"spread",60)
  if split then
    G.disconnect(g,b.id,1) G.disconnect(g,a.id,1) G.disconnect(g,s.id,1)
    wire(g,b,s) wire(g,s,a) wire(g,a,p)
    a.x,s.x=s.x,a.x
  end
  return g
end
add("v2_multi","V2 / Full volley",function()
  return multiPreset("v2_multi","V2 / Full volley",false)
end)
add("v2_split","V2 / Split strike",function()
  return multiPreset("v2_split","V2 / Split strike",true)
end)
return P
