-- Bounded cosmetic data. Never draws, plays audio, or consumes gameplay RNG.
local config=require("framework.config")
local payloads=require("payloads")
local F={}
local function append(list,item,limit)
  if #list>=limit then table.remove(list,1) end
  list[#list+1]=item
end
function F.reset(r)
  r.feedback={flashes={},particles={},trails={},sounds={}}
end
local function enabled() return config.get("feedback.enabled")~=false end
function F.sound(r,kind,id,power)
  if config.get("audio.enabled")==false then return end
  append(r.feedback.sounds,{kind=kind,id=id,power=power or 1,
    pitch=0.97+r.feedbackRng.next()*0.06},32)
end
function F.launch(r,s)
  s.payloadIds=s.payloadIds or payloads.strike(s)
  s.feedbackX,s.feedbackY=s.x,s.y
  local id=s.payloadIds[1]
  local mode=s.v2 and s.node.props.subclass
  local power=s.state.brightness or 1
  if enabled() then
    append(r.feedback.flashes,{kind="muzzle",id=id,x=s.x,y=s.y,
      dx=s.dirX,dy=s.dirY,power=power,age=0,life=0.075},80)
  end
  F.sound(r,mode=="sweep" and "sweep" or "shot",id,power)
end
function F.hit(r,s,e,id,critical)
  id=id or (s.payloadIds and s.payloadIds[1]) or "sharp"
  -- Sustained payloads may deal damage every tick. Feedback is per target and
  -- family, with a short cooldown; a lethal tick always gets its own cue.
  e.feedbackTimes=e.feedbackTimes or {}
  if not e.dead and (e.feedbackTimes[id] or -1)>r.time then return end
  e.feedbackTimes[id]=r.time+0.09
  local power=(s.state and s.state.brightness) or 1
  local kill=e.dead
  F.sound(r,kill and "kill" or "hit",id,power)
  if not enabled() then return end
  local dx,dy=s.dirX or 1,s.dirY or 0
  append(r.feedback.flashes,{kind=kill and "kill" or "hit",id=id,
    x=e.x,y=e.y,dx=dx,dy=dy,power=power,age=0,life=kill and 0.24 or 0.14,
    radius=math.min(14,e.radius or 4),critical=critical},80)
  local a=math.atan2(dy,dx)
  local count=kill and 10 or 5
  for _=1,count do
    local angle=a+(r.feedbackRng.next()-0.5)*(kill and math.pi*2 or 2.5)
    local speed=(kill and 28 or 18)+r.feedbackRng.next()*38
    append(r.feedback.particles,{id=id,x=e.x,y=e.y,
      vx=math.cos(angle)*speed,vy=math.sin(angle)*speed,
      life=0.12+r.feedbackRng.next()*0.20,age=0,power=power},320)
  end
end
local function age(list,dt,move)
  local live={}
  for _,v in ipairs(list) do
    v.age=v.age+dt
    if v.age<v.life then
      if move then
        v.x=v.x+v.vx*dt v.y=v.y+v.vy*dt
        local drag=math.max(0,1-5*dt) v.vx=v.vx*drag v.vy=v.vy*drag
      end
      live[#live+1]=v
    end
  end
  return live
end
function F.update(r,dt)
  local f=r.feedback
  f.flashes=age(f.flashes,dt)
  f.particles=age(f.particles,dt,true)
  f.trails=age(f.trails,dt)
  if not enabled() then f.flashes={} f.particles={} f.trails={} end
  local function trace(s)
    local x,y=s.feedbackX or s.x,s.feedbackY or s.y
    s.feedbackX,s.feedbackY=s.x,s.y
    if not enabled() or (s.x-x)^2+(s.y-y)^2<0.01 then return end
    if s.v2 and (s.node.props.subclass=="stab" or s.node.props.subclass=="sweep") then return end
    local ids=s.payloadIds or {"sharp"}
    s.trailStep=(s.trailStep or 0)+1
    append(f.trails,{x=x,y=y,ex=s.x,ey=s.y,id=ids[(s.trailStep-1)%#ids+1],
      width=math.max(1,((s.state and s.state.collisionSize) or s.radius or 2)*0.7),
      power=(s.state and s.state.brightness) or 1,age=0,
      life=config.get("feedback.trailLife") or 0.12},600)
  end
  for _,s in ipairs(r.strikes) do trace(s) end
  for _,s in ipairs(r.projectiles) do trace(s) end
end
return F
