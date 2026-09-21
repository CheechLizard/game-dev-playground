-- Playable sequence runtime. Pure Lua; host supplies the world and effects.
-- Prototype choices and supported subset: docs/MWS_Implementation.md.
local G=require("framework.mws.v2graph")
local M=require("framework.mws.v2modules")
local T=require("framework.mws.triggers")
local Input=require("framework.mws.input")
local R={} R.__index=R
local STEP=1/60
local function copy(t) local o={} for k,v in pairs(t) do o[k]=v end return o end
local function unit(x,y)
  local l=math.sqrt(x*x+y*y) if l<1e-9 then return 1,0 end return x/l,y/l
end
local function angle(x,y) return math.atan2(y,x) end
local function rotate(p,a)
  local q=copy(p) local b=angle(p.dx,p.dy)+a
  q.dx,q.dy=math.cos(b),math.sin(b) q.aimed=true return q
end

function R.new(g,host)
  local self=setmetatable({graph=g,host=host,input=Input.new(),version=2,accumulator=0},R)
  self:rebuild() return self
end
function R:prop(n,name) return n.props[name] end
function R:inputEvent(e) return self.input:handle(e) end
function R:setFiring(v) self:inputEvent(v and Input.FIRE_BUTTON_DOWN or Input.FIRE_BUTTON_UP) end
function R:clear()
  for _,group in ipairs(self.groups or {}) do group.alive=false group.remaining=0 end
  for _,s in ipairs(self.strikes or {}) do
    s.alive=false if self.host.despawn then self.host.despawn(s) end
  end
  self.strikes={} self.groups={} self.contexts={} self.pending={}
