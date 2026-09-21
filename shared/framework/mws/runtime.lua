-- Running a weapon graph: strike state, events, domains and energy.
-- This is the legacy v1 execution model with the new normalized input port.
-- v2 sequence power and Trigger execution are not integrated yet; see
-- docs/MWS_Implementation.md.
--
-- The runtime walks the graph and decides *what* should happen. It never
-- simulates anything: when a STRIKER fires, the runtime hands the host game a
-- fully-formed strike and the host puts it in its own world with its own
-- collision. The host calls back in with hit/miss/end, and the runtime carries
-- on down the graph from there.
--
-- That split is the whole reason this file has no love.* calls and can be
-- tested headless.
--
-- ---------------------------------------------------------------- contexts
--
-- A context is a domain plus the parent that supplies position to everything
-- in it. The weapon's own context is parented to the wielder. A STRIKER that
-- launches a detaching strike opens a child context parented to the strike
-- itself, so a REPEATER below it spawns from the moving projectile without
-- knowing that is what it is doing. Recursion falls out of this for free.
--
-- Energy is only charged in the weapon's context. The specification pays a
-- strike's *whole* downstream cost up front, follow-ups included, so a
-- REPEATER riding a projectile has already been paid for and does not check.

local mods = require("framework.mws.modules")
local graph = require("framework.mws.graph")
local inputAdapter = require("framework.mws.input")

local runtime = {}
runtime.__index = runtime

local DEG = math.pi / 180

-- ------------------------------------------------------------- strike state
--
-- The fields the specification's appendix defines, with its defaults. Created
-- fresh by TRIGGER, cloned at every BARREL branch, and read by the host when
-- it builds the strike.

local function newState()
  return {
    weaponAimX = 1, weaponAimY = 0,
    strikeAimX = 1, strikeAimY = 0,
    angleSpread = 0,
    rangeMax = math.huge,

    motionType = "linear",
    baseSpeed = 0,
    speedMultiplier = 1,
    acceleration = 0,
    gravity = 0,
    waveAmplitude = 0,
    waveFrequency = 0,
    orbitRadius = 0,
    orbitSpeed = 0,
    inheritedVx = 0,
    inheritedVy = 0,

    collisionSize = 1,
    triggerBehavior = "consumable",
    durable = false,
    expires = true,
    lifetimeMax = math.huge,

    baseDamage = 0,
    aoeRadius = 0,
    wasHit = false,
    visual = "bullet",
    extra = {},          -- game-added properties, copied through untouched
  }
end

local function cloneState(s)
  local out = {}
  for k, v in pairs(s) do out[k] = v end
  out.extra = {}
  for k, v in pairs(s.extra) do out.extra[k] = v end
  return out
end

runtime.newState = newState
runtime.cloneState = cloneState

