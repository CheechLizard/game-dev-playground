-- v2 authoring graph and sequence compilation. The first test build is a DAG
-- with one parent per node. Multi-input joins remain explicitly unsupported.
local M=require("framework.mws.v2modules")
local G={}
function G.new(id,name)
  return {version=2,id=id or "v2",name=name or id or "V2",nodes={},order={},nextId=1}
end
function G.addNode(g,typeId,x,y,id)
  assert(M.byId[typeId],"unknown v2 module")
  if not id then
    repeat id="n"..g.nextId g.nextId=g.nextId+1 until not g.nodes[id]
  end
  assert(not g.nodes[id],"duplicate node id")
  local n={id=id,type=typeId,x=x or 0,y=y or 0,props=M.defaults(typeId),outputs={}}
  g.nodes[id]=n g.order[#g.order+1]=id return n
end
function G.parentOf(g,id)
  for _, nid in ipairs(g.order) do
    for port,to in pairs(g.nodes[nid].outputs) do
      if to==id then return g.nodes[nid],port end
    end
  end
end
function G.childrenOf(g,n)
  local out={}
  for port=1,M.byId[n.type].outputs do
    local child=g.nodes[n.outputs[port]]
    if child then out[#out+1]={node=child,port=port} end
  end
  return out
end
function G.roots(g)
  local roots={}
  for _,id in ipairs(g.order) do if not G.parentOf(g,id) then roots[#roots+1]=g.nodes[id] end end
  return roots
end
function G.connect(g,from,port,to)
  local a,b=g.nodes[from],g.nodes[to]
  if not a or not b then return false,"Missing module" end
  if port<1 or port>M.byId[a.type].outputs or port~=math.floor(port) then return false,"Invalid output port" end
  if G.parentOf(g,to) then return false,"Multi-input joins are not available in this test build" end
  local cursor=a
  while cursor do
    if cursor.id==to then return false,"Cycles are not supported" end
    cursor=G.parentOf(g,cursor.id)
  end
  a.outputs[port]=to return true
end
function G.disconnect(g,id,port)
  if g.nodes[id] then g.nodes[id].outputs[port]=nil return true end return false
end
function G.removeNode(g,id)
  local p,port=G.parentOf(g,id) if p then p.outputs[port]=nil end
  g.nodes[id]=nil
  for i,nid in ipairs(g.order) do if nid==id then table.remove(g.order,i) break end end
end
function G.subtree(g,n,out)
  out=out or {} if not n then return out end
  out[#out+1]=n
  for _, c in ipairs(G.childrenOf(g,n)) do G.subtree(g,c.node,out) end
  return out
end
function G.startup(n)
  local p=n.props
  return p.startupCost+p.sizeCost*p.radius*p.radius*p.weight
end

-- A Barrel uses its preceding Striker, or the first Strikers it feeds.
-- Never borrow reach from a later event sequence or an unrelated branch.
local function targetStrikers(g,n,info)
  local sequence=info[n.id].sequence
  local parent=G.parentOf(g,n.id)
  while parent and info[parent.id].sequence==sequence do
    if parent.type=="striker" then return {parent} end
    parent=G.parentOf(g,parent.id)
  end
  local out={}
  local function collect(current)
    if info[current.id].sequence~=sequence then return end
    if current.type=="striker" then out[#out+1]=current return end
    for _,child in ipairs(G.childrenOf(g,current)) do collect(child.node) end
  end
  collect(n)
  return out
end

function G.compile(g)
  local sequences,info,errors={},{},{}
  local function issue(id,text,level) errors[#errors+1]={nodeId=id,text=text,level=level or "error"} end
  local function walk(n,seq)
    seq.nodes[#seq.nodes+1]=n
    info[n.id]={sequence=seq.id,domain=seq.parent and "post" or "weapon",depth=0}
    if n.type=="battery" then
      local scale=M.tierScale[n.props.tier] or 1
      seq.capacity=seq.capacity+n.props.capacity*scale
      seq.rate=seq.rate+n.props.fillRate*scale
      seq.initial=seq.initial+n.props.capacity*scale*n.props.initialCharge
      seq.batteries=seq.batteries+1
    elseif n.type=="trigger" then seq.triggers=seq.triggers+1
    elseif n.type=="striker" then seq.strikers=seq.strikers+1 end
    for _, c in ipairs(G.childrenOf(g,n)) do
      if n.type=="striker" and c.node.type=="trigger" then
        local nextSeq={id=#sequences+1,root=c.node,parent=n.id,nodes={},capacity=0,rate=0,initial=0,batteries=0,triggers=0,strikers=0}
        sequences[#sequences+1]=nextSeq
        walk(c.node,nextSeq)
      else walk(c.node,seq) end
    end
  end
  for _,root in ipairs(G.roots(g)) do
    local seq={id=#sequences+1,root=root,nodes={},capacity=0,rate=0,initial=0,batteries=0,triggers=0,strikers=0}
    sequences[#sequences+1]=seq walk(root,seq)
    if root.type~="trigger" then issue(root.id,"Sequence must begin with a Trigger") end
  end
  if #sequences==0 then issue(nil,"Add a Trigger to begin a sequence") end
  for _,seq in ipairs(sequences) do
    if seq.batteries==0 then issue(seq.root.id,"Sequence "..seq.id.." requires a Battery") end
    if seq.strikers==0 then issue(seq.root.id,"Sequence "..seq.id.." requires a Striker") end
    -- One collider's startup threshold on the shared rail, deduplicated by cost.
    local costs,seen={},{}
    for _,n in ipairs(seq.nodes) do
      if n.type=="striker" then
        local cost=G.startup(n)
        if not seen[cost] then costs[#costs+1]=cost seen[cost]=true end
      end
    end
    table.sort(costs)
    for _,n in ipairs(seq.nodes) do
      local p=info[n.id] p.rail=seq.rate p.capacity=seq.capacity
      p.stored=seq.initial
      if n.type=="trigger" then p.hot=0 end
      if n.type=="battery" then p.startupCosts=costs end
      if n.type=="barrel" then p.targetStrikers=targetStrikers(g,n,info) end
      p.cost=n.type=="striker" and G.startup(n) or 0
      if p.cost>seq.capacity then issue(n.id,"Startup cost exceeds sequence capacity","warn") end
      if n.type=="trigger" and not require("framework.mws.triggers").byId[n.props.subclass] then
        issue(n.id,"Unknown Trigger subclass")
      end
    end
  end
  -- A second striker must begin a new sequence explicitly through a trigger.
  local function checkPaths(n,hasStriker)
    if n.type=="striker" and hasStriker then issue(n.id,"Connect Striker to Trigger to start another sequence") end
    if n.type=="trigger" and hasStriker then issue(n.id,"A downstream Trigger must connect directly to a Striker") end
    local has=hasStriker or n.type=="striker"
    for _,c in ipairs(G.childrenOf(g,n)) do
      local boundary=n.type=="striker" and c.node.type=="trigger"
      if boundary then checkPaths(c.node,false) else checkPaths(c.node,has) end
    end
  end
  for _,root in ipairs(G.roots(g)) do checkPaths(root,false) end
  return sequences,info,errors
end
function G.validate(g) local _,_,e=G.compile(g) return e end
function G.isFirable(g)
  for _,p in ipairs(G.validate(g)) do if p.level=="error" then return false end end return true
end
function G.analyse(g) local _,i=G.compile(g) return i end
function G.budget(g)
  local s,i=G.compile(g) local rate=0
  for _,seq in ipairs(s) do rate=rate+seq.rate end return 0,rate,i
end
function G.toTable(g)
  local nodes={}
  for _,id in ipairs(g.order) do
    local n=g.nodes[id] local props={}
    for _,p in ipairs(M.props(n.type,n.props.subclass)) do props[p.name]=n.props[p.name] end
    local outputs={} for port,to in pairs(n.outputs) do outputs[tostring(port)]=to end
    nodes[#nodes+1]={id=id,type=n.type,x=n.x,y=n.y,props=props,outputs=outputs}
  end
  return {version=2,id=g.id,name=g.name,nodes=nodes}
end
function G.fromTable(t)
  local g=G.new(t.id,t.name) local dropped={}
  for _,raw in ipairs(t.nodes or {}) do
    if M.byId[raw.type] then
      local n=G.addNode(g,raw.type,raw.x,raw.y,raw.id)
      local props=raw.props or {}
      M.set(n,"subclass",props.subclass or M.byId[raw.type].subclass.default)
      local known={}
      for _,p in ipairs(M.props(n.type,n.props.subclass)) do
        known[p.name]=true
        if props[p.name]~=nil then n.props[p.name]=M.coerce(p,props[p.name]) end
      end
      for key in pairs(props) do if not known[key] then dropped[#dropped+1]=key end end
    else dropped[#dropped+1]=tostring(raw.type) end
  end
  -- Stable graph/port order also fixes allocation priority for this prototype.
  for _,raw in ipairs(t.nodes or {}) do
    if g.nodes[raw.id] then
      for port=1,M.byId[g.nodes[raw.id].type].outputs do
        local child=(raw.outputs or {})[tostring(port)] or (raw.outputs or {})[port]
        if child then
          local ok,why=G.connect(g,raw.id,port,child)
          if not ok then dropped[#dropped+1]=why end
        end
      end
    end
  end
  return g,dropped
end
function G.clone(g) return (G.fromTable(G.toTable(g))) end
return G
