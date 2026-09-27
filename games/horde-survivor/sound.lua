-- Small synthesized palette, cached once per sound. No files or global RNG.
-- Only this presentation adapter touches love.audio; the run queues data.
local config=require("framework.config")
local P=require("payloads")
local A={cache={},voices={},cooldowns={},clock=0}
local RATE=22050
-- Pure sampler also lets headless tests check envelopes and signal bounds.
function A.samples(id,kind)
  local pitch=P.get(id).pitch
  local duration=({shot=0.13,hit=0.10,kill=0.28,sweep=0.20,tail=0.20,hum=0.4})[kind] or 0.13
  local count=math.floor(duration*RATE)
  local out={} local phase=0 local seed=73
  for i=0,count-1 do
    seed=(seed*16807)%2147483647
    local noise=seed/2147483647*2-1
    local t=i/RATE local u=i/(count-1)
    local value
    if kind=="hum" then
      -- Whole cycles in the buffer make the loop boundary continuous.
      value=(math.sin(2*math.pi*100*t)+0.3*math.sin(2*math.pi*200*t))
        *(0.8+0.2*math.sin(2*math.pi*5*t))*0.22
    else
      local frequency=pitch*(1.4-u*0.9)
      if kind=="hit" then frequency=pitch*0.7*(1-u*0.6)
      elseif kind=="kill" then frequency=pitch*0.45*(1-u*0.65)
      elseif kind=="tail" then frequency=220*(1-u*0.8) end
      phase=phase+frequency/RATE
      local tone=math.sin(2*math.pi*phase)
      local grit=(id=="impact" or kind=="sweep") and 0.65 or 0.22
      if id=="sharp" then tone=0.7*tone+0.3*math.sin(4*math.pi*phase) end
      local attack=math.min(1,t/0.003)
      local envelope=attack*(1-u)^3
      value=((1-grit)*tone+grit*noise)*envelope*0.65
    end
    out[#out+1]=value
  end
  return out,RATE
end
local function source(id,kind)
  local key=id..":"..kind
  if not A.cache[key] then
    local samples,rate=A.samples(id,kind)
    local data=love.sound.newSoundData(#samples,rate,16,1)
    for i,v in ipairs(samples) do data:setSample(i-1,v) end
    A.cache[key]=love.audio.newSource(data)
  end
  return A.cache[key]
end
function A.stop()
  for _,v in ipairs(A.voices) do v:stop() end
  A.voices={}
  if A.hum then A.hum:stop() A.hum=nil end
  A.cooldowns={}
end
local function play(event,c)
  local key=event.kind..":"..event.id
  if (A.cooldowns[key] or 0)>A.clock then return end
  if #A.voices>=c.voices then return end
  A.cooldowns[key]=A.clock+(event.kind=="shot" and 0.045 or 0.075)
  local v=source(event.id,event.kind):clone()
  local group=(event.kind=="shot" or event.kind=="sweep") and c.shots or c.hits
  v:setVolume(c.volume*group*math.min(1,event.power or 1))
  v:setPitch(event.pitch or 1) v:play()
  A.voices[#A.voices+1]=v
end
function A.update(r,dt,active)
  local f=r and r.feedback
  local events=f and f.sounds or {}
  if f then f.sounds={} end
  local c=config.values.audio
  if A.owner~=r or A.generation~=(r and r.feedback) then
    A.stop() A.owner=r A.generation=r and r.feedback
  end
  if not active or not c or not c.enabled or c.volume<=0
    or not (love and love.audio and love.sound) then A.stop() return end
  A.clock=A.clock+dt
  local live={}
  for _,v in ipairs(A.voices) do if v:isPlaying() then live[#live+1]=v end end
  A.voices=live
  for _,e in ipairs(events) do play(e,c) end
  local power=0
  for _,s in ipairs(r.strikes) do
    if s.alive and s.sustained and s.payloadIds then
      for _,id in ipairs(s.payloadIds) do
        if id=="plasma" then power=math.max(power,s.state.brightness or 1) end
      end
    end
  end
  if power>0 and c.beams>0 then
    if not A.hum then A.hum=source("plasma","hum"):clone() A.hum:setLooping(true) A.hum:play() end
    A.hum:setVolume(c.volume*c.beams*power)
  elseif A.hum then
    A.hum:stop() A.hum=nil
    play({id="plasma",kind="tail",power=1},c)
  end
end
return A
