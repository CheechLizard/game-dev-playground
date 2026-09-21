# Glossary

Project-specific vocabulary for game-dev-playground. Where a term maps to
something concrete, the code identifier is named.

Keep this in sync in the same change: when a term is added, renamed, or
retired, update it here too.

## Framework

| Term | Meaning | Code |
|---|---|---|
| **Schema** | The single source of truth for every tunable in a game. Declared at load time; the editor UI, the config defaults, and profile serialisation are all derived from it, so none of them can drift out of sync. | `shared/framework/schema.lua`, `schema.register` |
| **Setting** | One tunable declared in the schema — a `key`, `type`, `default`, and display metadata. Types: `number`, `int`, `bool`, `enum`, `color`, `string`. | `schema.settings`, keyed by dotted `key` |
| **Key** | A setting's dotted address, e.g. `player.moveSpeed`, `render.width`. Split into a nested path when read or written. | `config.get`, `config.set`, `splitKey` |
| **Page** / **Section** | The two levels of grouping a setting declares for the editor. Both are ordered by an `order` field. A page is an editor tab; a section is a labelled block within it. | `schema.pages`, `getPage`, `getSection` |
| **Config** | The live, flat set of current values materialised from the schema. The game reads values only through this, never from the schema directly. | `shared/framework/config.lua`, `config.build` |
| **Listener** | A callback registered against a key, fired when that key's value changes. Used for values needing rebuild work, e.g. `render.width` → `rebuildCanvas`. | `config.listen` |
| **Restart-pending** | State flagged when a changed setting cannot take effect until relaunch. Surfaced in the editor. | `config.needsRestart` |
| **Profile** | A named set of overrides stored in the repo as JSON. Stores only values differing from schema defaults, so adding a setting never invalidates an existing profile. | `config/profiles/<name>.json`, `shared/framework/profiles.lua` |
| **Autosave** | Writes the active profile once edits stop, rather than on every frame of a drag. Without it a session of tuning is lost by quitting without pressing Save. A profile load is suppressed, or loading would immediately dirty what it just read. | `profiles.autosave`, `profiles.update` |
| **Startup profile** | The profile marked in the index to load at launch, as distinct from the one currently loaded (`active`). | `profiles.startup`, `profiles.active`, `config/profiles/_index.json` |
| **Orphan** | A key present in a loaded profile but absent from the schema — usually a setting deleted since the profile was saved. Pruned on next save. | `profiles.orphans`, `profiles.pruneOrphans` |
| **Layer** | One debug-draw overlay (colliders, ranges, spawn rings…). Registered as an ordinary bool setting on the Overlays page, so it appears in the editor and saves into profiles through the same mechanism as everything else. | `dd.register`, `dd.layers` |
| **Master switch** | The single toggle gating all debug overlays at once, regardless of individual layer state. `F4`. | `dd.master` |
| **Action** | A named input intent (rather than a raw key or button), so keyboard and gamepad feed one path. Consumed once per frame. | `input.press`, `input.consume` |
| **Letterbox** | The integer-scaled centring of the fixed-size render canvas within the window. Integer-only: a fractional scale makes pixel art shimmer. | `recomputeLetterbox` in `main.lua` |
| **Canvas** | The fixed-size offscreen render target sized by `render.width`/`render.height`, drawn letterboxed into the window. | `rebuildCanvas` in `main.lua` |
| **Capture** | A screenshot taken without a human at the keyboard: the launcher drives the game from the command line, draws one frame, writes a PNG and quits. The only way to see a drawn surface from a worktree with no screen. | `shared/framework/capture.lua`, `--capture`, `tools/capture.sh`, `F7` |
| **Warm-up** | The fixed 1/60 steps a capture fast-forwards the simulation through before it shoots, named by `--at`. Fixed-step and the only time that passes during a capture, which is what makes the same command line produce the same PNG. | `capture.advance`, `--at` |
| **Settle frames** | The few frames a capture draws and discards before shooting, so the window and the GL context are real by the time it matters. The simulation is frozen through them. | `SETTLE_FRAMES`, `capture.frozen` |
| **Role** | What calling code asks fonts for — `title`, `heading`, `body`, `small` — rather than naming a family and size. One setting then resizes every surface at once. | `fonts.role`, `shared/framework/fonts.lua` |
| **Family** | One pixel font file plus the design size its glyphs were drawn at. Requested sizes snap to a multiple of that step, or the stems break up. | `fonts.families`, `step` |
| **Launcher** | `main.lua`. Owns boot order: schema → `config.build` → `profiles.init` → game. | `main.lua`, `love.load` |
| **Halftone** | An intermediate tone in the UI, drawn as an ordered dither of the foreground rather than as a grey. The pattern is anchored to the screen, so two fills of the same density that meet read as one surface. Never behind text: the stipple and the glyphs are the same white. | `ui.halftone`, `ui.tone` |
| **Tone** | A named halftone density — `inert`, `raised`, `hover`, `heavy`. Passed to a fill where a colour would otherwise go, so no widget invents its own shading. | `ui.tone` |
| **Unit** | The UI spacing base, 4px, multiplied by `ui.fontScale`. Every offset in the interface is a multiple of it, so the rhythm holds at 2x and 3x instead of the text growing while the gaps stay put. | `ui.unit`, `ui.BASE_UNIT`, `ui.pad`, `ui.gap`, `ui.sectionGap` |

