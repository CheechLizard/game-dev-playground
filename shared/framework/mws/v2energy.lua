-- The entire v2 battery contract. Movement and payloads never spend energy.
local E={}
function E.continuous(node)
  local mode=node.props.subclass
  return mode~="ranged" and mode~="piercing"
end
function E.required(node) return node.props.startEnergy end
function E.refill(seq,dt)
  seq.energy=math.min(seq.capacity,seq.energy+seq.rate*dt)
end
-- One request is one logical strike, even when its output is split. A volley
-- qualifies as a whole; only projectiles pay on admission. Sustained strikes
-- keep their starting charge available for the single ongoing drain.
function E.start(seq,requests)
  local required,spend=0,0
  for _,request in ipairs(requests) do
    local amount=E.required(request.node)
    required=required+amount
    if not E.continuous(request.node) then spend=spend+amount end
  end
  if seq.energy+1e-8<required then return false end
  seq.energy=math.max(0,seq.energy-spend)
  return true
end
-- All sustained strikes on a sequence receive the same fraction of their
-- requested time. Order cannot give one beam another beam's final energy.
function E.drain(seq,amount)
  if amount<=0 then return 1 end
  local spent=math.min(seq.energy,amount)
  seq.energy=math.max(0,seq.energy-spent)
  return spent/amount
end
return E
