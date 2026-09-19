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
| **Startup profile** | The profile marked in the index to load at launch, as distinct from the one currently loaded (`active`). | `profiles.startup`, `profiles.active`, `config/profiles/_index.json` |
| **Orphan** | A key present in a loaded profile but absent from the schema — usually a setting deleted since the profile was saved. Pruned on next save. | `profiles.orphans`, `profiles.pruneOrphans` |
| **Layer** | One debug-draw overlay (colliders, ranges, spawn rings…). Registered as an ordinary bool setting on the Overlays page, so it appears in the editor and saves into profiles through the same mechanism as everything else. | `dd.register`, `dd.layers` |
| **Master switch** | The single toggle gating all debug overlays at once, regardless of individual layer state. `F4`. | `dd.master` |
| **Action** | A named input intent (rather than a raw key or button), so keyboard and gamepad feed one path. Consumed once per frame. | `input.press`, `input.consume` |
| **Letterbox** | The integer-scaled centring of the fixed-size render canvas within the window. Integer-only: a fractional scale makes pixel art shimmer. | `recomputeLetterbox` in `main.lua` |
| **Canvas** | The fixed-size offscreen render target sized by `render.width`/`render.height`, drawn letterboxed into the window. | `rebuildCanvas` in `main.lua` |
| **Launcher** | `main.lua`. Owns boot order: schema → `config.build` → `profiles.init` → game. | `main.lua`, `love.load` |

## horde-survivor

| Term | Meaning | Code |
|---|---|---|
| **Run** | One playthrough attempt, from start to death or win. Holds the whole simulation and contains no draw calls or direct input reads, so it can run headless. | `games/horde-survivor/run.lua` |
| **Run state** | Which phase a run is in: `playing`, `shop`, `dead`, `won`. | `run.STATE` |
| **Wave** | The unit of escalation. Drives enemy composition and what content is unlocked. | `content.waveTable`, `content.unlockedAt` |
| **Enemy** / **Weapon** | Content definitions declared as data tables with typed field specs, looked up by id. | `content.enemies`, `content.weapons`, `content.enemyById`, `content.weaponById` |
| **Behaviour** | An enemy's movement/attack pattern, declared as a field on the enemy definition. | `content.behaviourFields` |
| **LP** | The levelling currency dropped by kills — this game's XP. Spent on nothing; it accrues toward the next level. Distinct from gold. | `run.player.lp`, `level.baseRequirement`, `scale.lpPerWave` |
| **Gold** | The shop currency, earned per wave cleared and from drops. Spent on weapons, upgrades and rerolls. | `run:addGold`, `player.goldFind`, `economy.*` |
| **Pickup** | A dropped item on the ground, tagged by `kind` (`lp`, `gold`, `heal`). Flies to the player inside the pickup radius; gold and health expire, LP never does. | `pk.kind` in `run.lua` |
| **Elite** | A rolled-up enemy variant: more HP, larger radius, bigger reward. Rolled per spawn against `scale.eliteChance`. | `enemy.elite`, `scale.eliteHpMult`, `scale.eliteRewardMult` |
| **Shop item** | An offer in the shop, tagged by `kind` (`weapon`, `upgrade`, `heal`). Rerollable for gold. | `kind` in `run.lua:325`, `shop.rerollCost` |
| **Seeded rng** | The run's own generator, so a given seed reproduces a run exactly in both tests and the game. Deliberately not `math.random`. | `makeRng` in `run.lua` |

## Tooling

| Term | Meaning | Code |
|---|---|---|
| **Headless** | Running simulation or tests with no LÖVE window, under plain Lua 5.1. | `tools/test.lua` |
| **Sim suite** | Headless driver that plays runs to completion for balance checking. | `tools/simsuite.lua` |
| **Balance harness** | Batch runner over the sim suite, reporting aggregate outcomes across many runs. | `tools/balance.lua --runs N` |