end
function R:context(seq,event)
  local c={seq=seq,event=event,age=0,states={},buffers={},routes={},active={},lastHot=0}
  self.contexts[#self.contexts+1]=c return c
end
function R:rebuild()
  self:clear()
  self.sequences,self.info,self.problems=G.compile(self.graph)
  self.valid=true
  for _,p in ipairs(self.problems) do if p.level=="error" then self.valid=false end end
  self.time=0 self.accumulator=0 self.log={}
  self.stats={fired=0,hits=0,completed=0,misses=0,skipped=0,limited=0}
  for _,seq in ipairs(self.sequences) do
    seq.energy=seq.initial seq.delayTicks=0
    for _,n in ipairs(seq.nodes) do
      if n.type=="trigger" and n.props.subclass=="delay" then
        seq.delayTicks=seq.delayTicks+n.props.delayTicks
      end
    end
    if not seq.parent then self:context(seq) end
  end
end
function R:pay(seq,amount)
  if seq.energy+1e-8<amount then return false end
  seq.energy=math.max(0,seq.energy-amount) return true
end
function R:packet(ctx)
  local p
  if ctx.event then p=ctx.event else
    local w=self.host.wielder()
    p={x=w.x,y=w.y,dx=w.aimX or 1,dy=w.aimY or 0}
  end
  return {x=p.x,y=p.y,dx=p.dx or 1,dy=p.dy or 0,nx=p.nx,ny=p.ny,
    aimed=false,fixed=ctx.event~=nil}
end
function R:inTargetRange(n,p,e)
  local distance=math.sqrt((e.x-p.x)^2+(e.y-p.y)^2)
  for _,striker in ipairs(self.info[n.id].targetStrikers or {}) do
    local cfg=striker.props
    local reach,inner=cfg.range,0
    if cfg.subclass=="ranged" or cfg.subclass=="piercing" then
      reach=math.min(reach,cfg.speed*cfg.duration)
    elseif cfg.subclass=="area" then reach=0
    elseif cfg.subclass=="orbit" then reach=cfg.orbitRadius inner=reach end
    local margin=cfg.radius+(e.radius or 0)
    if distance<=reach+margin and distance>=inner-margin then return true end
  end
  return false
end
function R:barrel(ctx,n,p,path)
  local cfg=n.props local mode=cfg.subclass
  local q=copy(p) local count=1
  local base=math.rad(mode=="forward" and 0 or (cfg.angle or 0))
  if mode=="blind" then base=self.host.random()*math.pi*2-angle(q.dx,q.dy)
  elseif mode=="spread" then
    -- Averaging independent draws gives a smooth, symmetric bell shape with
    -- hard cone bounds. No clamping that could pile shots up at the edges.
    local sum=0
    for _=1,6 do sum=sum+self.host.random() end
    base=base+(sum/6-0.5)*math.rad(cfg.spread)
  elseif mode=="rotating" then base=base+self.time*math.rad(cfg.rotationSpeed)
  elseif mode=="bounce" then
    if q.nx then
      local d=q.dx*q.nx+q.dy*q.ny q.dx,q.dy=q.dx-2*d*q.nx,q.dy-2*d*q.ny
    else q.dx,q.dy=-q.dx,-q.dy end
  elseif mode=="refract" then
    if q.nx then q.dx,q.dy=-q.nx,-q.ny end
  elseif mode=="seeking" or mode=="weakling" or mode=="bossling" then
    local best,score
    for _,e in ipairs(self.host.enemies()) do
      if not e.dead and self:inTargetRange(n,q,e) then
        local v=(e.x-q.x)^2+(e.y-q.y)^2
        if mode=="weakling" then v=e.hp elseif mode=="bossling" then v=-e.hp end
        if not score or v<score then best,score=e,v end
      end
    end
    if best then q.dx,q.dy=unit(best.x-q.x,best.y-q.y) end
  end
  if mode=="multi" or mode=="alternating" then count=cfg.count end
  local first,last=1,count
  if mode=="alternating" then
    local key="barrel:"..path..n.id
    local index=((ctx.states[key] or 0)%count)+1 ctx.states[key]=index
    first,last=index,index
  end
  local out={}
  for i=first,last do
    local offset=count>1 and ((i-1)/(count-1)-0.5)*math.rad(cfg.spread) or 0
    out[#out+1]={packet=rotate(q,base+offset),port=i,path=path..n.id..":"..i.."/"}
  end
  return out
end

-- Before a Striker, Multi repeats requests. After it, Multi divides one
-- output family. Nested splits divide their incoming share, never clone it.
function R:plans(ctx,node,p,payloads,path)
  local requests,byKey={},{} local count=0
  local function finish(q,ps,k,share,family)
    count=count+1
    local key=family or k
    local request=byKey[key]
    if not request then
      request={key=key,plans={},colliderCount=0}
      byKey[key]=request requests[#requests+1]=request
    end
    request.plans[#request.plans+1]={packet=q,payloads=ps,share=share}
    request.colliderCount=request.colliderCount+1
  end
  local function walk(n,q,ps,k,share,family)
    if count>512 or n.type=="trigger" then return end
    if n.type=="payload" then ps=copy(ps) ps[#ps+1]=n end
    local children=G.childrenOf(self.graph,n)
    if n.type=="barrel" then
      if n.props.subclass=="multi" then
        family=family or k..n.id..":split"
        share=share/n.props.count
      end
      for _,b in ipairs(self:barrel(ctx,n,q,k)) do
        if #children==0 then finish(b.packet,ps,b.path,share,family)
        else walk(children[(b.port-1)%#children+1].node,b.packet,ps,b.path,share,family) end
      end
    else
      local physical={}
      for _,c in ipairs(children) do
        if c.node.type~="trigger" then physical[#physical+1]=c end
      end
      if #physical==0 then finish(q,ps,k,share,family)
      else
        -- Branches inside a split cannot duplicate that split's budget.
        local part=family and share/#physical or share
        for _,c in ipairs(physical) do walk(c.node,q,ps,k..c.port.."/",part,family) end
      end
    end
  end
  walk(node,p,payloads,path,1,nil)
  if count>512 then
    -- The whole request must fail; never emit a truncated expansion.
    return {{key=path..":limit",plans={},colliderCount=513}}
  end
  return requests
end
function R:emit(s,kind,reason,target,nx,ny,contactX,contactY)
  local e={kind=kind,hitCount=s.group.hitCount,reason=reason,x=s.x,y=s.y,
    dx=s.dirX,dy=s.dirY,nx=nx,ny=ny,target=target,striker=s.node.id,sequence=s.seq.id}
  if target then e.x,e.y=contactX or target.x,contactY or target.y end
  self.log[#self.log+1]=e if #self.log>40 then table.remove(self.log,1) end
  for _,seq in ipairs(self.sequences) do
    if seq.parent==s.node.id then
      local sub=seq.root.props.subclass
      local accept=(sub~="hit" and sub~="miss" and sub~="complete")
        or (sub=="hit" and kind=="hit")
        or (sub=="complete" and kind=="complete")
        or (sub=="miss" and kind=="complete" and e.hitCount==0)
      if accept then self.pending[#self.pending+1]={seq=seq,event=e} end
    end
  end
end
function R:finish(s,reason)
  if not s.alive then return end
  s.alive=false
  local group=s.group
  group.remaining=group.remaining-1
  if group.remaining==0 then
    group.alive=false self.stats.completed=self.stats.completed+1
    if group.hitCount==0 then self.stats.misses=self.stats.misses+1 end
    -- The final child's endpoint and reason locate the single Complete event.
    self:emit(s,"complete",reason)
  end
  if self.host.despawn then self.host.despawn(s) end
end
function R:finishGroup(group,reason)
  for _,s in ipairs(group.children) do self:finish(s,reason) end
end
-- Pre-Striker Multi reserves every requested strike together. Each request
-- may itself contain split colliders, but pays startup just once.
function R:withVolley(ctx,emit)
  if ctx.volley then emit() return end
  ctx.volley={}
  emit()
  local requests=ctx.volley ctx.volley=nil
  if #requests==0 then return end
  local cost,colliders=0,0
  for _,request in ipairs(requests) do
    cost=cost+G.startup(request.node)
    colliders=colliders+request.plan.colliderCount
  end
  if #self.strikes+colliders>512 then
    self.stats.limited=self.stats.limited+#requests return
  end
  if not self:pay(ctx.seq,cost) then
    self.stats.skipped=self.stats.skipped+#requests self.stalled=true return
  end
  for _,request in ipairs(requests) do self:offer(ctx,request.node,1,request.plan,true) end
end
function R:offer(ctx,n,signal,request,prepaid)
  local cfg=n.props local key=n.id..":"..request.key
  if signal==1 then ctx.hotKeys[key]=true end
  local sustained=cfg.subclass~="ranged" and cfg.subclass~="piercing"
  local active=ctx.active[key]
  if active and active.alive and sustained then
    if signal==0 and cfg.releaseEnds then self:finishGroup(active,"release") end
    return
  end
  if signal==0 then return end
  if ctx.volley then
    ctx.volley[#ctx.volley+1]={node=n,plan=request} return
  end
  if #self.strikes+request.colliderCount>512 then self.stats.limited=self.stats.limited+1 return end
  if not prepaid and not self:pay(ctx.seq,G.startup(n)) then
    self.stats.skipped=self.stats.skipped+1 self.stalled=true return
  end
  local group={alive=true,node=n,sustained=sustained,children={},hitCount=0,
    remaining=request.colliderCount,seq=ctx.seq}
  ctx.active[key]=group self.groups[#self.groups+1]=group
  self.stats.fired=self.stats.fired+1
  for _,plan in ipairs(request.plans) do
    local p=plan.packet
    local dx,dy=p.dx,p.dy
    if not p.aimed then local a=self.host.random()*math.pi*2 dx,dy=math.cos(a),math.sin(a) end
    local s={v2=true,node=n,seq=ctx.seq,ctx=ctx,packet=copy(p),payloads=plan.payloads,
      runtime=self,alive=true,age=0,hitCount=0,hitSet={},x=p.x,y=p.y,
      group=group,share=plan.share,
      dirX=dx,dirY=dy,baseAngle=angle(dx,dy),sustained=sustained,
      state={collisionSize=cfg.radius,strikeAimX=dx,strikeAimY=dy,
        brightness=math.sqrt(plan.share),
        baseSpeed=cfg.speed,speedMultiplier=1,visual=sustained and "field" or "bullet",
        baseDamage=0,extra={}},dist=0}
    group.children[#group.children+1]=s self.strikes[#self.strikes+1]=s
    if self.host.spawn then self.host.spawn(s) end
  end
end
function R:walk(ctx,n,signal,p,path,payloads)
  local cfg=n.props
  if n.type=="trigger" then
    local key=n.id..":"..path
    local state=ctx.states[key]
    if not state then state=T.new(cfg.subclass,M.triggerProps(n)) ctx.states[key]=state end
    local observation={}
    if ctx.age==0 then observation.event=ctx.event end
    if cfg.subclass=="proximity" then
      observation.proximity=false
      for _,e in ipairs(self.host.enemies()) do
        if not e.dead and (e.x-p.x)^2+(e.y-p.y)^2<=cfg.sensorRadius^2 then observation.proximity=true break end
      end
    end
    if cfg.subclass=="delay" and cfg.delayTicks>0 then
      local h=ctx.buffers[key] or {} ctx.buffers[key]=h
      local i=state.tick%cfg.delayTicks+1 local old=h[i]
      h[i]=copy(p) if old then p=copy(old) p.fixed=true end
    end
    signal=state:step(signal,observation)
    -- A module can execute in several event contexts/routes in the same tick.
    -- Display hot if any execution is hot, regardless of iteration order.
    self.info[n.id].hot=math.max(self.info[n.id].hot,signal)
    if signal==1 then ctx.lastHot=ctx.age end
  elseif n.type=="striker" then
    if signal==1 then
      for _,request in ipairs(self:plans(ctx,n,p,payloads,path)) do
        self:offer(ctx,n,signal,request)
      end
    end
    return
  elseif n.type=="barrel" then
    local children=G.childrenOf(self.graph,n)
    -- Every route keeps receiving cold ticks, so a downstream Single resets
    -- and a pending Delay continues even after this barrel selects another lane.
    local key=path..n.id
    local routes=ctx.routes[key]
    if not routes then
      routes={} ctx.routes[key]=routes
      local count=(cfg.subclass=="multi" or cfg.subclass=="alternating") and cfg.count or 1
      for i=1,count do
        local offset=count>1 and ((i-1)/(count-1)-0.5)*math.rad(cfg.spread) or 0
        local k=path..n.id..":"..i.."/"
        local base=cfg.subclass=="forward" and 0 or (cfg.angle or 0)
        routes[i]={packet=rotate(p,math.rad(base)+offset),port=i,path=k}
      end
    end
    local hot={}
    if signal==1 then
      for _,b in ipairs(self:barrel(ctx,n,p,path)) do routes[b.port]=b hot[b.port]=true end
    end
    local function emit()
      for _,b in ipairs(routes) do
        if #children>0 then self:walk(ctx,children[(b.port-1)%#children+1].node,
          hot[b.port] and 1 or 0,b.packet,b.path,payloads) end
      end
    end
    if cfg.subclass=="multi" then self:withVolley(ctx,emit) else emit() end
    return
  elseif n.type=="payload" then payloads=copy(payloads) payloads[#payloads+1]=n end
  for _,c in ipairs(G.childrenOf(self.graph,n)) do self:walk(ctx,c.node,signal,p,path,payloads) end
end

local function distanceToSegment(ex,ey,x,y,dx,dy,length)
  local t=math.max(0,math.min(length,(ex-x)*dx+(ey-y)*dy))
  return (ex-x-t*dx)^2+(ey-y-t*dy)^2
end
-- Split outputs share each tick's movement draw. Keep geometry unchanged in
-- this first tuning pass; payload energy/damage carries the reduced power.
function R:movement(s)
  local p=s.node.props local mode=p.subclass local distance=0
  if mode=="ranged" or mode=="piercing" then distance=math.min(p.speed*STEP,math.max(0,p.range-s.dist))
  elseif mode=="orbit" then distance=p.orbitRadius*math.abs(math.rad(p.orbitSpeed))*STEP
  elseif mode=="stab" or mode=="sweep" then distance=p.range*STEP end
  return distance,(p.draw*STEP+p.distanceCost*distance*p.weight)*s.share
end
function R:simulate(s)
  local p=s.node.props local mode=p.subclass local dt=STEP
  local origin=s.packet
  if s.sustained and not origin.fixed then
    local w=self.host.wielder() origin.x,origin.y=w.x,w.y
  end
  local distance=self:movement(s)
  s.age=s.age+dt
  local oldX,oldY=s.x,s.y
  if mode=="ranged" or mode=="piercing" then
    s.x=s.x+s.dirX*distance s.y=s.y+s.dirY*distance s.dist=s.dist+distance
  else
    s.x,s.y=origin.x,origin.y
    if mode=="sweep" then
      local a=s.baseAngle+math.rad(p.arc)*(math.min(1,s.age/p.duration)-0.5)
      s.dirX,s.dirY=math.cos(a),math.sin(a)
    elseif mode=="orbit" then
      local a=s.baseAngle+s.age*math.rad(p.orbitSpeed)
      s.x=origin.x+math.cos(a)*p.orbitRadius s.y=origin.y+math.sin(a)*p.orbitRadius
    end
  end
  local projectile=mode=="ranged" or mode=="piercing"
  local contacts={}
  for i,e in ipairs(self.host.enemies()) do
    if not e.dead then
      local along=(e.x-oldX)*s.dirX+(e.y-oldY)*s.dirY
      local across=(e.x-oldX)*s.dirY-(e.y-oldY)*s.dirX
      local radius=p.radius+(e.radius or 0)
      local t=math.max(0,along-math.sqrt(math.max(0,radius^2-across^2)))
      contacts[#contacts+1]={enemy=e,t=t,index=i}
    end
  end
  if projectile then table.sort(contacts,function(a,b)
    return a.t<b.t or (a.t==b.t and a.index<b.index)
  end) end
  for _,contact in ipairs(contacts) do
    local e=contact.enemy
    if s.alive and not e.dead then
      local reach=p.radius+(e.radius or 0)
      local overlap=(e.x-s.x)^2+(e.y-s.y)^2<=reach^2
      if mode=="ranged" or mode=="piercing" then
        overlap=distanceToSegment(e.x,e.y,oldX,oldY,s.dirX,s.dirY,distance)<=reach^2
      elseif mode=="stab" or mode=="sweep" then
        overlap=distanceToSegment(e.x,e.y,s.x,s.y,s.dirX,s.dirY,p.range)<=reach^2
      elseif mode=="area" and overlap and p.arc<360 then
        local a=angle(e.x-s.x,e.y-s.y)-s.baseAngle
        a=(a+math.pi)%(math.pi*2)-math.pi overlap=math.abs(a)<=math.rad(p.arc)/2
      end
      local first=not s.hitSet[e]
      if overlap and (s.sustained or first) then
        if first then
          s.hitSet[e]=true s.hitCount=s.hitCount+1
          s.group.hitCount=s.group.hitCount+1 self.stats.hits=self.stats.hits+1
          local cx,cy=e.x,e.y
          if projectile then cx,cy=oldX+s.dirX*contact.t,oldY+s.dirY*contact.t end
          local nx,ny=unit(cx-e.x,cy-e.y)
          self:emit(s,"hit",nil,e,nx,ny,cx,cy)
          if projectile and (mode=="ranged" or s.hitCount>=p.hitLimit) then s.x,s.y=cx,cy end
        end
        for _,payload in ipairs(s.payloads) do
          local q=payload.props local continuous=q.subclass=="plasma"
          if s.alive and (first or continuous) then
            local energy=q.energy*(continuous and dt or 1)*s.share
            if not self:pay(s.seq,energy) then self:finish(s,"energy") break end
            local damage=energy*q.efficiency
            if q.subclass=="impact" then damage=damage*p.weight*math.max(0.1,p.speed/100) end
            if damage>0 then self.host.damage(s,e,damage) end
            if first and q.effect~="none" and self.host.effect then self.host.effect(q.effect,e.x,e.y,payload) end
          end
        end
        if s.alive and mode=="ranged" then self:finish(s,"hit")
        elseif s.alive and mode=="piercing" and s.hitCount>=p.hitLimit then self:finish(s,"hit_limit") end
      end
    end
  end
  if s.alive then
    if s.age+1e-8>=p.duration then self:finish(s,"duration")
    elseif not s.sustained and s.dist+1e-8>=p.range then self:finish(s,"range") end
  end
end
function R:step()
  self.time=self.time+STEP self.stalled=false
  for _,info in pairs(self.info) do if info.hot~=nil then info.hot=0 end end
  for _,seq in ipairs(self.sequences) do seq.energy=math.min(seq.capacity,seq.energy+seq.rate*STEP) end
  local incoming=self.pending self.pending={}
  for _,q in ipairs(incoming) do
    if #self.contexts<256 then self:context(q.seq,q.event) else self.stats.limited=self.stats.limited+1 end
  end
  if self.valid then
    for _,ctx in ipairs(self.contexts) do
      ctx.hotKeys={}
      local signal=ctx.event and (ctx.age==0 and 1 or 0) or self.input:sample()
      self:walk(ctx,ctx.seq.root,signal,self:packet(ctx),"",{})
      for key,group in pairs(ctx.active) do
        if group.alive and group.sustained and group.node.props.releaseEnds and not ctx.hotKeys[key] then
          self:finishGroup(group,"release")
        end
      end
      ctx.age=ctx.age+1
    end
  end
  for _,group in ipairs(self.groups) do
    if group.alive then
      local cost=0
      for _,s in ipairs(group.children) do
        if s.alive then local _,draw=self:movement(s) cost=cost+draw end
      end
      if self:pay(group.seq,cost) then
        for _,s in ipairs(group.children) do if s.alive then self:simulate(s) end end
      else self:finishGroup(group,"energy") end
    end
  end
  local groups={} for _,group in ipairs(self.groups) do if group.alive then groups[#groups+1]=group end end
  self.groups=groups
  local live={} for _,s in ipairs(self.strikes) do if s.alive then live[#live+1]=s end end self.strikes=live
  local contexts={}
  for _,ctx in ipairs(self.contexts) do
    local active=false for _,s in pairs(ctx.active) do if s.alive then active=true break end end
    if not ctx.event or active or ctx.age-ctx.lastHot<=ctx.seq.delayTicks+2 then contexts[#contexts+1]=ctx end
  end
  self.contexts=contexts
  for _,seq in ipairs(self.sequences) do
    for _,n in ipairs(seq.nodes) do self.info[n.id].stored=seq.energy end
  end
end
function R:update(dt)
  self.accumulator=self.accumulator+dt
  while self.accumulator+1e-9>=STEP do
    self.accumulator=self.accumulator-STEP self:step()
  end
end
return R
