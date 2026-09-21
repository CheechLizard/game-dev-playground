-- Observable v2 contracts: reservoirs, real collisions, events and authoring.
local G=require("framework.mws.graph")
local V=require("framework.mws.v2graph")
local M=require("framework.mws.v2modules")
local R=require("framework.mws.v2runtime")
local tests={}
local function node(g,kind,sub,props)
  local n=G.addNode(g,kind) M.set(n,"subclass",sub)
  for k,v in pairs(props or {}) do M.set(n,k,v) end return n
end
local function wire(g,a,b,port) assert(G.connect(g,a.id,port or 1,b.id)) end
local function fixture(trigger,striker,options)
  options=options or {}
  local g=G.newV2("test")
  local t=node(g,"trigger",trigger or "single",options.trigger)
  local b=node(g,"battery","infinite",options.battery or {capacity=100,fillRate=0})
  local a=node(g,"barrel","forward")
  local s=node(g,"striker",striker or "ranged",{startupCost=1,sizeCost=0,draw=0,
    distanceCost=0,speed=60,range=20,radius=1,duration=3,releaseEnds=false})
  for k,v in pairs(options.striker or {}) do M.set(s,k,v) end
  wire(g,t,b) wire(g,b,a) wire(g,a,s)
  return g,t,b,a,s
