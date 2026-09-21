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
      eq("multi produces three strikes on each pulse on either side of striker",r.stats.fired,6)
      check("multi directions are distinct",h.spawned[1].dirY~=h.spawned[3].dirY)
      near("fan spends the shared rail once per actual collider",r.sequences[1].energy,94)
    end
    local g,_,_,a,s=fixture("repeater","ranged",{trigger={periodTicks=3,pulseTicks=1}})
    M.set(a,"subclass","alternating") M.set(a,"count",2)
    local single=node(g,"trigger","single")
    G.disconnect(g,a.id,1) wire(g,a,single) wire(g,single,s)
    local r,h=world(g) ticks(r,7,true)
    eq("cold routes rearm Singles after alternating barrels",r.stats.fired,3)
    near("alternating resets to its first lane after full cycle",h.spawned[1].dirY,h.spawned[3].dirY)
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
