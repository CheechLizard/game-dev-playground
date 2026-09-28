-- Correlate runtime events with queued and actually played audio.
local Trace=require("framework.eventtrace")
local D={}
function D.reset(r) r.trace=Trace.new() end
function D.record(r,kind,fields)
  if not r.trace then D.reset(r) end
  return r.trace:record(kind,r.time,fields)
end
function D.strike(r,s)
  if not r.trace then D.reset(r) end
  local p=s.node and s.node.props or {}
  if not s.debugId then
    s.debugGeneration=s.runtime and s.runtime.generation
    s.debugSubclass=p.subclass
  end
  return {strike=r.trace:identify(s),group=s.group and s.group.debugId,
    weapon=s.weaponId,striker=s.node and s.node.id,sequence=s.seq and s.seq.id,
    subclass=s.debugSubclass,age=s.age or 0,alive=s.alive,reach=s.reach,
    x=s.x,y=s.y,dirX=s.dirX,dirY=s.dirY,
    charge=s.seq and s.seq.energy,runtimeTime=s.runtime and s.runtime.time,
    generation=s.debugGeneration}
end
function D.strikeEvent(r,kind,s,extra)
  local fields=D.strike(r,s)
  for k,v in pairs(extra or {}) do fields[k]=v end
  return D.record(r,kind,fields)
end
function D.sound(r,event,outcome,extra)
  if not r then return end
  local fields=event.strike and D.strike(r,event.strike) or {}
  fields.sound=event.kind fields.payload=event.id fields.cause=event.cause
  fields.causeEvent=event.causeEvent fields.queuedEvent=event.queuedEvent
  fields.power=event.power fields.pitch=event.pitch
  for k,v in pairs(extra or {}) do fields[k]=v end
  return D.record(r,"sound_"..outcome,fields)
end
return D