--- The PAYLOAD a STRIKER should stamp its damage from: nearest one below it,
-- breadth-first, as the specification wires it at build time.
local function payloadBelow(g, node)
  local queue, head = { node }, 1
  local seen = {}
  while head <= #queue do
    local current = queue[head]
    head = head + 1
    if current and not seen[current.id] then
      seen[current.id] = true
      if current.type == "payload" and current ~= node then return current end
      for _, child in ipairs(graph.childrenOf(g, current)) do
        queue[#queue + 1] = child.node
      end
    end
  end
  return nil
end

runtime.payloadBelow = payloadBelow

-- ------------------------------------------------------------------ context

local Context = {}
Context.__index = Context

local function newContext(instance, parent, domain, free)
  return setmetatable({
    instance = instance,
    parent = parent,        -- anything with x, y and optionally vx, vy
    domain = domain,
    free = free or false,   -- true: already paid for, does not check energy
    nodeState = {},
    energy = {},
    alive = true,
  }, Context)
end

function Context:state(nodeId)
  local s = self.nodeState[nodeId]
  if not s then s = {} self.nodeState[nodeId] = s end
  return s
end

-- ----------------------------------------------------------------- instance

--- Create a live weapon from a graph.
-- @param g      the graph (not copied: edits in the editor are felt at once)
-- @param host   the game's adapter, see the comments on each call below
-- @param opts   { cost = function(node) -> energy,
--                buffer = seconds,
--                modifier = function(node, name, value) -> value }
--
-- `modifier` is how everything outside the graph reaches into it: weapon
-- level, the player's damage and attack-speed bonuses, the area multiplier.
-- Without it a levelled weapon would need a rewritten copy of its graph, and
-- the editor would be editing the copy rather than the weapon.
function runtime.new(g, host, opts)
  opts = opts or {}
  local self = setmetatable({
    graph = g,
    host = host,
    costFn = opts.cost,
    modifier = opts.modifier,
    buffer = opts.buffer or 2,
    input = inputAdapter.new(),
    firing = false,
    wasFiring = false,
    time = 0,
    contexts = {},
    strikes = {},        -- live strikes this weapon owns, for Stop handling
    stalled = false,     -- true when something wanted to fire and could not
  }, runtime)
  self.root = newContext(self, nil, "weapon", false)
  self.contexts[#self.contexts + 1] = self.root
  self:rebuild()
  return self
end

--- Read one property of a node, as this weapon actually has it.
function runtime:prop(node, name)
  local value = node.props[name]
  if self.modifier then return self.modifier(node, name, value) end
  return value
end

--- Recompute the cached analysis. Cheap, and the editor calls it on every
-- structural edit so the energy readouts never lag the graph.
function runtime:rebuild()
  local propOf = function(node, name) return self:prop(node, name) end
  self.info = graph.analyse(self.graph, self.costFn, propOf)
  self.payloadFor = {}
  for _, id in ipairs(self.graph.order) do
    local node = self.graph.nodes[id]
    if node.type == "striker" then
      self.payloadFor[id] = payloadBelow(self.graph, node)
    end
  end
end

--- Normalized events from the application's input abstraction.
function runtime:inputEvent(event)
  return self.input:handle(event)
end

--- Compatibility for existing callers while graphs migrate to v2 signals.
function runtime:setFiring(firing)
  return self:inputEvent(firing and inputAdapter.FIRE_BUTTON_DOWN
    or inputAdapter.FIRE_BUTTON_UP)
end

local function rand(self)
  if self.host.random then return self.host.random() end
  return math.random()
end

--- Where a context's events spawn from.
local function parentPoint(self, ctx)
  if ctx.parent then
    return ctx.parent.x or 0, ctx.parent.y or 0,
           ctx.parent.vx or 0, ctx.parent.vy or 0
  end
  local w = self.host.wielder and self.host.wielder()
  if w then return w.x or 0, w.y or 0, w.vx or 0, w.vy or 0 end
  return 0, 0, 0, 0
end

-- ------------------------------------------------------------------- energy

--- Charge a context for a strike started at `node`. Returns true when paid.
local function pay(self, ctx, node)
  if ctx.free then return true end
  local info = self.info[node.id]
  if not info then return true end
  local cost = info.cost or 0
  if cost <= 0 then return true end
  local pool = ctx.energy[node.id] or 0
  if pool < cost then
    self.stalled = true
    return false
  end
  ctx.energy[node.id] = pool - cost
  return true
end

--- Fill every energy-aware node's pool from its rail. The cap is a burst
-- window rather than a single strike, so a weapon can open with a volley and
-- then settle to whatever its batteries actually sustain.
local function chargeEnergy(self, ctx, dt)
  if ctx.free then return end
  for _, id in ipairs(self.graph.order) do
    local node = self.graph.nodes[id]
    if node.type == "trigger" or node.type == "repeater" then
      local info = self.info[id]
      if info and not info.orphan then
        local cap = math.max(info.cost or 0, (info.rail or 0) * self.buffer)
        local pool = (ctx.energy[id] or cap) + (info.rail or 0) * dt
        ctx.energy[id] = math.min(cap, pool)
      end
    end
  end
end

-- ------------------------------------------------------------------- events
--
-- One dispatch function per module type, all with the same shape:
--   fn(self, ctx, node, event)
-- An event is { kind, state, x, y, target, wasHit }. Modules forward by
-- calling `send` on their children; consuming an event is simply not doing so.

local dispatch = {}

local function send(self, ctx, node, event)
  for _, child in ipairs(graph.childrenOf(self.graph, node)) do
    local fn = dispatch[child.node.type]
    if fn then fn(self, ctx, child.node, event) end
  end
end

local function sendPort(self, ctx, node, port, event)
  local childId = node.outputs[port]
  local child = childId and self.graph.nodes[childId]
  if not child then return end
  local fn = dispatch[child.type]
  if fn then fn(self, ctx, child, event) end
end

-- BATTERY: pure supply. Everything passes through it untouched.
dispatch.battery = function(self, ctx, node, event)
  send(self, ctx, node, event)
end

--- Build the fresh strike state a TRIGGER hands down, aim included.
local function startState(self, ctx)
  local state = newState()
  local _, _, vx, vy = parentPoint(self, ctx)
  local w = self.host.wielder and self.host.wielder()
  local ax, ay = 1, 0
  if ctx.parent and (ctx.parent.dirX or ctx.parent.dirY) then
    ax, ay = ctx.parent.dirX or 1, ctx.parent.dirY or 0
  elseif w then
    ax, ay = w.aimX or 1, w.aimY or 0
  end
  state.weaponAimX, state.weaponAimY = ax, ay
  -- Unaimed by default: the specification has strike_aim start random and be
  -- overridden by a BARREL. A graph with no BARREL sprays, and that is the
  -- intended lesson.
  local a = rand(self) * math.pi * 2
  state.strikeAimX, state.strikeAimY = math.cos(a), math.sin(a)
  state.inheritedVx, state.inheritedVy = vx, vy
  return state
end

dispatch.trigger = function(self, ctx, node, event)
  local cond = self:prop(node, "condition")
  local kind = event and event.kind

  if cond == "on_start" or cond == "on_hit" or cond == "on_miss" then
    if kind ~= "start" then
      -- A Stop still has to reach anything below, or nested repeaters never
      -- close their windows.
      if kind == "stop" then send(self, ctx, node, event) end
      return
    end
    -- Only a Start the PAYLOAD raised counts. A STRIKER also sends Start down
    -- its subgraph at launch, to open the repeaters riding on it, and that
    -- one passes straight through the payload -- so without this a cluster
    -- bomb detonates the moment it is fired rather than where it lands.
    --
    -- Swallowed rather than forwarded: what hangs below a chain trigger is
    -- the follow-up strike, and it exists only when this trigger says so.
    if not event.fromPayload then return end
    if cond == "on_hit" and not event.wasHit then return end
    if cond == "on_miss" and event.wasHit then return end
  elseif cond == "on_stop" then
    if kind ~= "stop" then return end
  else
    -- Firing triggers are driven by runtime:update, not by upstream events.
    if kind == "stop" then send(self, ctx, node, event) end
    return
  end

  if not pay(self, ctx, node) then return end
  local state = startState(self, ctx)
  state.wasHit = event.wasHit or false
  send(self, ctx, node, {
    kind = "start", state = state,
    x = event.x, y = event.y, wasHit = state.wasHit,
  })
end

--- The firing half of TRIGGER: press and release edges, once per frame.
local function updateFiringTriggers(self, ctx, dt)
  local pressed = self.firing and not self.wasFiring
  local released = self.wasFiring and not self.firing
  if not (pressed or released) then return end

  for _, id in ipairs(self.graph.order) do
    local node = self.graph.nodes[id]
    if node.type == "trigger" then
      local cond = self:prop(node, "condition")
      if cond == "player_press" or cond == "player_hold" then
        local x, y = parentPoint(self, ctx)
        if pressed then
          if pay(self, ctx, node) then
            send(self, ctx, node,
              { kind = "start", state = startState(self, ctx), x = x, y = y })
          end
        elseif released and cond == "player_hold" then
          send(self, ctx, node, { kind = "stop", x = x, y = y })
        end
      end
    end
  end
end

dispatch.repeater = function(self, ctx, node, event)
  local s = ctx:state(node.id)
  if event.kind == "start" then
    s.open = true
    s.template = event.state
    s.timer = 0                     -- the window's first strike is immediate
    if s.stock == nil then
      local capacity = self:prop(node, "capacity") or 0
      s.stock = capacity > 0 and capacity or math.huge
    end
  elseif event.kind == "stop" then
    -- Swallow a Stop that closes nothing, or a projectile ending would close
    -- windows it never opened further down.
    if s.open then
      s.open = false
      send(self, ctx, node, event)
    end
  else
    send(self, ctx, node, event)
  end
end

local function updateRepeaters(self, ctx, dt)
  for _, id in ipairs(self.graph.order) do
    local node = self.graph.nodes[id]
    if node.type == "repeater" then
      local s = ctx.nodeState[id]
      if s then
        local capacity = self:prop(node, "capacity") or 0
        local regen = self:prop(node, "generationTime") or 1
        if capacity > 0 then
          s.stock = math.min(capacity, (s.stock or capacity) + dt / math.max(1e-4, regen))
        end
        if s.open and s.template then
          local rate = math.max(1e-4, self:prop(node, "fireRate") or 1)
          s.timer = (s.timer or 0) - dt
          local guard = 0
          while s.timer <= 0 and guard < 32 do
            guard = guard + 1
            s.timer = s.timer + 1 / rate
            local haveStock = capacity <= 0 or (s.stock or 0) >= 1
            if haveStock and pay(self, ctx, node) then
              if capacity > 0 then s.stock = s.stock - 1 end
              -- Each strike is its own copy of the window's state, re-aimed
              -- and re-randomised: the window is a licence to fire, not one
              -- shot repeated.
              local state = cloneState(s.template)
              local x, y, vx, vy = parentPoint(self, ctx)
              local w = self.host.wielder and self.host.wielder()
              if ctx.parent and (ctx.parent.dirX or ctx.parent.dirY) then
                state.weaponAimX = ctx.parent.dirX or state.weaponAimX
                state.weaponAimY = ctx.parent.dirY or state.weaponAimY
              elseif w then
                state.weaponAimX, state.weaponAimY = w.aimX or 1, w.aimY or 0
              end
              local a = rand(self) * math.pi * 2
              state.strikeAimX, state.strikeAimY = math.cos(a), math.sin(a)
              state.inheritedVx, state.inheritedVy = vx, vy
              send(self, ctx, node, { kind = "start", state = state, x = x, y = y })
            else
              s.timer = 0
              break
            end
          end
        end
      end
    end
  end
end

dispatch.barrel = function(self, ctx, node, event)
  if event.kind ~= "start" then
    send(self, ctx, node, event)
    return
  end

  local children = graph.childrenOf(self.graph, node)
  if #children == 0 then return end

  local function P(name) return self:prop(node, name) end
  local count = math.max(1, math.floor(P("barrelCount") or 1))
  local spread = (P("spread") or 0) * DEG
  local base = (P("angle") or 0) * DEG
  local rangeMax = P("rangeMax") or math.huge
  local variance = P("spreadVariance") or 0

  -- Where the barrel points. The specification has the player aim the weapon;
  -- nothing aims this game's weapons, so the barrel picks its own heading.
  local px, py = parentPoint(self, ctx)
  local aimX, aimY = event.state.weaponAimX, event.state.weaponAimY
  local mode = P("aimMode") or "nearest"
  if mode == "random" then
    local a = rand(self) * math.pi * 2
    aimX, aimY = math.cos(a), math.sin(a)
  elseif mode == "fixed" then
    aimX, aimY = 1, 0
  elseif mode == "nearest" and self.host.aim then
    local dx, dy = self.host.aim(px, py, rangeMax, ctx)
    if dx then aimX, aimY = dx, dy
    else
      -- Nothing in range: hold fire rather than spraying at the wall. The
      -- energy is already spent, which is the honest cost of a miss.
      return
    end
  end
  local aimAngle = math.atan2(aimY, aimX)

  local s = ctx:state(node.id)
  local first, last = 1, count
  if P("routing") ~= "all" then
    s.lastBarrel = ((s.lastBarrel or 0) % count) + 1
    first, last = s.lastBarrel, s.lastBarrel
  end

  for i = first, last do
    local offset = (count == 1) and 0 or (spread * ((i - 1) / (count - 1) - 0.5))
    local wobble = 0
    if variance > 0 then wobble = (rand(self) - 0.5) * variance * DEG end
    local a = aimAngle + base + offset + wobble

    local state = cloneState(event.state)
    state.weaponAimX, state.weaponAimY = aimX, aimY
    state.strikeAimX, state.strikeAimY = math.cos(a), math.sin(a)
    state.angleSpread = variance
    -- Range narrows, never widens: a tight barrel downstream of a loose one
    -- should still be tight.
    if rangeMax < state.rangeMax then state.rangeMax = rangeMax end

    local port = ((i - 1) % #children) + 1
    sendPort(self, ctx, node, children[port].port,
      { kind = "start", state = state, x = event.x, y = event.y,
        wasHit = event.wasHit })
  end
end

dispatch.striker = function(self, ctx, node, event)
  if event.kind == "stop" then
    -- Ending strikes this node owns in this context. Durable strikes ignore
    -- it, which is what lets a launched rocket outlive the trigger release.
    for _, strike in ipairs(self.strikes) do
      if strike.node == node and strike.ctx == ctx and strike.alive
         and not strike.state.durable then
        self:endStrike(strike, "stop")
      end
    end
    return
  end
  if event.kind ~= "start" then
    send(self, ctx, node, event)
    return
  end

  local function P(name) return self:prop(node, name) end
  local state = cloneState(event.state)
  state.motionType = P("motionType") or "linear"
  state.baseSpeed = P("baseSpeed") or 0
  state.speedMultiplier = state.speedMultiplier * (P("speedMultiplier") or 1)
  state.acceleration = state.acceleration + (P("acceleration") or 0)
  state.gravity = P("gravity") or 0
  state.waveAmplitude = P("waveAmplitude") or 0
  state.waveFrequency = P("waveFrequency") or 0
  state.orbitRadius = P("orbitRadius") or 0
  state.orbitSpeed = P("orbitSpeed") or 0
  state.collisionSize = P("collisionSize") or 1
  state.triggerBehavior = P("triggerBehavior") or "consumable"
  state.durable = P("durable") or false
  state.expires = P("expires") ~= false
  state.lifetimeMax = P("lifetimeMax") or math.huge
  state.visual = P("visual") or "bullet"

  local speedVariance = P("speedVariance") or 0
  if speedVariance > 0 then
    state.baseSpeed = state.baseSpeed + (rand(self) - 0.5) * speedVariance
  end

  -- Damage is stamped on at launch from the payload below, so the host's
  -- collision can read one number off the strike instead of walking a graph
  -- for every hit.
  -- Everything the module declares that is not already a strike-state field
  -- rides along in `extra`. A game that bolts pierce onto STRIKER gets pierce
  -- on the strike without the framework ever hearing the word.
  for _, prop in ipairs(mods.props("striker")) do
    if state[prop.name] == nil then
      state.extra[prop.name] = self:prop(node, prop.name)
    end
  end

  local payload = self.payloadFor[node.id]
  if payload then
    state.baseDamage = self:prop(payload, "damagePower") or 0
    state.aoeRadius = self:prop(payload, "damageRadius") or 0
    for _, prop in ipairs(mods.props("payload")) do
      state.extra[prop.name] = self:prop(payload, prop.name)
    end
  end

  local px, py = parentPoint(self, ctx)
  local strike = {
    node = node, ctx = ctx, state = state,
    x = event.x or px, y = event.y or py,
    alive = true,
    age = 0,
    runtime = self,
  }
  self.strikes[#self.strikes + 1] = strike

  -- Anything below the striker belongs to the strike, not to the wielder.
  local children = graph.childrenOf(self.graph, node)
  if #children > 0 then
    local attached = (state.motionType == "orbit") or (state.baseSpeed == 0)
    strike.subCtx = newContext(self, strike,
      attached and "weapon" or "inflight", true)
    self.contexts[#self.contexts + 1] = strike.subCtx
  end

  if self.host.spawn then self.host.spawn(strike) end

  -- Launch opens the windows below: this is what makes a gun that fires guns
  -- work without any module knowing it is riding a projectile.
  if strike.subCtx then
    send(self, strike.subCtx, node,
      { kind = "start", state = cloneState(state), x = strike.x, y = strike.y })
  end
end

dispatch.payload = function(self, ctx, node, event)
  if event.kind == "hit" or event.kind == "miss" then
    local wasHit = (event.kind == "hit")
    if self.host.payload then
      self.host.payload(node, event, wasHit, ctx)
    end
    local effect = self:prop(node, "effect")
    if effect and effect ~= "none" and self.host.effect then
      self.host.effect(effect, event.x, event.y, node, ctx)
    end
    -- The impact becomes the parent for whatever the chain starts next.
    local post = newContext(self, { x = event.x, y = event.y, vx = 0, vy = 0 },
      "post", true)
    send(self, post, node,
      { kind = "start", state = event.state or newState(),
        x = event.x, y = event.y, wasHit = wasHit, fromPayload = true })
    return
  end
  send(self, ctx, node, event)
end

dispatch.emitter = function(self, ctx, node, event)
  if event.kind ~= "start" then return end
  if self.host.emit then
    local px, py = parentPoint(self, ctx)
    self.host.emit(node, event.x or px, event.y or py, event.state, ctx)
  end
end

-- ------------------------------------------------------------ host callbacks

--- The host calls this when a strike collides. Retriggerable strikes call it
-- once per tick; consumable strikes call it once and then end.
--
-- `keepAlive` is the host overruling that, which is what a game with pierce
-- needs: the payload fires on every body the shot goes through, and the shot
-- only ends when the host says it has run out of bodies.
function runtime:hit(strike, x, y, target, keepAlive)
  if not strike.alive then return end
  local ends = (strike.state.triggerBehavior ~= "retriggerable") and not keepAlive
  local ctx = strike.subCtx
  if ctx then
    local event = { kind = "hit", state = cloneState(strike.state),
                    x = x, y = y, target = target }
    event.state.wasHit = true
    send(self, ctx, strike.node, event)
  end
  if ends then self:endStrike(strike, "hit") end
end

--- The host calls this when a strike runs out of life or range.
function runtime:expire(strike, x, y)
  self:endStrike(strike, "expire", x, y)
end

--- End a strike. Order matters and comes straight from the specification:
-- Stop first, so repeaters below close their windows, and only then the Hit
-- or Miss that fires the payload.
function runtime:endStrike(strike, reason, x, y)
  if not strike.alive then return end
  strike.alive = false
  local ctx = strike.subCtx
  if ctx then
    send(self, ctx, strike.node, { kind = "stop" })
    if reason == "expire" and strike.state.expires then
      local event = { kind = "miss", state = cloneState(strike.state),
                      x = x or strike.x, y = y or strike.y }
      event.state.wasHit = false
      send(self, ctx, strike.node, event)
    end
    ctx.alive = false
  end
  if self.host.despawn then self.host.despawn(strike) end
end

-- ------------------------------------------------------------------- update

function runtime:update(dt)
  self.firing = self.input:sample() == 1
  self.time = self.time + dt
  self.stalled = false

  chargeEnergy(self, self.root, dt)
  updateFiringTriggers(self, self.root, dt)

  -- Copied, because a repeater firing a striker can add contexts mid-loop.
  local live = {}
  for _, ctx in ipairs(self.contexts) do
    if ctx.alive then live[#live + 1] = ctx end
  end
  for _, ctx in ipairs(live) do
    if ctx.alive then updateRepeaters(self, ctx, dt) end
  end

  local keptCtx = {}
  for _, ctx in ipairs(self.contexts) do
    if ctx.alive then keptCtx[#keptCtx + 1] = ctx end
  end
  self.contexts = keptCtx

  local keptStrikes = {}
  for _, strike in ipairs(self.strikes) do
    if strike.alive then keptStrikes[#keptStrikes + 1] = strike end
  end
  self.strikes = keptStrikes

  self.wasFiring = self.firing
end

--- Drop every live strike, for a restart or a graph rewrite.
function runtime:clear()
  for _, strike in ipairs(self.strikes) do
    strike.alive = false
    if self.host.despawn then self.host.despawn(strike) end
  end
  self.strikes = {}
  self.contexts = { self.root }
  self.root.nodeState = {}
  self.root.alive = true
  self.wasFiring = false
end

return runtime