## horde-survivor

| Term | Meaning | Code |
|---|---|---|
| **Run** | One playthrough attempt, from start to death or win. Holds the whole simulation and contains no draw calls or direct input reads, so it can run headless. | `games/horde-survivor/run.lua` |
| **Run state** | Which phase a run is in: `playing`, `shop`, `dead`, `won`. | `run.STATE` |
| **Wave** | The unit of escalation, and a fixed block of time — **15 seconds** by default, not a batch of enemies you clear. Nothing but the clock advances it. The wave number is both the player's progress and its position on the difficulty curve: a run is always `durationMinutes * 60 / waveSeconds` waves, numbered from 1, with no offset between the two. | `run.waveSeconds`, `run:waveCount`, `content.unlockedAt` |
| **Enemy** / **Weapon** | Content definitions declared as data tables with typed field specs, looked up by id. | `content.enemies`, `content.weapons`, `content.enemyById`, `content.weaponById` |
| **Behaviour** | An enemy's movement/attack pattern, declared as a field on the enemy definition. Shooting is a shared routine, not a behaviour: any behaviour that declares the shot fields fires the same shot. | `content.behaviourFields`, `run:fireEnemyShot` |
| **Aim prediction** | How far a weapon leads a moving target. Firing at where an enemy *is* only works while it is coming towards you; anything crossing your line has left by the time the shot lands. | `player.aimLead`, `run:aimPoint` |
| **LP** | The levelling currency dropped by kills — this game's XP. Spent on nothing; it accrues toward the next level. Distinct from gold. | `run.player.lp`, `level.baseRequirement`, `scale.lpPerWave` |
| **Gold** | The shop currency, earned per wave cleared and from drops. Spent on weapons, upgrades and rerolls. | `run:addGold`, `player.goldFind`, `economy.*` |
| **Pickup** | A dropped item on the ground, tagged by `kind` (`lp`, `gold`, `heal`). Flies to the player inside the pickup radius; gold and health expire, LP never does. | `pk.kind` in `run.lua` |
| **Pack** | How many of an enemy arrive together. A pick spawns a whole pack clustered around one point, so a pack lands as a group rather than trickling in from opposite edges. Most enemies are loners; the swarmer is not. | `enemy.<id>.pack`, `wave.packSpread` |
| **Spawn warning** | A ring that closes on the spot before an enemy appears there, so a spawn can be walked away from instead of only reacted to. Pending spawns count against the alive cap: they are already paid for. | `wave.spawnTelegraph`, `run:queueSpawn`, `run.pendingSpawns` |
| **Elite** | A rolled-up enemy variant: more HP, larger radius, bigger reward. Rolled per spawn against `scale.eliteChance`. | `enemy.elite`, `scale.eliteHpMult`, `scale.eliteRewardMult` |
| **Shop item** | An offer in the shop, tagged by `kind` (`weapon`, `upgrade`, `heal`). Rerollable for gold. | `kind` in `run.lua:325`, `shop.rerollCost` |
| **Passive** | A repeatable stat upgrade sold in the shop, as opposed to a weapon. `stat` names a key in `player.bonus`, so a new one needs no new plumbing. Stacks, priced higher each time, capped. | `content.passives`, `run:addPassive`, `player.passives` |
| **Stack** | One purchase of a passive. The count drives both its price and its cap. | `run:passiveCost`, `maxStacks` |
| **Sandbox** | A run with `sandbox` set: no wave spawning, no wave clock, no win or lose timer. Everything else behaves exactly as in a real run. Backs the zoo and the range. | `run.sandbox`, `games/horde-survivor/sandbox.lua` |
| **Pause menu** | The pause screen, which doubles as the level picker: resume, the run, the zoo, the range. `P`. An editor-induced freeze shows only the word PAUSED instead, so the panel being worked in is not covered. | `drawPauseMenu` in `game.lua` |
| **Zoo** | The inspection level with one cage per enemy. `F5`. | `sandbox.new("zoo")` |
| **Range** | The inspection level with one room per weapon. `F6`. | `sandbox.new("range")` |
| **Room** / **Cage** | One cell of a sandbox level's grid. A room is live only while the player is standing in it. | `sandbox.rooms`, `roomAt` |
| **Specimen** | The still sprite shown in an idle room, so you can see what lives there without walking in. Hidden once the room goes live. | `sandbox.draw` |
| **Placard** | The stats panel for a sandbox room. Appears when you stand within `sandbox.previewRange` of a room and hides once you step inside, where the room itself is the information. Its stats are the live schema settings, drawn with the editor's own widgets, so a room is tuned from the corridor and tested by walking in. | `sandbox.preview`, `editor.drawSetting` |
| **Invulnerable** | A standing immunity, as the sandbox levels grant. Distinct from the brief post-hit window the player blinks through: a permanent state must not blink, or the flicker reads as a fault. | `player.invulnerable` vs `player.iframe` |
| **Underlay** | An optional world-space layer drawn between the background and the entities. The sandbox rooms use it. | `render.underlay` |
| **Seeded rng** | The run's own generator, so a given seed reproduces a run exactly in both tests and the game. Deliberately not `math.random`. | `makeRng` in `run.lua` |

