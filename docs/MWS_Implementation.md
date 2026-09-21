# Modular Weapon System: playable v2 test build

The [v2 specification](Modular_Weapon_System.md) remains the target. The F8 bench
now runs editable v2 weapons with independent sequence reservoirs, real
collisions, Hit/Complete events, all nine Trigger subclasses, and normalized
input. This is a working subset, not every subclass. The ordinary survival game
and its shop weapons still use the legacy runtime.

## Try it

Run `love .` from `~/Dev/game-dev-playground/main`, then press **F8**.
The first six bench weapons are v2 prototypes; **comma / period** cycles weapons.
The editor's **Levels → Bench → Prototype** setting also selects them.

Bench enemies stay still by default so weapon movement is visible. Their AI,
separation and knockback are paused; hit detection, damage and replacement of
defeated targets still work. Disable **Levels → Bench → Dummies hold still** for
moving enemies. The survival game is unaffected.

- **Z** or **controller X** supplies fire input. **Fire pulse** supplies one
  pulse; **Hold fire** supplies continuous input. Turn Hold fire off when testing
  individual presses. WASD/arrows/controller stick move the player.
- Click a module to change its subclass, tier or settings. Timing values use
  integer simulation ticks: **60 ticks = one second**. Enter or clicking outside
  a timing field commits its value.
- Drag output ports to inputs to connect modules; drag connected ports to
  disconnect. Add modules using the palette. Delete removes the selection.
- **Save** writes the graph to `config/weapons/<id>.json`. **Revert** removes
  that override and restores the built-in graph.
- Property/wiring edits reset runtime state and refill to configured initial
  charge, without producing gameplay completion events. **Reset test** does the
  same without changing the graph. Moving tiles does not reset.

| Preset | What to test |
|---|---|
| V2 / Pulse | Hold fire: Repeater pulses immediately, then every 18 ticks. Release and press again to restart its pattern. |
| V2 / Beam exhaustion | Press once to toggle on. The 40-capacity, 10 e/s battery drains; the beam ends, then fresh beams start as energy recovers. Press again to toggle off. Upgrade Battery tier/refill to sustain it longer. |
| V2 / Piercing + Miss | Tap for a piercing shot. The second sequence creates a field only after zero-hit completion. Set dummy population to zero in Levels to observe Miss reliably. |
| V2 / Complete + Field | Hold fire: each shot's completion starts a separately powered field, whether it hit or missed. Both reservoirs appear in the header. |
| V2 / Delayed single | Tap, then move: a shot fires 60 ticks later from its captured origin. Release never cancels it. The downstream Seeking barrel selects a target at execution time. |
| V2 / Sweep | Hold fire for repeated sweeps. Each runs to completion after its input pulse goes cold because Release ends strike is off. |

The header shows stored energy / capacity and refill for each sequence. Fire,
Hit, End, Miss and Skip counters show actual strikes, distinct contacts,
completions, zero-hit completions and unaffordable firing opportunities. Skips
are never queued. The footer shows the latest event, sequence and hit count.
Invalid graphs are inactive and display a validation message.

Trigger tiles show **HOT** with a filled accent icon or **COLD** with an outlined
icon, using the output of the latest simulation tick. Selection only changes the
tile border. If a module executes in several contexts, any hot output makes its
tile hot. A one-tick pulse lasts 1/60 second; the display does not extend it.

Battery icons fill from the bottom with their sequence's stored energy divided
by its total capacity. Batteries sharing a sequence display the same pool.
A short tick beside the cell marks the energy needed to start one strike,
including size and weight costs. Different branch costs get separate ticks;
an upward chevron means a cost exceeds capacity. Continuing work and payload
spending drain the fill as they happen. The mark does not promise enough energy
to finish a strike. Edits and Reset test refresh these indicators immediately.

## Available modules

| Class | Implemented subclasses |
|---|---|
| Trigger | Inverter, Single, Toggle, Delay, Repeater, Proximity, Hit, Miss, Complete |
| Battery | Infinite, with capacity, refill, initial charge and five tiers |
| Barrel | Forward, Directional, Spread, Multi, Alternating, Blind, Seeking, Weakling, Bossling, Rotating, Bounce, Refract |
| Striker | Ranged, Piercing, Stab, Sweep, Area, Orbit |
| Payload | Sharp, Impact, Plasma, with primitive visual effects |

The v2 palette has five classes. Repeater is a Trigger subclass; Emitter is absent.
All batteries add across their sequence, regardless of placement/branch. Direct
**Striker → Trigger** starts another sequence. Energy is never inherited or
duplicated across that boundary or branch executions. Unaffordable pulses are
dropped; hot signals retry when startup becomes affordable. Exhaustion ends the
old strike; restart creates a new one. Payload-free strikes still produce events.
Without a Barrel, firing direction is random and ignores incoming direction.

## Explicit prototype choices and departures

These make unsettled parts testable; they do not amend the design specification.

