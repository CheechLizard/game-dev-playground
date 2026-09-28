-- Bounded, ordered diagnostics. No world references or gameplay RNG are kept.
local json=require("lib.json")
local Trace={} Trace.__index=Trace
local serial=0
function Trace.new(capacity)
  serial=serial+1
  return setmetatable({capacity=capacity or 2048,entries={},last=0,count=0,
    nextStrike=0,nextGroup=0,epoch=tostring(os.time())..":"..serial},Trace)
end
function Trace:record(kind,time,fields)
  self.last=self.last+1
  local event={id=self.last,kind=kind,time=time or 0}
  for k,v in pairs(fields or {}) do event[k]=v end
  self.entries[(self.last-1)%self.capacity+1]=event
  self.count=math.min(self.capacity,self.count+1)
  return event.id
end
function Trace:identify(s)
  if not s.debugId then self.nextStrike=self.nextStrike+1 s.debugId=self.nextStrike end
  if s.group and not s.group.debugId then
    self.nextGroup=self.nextGroup+1 s.group.debugId=self.nextGroup
  end
  return s.debugId
end
function Trace:read(after,limit)
  limit=limit or 100
  local first=self.last-self.count+1
  local from=after and math.max(first,after+1) or math.max(first,self.last-limit+1)
  local events=json.array()
  for id=from,math.min(self.last,from+limit-1) do
    events[#events+1]=self.entries[(id-1)%self.capacity+1]
  end
  local cursor=#events>0 and events[#events].id or self.last
  return {epoch=self.epoch,events=events,cursor=cursor,latest=self.last,
    oldest=first,dropped=after~=nil and after<first-1,
    cursorAhead=after~=nil and after>self.last,hasMore=cursor<self.last}
end
return Trace