## Modular Weapon System

The revised design is in [Modular Weapon System v2.0](Modular_Weapon_System.md).
The graph runtime still implements the earlier ShmupRouge specification, with
the new input boundary integrated. New Trigger primitives are available separately;
see [implementation status](MWS_Implementation.md). The two vocabularies are
separated below so design changes are not mistaken for shipped behavior.

### Revised design (partially implemented)

| Term | Meaning |
|---|---|
| **Module class** | A role: Trigger, Battery, Barrel, Striker, or Payload. |
| **Emitter (retired)** | An earlier module whose use cases are now expressed through sequences. The revised design has no separate Emitter module or special fire-and-forget execution path. |
| **Module subclass** | A particular behavior within a class, such as Repeater Trigger or Sweep Striker. |
| **Module instance** | A configured module placed in a graph, with runtime state separate from its configuration. Acquisition and editing rules depend on the game/tool mode. |
| **Sequence** | A graph subsection requiring a Trigger, Battery, and Striker; Barrels and Payloads are optional. A Striker-to-Trigger connection starts the next sequence. |
| **Sequence rail** | One shared energy reservoir for a sequence. All its batteries contribute additively regardless of position or branch. No energy crosses sequence boundaries. |
| **Capacity (C)** | The maximum energy a reservoir can hold, not its current contents. |
| **Fill rate (R)** | Energy replenished per second while allowed by the battery subclass. |
| **Stored energy (E)** | The reservoir's current spendable energy, between zero and capacity. |
| **Battery tier** | Trash, common, rare, legendary, or celestial; affects both capacity and fill rate. Numerical scaling is open. |
| **Application input layer** | Owns devices, bindings, repeats, and between-tick timing above the weapon adapter. Multiple presses between ticks register one press; no replay backlog is created. |
| **Weapon input adapter** | Converts normalized events such as `FIRE_BUTTON_DOWN` and `FIRE_BUTTON_UP` into firing signal state; does not handle raw devices or buffer input history. |
| **Input bitstream** | One bit per simulation tick. Application signals come through the input adapter; Hit/Miss/Complete Triggers convert upstream striker events into signals. |
| **Inverter Trigger** | Boolean NOT. Two inverters restore their input; idle zero input becomes constant-hot output. |
| **Single Trigger** | One hot tick on each 0→1 input transition; cold input rearms it. Previous input starts cold. |
| **Toggle Trigger** | Starts cold and flips output on each 0→1 input transition; release leaves its output unchanged. |
| **Delay Trigger** | Echoes the entire input pattern after a configured delay, including releases. Pending output cannot be cancelled. Replaces the Timer Trigger, not the Timer Battery. |
| **Repeater Trigger** | Pulses immediately while input is hot, with configurable pulse width and faster repetition at higher tiers. Cold input resets the pattern. |
| **Proximity Trigger** | Stays hot while enemies are present inside the sequence's AOE. |
| **Hit Trigger** | Converts qualifying Hit events into signals for a subsequent sequence. |
| **Hot / cold** | Trigger output 1 / 0. A hot output can start a new strike whenever startup energy is available, including after exhaustion and refill. |
| **DOI** | Direction of input. Barrels transform and route it in order. Without a Barrel, firing direction is random and ignores it. |
| **Startup cost** | Energy required to start one strike. Above capacity it can never start; above current stored energy the firing opportunity is skipped. |
| **Exhaustion** | Inability to fund a required continuing cost; ends an active strike. Subsequent firing creates a fresh strike rather than resuming it. |
| **Hit** | An event for a qualifying contact during a strike, with accumulated hit count. Counting rules for sustained AOE remain open. |
| **Complete** | One final event when an actual strike ends, including through energy exhaustion; carries final hit count. A skipped start has no completion event. |
| **Miss Trigger** | Activates on Complete only when `hitCount == 0`; not an unhandled-event fallback. |
| **Complete Trigger** | Activates on every Complete event regardless of hit count. |
| **Impact / AOE** | Broad behaviors: point damage / damage over time within an area. Not extra module classes. |