end
local function world(g,enemies)
  local w={x=0,y=0,aimX=1,aimY=0}
  local h={targets=enemies or {},spawned={},damageTotal=0,w=w}
  h.wielder=function() return w end
  h.enemies=function() return h.targets end
  h.random=function() return 0.25 end
  h.spawn=function(s) h.spawned[#h.spawned+1]=s end
  h.damage=function(_,e,amount) e.hp=e.hp-amount h.damageTotal=h.damageTotal+amount end
  return R.new(g,h),h
end
local function ticks(r,n,hot)
  if hot~=nil then r:setFiring(hot) end
  for _=1,n do r:update(1/60) end
end
local function target(x,y) return {x=x,y=y or 0,radius=0,hp=100} end
local function downstream(g,parent,sub,capacity)
  local t=node(g,"trigger",sub)
  local b=node(g,"battery","infinite",{capacity=capacity or 10,fillRate=0})
  local s=node(g,"striker","area",{startupCost=1,sizeCost=0,draw=0,
    distanceCost=0,radius=1,arc=360,duration=0.05,releaseEnds=false})
  wire(g,parent,t,2) wire(g,t,b) wire(g,b,s)
  return t,b,s
end

function tests.run(suite,check,eq,near)
  suite("mws v2: distinct barrel directions and centred spread")
  do
    local g,_,_,a=fixture()
    local r,h=world(g)
    h.w.aimX,h.w.aimY=0,1
    a.props.angle=45 -- a value retained by an older saved Forward module
    ticks(r,1,true)
    near("Forward ignores old angle offsets and preserves incoming direction",h.spawned[1].dirY,1)
    near("Forward adds no sideways component",h.spawned[1].dirX,0)
    M.set(a,"subclass","directional") M.set(a,"angle",30)
    r,h=world(g) h.w.aimX,h.w.aimY=0,1 ticks(r,1,true)
    near("Directional adds its angle to the incoming direction",h.spawned[1].dirX,-0.5)
    near("Directional offset is relative rather than world-fixed",h.spawned[1].dirY,math.sqrt(3)/2)
    M.set(a,"angle",0) r,h=world(g) ticks(r,1,true)
    near("Directional at zero offset behaves like Forward",h.spawned[1].dirX,1)
    local function names(sub)
      local out={} for _,p in ipairs(M.props("barrel",sub)) do out[p.name]=true end return out
    end
    local forward,directional,spread=names("forward"),names("directional"),names("spread")
    check("Forward inspector has no angle or spread controls",not forward.angle and not forward.spread)
    check("Directional exposes angle without irrelevant spread/count controls",directional.angle and not directional.spread and not directional.count)
    check("Spread exposes its arc without irrelevant count/rotation controls",spread.spread and not spread.count and not spread.rotationSpeed)

    M.set(a,"subclass","spread") M.set(a,"spread",60) M.set(a,"angle",20)
    r,h=world(g)
    local rng=12345
    h.random=function() rng=(rng*16807)%2147483647 return (rng-1)/2147483646 end
    local input={x=0,y=0,dx=math.cos(math.rad(30)),dy=math.sin(math.rad(30))}
    local samples,centre,left,right,mean=20000,0,0,0,0
    local bounded=true
    for _=1,samples do
      local packet=r:barrel(r.contexts[1],a,input,"")[1].packet
      local offset=math.deg(math.atan2(packet.dy,packet.dx))-50
      mean=mean+offset
      if offset<0 then left=left+1 else right=right+1 end
      if math.abs(offset)<=10 then centre=centre+1 end
      if math.abs(offset)>30+1e-9 then bounded=false end
    end
    check("all spread samples remain inside the configured cone",bounded)
    check("at least 75% of shots land in the central third of the cone",centre/samples>0.75)
    check("spread is balanced on both sides of its centre",math.abs(left-right)/samples<0.025)
    near("spread remains centred on incoming direction plus offset",mean/samples,0,0.2)
    M.set(a,"spread",0)
    local packet=r:barrel(r.contexts[1],a,input,"")[1].packet
    near("zero spread stays exactly on its configured centre",math.deg(math.atan2(packet.dy,packet.dx)),50)
  end
  suite("mws v2: targeting only reachable enemies")
  do
    for _,sub in ipairs({"weakling","bossling","seeking"}) do
      for _,after in ipairs({false,true}) do
        local g,_,b,a,s=fixture("single","ranged",{striker={range=20,speed=60,duration=3}})
        M.set(a,"subclass",sub)
        if after then
          G.disconnect(g,b.id,1) G.disconnect(g,a.id,1)
          wire(g,b,s) wire(g,s,a)
        end
        local close,far=target(0,10),target(100,0)
        close.hp=50 far.hp=sub=="bossling" and 100 or 1
        local r,h=world(g,{far,close}) ticks(r,1,true)
        near(sub.." aims at the reachable enemy "..(after and "after" or "before").." its Striker",h.spawned[1].dirY,1)
      end
    end
    local g,_,_,a=fixture("single","ranged",{striker={range=200,speed=10,duration=1}})
    M.set(a,"subclass","weakling")
    local close,far=target(0,5),target(50,0) close.hp=50 far.hp=1
    local r,h=world(g,{far,close}) ticks(r,1,true)
    near("projectile targeting also respects travel before duration expires",h.spawned[1].dirY,1)
    for _,mode in ipairs({"stab","sweep","area","orbit"}) do
      local shaped,_,_,barrel=fixture("single",mode,{striker={range=20,radius=2,orbitRadius=20}})
      M.set(barrel,"subclass","bossling")
      local nearEnemy,farEnemy=target(0,mode=="area" and 1 or 20),target(100,0)
      nearEnemy.hp=50 farEnemy.hp=100
      local rt,host=world(shaped,{farEnemy,nearEnemy}) ticks(rt,1,true)
      near(mode.." targeting uses its collider reach",host.spawned[1].packet.dy,1)
    end
    local scoped,_,_,barrel,striker=fixture("single","ranged",{striker={range=20}})
    M.set(barrel,"subclass","weakling")
    local _,_,field=downstream(scoped,striker,"complete") M.set(field,"radius",60)
    local closeEnemy,farEnemy=target(0,10),target(50,0) closeEnemy.hp=50 farEnemy.hp=1
    local rt,host=world(scoped,{farEnemy,closeEnemy}) ticks(rt,1,true)
    near("a later sequence cannot extend the current barrel's targeting range",host.spawned[1].dirY,1)
    local outside=target(100,0)
    local rt2,host2=world(scoped,{outside}) host2.w.aimX=0 host2.w.aimY=1 ticks(rt2,1,true)
    near("no reachable target preserves incoming direction",host2.spawned[1].dirY,1)
  end
  suite("mws v2: released fire stays quiet")
  do
    local i=require("framework.input") i.resetFire()
    local g=fixture("repeater","ranged",{trigger={periodTicks=120},battery={capacity=100,fillRate=100}})
    local r=world(g)
    for frame=1,1200 do
      if frame==1 then i.keypressed("z") end
      if frame==3 then i.keyreleased("z") end
      r:setFiring(i.sampleFire()) r:update(1/60)
    end
    eq("repeater never fires again after release across twenty seconds",r.stats.fired,1)
    i.resetFire()
    i.keypressed("z",true)
    eq("a repeat callback without a new key-down cannot create fire input",i.sampleFire(),false)
    i.keypressed("z") i.sampleFire() i.keyreleased("z") i.keypressed("z",true)
    eq("a stale repeat after release cannot relatch fire",i.sampleFire(),false)
    i.keypressed("z") i.sampleFire() i.resetFire() i.keypressed("z",true)
    eq("repeat after a reset cannot restore a held source",i.sampleFire(),false)
    i.keyreleased("z") i.keypressed("z")
    eq("a fresh key-down still fires after a reset",i.sampleFire(),true)
    i.keyreleased("z") i.resetFire()
  end
  suite("mws v2: live module telemetry")
  do
    local g,t,b=fixture("inverter","ranged",{battery={capacity=10,fillRate=60,initialCharge=0},
      striker={startupCost=5}})
    local r=world(g)
    eq("trigger starts cold before its first tick",r.info[t.id].hot,0)
    near("battery initially shows configured empty charge",r.info[b.id].stored,0)
    near("battery marks the actual startup cost",r.info[b.id].startupCosts[1],5)
    ticks(r,1,false)
    eq("trigger displays output rather than button input",r.info[t.id].hot,1)
    near("refill reaches the battery display",r.info[b.id].stored,1)
    ticks(r,4)
    eq("strike starts when the charge reaches the mark",r.stats.fired,1)
    near("startup spending empties the displayed reservoir",r.info[b.id].stored,0)
    ticks(r,3,true)
    eq("inverted hot input displays cold output",r.info[t.id].hot,0)
    near("battery displays recovery while the trigger is cold",r.info[b.id].stored,3)
    r:rebuild()
    near("reset immediately restores the displayed initial charge",r.info[b.id].stored,0)
    eq("reset clears the visible trigger state",r.info[t.id].hot,0)
  end
  do
    local g,_,b,_,s=fixture("single","ranged",{battery={capacity=10,fillRate=0,initialCharge=0.5},
      striker={startupCost=3,sizeCost=0.2,radius=2,weight=2}})
    local extra=node(g,"battery","infinite",{capacity=20,tier="rare",initialCharge=0.5})
    wire(g,s,extra)
    local _,childBattery=downstream(g,s,"complete",7)
    local r=world(g)
    near("battery display uses pooled tier-adjusted capacity",r.info[b.id].capacity,40)
    near("battery display uses pooled initial energy",r.info[b.id].stored,20)
    near("all batteries in a sequence show the same pool",r.info[extra.id].stored,20)
    near("startup mark includes size and weight costs",r.info[b.id].startupCosts[1],4.6)
    near("downstream battery has its own threshold",r.info[childBattery.id].startupCosts[1],1)
    near("downstream battery has its own charge",r.info[childBattery.id].stored,7)
    M.set(extra,"tier","legendary") r:rebuild()
    near("tier edits update the meter capacity immediately",r.info[b.id].capacity,50)
    near("tier edits update the initial charge immediately",r.info[b.id].stored,25)
  end
  do
    local g,t=fixture("hit") local r=world(g)
    r:context(r.sequences[1],{kind="hit",x=0,y=0})
    r:context(r.sequences[1],{kind="complete",x=0,y=0})
    ticks(r,1,false)
    eq("a later cold context cannot hide another context's hot output",r.info[t.id].hot,1)
    ticks(r,1)
    eq("event trigger display returns cold on the following tick",r.info[t.id].hot,0)
    ticks(r,10)
    eq("retired event contexts leave no stale hot display",r.info[t.id].hot,0)
  end
  do
    local g,_,b,a=fixture("single","ranged",{striker={startupCost=5}})
    local second=node(g,"striker","ranged",{startupCost=9,sizeCost=0}) wire(g,a,second,2)
    local same=node(g,"striker","ranged",{startupCost=5,sizeCost=0}) wire(g,a,same,3)
    local r=world(g) local costs=r.info[b.id].startupCosts
    eq("equal branch costs share one battery mark",#costs,2)
    near("first mark is the lower branch startup cost",costs[1],5)
    near("second mark preserves a different branch startup cost",costs[2],9)
  end
  suite("mws v2: application input coalescing")
  do
    local i=require("framework.input") i.resetFire()
    for _=1,20 do i.fireDown("key") i.fireUp("key") end
    eq("between-tick presses produce one hot sample",i.sampleFire(),true)
    eq("presses are not replayed next tick",i.sampleFire(),false)
    i.fireDown("key") i.fireDown("pad") i.sampleFire() i.fireUp("key")
    eq("another held input remains hot",i.sampleFire(),true)
    i.fireUp("pad") eq("all releases are cold",i.sampleFire(),false)
    i.fireDown("key") i.resetFire()
    eq("focus reset clears held input",i.sampleFire(),false)
  end
  suite("mws v2: reservoirs and sequence boundaries")
  do
    local g,_,b,_,s=fixture("inverter","ranged",{battery={capacity=10,fillRate=0},striker={startupCost=11}})
    local r=world(g) ticks(r,120,false)
    eq("cost above capacity never fires",r.stats.fired,0)
    eq("skipped starts do not complete",r.stats.completed,0)
    near("skipped starts spend no energy",r.sequences[1].energy,10)
    local extra=node(g,"battery","infinite",{capacity=20,fillRate=4,tier="rare"})
    wire(g,s,extra)
    local seq=V.compile(g)
    near("batteries after the striker still add capacity",seq[1].capacity,40)
    near("tier changes refill as well as capacity",seq[1].rate,6)
    downstream(g,s,"complete",7)
    seq=V.compile(g)
    eq("striker to trigger starts a sequence",#seq,2)
    near("downstream reservoir is independent",seq[2].capacity,7)
    near("downstream battery never boosts upstream",seq[1].capacity,40)
    G.disconnect(g,s.id,1) G.disconnect(g,b.id,1)
    local a=g.nodes[g.order[3]]
    wire(g,b,extra) wire(g,extra,a)
    seq=V.compile(g)
    near("battery placement within its sequence does not change capacity",seq[1].capacity,40)
  end
  do
    local g=fixture("single","ranged",{battery={capacity=10,fillRate=60,initialCharge=0},striker={startupCost=5}})
    local r=world(g) ticks(r,1,true) ticks(r,20,false)
    eq("unaffordable pulse is lost after refill",r.stats.fired,0)
    ticks(r,1,true) eq("fresh pulse can spend refilled energy",r.stats.fired,1)
    local hot=fixture("inverter","ranged",{battery={capacity=10,fillRate=60,initialCharge=0},striker={startupCost=5}})
    local continuous=world(hot) ticks(continuous,12,false)
    eq("hot signal retries as soon as startup is affordable",continuous.stats.fired,2)
  end
  do
    local g=fixture("toggle","stab",{battery={capacity=10,fillRate=6},
      striker={startupCost=2,draw=60,duration=20}})
    local r,h=world(g) ticks(r,1,true) ticks(r,89,false)
    check("beam exhausts and restarts without a fresh input edge",r.stats.fired>1)
    check("restarts create fresh strike objects",h.spawned[1]~=h.spawned[2])
    eq("first beam completes through energy exhaustion",r.log[1].reason,"energy")
    check("energy never becomes negative",r.sequences[1].energy>=0)
  end
  suite("mws v2: actual strike events")
  do
    local g=fixture("single","ranged",{striker={speed=500}})
    local nearTarget=target(2)
    local r=world(g,{target(7),nearTarget}) ticks(r,1,true)
    eq("fast projectiles hit the nearest contact regardless of enemy list order",r.log[1].target,nearTarget)
    near("completion occurs at the collision point",r.log[2].x,1)
    near("collision normal points away from the surface",r.log[1].nx,-1)
  end
  do
    local g,_,_,_,s=fixture("single","piercing",{striker={hitLimit=5}})
    downstream(g,s,"miss")
    local r,h=world(g,{target(5),target(12)}) ticks(r,1,true) ticks(r,30,false)
    eq("piercing reports two contacts",r.stats.hits,2)
    eq("piercing reports one final completion",r.stats.completed,1)
    eq("final completion carries accumulated count",r.log[3].hitCount,2)
    eq("range ends the partial piercing strike",r.log[3].reason,"range")
    eq("miss does not run after any hit",r.stats.fired,1)
    eq("payload-free contacts deal zero damage",h.damageTotal,0)
    eq("second sequence retains all its own energy",r.sequences[2].energy,10)
    local empty=world(g) ticks(empty,1,true) ticks(empty,30,false)
    eq("zero-hit completion activates Miss",empty.stats.fired,2)
  end
  do
    for _,enemies in ipairs({{}, {target(5)}}) do
      local g,_,_,_,s=fixture() downstream(g,s,"complete")
      local r=world(g,enemies) ticks(r,1,true) ticks(r,30,false)
      eq("Complete activates whether the strike hit or missed",r.stats.fired,2)
    end
    local g,_,_,_,s=fixture("single","piercing",{striker={speed=500,hitLimit=5}})
    downstream(g,s,"hit",1)
    local r=world(g,{target(2),target(4)}) ticks(r,1,true) ticks(r,1,false)
    eq("both contacts in a tick are delivered together next tick",r.stats.skipped,1)
    eq("event activations share one reservoir instead of copying it",r.stats.fired,2)
    near("the downstream rail was spent once",r.sequences[2].energy,0)
  end
  suite("mws v2: signals, routes and spatial context")
  do
    local g,t,b=fixture()
    local d=node(g,"trigger","delay",{delayTicks=5})
    G.disconnect(g,t.id,1) wire(g,t,d) wire(g,d,b)
    local r,h=world(g) ticks(r,1,true) h.w.x=100 ticks(r,4,false)
    eq("delay has not fired early",r.stats.fired,0)
    ticks(r,1,false)
    eq("release never cancels delayed output",r.stats.fired,1)
    near("delay retains the input's position",h.spawned[1].packet.x,0)
    local g2,_,_,_,s=fixture()
    local dt,db=downstream(g2,s,"complete")
    local delayed=node(g2,"trigger","delay",{delayTicks=15})
    G.disconnect(g2,dt.id,1) wire(g2,dt,delayed) wire(g2,delayed,db)
    local r2=world(g2) ticks(r2,1,true) ticks(r2,40,false)
    eq("event context survives until its Delay completes",r2.stats.fired,2)
  end
  do
    local g,_,b,a,s=fixture()
    G.disconnect(g,b.id,1) G.removeNode(g,a.id) wire(g,b,s)
    local r,h=world(g) ticks(r,1,true)
    near("without a barrel, direction ignores the wielder's DOI",h.spawned[1].dirX,0,1e-8)
    near("without a barrel, direction is sampled randomly",h.spawned[1].dirY,1)
  end
  do
    for _,after in ipairs({false,true}) do
      local g,t,_,a,s=fixture("repeater","ranged",{trigger={periodTicks=3,pulseTicks=1}})
      M.set(a,"subclass","multi") M.set(a,"count",3)
      if after then
        local b=g.nodes[g.order[2]] G.disconnect(g,b.id,1) G.disconnect(g,a.id,1)
        wire(g,b,s) wire(g,s,a)
      end
      local r,h=world(g) ticks(r,4,true)
      eq("Multi order determines strikes per pulse",r.stats.fired,after and 2 or 6)
      eq("either Multi order produces three colliders per pulse",#h.spawned,6)
      check("multi directions are distinct",h.spawned[1].dirY~=h.spawned[3].dirY)
      near("Multi before Striker pays per strike; Multi after splits one",r.sequences[1].energy,after and 98 or 94)
    end
    local g,_,_,a,s=fixture("repeater","ranged",{trigger={periodTicks=3,pulseTicks=1}})
    M.set(a,"subclass","alternating") M.set(a,"count",2)
    local single=node(g,"trigger","single")
    G.disconnect(g,a.id,1) wire(g,a,single) wire(g,single,s)
    local r,h=world(g) ticks(r,7,true)
    eq("cold routes rearm Singles after alternating barrels",r.stats.fired,3)
    near("alternating resets to its first lane after full cycle",h.spawned[1].dirY,h.spawned[3].dirY)
  end
  suite("mws v2: Multi before Striker reserves whole volleys")
  do
    local g,_,b,a,s=fixture("inverter","ranged",{battery={capacity=3,fillRate=60,initialCharge=0}})
    M.set(a,"subclass","multi") M.set(a,"count",3) M.set(a,"spread",60)
    local r,h=world(g)
    near("pre-Striker Multi battery tick marks the full volley",r.info[b.id].startupCosts[1],3)
    ticks(r,2,false)
    eq("low charge never emits a partial Multi volley",r.stats.fired,0)
    near("skipped volleys preserve charge for the full pattern",r.sequences[1].energy,2)
    eq("skipped Multi produces no Complete or Miss",r.stats.completed+r.stats.misses,0)
    ticks(r,1)
    eq("hot Multi resumes at the full volley threshold",r.stats.fired,3)
    near("full volley pays once for all three strikes",r.sequences[1].energy,0)
    near("full pattern retains its centre shot",h.spawned[2].dirY,0)
    near("full pattern keeps both sides symmetric",h.spawned[1].dirY,-h.spawned[3].dirY)
    near("pre-Striker Multi retains full output power",h.spawned[1].share,1)
    ticks(r,3) eq("refill produces another complete volley",r.stats.fired,6)
    M.set(b,"capacity",2) M.set(b,"initialCharge",1)
    r=world(g) ticks(r,20,false)
    eq("capacity below the whole volley never fires",r.stats.fired,0)
    near("impossible volleys never spend partial energy",r.sequences[1].energy,2)
    local warned=false
    for _,p in ipairs(r.problems) do if p.level=="warn" and p.nodeId==s.id then warned=true end end
    check("full volley above capacity produces a warning",warned)

    M.set(g.nodes[g.order[1]],"subclass","single")
    M.set(b,"capacity",3) M.set(b,"initialCharge",0)
    r=world(g) ticks(r,1,true) ticks(r,5,false)
    eq("an unaffordable Single volley is not queued for later refill",r.stats.fired,0)
    ticks(r,1,true) eq("a fresh press fires the charged volley",r.stats.fired,3)

    local second=node(g,"barrel","multi",{count=2})
    G.disconnect(g,a.id,1) wire(g,a,second) wire(g,second,s)
    M.set(b,"capacity",5) M.set(b,"initialCharge",1) M.set(b,"fillRate",0)
    r=world(g) ticks(r,1,true)
    eq("nested pre-Striker Multi cannot leak one affordable inner volley",r.stats.fired,0)
    near("nested pre-Striker mark includes every strike",r.info[b.id].startupCosts[1],6)
    M.set(b,"capacity",6) r=world(g) ticks(r,1,true)
    eq("nested pre-Striker Multi starts all six strikes",r.stats.fired,6)
    near("nested Multi does not charge twice",r.sequences[1].energy,0)

    -- Moving the second Multi after Striker halves each output, not doubles cost.
    G.disconnect(g,a.id,1) G.disconnect(g,second.id,1) wire(g,a,s) wire(g,s,second)
    M.set(b,"capacity",3) r,h=world(g) ticks(r,1,true)
    eq("combined orders start three logical strikes",r.stats.fired,3)
    eq("each of those strikes splits into two colliders",#h.spawned,6)
    near("post-Striker split does not inflate the pre-Striker cost mark",r.info[b.id].startupCosts[1],3)
    near("combined orders pay just three startups",r.sequences[1].energy,0)
    near("combined orders halve each child's output",h.spawned[1].share,0.5)

    local mixed,_,battery,multi=fixture("single","ranged",{battery={capacity=5,fillRate=0}})
    M.set(multi,"subclass","multi") M.set(multi,"count",3)
    local expensive=node(mixed,"striker","ranged",{startupCost=4,sizeCost=0,draw=0,distanceCost=0})
    wire(mixed,multi,expensive,2)
    local rt=world(mixed) ticks(rt,1,true)
    eq("differently priced lanes are still an indivisible volley",rt.stats.fired,0)
    near("mixed-lane mark counts cyclic routing and each cost",rt.info[battery.id].startupCosts[1],6)
    M.set(battery,"capacity",6) rt=world(mixed) ticks(rt,1,true)
    eq("mixed-lane volley starts at its combined threshold",rt.stats.fired,3)
    near("mixed-lane reservation pays the actual total",rt.sequences[1].energy,0)
    r=world(g)
    for i=1,510 do r.strikes[i]={alive=false} end
    ticks(r,1,true)
    eq("collider limit cannot truncate a Multi pattern",r.stats.fired,0)
    near("collider limit consumes no energy",r.sequences[1].energy,3)
  end
  suite("mws v2: Multi after Striker shares output and lifecycle")
  do
    local function split(options,trigger,mode)
      local g,t,b,a,s=fixture(trigger or "single",mode or "ranged",options)
      M.set(a,"subclass","multi") M.set(a,"count",3) M.set(a,"spread",60)
      G.disconnect(g,b.id,1) G.disconnect(g,a.id,1) wire(g,b,s) wire(g,s,a)
      return g,t,b,a,s
    end
    local g,_,b,a,s=split({battery={capacity=1,fillRate=0}})
    local r,h=world(g) ticks(r,1,true)
    eq("one startup funds a complete post-Striker split",r.stats.fired,1)
    eq("one funded strike produces all three colliders",#h.spawned,3)
    near("post-Striker battery tick marks one startup",r.info[b.id].startupCosts[1],1)
    near("post-Striker split pays startup only once",r.sequences[1].energy,0)
    near("each split child receives a third of output",h.spawned[1].share,1/3)
    check("split children are visibly dimmer",h.spawned[1].state.brightness<1)
    eq("single strike has no duplicate capacity warning",#r.problems,0)
    ticks(r,25,false)
    eq("all missing children emit one Complete",r.stats.completed,1)
    eq("all missing children count as one Miss",r.stats.misses,1)

    -- Identical payload coverage spends and deals one strike's total energy.
    g,_,b,a,s=split()
    local payload=node(g,"payload","sharp",{energy=6,efficiency=2,effect="none"}) wire(g,a,payload)
    local targets={target(10*math.cos(math.rad(30)),-5),target(10),target(10*math.cos(math.rad(30)),5)}
    r,h=world(g,targets) ticks(r,20,true)
    near("three split hits deal one full strike's damage",h.damageTotal,12)
    for i,e in ipairs(targets) do near("split child "..i.." deals one-third damage",e.hp,96) end
    near("payload costs are divided along with damage",r.sequences[1].energy,93)
    eq("split hits accumulate into the original strike",r.stats.hits,3)
    eq("split hit volley completes once",r.stats.completed,1)
    eq("hit volley never qualifies as a Miss",r.stats.misses,0)
    for i=1,3 do eq("Hit event carries the running combined count "..i,r.log[i].hitCount,i) end
    eq("single Complete carries all split hits",r.log[4].hitCount,3)

    -- The centre child finishes early; the siblings must finish before Complete.
    for _,event in ipairs({"complete","miss"}) do
      g,_,b,a,s=split() local _,childBattery=downstream(g,s,event,10)
      r,h=world(g,{target(4)}) ticks(r,5,true)
      eq("one finished child does not complete its parent",r.stats.completed,0)
      ticks(r,25,false)
      eq(event.." activates only once and obeys aggregate hit count",r.stats.fired,event=="complete" and 2 or 1)
      near("downstream reservoir is charged only by its own event",r.sequences[2].energy,event=="complete" and 9 or 10)
      near("downstream battery mark remains independent",r.info[childBattery.id].startupCosts[1],1)
    end
    g,_,b,a,s=split() downstream(g,s,"miss",10)
    r=world(g) ticks(r,30,true)
    eq("one all-miss split activates its downstream Miss once",r.stats.fired,2)

    -- Even an uneven tree conserves the original output share.
    g,_,b,a,s=split() M.set(a,"count",2)
    local nested=node(g,"barrel","multi",{count=3,spread=30}) wire(g,a,nested)
    local forward=node(g,"barrel","forward") wire(g,a,forward,2)
    r,h=world(g) ticks(r,1,true)
    eq("nested post-Striker splits still pay one startup",r.stats.fired,1)
    eq("uneven split creates four colliders",#h.spawned,4)
    local sum=0 for _,child in ipairs(h.spawned) do sum=sum+child.share end
    near("nested shares add to exactly one original output",sum,1)
    near("nested leaf gets one sixth",h.spawned[1].share,1/6)
    near("unsplit sibling keeps its half",h.spawned[4].share,0.5)
    near("nested splits do not inflate startup mark",r.info[b.id].startupCosts[1],1)

    g,_,b,a,s=split({striker={draw=6,distanceCost=0.1}})
    r,h=world(g) ticks(r,5,true)
    near("split travel and continuing work share one total draw",r.sequences[1].energy,98)
    near("initial split tuning preserves speed and reach",h.spawned[1].dist,5)

    g,_,b,a,s=split({striker={hitLimit=2}},"single","piercing") M.set(a,"spread",0)
    r=world(g,{target(5),target(10)}) ticks(r,15,true)
    eq("split piercing children retain their own penetration limits",r.stats.hits,6)
    eq("split piercing has one completion after all children finish",r.stats.completed,1)
    eq("piercing Complete includes all children's contacts",r.log[#r.log].hitCount,6)

    g,_,b,a,s=split({battery={capacity=2,fillRate=0}},"toggle","stab")
    payload=node(g,"payload","sharp",{energy=6,efficiency=2,effect="none"}) wire(g,a,payload)
    r,h=world(g,{target(5)}) ticks(r,1,true) ticks(r,10,false)
    eq("one child's payload exhaustion leaves its siblings active",#r.strikes,2)
    eq("an ended child does not restart while its parent stays active",#h.spawned,3)
    eq("a partially active split has not completed",r.stats.completed,0)
    r:clear()
    eq("reset silently clears the logical parent too",h.spawned[1].group.alive,false)
    eq("reset does not manufacture a Complete",r.stats.completed,0)

    -- Continuous damage also shares the budget on every tick.
    g,_,b,a,s=split(nil,"toggle","stab") M.set(a,"spread",0)
    payload=node(g,"payload","plasma",{energy=6,efficiency=2,effect="none"}) wire(g,a,payload)
    r,h=world(g,{target(5)}) ticks(r,1,true) ticks(r,9,false)
    near("split beams share total damage per second",h.damageTotal,2)
    near("split beams share total payload draw",r.sequences[1].energy,98)
    eq("same-target contacts from separate children each count once",r.stats.hits,3)
    M.set(s,"releaseEnds",true) ticks(r,1,true)
    eq("release ends all split children with one completion",r.stats.completed,1)
    eq("release removes every split collider",#r.strikes,0)
    eq("release Complete retains their combined hit count",r.log[#r.log].hitCount,3)

    g,_,b,a,s=split({battery={capacity=2,fillRate=0},striker={draw=60}},"toggle","stab")
    r,h=world(g) ticks(r,1,true)
    eq("split beam starts every child together",#r.strikes,3)
    ticks(r,1,false)
    eq("movement exhaustion ends the entire split together",#r.strikes,0)
    eq("exhaustion emits one Complete",r.stats.completed,1)
    eq("exhaustion records its reason",r.log[#r.log].reason,"energy")
    M.set(b,"fillRate",30) r,h=world(g) ticks(r,1,true) ticks(r,6,false)
    check("a hot split restarts after refill",r.stats.fired>1)
    check("refill creates a fresh parent strike",h.spawned[1].group~=h.spawned[4].group)

    -- A huge post-Striker fan fails atomically before spending startup.
    g,_,b,a,s=split() M.set(a,"count",8)
    local prev=a
    for _=1,3 do local n=node(g,"barrel","multi",{count=8}) wire(g,prev,n) prev=n end
    r=world(g) ticks(r,1,true)
    eq("oversized split cannot create a truncated pattern",r.stats.fired,0)
    eq("oversized split reports the safety limit",r.stats.limited,1)
    near("oversized split spends no startup energy",r.sequences[1].energy,100)
  end
  suite("mws v2: payloads and release")
  do
    local g,_,_,_,s=fixture("toggle","stab",{striker={releaseEnds=true,range=20}})
    local p=node(g,"payload","plasma",{energy=6,efficiency=2}) wire(g,s,p)
    local r,h=world(g,{target(5)}) ticks(r,1,true) ticks(r,9,false)
    eq("sustained hit count counts distinct targets",r.stats.hits,1)
    near("plasma damage is funded every contact tick",h.damageTotal,2)
    ticks(r,1,true)
    eq("second toggle press ends a release-sensitive strike",r.log[#r.log].reason,"release")
    eq("completion retains sustained hit count",r.log[#r.log].hitCount,1)
  end
  suite("mws v2: editable graphs and game integration")
  do
    local json=require("lib.json")
    for _,def in ipairs(require("weaponprototypes").list) do
      local graph=require("weapongraphs").build(def.id)
      local restored,dropped=G.fromTable(json.decode(json.encode(G.toTable(graph))))
      check(def.id.." is valid after JSON round-trip",G.isFirable(restored))
      eq(def.id.." loses no properties",#dropped,0)
      eq(def.id.." remains versioned",restored.version,2)
      local r,h=world(restored,{target(20),target(40)}) ticks(r,1,true) ticks(r,599,false)
      check(def.id.." starts at least one real strike",r.stats.fired>0)
      eq(def.id.." stays within prototype safety limits",r.stats.limited,0)
    end
    local g,t,b=fixture() G.removeNode(g,b.id)
    local r=world(g) ticks(r,1,true)
    eq("partially edited graphs are safe and inactive",r.stats.fired,0)
    check("missing required modules are reported",not r.valid)
    local d=node(g,"trigger","delay",{delayTicks=12})
    M.set(d,"subclass","repeater")
    eq("changing subclass installs its property defaults",d.props.periodTicks,6)
    eq("changing subclass removes obsolete properties",d.props.delayTicks,nil)
    require("tools.simsuite").bootstrap()
    local run=require("run").new(7)
    run.sandbox=true run.player.invulnerable=true
    run.player.weapons={}
    local w=run:addWeapon("blaster")
    run:buildWeaponGraph(w,require("weapongraphs").build("v2_beam"))
    run.fireSignal=true run:update(1/60,0,0) run.fireSignal=false
    for _=1,240 do run:update(1/60,0,0) end
    check("the game host runs exhaustion and restart",w.mws.stats.fired>1)
    eq("the game uses the sequence runtime",w.mws.version,2)
  end
  suite("mws v2: bench input lifecycle")
  do
    local previousLove=love
    local editor=require("framework.editor") local previousOpen=editor.open
    local ok,err=pcall(function()
      love={graphics={getDimensions=function() return 1280,720 end}}
      require("tools.simsuite").bootstrap()
      local config=require("framework.config") local input=require("framework.input")
      config.set("bench.population",0) config.set("bench.holdFire",false)
      input.resetFire()
      local bench=require("bench") local state=bench.new()
      for frame=1,600 do
        if frame==1 then input.keypressed("z") end
        if frame==2 then input.keyreleased("z") end
        bench.update(state,1/120,0,0)
      end
      eq("between-frame tap produces one shot through the real bench",state.weapon.mws.stats.fired,1)
      for _=1,600 do bench.update(state,1/60,0,0) end
      eq("idle bench does not produce later spontaneous shots",state.weapon.mws.stats.fired,1)
      input.keypressed("z") bench.equip(state,1) input.keypressed("z",true)
      bench.update(state,1/60,0,0)
      eq("weapon swap plus key repeat cannot start a new shot",state.weapon.mws.stats.fired,0)
      local game=dofile("games/horde-survivor/game.lua") game.restart(7)
      game.togglePause() input.pulseFire() game.update(1/60)
      eq("paused application discards pending fire presses",input.sampleFire(),false)
      game.togglePause() game.setMode("bench")
      editor.open=true input.pulseFire() game.update(1/60)
      eq("editor discards pending fire presses",input.sampleFire(),false)
      editor.open=false game.update(1/60)
      eq("closing the editor does not replay a fire press",input.sampleFire(),false)
      input.resetFire()
    end)
    love,editor.open=previousLove,previousOpen
    if not ok then error(err) end
  end
end
return tests
