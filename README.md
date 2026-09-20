# game-dev-playground

A workspace for prototyping game ideas, with a shared framework that every game
here gets for free: an in-game editor, a performance overlay, debug-draw layers,
and config profiles.

```
love .                      # run the default game
love . --game horde-survivor
luajit tools/test.lua       # headless tests (no LÖVE needed)
luajit tools/balance.lua --runs 5
tools/capture.sh hud.png    # screenshot, no hands on the keyboard
```

Run from the repo root. That matters: config profiles are written back into
`config/profiles/` so they can be diffed and committed, which only works when
the working directory is the repo.

## Layout

```
main.lua               launcher: boots the framework, then the game
conf.lua               window and LÖVE module setup
shared/framework/      schema, config, profiles, editor, perf, debugdraw, ui, input, fonts
shared/assets/fonts/   pixel fonts used by every screen-space surface
shared/lib/            json, filesystem shim
games/horde-survivor/  the first game, plus the zoo and range levels
config/profiles/       saved config profiles (JSON, committed)
tools/                 headless tests, the balance harness, the worktree helper
```

## Keys

| Key | |
|---|---|
| `F1` | editor |
| `F2` | performance overlay |
| `F3` | collider overlay |
| `F4` | master switch for all debug overlays |
| `F5` | zoo — one cage per enemy |
| `F6` | range — one room per weapon |
| `F7` | screenshot to `captures/` |
| `WASD` / left stick | move |
| `P` / `start` | pause menu, which is also the level picker |
| `R` | restart run |
| `,` `.` | cycle: weapon in the zoo, enemy type on the range |
| `↑` `↓` / d-pad | move through the pause menu; `space` picks |

Firing is automatic. `F5` and `F6` toggle: press the same key again to go back
to the run.

No screen prints its own controls. The play surface stays clear, so the keys
live here rather than on top of the game.

## Screenshots

Nothing here is loaded from an image file; every pixel is drawn, and every
editor surface is generated from the schema. So "does this look right?" can
only be answered by looking — which is a problem for anyone working without a
screen in front of the game. `--capture` is the answer: it drives the game from
the command line and writes a PNG.

```
tools/capture.sh hud.png --at 8 --seed 7
tools/capture.sh editor.png --editor Debug
tools/capture.sh zoo.png --mode zoo --press next --press next
tools/capture.sh shop.png --do "+100 gold" --do "Open shop"
```

The run settles for a few frames so the window is real, fast-forwards the
simulation in fixed 1/60 steps, applies what the flags asked for, draws one
frame, writes the PNG and quits — under a second, even for a long warm-up.
Nothing else moves: the simulation is frozen except for the warm-up, so the
same command line produces a byte-identical PNG every time.

| Flag | |
|---|---|
| `--capture <path>` | where the PNG goes; a bare name lands in `captures/` |
| `--at <seconds>` | simulated seconds to fast-forward before the shot (default 2) |
| `--seed <n>` | pins the run and LÖVE's generator, making the shot reproducible |
| `--mode run\|zoo\|range` | which level |
| `--profile <name>` | load a config profile first |
| `--set <key>=<value>` | any schema key, repeatable |
| `--do "<label>"` | run an editor action by its label, repeatable |
| `--press <action>` | feed an input action — `pause`, `next`, `confirm`… — repeatable |
| `--editor [page]` | open the editor, optionally on a named page |
| `--overlays` / `--perf` | every debug overlay on / the perf panel on |
| `--hold` | leave the window open after the shot (for `love .` by hand) |

The flags deliberately bottom out in things that already exist — `--set` takes
any schema key, `--do` any registered editor action, `--press` any input
action — so there is no list of capturable states to keep in sync. A new
surface becomes capturable by being reachable through one of those, which in
practice means giving it an editor action.

A capture run writes nothing but its PNG: autosave is switched off, so `--set`
cannot dirty the active profile. `captures/` is git-ignored. If the draw path
errors, the error and its traceback go to stderr and the process exits
non-zero, rather than sitting on LÖVE's error screen until something kills it.

`F7` takes the same screenshot while playing, named by timestamp. It prints the
path; there is no on-screen confirmation, because the play surface stays clear.

## The zoo and the range

Two inspection levels, both built on the same room grid and both running the
ordinary simulation, so what you see is what a real run does.

**Zoo** (`F5`) gives every enemy a cage. Walk in and that enemy spawns and
fights you for real; walk out and the cage empties. `,` and `.` swap which
weapon you are holding, so you can see how each one handles a given enemy.

**Range** (`F6`) gives every weapon a room. Walk in and you are handed that
weapon and nothing else. `,` and `.` change which enemy spawns to shoot at.

Both show the live stats for whatever room you are in, read from the config —
so a number you change in the editor is reflected there immediately. The
`Levels` page in the editor has the same entrances plus the room settings.

## The shop

The shop lays out as a grid, eight offers by default, mixing weapons and
upgrades with **passives**: repeatable stat boosts (damage, attack speed, move
speed, max HP, area, pickup range, crit, gold find). Weapons alone cannot fill
a shop of any size — there are only as many weapon offers as there are weapons
— so passives are what make a larger shop a real choice rather than padding.
Each passive costs more the more you stack it, and caps out.