### Current implementation (earlier model)

The following terms describe the code as it exists, including differences from
the original ShmupRouge specification. In particular, Segment, Rail, Strike cost,
and Chain trigger below must not be used as definitions for the revised design.

| Term | Meaning | Code |
|---|---|---|
| **MWS** | The Modular Weapon System: a weapon is a directed graph of modules rather than a stat block. Framework-level and game-agnostic — it decides *what* should happen and hands finished strikes to a host game to simulate. | `shared/framework/mws/` |
| **Module** | One node. Seven types, each doing one job: BATTERY supplies energy, TRIGGER starts strikes, REPEATER turns a window into a cadence, BARREL aims and branches, STRIKER simulates the strike, PAYLOAD applies damage and effects, EMITTER throws untracked particles. | `mws.modules.types` |
| **Module spec** | The declaration of a module type and its properties. Plays the part the schema plays for settings: the inspector, the node defaults and the graph JSON are all generated from it. A graph has variable topology, so its properties *cannot* be schema keys — this is the one place settings legitimately live outside the schema. | `shared/framework/mws/modules.lua` |
| **Graph** | A forest of single-input nodes. Every module takes events from exactly one upstream connection; BARREL alone has more than one downstream port. Unique parentage is what makes "which projectile am I attached to" have one answer. | `shared/framework/mws/graph.lua` |
| **Port** | One downstream connection on a node. The canvas always shows one more than are wired, so there is somewhere to drag a new branch from. | `node.outputs`, `visiblePorts` |
| **Event** | What flows through the graph: `start`, `stop`, `hit`, `miss`. A module forwards, modifies, consumes, or emits them. | `dispatch` in `runtime.lua` |
| **Strike state** | The data a Start carries — trajectory, motion, damage, lifetime. Created fresh by TRIGGER, cloned at every BARREL branch, read by the host when it builds the strike. Configuration, not live simulation data. | `runtime.newState` |
| **Strike** | One live instance in the world. The runtime creates it and the host game moves it and collides it; the host calls back with `hit` and `expire`. | `run.strikes`, `run:updateStrikes` |
| **Domain** | Which parent supplies position to a context: `weapon` (the wielder), `inflight` (a detached projectile), `post` (an impact point). | `info.domain` |
| **Context** | A domain plus its parent. A STRIKER launching a detaching strike opens a child context parented to the strike, so a REPEATER below it fires from the moving projectile without knowing that is what it is doing. Recursion falls out of this. | `newContext` in `runtime.lua` |
| **Subgraph** | What hangs below a STRIKER: the strike's own modules, updated with the strike as parent. | `strike.subCtx` |
| **Segment** | A stretch of graph with no branch in it, and the unit energy is measured over. A battery powers its whole segment — above it as well as below — because every example in the specification wires TRIGGER → BATTERY. What a battery cannot cross is a branch. | `segment` in `graph.lua` |
| **Rail** | The energy per second reaching a node: the batteries on its segment, plus what it inherited, divided at every barrel branch above it. | `info.rail` |
| **Strike cost** | What one strike started at a node costs: every module below it, precomputed. A BARREL routing `all` pays for every barrel; `round_robin` pays for the average one, because one event only takes one of them. | `strikeCost`, `mws.cost.<type>` |
| **Stall** | A trigger or repeater wanting to fire and not being able to pay. The balancing mechanism working, not a fault. | `runtime.stalled` |
| **Routing** | How a BARREL distributes one event: `round_robin` fires one barrel and advances, `all` fires every barrel at once. An extension — the specification says round-robin only, which cannot express a shotgun. | `barrel.routing` |
| **Aim mode** | Where a BARREL's heading comes from — `nearest`, `heading`, `random`, `fixed`. An extension: the specification assumes a player aiming a shmup, and this game's weapons fire themselves. | `barrel.aimMode` |
| **Chain trigger** | A TRIGGER with an `on_hit`, `on_miss`, `on_start` or `on_stop` condition, which starts a follow-up strike where the last one landed. It reacts only to a Start the PAYLOAD raised — a STRIKER also sends Start down its subgraph at launch, and reacting to that detonates a cluster bomb in the barrel. | `event.fromPayload` |
| **Weapon graph** | One saved weapon. The built-in is Lua; an edited one is written to `config/weapons/<id>.json` and overrides it, the same bargain a profile makes with the schema. Revert throws the override away. | `games/horde-survivor/weapongraphs.lua`, `arsenal.load` |
| **Arsenal** | The game's side of MWS: the extra module properties this game needs (crit, knockback, pierce), graph loading and saving, and the host adapter. The seam between the specification and the game. | `games/horde-survivor/arsenal.lua` |
| **Host** | What the runtime calls into: `wielder`, `aim`, `spawn`, `payload`, `effect`, `emit`. The whole contract between a graph and a game. | `arsenal.host` |
| **Modifier** | The hook through which weapon level and player bonuses reach a graph, read per property. The graph itself is never rewritten, so the bench edits the same table the run is firing. | `arsenal.modifier`, `runtime:prop` |
| **Bench** | The inspection level for weapon graphs. `F8`. The player fires in an arena across the top; the graph is a flowchart underneath, edited live. | `games/horde-survivor/bench.lua` |
| **Tile** | One module on the canvas: 48px, an icon and a three-letter tag. Its numbers are in the inspector, because a module's properties on its box make a six-module weapon wider than any panel it must fit in. | `flowchart.NODE` |