1. **Timing/input:** v2 bench simulation runs at 60 Hz. The application input layer
   collapses between-tick presses to one hot sample, preserves short taps, ignores
   held-key repeats, and supports separate keyboard/controller sources. The
   adapter receives named fire-down/up events only; no press replay queue.
2. **Charge/tiers:** batteries default to full, with editable initial-charge
   fraction. Trash/common/rare/legendary/celestial multipliers are
   0.5/1/1.5/2/3 for both capacity and refill. Repeater divides its base period by
   the multiplier, rounds to the nearest tick and clamps to at least two ticks.
   Effective width is capped at period minus one. These are provisional values.
3. **Energy scheduling:** refill happens first, starts follow stable graph/port
   order, then continuing costs follow creation order. Branches share one balance;
   no fairness scheduler. Unaffordable whole-tick work ends the strike rather than
   funding part of the tick.
4. **Costs:** startup is `startupCost + sizeCost × radius² × weight`. Continuing
   work costs `draw × dt + distanceCost × distance × weight`. Projectiles use
   actual travel; Orbit uses arc distance; Stab/Sweep use reach × dt. Sharp spends
   configured energy once per distinct target. Impact also scales damage by
   weight × max(0.1, speed / 100). Plasma spends configured energy/second **per
   overlapping target per tick**. Funded energy becomes damage through efficiency.
   The remaining reservoir is not automatically emptied on every hit.
5. **Concurrency:** Ranged/Piercing request a collider each hot tick.
   Stab/Sweep/Area/Orbit maintain one per execution route. Release ends sustained
   strikes only when their setting enables it. Active initial direction stays
   fixed except Sweep/Orbit motion. Root sustained origins follow the wielder;
   event and delayed origins remain at their captured location.
6. **Events:** hits count distinct targets per strike, including beams/fields.
   Sharp/Impact apply once per target; Plasma continues while overlapping.
   Complete fires once with final hit count; Miss accepts only count zero.
   Every qualifying event creates its own downstream execution context and
   one-tick pulse; all events from a tick arrive together next tick. Contexts
   own Trigger/Delay state but **share the sequence reservoir**. This is the
   provisional policy for the spec's unresolved collision-event batching.
7. **Routing:** one parent per node, no cycles or multi-input joins.
   Multi/Alternating map directions cyclically across connected children in port
   order; one connected child receives all lanes. A Striker before Multi applies
   to every lane, each resulting collider paying its own cost. Separate physical
   output paths create separate strike plans. Event branches connect directly
   to the Striker.
8. **Geometry:** Proximity uses an explicit sensor radius, independent of upstream
   gating. Enemies are circles; projectiles sweep their traveled segment, Stab/
   Sweep use thick lines, Area uses a circular sector, Orbit a moving circle.
   Sustained contact normals are approximate; projectile contacts follow travel
   order. Size/shape belongs to the Striker; a Payload shape editor is deferred.
9. **Scope:** Instant/Ammo/Constant/Timer Batteries, Drone, Oscillating/Zig-zag and
   multi-input Barrels, and Burning/Corrosive/Freezing/Black-hole Payloads remain
   unimplemented and absent from the palette. Old saved graphs/shop weapons
   retain legacy behavior. V2 does not inherit legacy player/weapon modifiers.
   Acquisition, loot, and a new shop are not part of this build.
10. **Limits/reset:** 512 live colliders and 256 execution contexts per weapon
    guard against runaway graphs. Excess work is dropped and increments a visible
    LIMIT REACHED counter; it is never replayed. These are prototype guards, not
    battery semantics. Authoring edits and Reset test deliberately clear work.

## Code and verification

`shared/framework/mws/v2modules.lua` declares properties once, importing Trigger
metadata from `triggers.lua`. Inspector, defaults and JSON use that registry.
`v2graph.lua` compiles membership/reservoir totals; `v2runtime.lua` runs signals,
energy, collisions and events through a host adapter. `framework/input.lua`
normalizes devices above `mws/input.lua`. `weaponprototypes.lua` owns the six
graphs. Version 2 survives save/load; unversioned graphs stay on the old runtime.

`luajit tools/test.lua` covers Trigger traces, input coalescing, independent/additive
reservoirs, dropped starts, exhaustion/restart, actual piercing collisions,
Hit/Miss/Complete routing, shared energy across event contexts, delayed position,
Barrel scope, JSON round-trips and game-host integration. Legacy tests remain.
`luajit tools/balance.lua --runs 1 --seconds 180` compares the survival baseline.

Reproducible visual checks use the Lua screenshot tool; no accessibility access
is needed. Add `--frames 4 --every 0.5` to inspect several moments in one run:

```sh
luajit tools/screenshot.lua /tmp/mws-pulse.png --mode bench --at 4 --seed 7 --set bench.holdFire=true
luajit tools/screenshot.lua /tmp/mws-beam.png --mode bench --at 0.5 --seed 7 --set bench.prototype=v2_beam --set bench.holdFire=true
luajit tools/screenshot.lua /tmp/mws-complete.png --mode bench --at 3 --seed 7 --set bench.prototype=v2_complete --set bench.holdFire=true
```