## The editor

`F1` opens a panel with a page per system. **Every page, section and control is
generated from the schema** — there is no second list of settings anywhere. Add
a setting to the schema and it appears; delete it and it disappears from the
editor *and* is pruned from saved profiles. That is the whole point of the
design: the editor cannot drift out of sync with the code, because it has no
independent knowledge of what exists.

Declare a setting in `games/<game>/settings.lua`:

```lua
schema.register{
  page = "Player", section = "Movement", order = 20,
  settings = {
    { key = "player.moveSpeed", label = "Move speed", type = "number",
      default = 82, min = 10, max = 400, unit = "px/s",
      help = "Shown under the control when Show help is on." },
  },
}
```

Read it in hot code through the nested tree, which costs two table lookups:

```lua
local speed = config.values.player.moveSpeed
```

Types are `number`, `int`, `bool`, `enum`, `color` and `string`. Numeric
settings must declare `min` and `max` — the schema refuses to register without
them, because the editor cannot draw a control for an unbounded number. Mark a
setting `live = false` if it only takes effect on a new run; the editor labels
it `*` and shows a "restart run to apply" banner.

**Content-derived settings.** Enemies and weapons are declared as data in
`content.lua`, and `settings.lua` walks that data to generate a settings section
per enemy and per weapon. Adding an enemy gives it a full editor section with no
extra work; deleting one takes its settings with it. The same generation drives
the per-enemy "Spawn 10 of these" debug buttons.

**Actions** are buttons rather than values, registered from game code because
they act on the live run:

```lua
editor.action{ page = "Debug", section = "Run", label = "Next wave now",
  fn = function() currentRun.waveTime = 1e9 end }
```

Values go in the schema. Actions go in `editor.action`. Keeping that split is
what keeps the IA clean.

## Config profiles

A profile is a named set of overrides in `config/profiles/<name>.json`. Profiles
store **only the difference from the schema defaults**, which has two
consequences worth relying on:

- adding a new setting never invalidates an existing profile — it inherits the
  new default;
- deleting a setting leaves a stale key, which the editor reports on the
  Profiles page with a **Prune** button.

`config/profiles/_index.json` records the profile order and which one loads at
launch. Set it from the editor's Profiles page with the `launch` button.

Shipped profiles: `default` (nothing overridden), `sandbox` (short invulnerable
run, all overlays on), `brutal` (steeper scaling, less gold).

## Overlays

Debug layers are registered with `debugdraw.register` and become bool settings
on the Overlays page, so they save into profiles like anything else. Guard hot
draw code on a single table lookup:

```lua
if dd.on.colliders then dd.circle("colliders", x, y, r) end
```

## Headless testing

`run.lua` contains no `love.graphics` calls and takes a movement vector rather
than reading input, so an entire run can be simulated with no window. That makes
balance measurable:

```
luajit tools/balance.lua --runs 8
luajit tools/balance.lua --profile brutal --runs 5
luajit tools/balance.lua --bubble 70       # how close the scripted pilot plays
luajit tools/balance.lua --csv out.csv
```

The pilot is a scripted approximation, not a good player. Its `--bubble`
parameter (how much personal space it keeps) swings results a lot, so **sweep it
before trusting any balance verdict** — a conclusion that only holds at one
bubble size is a fact about the bot, not about the game.

## The horde survivor

15-minute run, 15-second waves, shop every 2 waves. Enemies spawn off-screen in
pulses and advance on the player; contact costs HP. Kills drop LP, which the
player vacuums up to level, and levelling grants an automatic stat bump. Gold
buys weapons and upgrades in the shop.

**Enemies scale on wave index, not on player level.** This is deliberate:
scaling enemies to player level makes ignoring LP a viable strategy, which
fights the core loop of the genre. `scale.playerLevelWeight` (default `0`) turns
the other behaviour on if you want to feel it.

The difficulty model is a race between two rates, and it is easy to break:

- **spawn rate** grows through the run (`wave.countStart/End`, `wave.tickStart/End`)
- **kill rate** is player DPS divided by enemy HP

If enemy HP scales faster than player damage, kill rate *falls* every wave while
spawn rate climbs, and the run becomes unwinnable rather than hard. Keep
`scale.hpPerWave` below the rate player damage grows, and check both pages
together after changing either.

### Known balance state

Measured with the scripted pilot over several seeds and play styles: runs
currently reach **wave 54-60 of 60**, surviving the full run 58-92% of the
time depending on play style — the curve is too flat for a run with this many
shop visits and wants raising. It is a
playable starting point, not a balanced game — the numbers are all in the editor
and want a human playing them.

Open issues worth a look:

- **The Blaster does ~85% of all damage** in every configuration tested. It is
  the starting weapon, it is always in range, and its upgrades are the cheapest
  thing in the shop, so the greedy buyer never diversifies. Either the other
  weapons need to be more attractive or the Blaster needs to fall off.
- **Static Field barely contributes** (<4%). Area damage should be the horde
  answer late, and currently is not.
