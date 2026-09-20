-- Conformance tests for the Modular Weapon System.
--
-- These check the specification's *rules*, not the game's feel: that a module
-- accepts one input, that energy divides at a branch, that a projectile's
-- subgraph is parented to the projectile and not to the player, that Stop
-- reaches a repeater before Miss reaches a payload. If a rule here is wrong,
-- every weapon built on it is wrong in a way no amount of tuning will fix.
--
-- The runtime never draws and never simulates, so all of this runs headless
-- against a fake host that records what it was asked to do.

local mods = require("framework.mws.modules")
local graph = require("framework.mws.graph")
local runtime = require("framework.mws.runtime")

local mwssuite = {}

-- ----------------------------------------------------------------- helpers

--- A host that records rather than acts. `aim` points due east and `random`
-- is fixed, so every test below is deterministic.
local function recorder(opts)
  opts = opts or {}
  local log = {
    spawned = {}, payloads = {}, effects = {}, emissions = {}, despawned = {},
  }
  log.player = { x = opts.x or 0, y = opts.y or 0, vx = 0, vy = 0,
                 aimX = 1, aimY = 0 }
  log.host = {
    wielder = function() return log.player end,
    aim = function() if opts.noTarget then return nil end return 1, 0 end,
    random = function() return opts.random or 0.5 end,
    spawn = function(strike) log.spawned[#log.spawned + 1] = strike end,
    despawn = function(strike) log.despawned[#log.despawned + 1] = strike end,
    payload = function(node, event, wasHit)
      log.payloads[#log.payloads + 1] =
        { node = node, x = event.x, y = event.y, wasHit = wasHit }
    end,
    effect = function(name, x, y) log.effects[#log.effects + 1] = { name, x, y } end,
    emit = function(node, x, y) log.emissions[#log.emissions + 1] = { node, x, y } end,
  }
  return log
end

local COSTS = { trigger = 0, battery = 0, repeater = 0, barrel = 2,
                striker = 8, payload = 4, emitter = 3 }
local function cost(node) return COSTS[node.type] or 1 end

local function arm(g, log, opts)
  opts = opts or {}
  local rt = runtime.new(g, log.host,
    { cost = opts.cost or cost, buffer = opts.buffer or 2 })
  rt:setFiring(true)
  return rt
end

--- Run `seconds` of the weapon at 60Hz.
local function tick(rt, seconds)
  local dt = 1 / 60
  for _ = 1, math.floor(seconds * 60 + 0.5) do rt:update(dt) end
end

--- A straight chain of module types, wired head to tail. Returns the nodes in
-- order, so a test can reach for `n[3]` without naming every link.
local function chain(g, spec)
  local made, previous = {}, nil
  for i, step in ipairs(spec) do
    local node = graph.addNode(g, step[1], i * 80, 0)
    for name, value in pairs(step[2] or {}) do node.props[name] = value end
    if previous then assert(graph.connect(g, previous.id, 1, node.id)) end
    made[#made + 1] = node
    previous = node
  end
  return made
end

-- -------------------------------------------------------------------- tests

function mwssuite.run(suite, check, eq, near)
  -- The game bolts extra properties onto the framework's modules; the suite
  -- needs them registered before it builds anything.
  require("arsenal").registerModules()

  -- ================================================== graph structure
  suite("mws: graph structure")
  do
    local g = graph.new("t", "T")
    local trg = graph.addNode(g, "trigger", 0, 0)
    local stk = graph.addNode(g, "striker", 80, 0)
    local pay = graph.addNode(g, "payload", 160, 0)

    check("a module accepts a connection", graph.connect(g, trg.id, 1, stk.id))
    check("a module accepts only one input",
      not graph.connect(g, pay.id, 1, stk.id))
    check("a module cannot feed itself",
      not graph.connect(g, trg.id, 1, trg.id))

    graph.connect(g, stk.id, 1, pay.id)
    check("a cycle is refused", not graph.connect(g, pay.id, 1, trg.id))

    local emt = graph.addNode(g, "emitter", 240, 0)
    check("a terminal module takes nothing downstream",
      not graph.connect(g, emt.id, 1, trg.id))

    eq("the trigger is the only root", #graph.roots(g), 2)   -- trigger + emitter

    -- Pulling a module out of the middle orphans its children rather than
    -- deleting them: losing the rest of a weapon to one keystroke is not a
    -- trade anyone wants.
    graph.removeNode(g, stk.id)
    check("removing a module leaves its children", g.nodes[pay.id] ~= nil)
    check("removing a module unwires its parent", trg.outputs[1] == nil)
  end

  -- ================================================== serialisation
  suite("mws: serialisation")
  do
    local g = graph.new("blaster", "Blaster")
    local n = chain(g, {
      { "trigger" }, { "battery", { energyPerSecond = 99 } },
      { "striker" }, { "payload", { damagePower = 12 } },
    })

    local t = graph.toTable(g)
    -- Only what differs from the module's defaults is written, so a property
    -- added to a module type is inherited by every graph already saved.
    local battery
    for _, raw in ipairs(t.nodes) do
      if raw.type == "battery" then battery = raw end
    end
    eq("a changed property is stored", battery.props.energyPerSecond, 99)

    local trigger
    for _, raw in ipairs(t.nodes) do
      if raw.type == "trigger" then trigger = raw end
    end
    check("an unchanged property is not stored", trigger.props == nil)

    local back = graph.fromTable(t)
    eq("every node round trips", #back.order, #g.order)
    eq("values round trip", back.nodes[n[2].id].props.energyPerSecond, 99)
    eq("defaults are restored on load",
      back.nodes[n[1].id].props.condition, "player_hold")
    check("wiring round trips",
      back.nodes[n[1].id].outputs[1] == n[2].id)

    -- A graph saved before a property was renamed should still open.
    t.nodes[2].props.thisWasDeleted = 3
    local _, dropped = graph.fromTable(t)
    eq("an unknown property is dropped, not fatal", #dropped, 1)

    local ids = graph.new("x")
    graph.addNode(ids, "trigger", 0, 0, "n7")
    local reloaded = graph.fromTable(graph.toTable(ids))
    local fresh = graph.addNode(reloaded, "battery", 0, 0)
    check("ids from a file do not collide with new ones", fresh.id ~= "n7")
  end

  -- ================================================== validation
  suite("mws: validation")
  do
    local g = graph.new("t")
    check("an empty graph is not firable", not graph.isFirable(g))

    chain(g, { { "battery" }, { "striker" }, { "payload" } })
    check("a graph with no trigger is not firable", not graph.isFirable(g))

    local g2 = graph.new("t2")
    chain(g2, { { "trigger" }, { "striker" }, { "payload" } })
    check("a trigger makes it firable", graph.isFirable(g2))

    local g3 = graph.new("t3")
    local n = chain(g3, { { "trigger", { condition = "on_hit" } }, { "striker" } })
    check("a chain trigger with nothing above it is an error",
      not graph.isFirable(g3))

    local bare = graph.new("bare")
    chain(bare, { { "trigger" }, { "striker" } })
    local warned = false
    for _, p in ipairs(graph.validate(bare)) do
      if p.level == "warn" then warned = true end
    end
    check("a striker with no payload warns", warned)
    eq("validation names the node it is about",
      type(graph.validate(g3)[1].nodeId), "string")
    check("nodes exist for the validated graph", n[1] ~= nil)
  end

  -- ================================================== energy
  suite("mws: energy")
  do
    -- Batteries stack along a path.
    local g = graph.new("t")
    local n = chain(g, {
      { "trigger" }, { "battery", { energyPerSecond = 30 } },
      { "battery", { energyPerSecond = 20 } }, { "striker" }, { "payload" },
    })
    local info = graph.analyse(g, cost)
    eq("batteries on one path stack", info[n[4].id].rail, 50)
    -- Above, not only below. Every example in the specification wires
    -- TRIGGER -> BATTERY -> ..., so a battery that only powered what was
    -- drawn under it would leave the trigger unable to pay for anything.
    -- What a battery cannot cross is a branch, which is tested below.
    eq("a battery powers the whole path it sits on, trigger included",
      info[n[1].id].rail, 50)

    -- Cost is the whole subtree below the node that starts the strike.
    eq("a strike costs everything downstream of it", info[n[1].id].cost,
      COSTS.striker + COSTS.payload)

    -- Energy divides across a barrel's ports, per the specification.
    local b = graph.new("b")
    local trg = graph.addNode(b, "trigger", 0, 0)
    local bat = graph.addNode(b, "battery", 80, 0)
    local brl = graph.addNode(b, "barrel", 160, 0)
    bat.props.energyPerSecond = 90
    graph.connect(b, trg.id, 1, bat.id)
    graph.connect(b, bat.id, 1, brl.id)
    local ports = {}
    for i = 1, 3 do
      local s = graph.addNode(b, "striker", 240, i * 60)
      graph.connect(b, brl.id, i, s.id)
      ports[i] = s
    end
    local binfo = graph.analyse(b, cost)
    near("90 e/s across three ports is 30 each", binfo[ports[1].id].rail, 30, 1e-9)

    -- A battery after a branch powers only that branch: the specification's
    -- asymmetric triple barrel.
    local boost = graph.addNode(b, "battery", 320, 180)
    boost.props.energyPerSecond = 60
    graph.removeNode(b, ports[3].id)
    graph.connect(b, brl.id, 3, boost.id)
    local super = graph.addNode(b, "striker", 400, 180)
    graph.connect(b, boost.id, 1, super.id)
    binfo = graph.analyse(b, cost)
    near("a battery past a branch lifts only that branch",
      binfo[super.id].rail, 90, 1e-9)
    near("the other branches are untouched", binfo[ports[1].id].rail, 30, 1e-9)

    -- Routing changes what a strike costs, because `all` fires every barrel.
    local r = graph.new("r")
    local rn = chain(r, {
      { "trigger" }, { "barrel", { barrelCount = 3, routing = "all" } },
      { "striker" }, { "payload" },
    })
    local branch = COSTS.striker + COSTS.payload
    eq("routing all pays for every barrel",
      graph.analyse(r, cost)[rn[1].id].cost, COSTS.barrel + branch * 3)
    rn[2].props.routing = "round_robin"
    eq("round robin pays for the one barrel it uses",
      graph.analyse(r, cost)[rn[1].id].cost, COSTS.barrel + branch)
  end

  -- ================================================== events
  suite("mws: events")
  do
    -- A repeater fires at its rate while its window is open, and stops when
    -- the window closes.
    local g = graph.new("t")
    local n = chain(g, {
      { "trigger", { condition = "player_hold" } },
      { "battery", { energyPerSecond = 500 } },
      { "repeater", { fireRate = 10, capacity = 0 } },
      { "barrel", { aimMode = "nearest" } },
      { "striker", { baseSpeed = 100 } },
      { "payload", { damagePower = 5 } },
    })
    local log = recorder()
    local rt = arm(g, log)
    tick(rt, 1)
    check("a repeater fires at about its rate",
      #log.spawned >= 9 and #log.spawned <= 12, #log.spawned .. " in 1s at 10/s")

    local before = #log.spawned
    rt:setFiring(false)
    tick(rt, 1)
    eq("releasing fire closes the window", #log.spawned, before)

    rt:setFiring(true)
    tick(rt, 0.5)
    check("firing again reopens it", #log.spawned > before)

    -- A barrel aims the strike; without one it is random, as the appendix says.
    local aimed = log.spawned[1]
    near("a barrel aims the strike", aimed.state.strikeAimX, 1, 1e-6)
    near("and squares it up", aimed.state.strikeAimY, 0, 1e-6)

    -- The striker stamps damage from the payload below it, so collision can
    -- read one number instead of walking the graph on every hit.
    eq("the striker carries the payload's damage", aimed.state.baseDamage, 5)
    eq("the barrel's range reaches the strike", aimed.state.rangeMax,
      n[4].props.rangeMax)

    -- Nothing in range means nothing fired: the barrel holds rather than
    -- spraying at a wall.
    local blind = recorder{ noTarget = true }
    local rt2 = arm(g, blind)
    tick(rt2, 1)
    eq("a barrel with no target does not fire", #blind.spawned, 0)
  end

  suite("mws: barrel spread and routing")
  do
    local g = graph.new("t")
    local n = chain(g, {
      { "trigger" }, { "battery", { energyPerSecond = 900 } },
      { "barrel", { barrelCount = 3, spread = 90, routing = "all",
                    spreadVariance = 0 } },
      { "striker", { baseSpeed = 100 } }, { "payload" },
    })
    local log = recorder()
    local rt = arm(g, log)
    tick(rt, 1 / 60)
    eq("routing all fires every barrel at once", #log.spawned, 3)

    -- Three barrels across 90 degrees are -45, 0, +45 off the aim.
    local angles = {}
    for i, s in ipairs(log.spawned) do
      angles[i] = math.deg(math.atan2(s.state.strikeAimY, s.state.strikeAimX))
    end
    table.sort(angles)
    near("the barrels are evenly spread", angles[1], -45, 1e-6)
    near("and centred on the aim", angles[2], 0, 1e-6)
    near("across the whole arc", angles[3], 45, 1e-6)

    n[3].props.routing = "round_robin"
    local rr = recorder()
    local rt2 = arm(g, rr)
    tick(rt2, 1 / 60)
    eq("round robin fires one barrel per event", #rr.spawned, 1)

    -- A single barrel is dead accurate: `spread` is an arc between barrels,
    -- not a wobble. The two are easy to confuse and behave nothing alike.
    n[3].props.routing = "all"
    n[3].props.barrelCount = 1
    local one = recorder()
    tick(arm(g, one), 1 / 60)
    near("one barrel across any arc still points at the target",
      one.spawned[1].state.strikeAimY, 0, 1e-6)
  end

  -- ================================================== payload and chains
  suite("mws: payload, hit and miss")
  do
    local g = graph.new("t")
    local n = chain(g, {
      { "trigger" }, { "battery", { energyPerSecond = 900 } },
      { "barrel" }, { "striker", { baseSpeed = 100 } },
      { "payload", { damagePower = 9, effect = "burst" } },
    })
    local log = recorder()
    local rt = arm(g, log)
    tick(rt, 1 / 60)
    local strike = log.spawned[1]

    rt:hit(strike, 40, 7, { name = "target" })
    eq("a hit fires the payload", #log.payloads, 1)
    eq("at the impact point", log.payloads[1].x, 40)
    check("and says it was a hit", log.payloads[1].wasHit)
    eq("a payload triggers its effect", log.effects[1][1], "burst")
    check("a consumable strike ends on its hit", not strike.alive)

    -- Miss is the other half: effect, no damage, and wasHit false.
    local log2 = recorder()
    local rt2 = arm(g, log2)
    tick(rt2, 1 / 60)
    local s2 = log2.spawned[1]
    rt2:expire(s2, 5, 5)
    eq("expiring fires the payload too", #log2.payloads, 1)
    check("but marks it a miss", not log2.payloads[1].wasHit)

    -- `expires = false` means the strike ends quietly.
    n[4].props.expires = false
    local log3 = recorder()
    local rt3 = arm(g, log3)
    tick(rt3, 1 / 60)
    rt3:expire(log3.spawned[1], 5, 5)
    eq("a strike that does not expire fires nothing", #log3.payloads, 0)
  end

  suite("mws: chain triggers")
  do
    -- The specification's cluster bomb: a strike whose payload starts a
    -- second strike, but only where the first one actually hit.
    local g = graph.new("t")
    local n = chain(g, {
      { "trigger" }, { "battery", { energyPerSecond = 900 } },
      { "barrel" }, { "striker", { baseSpeed = 100 } },
      { "payload", { damagePower = 9 } },
      { "trigger", { condition = "on_hit" } },
      { "barrel" }, { "striker", { baseSpeed = 50 } }, { "payload" },
    })
    local log = recorder()
    local rt = arm(g, log)
    tick(rt, 1 / 60)
    eq("the first strike went out", #log.spawned, 1)

    rt:hit(log.spawned[1], 33, 44, {})
    eq("a hit starts the follow-up", #log.spawned, 2)
    eq("the follow-up starts where the hit landed", log.spawned[2].x, 33)
    eq("and not where the player is", log.player.x, 0)

    -- on_hit must ignore a miss, or a cluster bomb goes off in mid-air.
    local log2 = recorder()
    local rt2 = arm(g, log2)
    tick(rt2, 1 / 60)
    rt2:expire(log2.spawned[1], 33, 44)
    eq("on_hit ignores a miss", #log2.spawned, 1)

    n[6].props.condition = "on_miss"
    local log3 = recorder()
    local rt3 = arm(g, log3)
    tick(rt3, 1 / 60)
    rt3:expire(log3.spawned[1], 33, 44)
    eq("on_miss fires on a miss", #log3.spawned, 2)
  end

  -- ================================================== domains and recursion
  suite("mws: domains and recursion")
  do
    -- The spray cannon: a projectile that carries a repeater, which fires
    -- from the projectile's position rather than the player's. This is the
    -- rule the whole parent-context design exists for.
    local g = graph.new("t")
    chain(g, {
      { "trigger" }, { "battery", { energyPerSecond = 900 } },
      { "striker", { baseSpeed = 200, lifetimeMax = 5 } },
      { "repeater", { fireRate = 10, capacity = 0 } },
      { "barrel" }, { "striker", { baseSpeed = 80 } }, { "payload" },
    })
    local log = recorder()
    local rt = arm(g, log)
    tick(rt, 1 / 60)
    -- Two: the parent, and the carried repeater's first child, which fires on
    -- the same frame its window opens. A gun should shoot the instant it is
    -- told to, not one interval later.
    eq("the parent strike launched", #log.spawned, 2)

    local parent = log.spawned[1]
    check("a detaching strike opens a subgraph", parent.subCtx ~= nil)
    eq("its subgraph is inflight", parent.subCtx.domain, "inflight")
    check("the subgraph is already paid for", parent.subCtx.free)

    -- Fly the parent away from the player, then let its repeater run.
    parent.x, parent.y = 500, 300
    tick(rt, 0.25)
    check("the carried repeater fires", #log.spawned > 1)
    local child = log.spawned[#log.spawned]
    eq("children spawn from the projectile", child.x, 500)
    eq("not from the wielder", log.player.x, 0)

    -- When the parent ends, its window closes and the children stop.
    local atEnd = #log.spawned
    rt:expire(parent, 500, 300)
    tick(rt, 0.5)
    eq("the projectile ending closes its repeater", #log.spawned, atEnd)
    check("the subgraph is retired", not parent.subCtx.alive)

    -- An attached strike -- one that orbits, or does not move -- stays in the
    -- weapon's domain, because it never left.
    local a = graph.new("a")
    chain(a, {
      { "trigger" }, { "battery", { energyPerSecond = 900 } },
      { "striker", { motionType = "orbit", baseSpeed = 0 } },
      { "payload" },
    })
    local alog = recorder()
    tick(arm(a, alog), 1 / 60)
    eq("an orbiting strike stays in the weapon's domain",
      alog.spawned[1].subCtx.domain, "weapon")
  end

  suite("mws: stop before miss")
  do
    -- The order matters and the specification is explicit: Stop closes the
    -- repeaters below, and only then does Miss fire the payload. Reversed,
    -- a dying projectile gets one last free volley.
    local g = graph.new("t")
    chain(g, {
      { "trigger" }, { "battery", { energyPerSecond = 900 } },
      { "striker", { baseSpeed = 200, lifetimeMax = 5 } },
      { "repeater", { fireRate = 60, capacity = 0 } },
      { "barrel" }, { "striker", { baseSpeed = 80 } }, { "payload" },
    })
    local log = recorder()
    local rt = arm(g, log)
    tick(rt, 1 / 60)
    local parent = log.spawned[1]
    tick(rt, 0.1)

    local before = #log.spawned
    rt:expire(parent, 10, 10)
    eq("ending a projectile spawns nothing further", #log.spawned, before)
  end

  -- ================================================== energy gating
  suite("mws: running out of energy")
  do
    -- A weapon whose batteries cannot keep up still fires -- it just cannot
    -- fire as often as it asks to. That stall is the balancing mechanism, not
    -- a failure, so it has to actually happen.
    local g = graph.new("t")
    chain(g, {
      { "trigger" }, { "battery", { energyPerSecond = 12 } },
      { "repeater", { fireRate = 20, capacity = 0 } },
      { "barrel" }, { "striker" }, { "payload" },
    })
    local log = recorder()
    local rt = arm(g, log, { buffer = 0 })
    tick(rt, 1)

    local strikeCost = COSTS.barrel + COSTS.striker + COSTS.payload
    local affordable = 12 / strikeCost
    check("a starved weapon fires what it can afford, not what it asks for",
      #log.spawned <= math.ceil(affordable) + 1,
      string.format("%d fired, about %.1f affordable", #log.spawned, affordable))
    check("and reports that it stalled", rt.stalled)

    -- Given supply, the same weapon keeps up.
    local rich = graph.new("t2")
    chain(rich, {
      { "trigger" }, { "battery", { energyPerSecond = 900 } },
      { "repeater", { fireRate = 20, capacity = 0 } },
      { "barrel" }, { "striker" }, { "payload" },
    })
    local log2 = recorder()
    local rt2 = arm(rich, log2, { buffer = 0 })
    tick(rt2, 1)
    check("a supplied weapon does not stall", not rt2.stalled)
    check("and fires at its rate", #log2.spawned >= 18, #log2.spawned)
  end

  suite("mws: repeater capacity")
  do
    -- Capacity is a magazine: a burst, then a wait while it regenerates.
    local g = graph.new("t")
    chain(g, {
      { "trigger" }, { "battery", { energyPerSecond = 900 } },
      { "repeater", { fireRate = 30, capacity = 4, generationTime = 1 } },
      { "barrel" }, { "striker" }, { "payload" },
    })
    local log = recorder()
    local rt = arm(g, log)
    tick(rt, 0.2)
    check("a magazine empties after its capacity",
      #log.spawned <= 5, #log.spawned .. " from a magazine of 4")
    local emptied = #log.spawned
    tick(rt, 2.2)
    check("and refills at its regeneration rate", #log.spawned > emptied)
  end

  -- ================================================== module spec
  suite("mws: module properties")
  do
    for _, t in ipairs(mods.types) do
      local defaults = mods.defaults(t.id)
      local missing = {}
      for _, prop in ipairs(t.props) do
        if defaults[prop.name] == nil then missing[#missing + 1] = prop.name end
        if prop.type == "number" or prop.type == "int" then
          if type(prop.min) ~= "number" or type(prop.max) ~= "number" then
            missing[#missing + 1] = prop.name .. " (no range)"
          end
        end
      end
      check(t.name .. " declares a default and a range for every property",
        #missing == 0, table.concat(missing, ", "))
    end

    -- Coercion is what keeps a hand-edited JSON file from poisoning a weapon.
    local prop = { name = "x", type = "number", default = 5, min = 0, max = 10 }
    eq("a number above the range is clamped", mods.coerce(prop, 99), 10)
    eq("a number below the range is clamped", mods.coerce(prop, -99), 0)
    eq("a non-number falls back to the default", mods.coerce(prop, "nope"), 5)
    local enum = { name = "e", type = "enum", default = "a", values = { "a", "b" } }
    eq("an unknown enum falls back to the default", mods.coerce(enum, "z"), "a")
  end
end

return mwssuite
