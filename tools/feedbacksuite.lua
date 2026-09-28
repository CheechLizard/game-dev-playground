-- Presentation contracts: identities, funded contacts, isolation and audio life.
local S={}
function S.run(suite,check,eq,near)
  local sim=require("tools.simsuite")
  local config=require("framework.config")
  local Run=require("run")
  local P=require("payloads")
  local F=require("feedback")
  local A=require("sound")
  local G=require("framework.mws.graph")
  local M=require("framework.mws.v2modules")
  local function world(kind,sub)
    local r=Run.new(41) r.sandbox=true r.stationaryEnemies=true
    r.player.x,r.player.y=40,40 r.player.invulnerable=true
    local w=r.player.weapons[1]
    local g=require("weaponprototypes").builders.v2_pulse()
    local payload,striker
    for _,id in ipairs(g.order) do
      local n=g.nodes[id]
      if n.type=="barrel" then M.set(n,"subclass","forward") end
      if n.type=="payload" then payload=n M.set(n,"subclass",kind or "sharp") end
      if n.type=="striker" then striker=n M.set(n,"subclass",sub or "ranged") end
    end
    r.player.facingX,r.player.facingY=1,0
    r:buildWeaponGraph(w,g)
    r.fireSignal=true
    return r,w,g,payload,striker
  end
  sim.bootstrap()
  suite("payload identity and funded feedback")
  do
    local r,w,g,p,s=world("impact")
    local target=r:spawnEnemy("grunt",80,40) target.hp=1000
    r:update(1/60,0,0)
    eq("subclass gives launch its identity",r.strikes[1].payloadIds[1],"impact")
    eq("shot sound has the same identity",r.feedback.sounds[1].id,"impact")
    for _=1,12 do r:update(1/60,0,0) end
    local hit=false
    for _,v in ipairs(r.feedback.sounds) do if v.kind=="hit" and v.id=="impact" then hit=true end end
    check("funded Impact contact emits matching sound",hit)
    check("funded contact creates particles",#r.feedback.particles>0)
    local colour={0.2,0.3,0.4,1} config.set("payloadColour.impact",colour)
    near("graph and renderer read the live palette",P.nodeStyle(p).colour[2],0.3)
    local child=G.addNode(g,"payload") M.set(child,"subclass","plasma")
    G.connect(g,p.id,1,child.id)
    r:buildWeaponGraph(w,g) r.strikes={} F.reset(r)
    r:update(1/60,0,0)
    eq("mixed payload keeps first family",r.strikes[1].payloadIds[1],"impact")
    eq("mixed payload keeps second family",r.strikes[1].payloadIds[2],"plasma")
    -- A payload before the Striker is part of the same identity plan.
    G.disconnect(g,s.id,1) G.disconnect(g,p.id,1)
    local barrel=g.nodes[g.order[3]] G.disconnect(g,barrel.id,1)
    G.connect(g,barrel.id,1,p.id) G.connect(g,p.id,1,s.id)
    G.connect(g,s.id,1,child.id)
    r:buildWeaponGraph(w,g) r.strikes={} F.reset(r) r:update(1/60,0,0)
    eq("upstream payload contributes identity",r.strikes[1].payloadIds[1],"impact")
  end
  do
    local r,w,g,p=world("sharp")
    local target=r:spawnEnemy("grunt",80,40) target.hp=1000
    M.set(g.nodes[g.order[1]],"subclass","single")
    local battery=g.nodes[g.order[2]]
    M.set(battery,"capacity",8) M.set(battery,"fillRate",0)
    M.set(p,"damage",100) r:buildWeaponGraph(w,g)
    for _=1,20 do r:update(1/60,0,0) end
    local hit=false
    for _,v in ipairs(r.feedback.sounds) do if v.kind=="hit" then hit=true end end
    check("fully paid projectile has impact audio even with an empty battery",hit)
    eq("fully paid projectile applies its configured damage",target.hp,900)
    near("damage never charges the empty reservoir",w.mws.sequences[1].energy,0)
    G.removeNode(g,p.id) r:buildWeaponGraph(w,g) r.strikes={} F.reset(r)
    r:update(1/60,0,0)
    eq("payload-free strike is neutral",r.strikes[1].payloadIds[1],"none")
  end
  do
    local r,w,g,_,striker=world("plasma","stab")
    M.set(striker,"releaseEnds",false) r:buildWeaponGraph(w,g)
    local e=r:spawnEnemy("grunt",60,40) e.hp=1000
    for _=1,6 do r:update(1/60,0,0) end
    local count=0
    for _,v in ipairs(r.feedback.sounds) do if v.kind=="hit" then count=count+1 end end
    check("continuous damage coalesces feedback",count<=2)
    e.hp=0.001
    r:update(1/60,0,0)
    local kill=false
    for _,v in ipairs(r.feedback.sounds) do if v.kind=="kill" then kill=true end end
    check("lethal tick bypasses hit cooldown",kill)
  end
  suite("cosmetic isolation and bounds")
  do
    local a,b=Run.new(123),Run.new(123)
    local s={x=20,y=20,dirX=1,dirY=0,payloadIds={"sharp"},state={brightness=1}}
    local e={x=30,y=20,radius=4,dead=true}
    for _=1,500 do F.launch(a,s) F.hit(a,s,e,"sharp") end
    eq("feedback leaves gameplay RNG untouched",a.rng.next(),b.rng.next())
    eq("feedback leaves weapon jitter RNG untouched",a.fxRng.next(),b.fxRng.next())
    check("particles and flashes stay bounded",#a.feedback.particles<=320 and #a.feedback.flashes<=80)
    check("headless audio queue stays bounded",#a.feedback.sounds<=32)
    F.update(a,1)
    eq("expired feedback is removed",#a.feedback.particles+#a.feedback.flashes,0)
    config.set("feedback.enabled",false) F.launch(a,s) F.hit(a,s,e,"sharp")
    eq("effects toggle suppresses cosmetic geometry",#a.feedback.flashes+#a.feedback.particles,0)
    config.set("feedback.enabled",true)
  end
  suite("sound synthesis and lifecycle")
  do
    local safe=true local distinct={}
    for _,id in ipairs({"sharp","impact","plasma"}) do
      for _,kind in ipairs({"shot","hit","kill","sweep","tail","hum"}) do
        local samples,rate=A.samples(id,kind)
        for _,v in ipairs(samples) do if v~=v or math.abs(v)>1 then safe=false end end
        if kind~="hum" then near(id.." "..kind.." ends silently",samples[#samples],0) end
        distinct[id..kind]=samples[70]
        eq("synthesis rate",rate,22050)
      end
    end
    check("all synthesized samples are finite and bounded",safe)
    check("payload voices differ",distinct.sharpshot~=distinct.impactshot and distinct.impactshot~=distinct.plasmashot)
    local oldLove=love local oldCache=A.cache
    local made={}
    local function voice()
      local v={playing=false}
      function v:clone() return voice() end
      function v:play() self.playing=true end
      function v:stop() self.playing=false end
      function v:isPlaying() return self.playing end
      function v:setVolume(x) self.volume=x end
      function v:setPitch(x) self.pitch=x end
      function v:setLooping(x) self.loop=x end
      made[#made+1]=v return v
    end
    love={sound={newSoundData=function() return {setSample=function() end} end},
      audio={newSource=voice}}
    A.stop() A.cache={} sim.bootstrap()
    local r=Run.new(1)
    config.set("audio.voices",2)
    for _,id in ipairs({"sharp","impact","plasma"}) do F.sound(r,"shot",id) end
    A.update(r,1/60,true)
    eq("audio voice cap applies",#A.voices,2)
    eq("audio consumes event queue",#r.feedback.sounds,0)
    r.strikes={{alive=true,sustained=true,payloadIds={"plasma"},state={brightness=0.5}}}
    A.update(r,1/60,true) check("sustained plasma starts loop",A.hum and A.hum.playing and A.hum.loop)
    near("split scales hum volume",A.hum.volume,0.45*0.35*0.5)
    A.update(r,1/60,false)
    check("pause stops loop and one-shots",not A.hum and #A.voices==0)
    A.update(r,1/60,true) local hum=A.hum
    F.reset(r) r.strikes={} A.update(r,1/60,true)
    check("weapon reset stops old loop",not hum.playing and not A.hum)
    config.set("audio.enabled",false) A.update(r,1/60,true)
    eq("mute leaves no voices",#A.voices,0)
    A.stop() A.cache=oldCache love=oldLove
  end
  sim.bootstrap()
end
return S
