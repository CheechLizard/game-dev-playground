-- Primitive-only payload art, kept separate from simulation and sound.
local config=require("framework.config")
local P=require("payloads")
local D={}
local function colour(id,alpha,power)
  local c=P.colour(id) local p=power or 1
  love.graphics.setColor(c[1]*p,c[2]*p,c[3]*p,alpha or 1)
end
function D.trails(r)
  local g=love.graphics
  for _,v in ipairs(r.feedback.trails) do
    colour(v.id,(1-v.age/v.life)*0.65,v.power)
    g.setLineWidth(v.width*(1-v.age/v.life*0.5)) g.line(v.x,v.y,v.ex,v.ey)
  end
  g.setLineWidth(1)
end
function D.strike(s)
  local g=love.graphics
  local st=s.state local size=st.collisionSize
  local ids=s.payloadIds or {"none"} local id=ids[1]
  local power=st.brightness or 1
  local mode=s.v2 and s.node.props.subclass
  local juice=config.get("feedback.enabled")~=false
  colour(id,juice and 0.18 or 1,power)
  if mode=="stab" or mode=="sweep" then
    local reach=s.node.props.range
    if juice and mode=="sweep" then
      local a=math.atan2(s.dirY,s.dirX)
      for i=3,1,-1 do
        local tail=a-i*0.07
        colour(ids[(i-1)%#ids+1],0.12*(4-i),power)
        g.setLineWidth(math.max(1,size*2))
        g.line(s.x,s.y,s.x+math.cos(tail)*reach,s.y+math.sin(tail)*reach)
      end
    end
    g.setLineWidth(size*2+(juice and 3 or 0))
    g.line(s.x,s.y,s.x+s.dirX*reach,s.y+s.dirY*reach)
    colour(id,1,power) g.setLineWidth(math.max(1,size*2))
    g.line(s.x,s.y,s.x+s.dirX*reach,s.y+s.dirY*reach)
    for i=2,#ids do
      colour(ids[i],0.9,power)
      local a,b=(i-2)/math.max(1,#ids-1),(i-1)/math.max(1,#ids-1)
      g.setLineWidth(math.max(1,size*0.8))
      g.line(s.x+s.dirX*reach*a,s.y+s.dirY*reach*a,
        s.x+s.dirX*reach*b,s.y+s.dirY*reach*b)
    end
    if juice then
      g.setColor(power,power,power,0.85) g.setLineWidth(math.max(0.5,size*0.5))
      g.line(s.x,s.y,s.x+s.dirX*reach,s.y+s.dirY*reach)
    end
  elseif mode=="area" or st.visual=="field" then
    local arc=mode=="area" and s.node.props.arc or 360
    local a=s.baseAngle or 0 local half=math.rad(arc)/2
    colour(id,0.13,power)
    if arc<360 then g.arc("fill","pie",s.x,s.y,size,a-half,a+half)
    else g.circle("fill",s.x,s.y,size) end
    colour(id,0.9,power)
    if arc<360 then g.arc("line","pie",s.x,s.y,size,a-half,a+half)
    else g.circle("line",s.x,s.y,size) end
    for i=2,#ids do
      colour(ids[i],0.8,power)
      local r=math.max(1,size-i+1)
      if arc<360 then g.arc("line","open",s.x,s.y,r,a-half,a+half)
      else g.circle("line",s.x,s.y,r) end
    end
    if juice then
      local pulse=0.65+0.12*math.sin((s.age or 0)*12)
      colour(ids[#ids],0.35,power)
      if arc<360 then g.arc("line","open",s.x,s.y,size*pulse,a-half,a+half)
      else g.circle("line",s.x,s.y,size*pulse) end
    end
  else
    local dx,dy=s.dirX,s.dirY
    if juice then g.circle("fill",s.x,s.y,size+2) end
    colour(id,1,power)
    local visual=st.visual or "bullet"
    if visual=="spark" then
      g.line(s.x-size,s.y,s.x+size,s.y) g.line(s.x,s.y-size,s.x,s.y+size)
    elseif visual=="blade" or visual=="bolt" or (visual=="bullet" and id=="sharp") then
      local length=size*(st.visual=="bolt" and 2.5 or 1.7)
      g.polygon("fill",s.x+dx*length,s.y+dy*length,
        s.x-dy*size*0.7,s.y+dx*size*0.7,s.x-dx*length,s.y-dy*length,
        s.x+dy*size*0.7,s.y-dx*size*0.7)
    elseif visual=="orb" or (visual=="bullet" and id=="plasma") then
      g.circle("line",s.x,s.y,size+0.5) g.circle("fill",s.x,s.y,size*0.65)
    else g.circle("fill",s.x,s.y,size) end
    if juice then
      g.setColor(power,power,power,0.95)
      g.circle("fill",s.x+dx*size*0.3,s.y+dy*size*0.3,math.max(0.5,size*0.35))
    end
    -- Mixed payloads keep distinct bands; never average into an unknown colour.
    for i=2,#ids do
      colour(ids[i],0.9,power) g.circle("line",s.x,s.y,size+1+(i-2)*1.5)
    end
  end
  g.setLineWidth(1)
end
function D.effects(r)
  local g=love.graphics
  for _,v in ipairs(r.feedback.flashes) do
    local t=v.age/v.life local fade=1-t
    colour(v.id,fade,v.power)
    local dx,dy=v.dx,v.dy
    if v.kind=="muzzle" then
      local n=3+fade*4
      g.polygon("fill",v.x+dx*n,v.y+dy*n,v.x-dy*2,v.y+dx*2,
        v.x-dx*2,v.y-dy*2,v.x+dy*2,v.y-dx*2)
    else
      local radius=(v.kind=="kill" and v.radius+7 or 5)*(0.3+t)
      local mark=P.get(v.id).mark
      if mark=="slash" then
        g.setLineWidth(fade*2+0.5)
        g.line(v.x-dy*radius-dx*radius*0.3,v.y+dx*radius-dy*radius*0.3,
          v.x+dy*radius+dx*radius*0.3,v.y-dx*radius+dy*radius*0.3)
      elseif mark=="burst" or mark=="shard" then
        for i=1,6 do
          local a=i*math.pi/3
          g.line(v.x+math.cos(a)*radius*0.5,v.y+math.sin(a)*radius*0.5,
            v.x+math.cos(a)*radius,v.y+math.sin(a)*radius)
        end
      else g.circle("line",v.x,v.y,radius) end
      if v.kind=="kill" then
        colour(v.id,fade*0.6,v.power) g.circle("line",v.x,v.y,radius)
      end
      if t<0.3 then
        g.setColor(v.power,v.power,v.power,fade)
        g.circle("fill",v.x,v.y,(v.critical and 3 or 2)*fade)
      end
    end
  end
  g.setLineWidth(1)
  for _,v in ipairs(r.feedback.particles) do
    colour(v.id,1-v.age/v.life,v.power)
    local mark=P.get(v.id).mark
    if mark=="ring" or mark=="bubble" then g.circle("line",v.x,v.y,0.7+(1-v.age/v.life))
    elseif mark=="slash" then g.line(v.x,v.y,v.x-v.vx*0.045,v.y-v.vy*0.045)
    else g.rectangle("fill",v.x-0.7,v.y-0.7,1.4,1.4) end
  end
end
return D