## Tooling

| Term | Meaning | Code |
|---|---|---|
| **Headless** | Running simulation or tests with no LÖVE window, under a Lua 5.1-compatible interpreter. Use `luajit`: Homebrew dropped `lua@5.1`, and LuaJIT is the VM LÖVE itself runs. | `tools/test.lua` |
| **Sim suite** | Headless driver that plays runs to completion for balance checking. | `tools/simsuite.lua` |
| **Balance harness** | Batch runner over the sim suite, reporting aggregate outcomes across many runs and, by default, across a bubble sweep. | `tools/balance.lua --runs N` |
| **Pilot** | The scripted player the sim suite drives. Kites rather than flees: it repels only from enemies inside its bubble, so it circles a group while its weapons work. Competent, not optimal. | `pilot` in `tools/simsuite.lua` |
| **Bubble** | The pilot's personal-space radius in pixels. Survival time, weapon damage share and even which enemy is the top threat all move with it, so a single-bubble reading measures the pilot as much as the game. | `sim.defaultBubble`, `--bubble N` |
| **Sweep** | Running the harness at several bubbles and reading the spread rather than one number. The default. A change that moves only one row has not moved the balance. | `SWEEP` in `tools/balance.lua` |

## Workflow

| Term | Meaning | Code |
|---|---|---|
| **Integration branch** | `main`. The stable base every worktree branches from and every change merges back into. | — |
| **Worktree** | An additional checkout for parallel work, created as a *sibling* of the repo — never inside it, since `love .` treats the whole directory tree as the game source. | `tools/worktree.sh` |
| **Save identity** | The LÖVE save-directory name. Derived from the checkout's directory name rather than fixed, so parallel worktrees do not share one screenshot folder and overwrite each other's captures. Captures normally land in the checkout instead; this is the fallback when that write fails. | `conf.lua`, `t.identity`, `fs.write` |
