-- The weapon graph: structure, validation, energy analysis, serialisation.
--
-- A graph is a forest of single-input nodes. Every module accepts events from
-- exactly one upstream connection; BARREL is the only module with more than
-- one downstream port. That constraint is what makes the whole thing tractable
-- -- parentage is unique, so "which projectile am I attached to" has one
-- answer, and a cycle check is a walk up the parent chain.
--
-- Nothing here knows about a game. `analyse` takes the per-type energy cost as
-- a function so the framework does not have to reach for config.

local mods = require("framework.mws.modules")

local graph = {}

-- -------------------------------------------------------------- construction

function graph.new(id, name)
  return {
    id = id or "untitled",
    name = name or "Untitled",
    nodes = {},      -- nodeId -> node
    order = {},      -- nodeIds, in creation order: stable iteration and JSON
    nextId = 1,
  }
end

local function newId(g)
  local id
  repeat
    id = "n" .. g.nextId
    g.nextId = g.nextId + 1
  until not g.nodes[id]
  return id
end

--- Add a node of `typeId` at a canvas position. Returns the node.
function graph.addNode(g, typeId, x, y, id)
  assert(mods.byId[typeId], "mws.graph: no such module type " .. tostring(typeId))
  id = id or newId(g)
  local node = {
    id = id,
    type = typeId,
    x = x or 0,
    y = y or 0,
    props = mods.defaults(typeId),
    outputs = {},    -- port index -> child nodeId
  }
  g.nodes[id] = node
  g.order[#g.order + 1] = id
  return node
end

--- The node feeding `id`, plus the port it feeds from. nil for a root.
function graph.parentOf(g, id)
  for _, otherId in ipairs(g.order) do
    local node = g.nodes[otherId]
    for port, childId in pairs(node.outputs) do
      if childId == id then return node, port end
    end
  end
  return nil
end

--- Nodes with no parent, in creation order. A weapon fires from these.
function graph.roots(g)
  local out = {}
  for _, id in ipairs(g.order) do
    if not graph.parentOf(g, id) then out[#out + 1] = g.nodes[id] end
  end
  return out
end

--- Children of a node, ordered by port. Ports may be sparse.
function graph.childrenOf(g, node)
  local out = {}
  local t = mods.byId[node.type]
  for port = 1, (t and t.outputs or 1) do
    local childId = node.outputs[port]
    if childId and g.nodes[childId] then
      out[#out + 1] = { port = port, node = g.nodes[childId] }
    end
  end
  return out
end

--- Is `ancestorId` on the parent chain of `id` (or the same node)?
local function isAncestor(g, ancestorId, id)
  local seen = {}
  local cursor = id
  while cursor and not seen[cursor] do
    if cursor == ancestorId then return true end
    seen[cursor] = true
    local parent = graph.parentOf(g, cursor)
    cursor = parent and parent.id or nil
  end
  return false
end

--- Wire `fromId` port -> `toId`. Returns true, or false plus a reason.
function graph.connect(g, fromId, port, toId)
  local from, to = g.nodes[fromId], g.nodes[toId]
  if not from or not to then return false, "no such node" end
  if fromId == toId then return false, "a module cannot feed itself" end

  local fromType = mods.byId[from.type]
  if fromType.terminal or fromType.outputs < 1 then
    return false, fromType.name .. " is terminal: nothing goes downstream of it"
  end
  if port < 1 or port > fromType.outputs then
    return false, "port out of range for " .. fromType.name
  end
  if graph.parentOf(g, toId) then
    return false, mods.byId[to.type].name .. " already has an input"
  end
  if isAncestor(g, toId, fromId) then
    return false, "that would make a loop"
  end

  from.outputs[port] = toId
  return true
end

function graph.disconnect(g, fromId, port)
  local from = g.nodes[fromId]
  if not from then return false end
  from.outputs[port] = nil
  return true
end

--- Delete a node. Its parent link and its children's links go with it; the
-- children become roots rather than being deleted, so pulling a module out of
-- the middle of a chain does not silently take the rest of the weapon.
function graph.removeNode(g, id)
  if not g.nodes[id] then return false end
  local parent, port = graph.parentOf(g, id)
  if parent then parent.outputs[port] = nil end
  g.nodes[id] = nil
  for i, otherId in ipairs(g.order) do
    if otherId == id then table.remove(g.order, i) break end
  end
  return true
end

--- Every node reachable from `node`, depth-first, `node` first.
function graph.subtree(g, node, out, seen)
  out, seen = out or {}, seen or {}
  if not node or seen[node.id] then return out end
  seen[node.id] = true
  out[#out + 1] = node
  for _, child in ipairs(graph.childrenOf(g, node)) do
    graph.subtree(g, child.node, out, seen)
  end
  return out
end

-- ---------------------------------------------------------------- validation

--- Problems worth showing in the editor. Each is { level, nodeId, text }
-- where level is "error" (the weapon will not fire) or "warn" (it will, but
-- something is doing nothing).
function graph.validate(g)
  local problems = {}
  local function add(level, nodeId, text)
    problems[#problems + 1] = { level = level, nodeId = nodeId, text = text }
  end

  local roots = graph.roots(g)
  local firing = 0
  for _, root in ipairs(roots) do
    if mods.isRoot(root.type) then firing = firing + 1 end
  end
  if #g.order == 0 then
    add("error", nil, "Empty graph: add a TRIGGER to start.")
  elseif firing == 0 then
    add("error", nil, "No TRIGGER at the top: nothing will ever start a strike.")
  end

  for _, id in ipairs(g.order) do
    local node = g.nodes[id]
    local t = mods.byId[node.type]
    local isRoot = not graph.parentOf(g, id)
    if isRoot and not mods.isRoot(node.type) then
      add("warn", id, t.name .. " has no input, so it never runs.")
    end

    local children = graph.childrenOf(g, node)
    if t.terminal and #children > 0 then
      add("error", id, t.name .. " is terminal but has something wired below it.")
    end

    if node.type == "striker" then
      local hasPayload = false
      for _, n in ipairs(graph.subtree(g, node)) do
        if n.type == "payload" then hasPayload = true break end
      end
      if not hasPayload then
        add("warn", id, "STRIKER has no PAYLOAD below it, so it deals no damage.")
      end
    end

    if node.type == "barrel" and #children == 0 then
      add("warn", id, "BARREL routes nowhere.")
    end

    if node.type == "trigger" then
      local cond = node.props.condition
      local parent = graph.parentOf(g, id)
      if (cond == "on_hit" or cond == "on_miss" or cond == "on_start"
          or cond == "on_stop") and not parent then
        add("error", id, "TRIGGER waits on '" .. cond
          .. "' but has no PAYLOAD above it to wait on.")
      end
      if (cond == "player_hold" or cond == "player_press") and parent then
        add("warn", id, "A firing TRIGGER below another module fires anyway; "
          .. "its input is ignored.")
      end
    end
  end

  return problems
end

--- True when nothing in validate() is an error.
function graph.isFirable(g)
  for _, p in ipairs(graph.validate(g)) do
    if p.level == "error" then return false end
  end
  return true
end

-- -------------------------------------------------------------------- energy
--
-- Two numbers per node, both precomputed because the specification says a
-- strike's cost is known when the weapon is built, not when it fires:
--
--   rail  the energy per second arriving here, batteries above it summed and
--         divided at every barrel branch it passed through
--   cost  what one strike started here costs: every module below it, plus the
--         follow-up strikes any downstream TRIGGER will start

local function costOfNode(node, costFn)
  return costFn and costFn(node) or 1
end

--- Reading a property through a hook rather than off the node, so a levelled
-- weapon analyses as the weapon it actually is rather than as its base graph.
local function rawProp(node, name) return node.props[name] end

-- Depth, not a visited set. A visited set is the obvious guard and it is
-- wrong here: three barrels feeding one striker pay for that striker three
-- times, and a set marks it counted after the first. Connections are already
-- acyclic -- graph.connect refuses a loop -- so depth is guard enough.
local MAX_DEPTH = 64

local function strikeCost(g, node, costFn, depth, propOf)
  depth = depth or 0
  if not node or depth > MAX_DEPTH then return 0 end

  local own = costOfNode(node, costFn)
  local children = graph.childrenOf(g, node)
  if #children == 0 then return own end

  if node.type == "barrel" then
    -- A barrel index maps onto a port; with N barrels and fewer ports the
    -- barrels wrap around. `all` pays for every barrel, round-robin pays for
    -- the average one, because a single event only ever takes one of them.
    local count = math.max(1, math.floor(propOf(node, "barrelCount") or 1))
    local total = 0
    for i = 1, count do
      local child = children[((i - 1) % #children) + 1]
      total = total + strikeCost(g, child.node, costFn, depth + 1, propOf)
    end
    if propOf(node, "routing") == "all" then
      return own + total
    end
    return own + total / count
  end

  local total = 0
  for _, child in ipairs(children) do
    total = total + strikeCost(g, child.node, costFn, depth + 1, propOf)
  end
  return own + total
end

--- Every node from `node` down to and including the next branch point.
--
-- A segment is a stretch of graph with no choice in it, and it is the unit
-- energy is measured over. The specification says energy is "path-local" and
-- divides at barrel outputs -- and every one of its examples puts the BATTERY
-- *below* the TRIGGER that spends from it. So a battery powers its whole
-- segment, not only what is drawn under it: position matters relative to
-- branches, which is exactly what the asymmetric triple barrel demonstrates.
local function segment(g, node, out, depth)
  out, depth = out or {}, depth or 0
  if not node or depth > MAX_DEPTH then return out end
  out[#out + 1] = node
  if node.type == "barrel" then return out end     -- the branch point ends it
  local children = graph.childrenOf(g, node)
  if #children == 1 then segment(g, children[1].node, out, depth + 1) end
  return out
end

--- Per-node analysis: rail, cost, domain and depth.
--
-- Walked a segment at a time rather than a node at a time. Node by node, a
-- battery is counted again by every module below it inside its own segment,
-- because each of them sums the stretch it can see. A segment has one rail by
-- definition, so summing it once at the head and handing that to every member
-- is both correct and what "path-local" means.
--
-- @param costFn optional function(node) -> energy cost of that module alone
-- @param propOf optional function(node, name) -> value, for levelled weapons
function graph.analyse(g, costFn, propOf)
  propOf = propOf or rawProp
  local info = {}

  local function walkSegment(head, inherited, domain, depth)
    if not head or info[head.id] then return end
    local members = segment(g, head)

    local rail = inherited
    for _, member in ipairs(members) do
      if member.type == "battery" then
        rail = rail + (propOf(member, "energyPerSecond") or 0)
      end
    end

    local at, atDepth = domain, depth
    for _, member in ipairs(members) do
      info[member.id] = {
        rail = rail,
        domain = at,
        depth = atDepth,
        cost = strikeCost(g, member, costFn, nil, propOf),
      }
      -- The domain shifts *below* a striker or a payload, so this comes after
      -- the member that causes the shift has been recorded.
      if member.type == "striker" then
        -- A strike that stays put or circles its wielder never detaches, so
        -- what hangs off it is still in the weapon's domain.
        local attached = (propOf(member, "motionType") == "orbit")
          or ((propOf(member, "baseSpeed") or 0) == 0)
        at = attached and "weapon" or "inflight"
      elseif member.type == "payload" then
        at = "post"
      end
      atDepth = atDepth + 1
    end

    local tail = members[#members]
    local children = graph.childrenOf(g, tail)
    local childRail = rail
    if tail.type == "barrel" and #children > 1 then
      childRail = rail / #children
    end
    for _, child in ipairs(children) do
      walkSegment(child.node, childRail, at, atDepth)
    end
  end

  for _, root in ipairs(graph.roots(g)) do
    walkSegment(root, 0, "weapon", 0)
  end

  -- Unreachable nodes still need an entry, or the editor has to special-case
  -- every lookup.
  for _, id in ipairs(g.order) do
    if not info[id] then
      info[id] = { rail = 0, domain = "weapon", depth = 0, cost = 0, orphan = true }
    end
  end
  return info
end

--- Sustained cost of the whole weapon in energy per second, and the supply it
-- has. A weapon whose demand exceeds its supply still fires -- it just stalls,
-- which is the behaviour the energy mechanic is for.
function graph.budget(g, costFn, propOf)
  propOf = propOf or rawProp
  local info = graph.analyse(g, costFn, propOf)
  local demand, supply = 0, 0
  for _, id in ipairs(g.order) do
    local node = g.nodes[id]
    local nodeInfo = info[id]
    if node.type == "battery" then
      supply = supply + (propOf(node, "energyPerSecond") or 0)
    elseif node.type == "repeater" then
      demand = demand + nodeInfo.cost * (propOf(node, "fireRate") or 0)
    end
  end
  return demand, supply, info
end

-- ------------------------------------------------------------- serialisation
--
-- Only what cannot be regenerated is written: the type, the position and any
-- property that differs from its module's default. A property added to a
-- module type is therefore inherited by every saved graph, and one deleted is
-- dropped on load -- the same bargain profiles make with the schema.

function graph.toTable(g)
  local nodes = {}
  for _, id in ipairs(g.order) do
    local node = g.nodes[id]
    local props = {}
    local any = false
    for _, prop in ipairs(mods.props(node.type)) do
      local value = node.props[prop.name]
      if value ~= nil and value ~= prop.default then
        props[prop.name] = value
        any = true
      end
    end
    local outputs = {}
    local anyOut = false
    for port, childId in pairs(node.outputs) do
      outputs[tostring(port)] = childId
      anyOut = true
    end
    nodes[#nodes + 1] = {
      id = id, type = node.type,
      x = node.x, y = node.y,
      props = any and props or nil,
      outputs = anyOut and outputs or nil,
    }
  end
  return { id = g.id, name = g.name, nodes = nodes }
end

--- Rebuild a graph from a table. Unknown module types and unknown properties
-- are dropped with a note, rather than refusing the whole file: a weapon saved
-- before a module was renamed should still open.
function graph.fromTable(t)
  local g = graph.new(t.id, t.name)
  local dropped = {}

  for _, raw in ipairs(t.nodes or {}) do
    if not mods.byId[raw.type] then
      dropped[#dropped + 1] = "unknown module '" .. tostring(raw.type) .. "'"
    else
      local node = graph.addNode(g, raw.type, raw.x, raw.y, raw.id)
      for _, prop in ipairs(mods.props(raw.type)) do
        local value = raw.props and raw.props[prop.name]
        if value ~= nil then node.props[prop.name] = mods.coerce(prop, value) end
      end
      if raw.props then
        for name in pairs(raw.props) do
          local known = false
          for _, prop in ipairs(mods.props(raw.type)) do
            if prop.name == name then known = true break end
          end
          if not known then
            dropped[#dropped + 1] = raw.type .. "." .. name
          end
        end
      end
    end
  end

  -- Wiring in a second pass: a node may be wired to one declared after it.
  for _, raw in ipairs(t.nodes or {}) do
    local node = g.nodes[raw.id]
    if node and raw.outputs then
      for portKey, childId in pairs(raw.outputs) do
        local port = tonumber(portKey)
        if port and g.nodes[childId] then
          graph.connect(g, raw.id, port, childId)
        end
      end
    end
  end

  -- Ids come from the file, so the counter has to clear them or the next
  -- added node collides with one already there.
  local maxN = 0
  for _, id in ipairs(g.order) do
    local n = tonumber(id:match("^n(%d+)$"))
    if n and n > maxN then maxN = n end
  end
  g.nextId = maxN + 1

  return g, dropped
end

function graph.clone(g)
  return (graph.fromTable(graph.toTable(g)))
end

-- Dispatch versioned authoring graphs through the same editor API. Existing
-- saved graphs retain their v1 semantics rather than being silently rewritten.
local v2=require("framework.mws.v2graph")
function graph.newV2(id,name) return v2.new(id,name) end
function graph.modules(g)
  if g and g.version==2 then return require("framework.mws.v2modules") end
  return mods
end
for _,name in ipairs({"addNode","parentOf","childrenOf","roots","connect",
    "disconnect","removeNode","subtree","validate","isFirable","analyse",
    "budget","toTable","clone"}) do
  local legacy=graph[name]
  graph[name]=function(g,...)
    if g.version==2 then return v2[name](g,...) end
    return legacy(g,...)
  end
end
local oldFromTable=graph.fromTable
function graph.fromTable(t)
  if t.version==2 then return v2.fromTable(t) end
  return oldFromTable(t)
end
return graph
