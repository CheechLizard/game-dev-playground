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
| **Role** | What calling code asks fonts for — `title`, `heading`, `body`, `small` — rather than naming a family and size. One setting then resizes every surface at once. | `fonts.role`, `shared/framework/fonts.lua` |
| **Family** | One pixel font file plus the design size its glyphs were drawn at. Requested sizes snap to a multiple of that step, or the stems break up. | `fonts.families`, `step` |
| **Launcher** | `main.lua`. Owns boot order: schema → `config.build` → `profiles.init` → game. | `main.lua`, `love.load` |

## horde-survivor

| Term | Meaning | Code |
|---|---|---|
| **Run** | One playthrough attempt, from start to death or win. Holds the whole simulation and contains no draw calls or direct input reads, so it can run headless. | `games/horde-survivor/run.lua` |
| **Run state** | Which phase a run is in: `playing`, `shop`, `dead`, `won`. | `run.STATE` |
| **Wave** | The unit of escalation, and a fixed block of time — **15 seconds** by default, not a batch of enemies you clear. Nothing but the clock advances it. Drives enemy composition, what content is unlocked, and the shop cadence. | `run.waveSeconds`, `content.waveTable`, `content.unlockedAt` |
| **Enemy** / **Weapon** | Content definitions declared as data tables with typed field specs, looked up by id. | `content.enemies`, `content.weapons`, `content.enemyById`, `content.weaponById` |
| **Behaviour** | An enemy's movement/attack pattern, declared as a field on the enemy definition. | `content.behaviourFields` |
| **LP** | The levelling currency dropped by kills — this game's XP. Spent on nothing; it accrues toward the next level. Distinct from gold. | `run.player.lp`, `level.baseRequirement`, `scale.lpPerWave` |
| **Gold** | The shop currency, earned per wave cleared and from drops. Spent on weapons, upgrades and rerolls. | `run:addGold`, `player.goldFind`, `economy.*` |
| **Pickup** | A dropped item on the ground, tagged by `kind` (`lp`, `gold`, `heal`). Flies to the player inside the pickup radius; gold and health expire, LP never does. | `pk.kind` in `run.lua` |
| **Elite** | A rolled-up enemy variant: more HP, larger radius, bigger reward. Rolled per spawn against `scale.eliteChance`. | `enemy.elite`, `scale.eliteHpMult`, `scale.eliteRewardMult` |
| **Shop item** | An offer in the shop, tagged by `kind` (`weapon`, `upgrade`, `heal`). Rerollable for gold. | `kind` in `run.lua:325`, `shop.rerollCost` |
| **Passive** | A repeatable stat upgrade sold in the shop, as opposed to a weapon. `stat` names a key in `player.bonus`, so a new one needs no new plumbing. Stacks, priced higher each time, capped. | `content.passives`, `run:addPassive`, `player.passives` |
| **Stack** | One purchase of a passive. The count drives both its price and its cap. | `run:passiveCost`, `maxStacks` |
| **Sandbox** | A run with `sandbox` set: no wave spawning, no wave clock, no win or lose timer. Everything else behaves exactly as in a real run. Backs the zoo and the range. | `run.sandbox`, `games/horde-survivor/sandbox.lua` |
| **Zoo** | The inspection level with one cage per enemy. `F5`. | `sandbox.new("zoo")` |
| **Range** | The inspection level with one room per weapon. `F6`. | `sandbox.new("range")` |
| **Room** / **Cage** | One cell of a sandbox level's grid. A room is live only while the player is standing in it. | `sandbox.rooms`, `roomAt` |
| **Specimen** | The still sprite shown in an idle room, so you can see what lives there without walking in. Hidden once the room goes live. | `sandbox.draw` |
| **Underlay** | An optional world-space layer drawn between the background and the entities. The sandbox rooms use it. | `render.underlay` |
| **Seeded rng** | The run's own generator, so a given seed reproduces a run exactly in both tests and the game. Deliberately not `math.random`. | `makeRng` in `run.lua` |

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
| **Save identity** | The LÖVE save-directory name. Derived from the checkout's directory name rather than fixed, so parallel worktrees do not share one screenshot folder and overwrite each other's captures. | `conf.lua`, `t.identity` |
