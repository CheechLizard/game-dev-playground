# Modular Weapon System implementation status

The [v2 design specification](Modular_Weapon_System.md) is the target. Migration
has begun with a signal-processing foundation and a normalized input boundary.
The game graph, energy accounting, strike events, and bench still use the older
model. Passing the legacy tests is not evidence of full v2 conformance.

## Implemented: input boundary and Trigger primitives

| Component | Available behavior |
|---|---|
| `shared/framework/mws/input.lua` | Accepts normalized `FIRE_BUTTON_DOWN` and `FIRE_BUTTON_UP` events and exposes current signal state. No device handling or input queue. |
| `shared/framework/mws/triggers.lua` | Independent Inverter, Single, Toggle, Delay, Repeater, Proximity, Hit, Miss, and Complete instances. Each evaluates one bit per simulation tick. |
| `runtime:inputEvent(event)` | The running game graph now accepts normalized fire events through the adapter. `setFiring` remains a compatibility entry point for existing callers. |
| `tools/triggersuite.lua` | Signal examples, chained order, startup behavior, delay preservation, pulse timing, sensor/event conversion, and instance isolation. Included by `tools/test.lua`. |

Trigger class metadata, configurable properties, and defaults are declared once
in `mws.triggers.types` / `mws.triggers.byId`. These declarations are the intended
source for the future subclass inspector. They do not yet replace the legacy
graph's Trigger conditions or its separate Repeater module. The new Trigger
primitives currently run through their public API and headless tests, not through
the existing bench.

The existing game's autonomous firing policy still supplies fire-down while
enemies exist and fire-up otherwise. Player bindings, quick-tap recognition, and
between-tick coalescing are responsibilities of a future application input-layer
integration. The adapter does not implement them. Feeding raw down/up bursts to
the adapter directly only changes its current state; it cannot preserve a short
tap that the upper layer failed to normalize.

## Using the foundation

Call the signal pipeline once per simulation tick, not once per rendered frame:

```lua
local mws = require("framework.mws")
local input = mws.input.new()
local toggle = mws.triggers.new("toggle")
local repeater = mws.triggers.new("repeater", {
  periodTicks = 6,
  pulseTicks = 2,
})

-- The external input layer supplies these normalized action events.
input:handle("FIRE_BUTTON_DOWN")

-- During each simulation tick, in graph order:
local signal = toggle:step(input:sample())
local fireRequest = repeater:step(signal)
-- A future sequence runtime will offer this bit to its striker and power rail.

input:handle("FIRE_BUTTON_UP")
```

`step` accepts booleans or integer bits and returns integer 0/1. Because Lua treats
zero as truthy, consumers must compare results to 1, rather than use a bare
`if fireRequest` condition. Instances copy their configuration and own separate
state. Construct a new instance when changing configuration; in-place live
reconfiguration/reset semantics are not implemented yet.

The host supplies sensor observations instead of the Trigger querying the game:

```lua
local proximity = mws.triggers.new("proximity")
local hot = proximity:step(0, { proximity = true })

local miss = mws.triggers.new("miss")
local result = miss:step(0, {
  event = { kind = "complete", hitCount = 0, reason = "range" },
})
```

Observations are local to a tick. Omitting an event on the following tick produces
cold output. The event conversion primitive accepts one supplied event per
instance/tick; it rejects an `events` batch rather than inventing a policy for
multiple striker events. Adjacent qualifying events can produce adjacent hot
bits. Their conversion to distinct downstream activations, including any need
for separators, remains part of the unresolved event-encoding design. This is
separate from the settled application-input rule of coalescing presses per tick.

## Explicit prototype choices

These choices make the primitive API executable; they are not additional settled
game-design decisions:

- Delay and Repeater timings use integer ticks. A zero-tick Delay passes its
  input through immediately. Seconds-to-ticks rounding belongs to later authoring
  integration; no rounding is silently imposed here.
- Repeater requires `1 <= pulseTicks < periodTicks`, leaving a cold interval
  between pulses. Rates faster than a tick can represent are rejected through
  these integer limits. Numerical battery/Trigger tiers are not invented; future
  content can assign shorter valid periods to higher Trigger tiers.
- Proximity directly reports the host's detection bit. Collision geometry and
  upstream gating remain open and are not implemented by this primitive.
- Complete events require an explicit nonnegative integer hit count. Missing
  information must not accidentally activate Miss.
- Delay stores a bounded history of signal bits. It shifts both transitions and
  does not cancel pending output when input goes cold. It is intentionally
  different from a backlog of application presses being replayed later.

Spatial/event metadata routing across a sequence or Delay is not implemented by
the bit processor. That work belongs to sequence execution/context handling.

## Remaining implementation stages

1. Compile sequence membership and connect Trigger instances to live execution;
   preserve the scope of modules around branches and sequence boundaries.
2. Replace legacy energy accounting with independent sequence reservoirs,
   startup costs, continuing draw, exhaustion, and hot-signal restart.
3. Emit individual Hit events and final Complete with counts from actual
   strikes, and route context into self-powered downstream sequences.
4. Migrate class/subclass graph instances, serialization, validation, and the
   editor together; replace legacy Repeater/Emitter paths and saved graphs.
5. Add and exercise the remaining Barrel, Striker, Battery, and Payload behaviors,
   recording experimental choices where the design is still open.

The full game/editor does not support the new reservoir or restart rules yet.
Those rules should not be inferred from the existing legacy graph readouts.
