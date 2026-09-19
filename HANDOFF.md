# Handoff

Context from the session that built this, for whoever picks it up next.
`README.md` covers how the thing works; this covers *why it is the way it is*,
what is unverified, and what is still open.

## Getting set up from nothing

The work is on the branch `claude/dreamy-euler-0kgm7h`, not on `main`.

```bash
# 1. LÖVE 11.x
brew install --cask love                  # macOS
winget install LoveDevelopers.LOVE        # Windows
sudo apt install love                     # Debian/Ubuntu

# 2. the code
git clone https://github.com/CheechLizard/game-dev-playground.git
cd game-dev-playground
git checkout claude/dreamy-euler-0kgm7h

# 3. run it, from the repo root
love .
```

On macOS the cask does not always put `love` on PATH; it lives at
`/Applications/love.app/Contents/MacOS/love`.

Launching as `love .` from the repo root is not stylistic. The shared framework
resolves against the root, and profile saves are written back into
`config/profiles/` so they land in git rather than in an app-support directory.
`love games/horde-survivor` will fail.

A Lua 5.1-compatible interpreter is optional but useful — it runs the tests and
the balance harness with no display. Homebrew dropped the `lua@5.1` formula, so
use LuaJIT, which is 5.1-compatible and is the VM LÖVE itself runs:

```bash
brew install luajit
luajit tools/test.lua        # 98 tests, ~5s
luajit tools/balance.lua --runs 5
```

## Do this first

**Nothing here has ever been rendered.** It was built in a cloud container with
no display. The simulation is covered by 96 passing headless tests; every line
of drawing code — editor UI, HUD, shop, summary, sprites, overlays — has never
executed.

```bash
love .          # from the repo root, not from games/horde-survivor
```

Expect first-launch breakage in the draw path. Likely suspects, roughly in
order:

- `shared/framework/ui.lua` — the scroll region translates the canvas and
  offsets the mouse to match (`beginScroll`/`endScroll`). If clicks land on the
  wrong widget, or widgets are unclickable after scrolling, that pairing is why.
- `shared/framework/editor.lua` — buttons that share a row rewind the layout
  cursor by hand (`opts.x`/`opts.y` in `ui.button`). Overlapping or stacked
  controls on the Profiles page point here.
- `games/horde-survivor/render.lua` — camera translate plus integer scaling.
  Pixel shimmer or a half-pixel jitter means the `math.floor` on the camera
  translate is not matching the canvas scale.
- `love.graphics.captureScreenshot` and canvases behave differently under
  software GL; that is a container problem, not a code problem.

## Decisions already made

Settled during the design conversation. Changing them is fine, but they were
deliberate, not defaults:

| Decision | Why |
|---|---|
| Love2D, not Godot | Full control over the editor/overlay/profile framework; Godot's own editor would half-duplicate it |
| Auto stat bump on level-up, no pick-1-of-3 | The player's choices all live in the shop (Brotato-like, not Vampire-Survivors-like) |
| **Enemies scale on wave index, never player level** | Scaling to player level makes ignoring LP optimal, which fights the core loop. Available behind `scale.playerLevelWeight`, default `0` |
| Profiles store diffs, not snapshots | New settings inherit defaults; old profiles never break |
| Profiles live in the repo as JSON | Diffable, committable, shareable. Requires launching from the repo root |
| 60s waves, ~2.5s spawn pulses | A wave is a block of spawning, not a single spawn. 15 waves, 5 shop visits per run |

## The one invariant that matters

**The schema is the only list of settings.** The editor has no independent
knowledge of what exists — pages, sections and controls are generated from it,
and profiles serialise against it. This is what makes "delete a setting from the
code and it disappears from the editor" true by construction rather than by
discipline.

Two rules follow, and breaking either quietly undoes the property:

1. **Values go in `settings.lua`. Actions go in `editor.action`.** A setting
   registered anywhere else (this already happened once — the `debug.*` keys
   were briefly registered in `game.lua`) exists in the game but not in headless
   runs, and profiles referencing it get flagged as stale.
2. **`run.lua` must stay free of `love.graphics` and must not read input.** It
   takes a movement vector. That is the only reason the balance harness can
   simulate full runs, and it is easy to break with one convenient `love.` call.

## Balance state

Measured with a scripted pilot: runs reach **wave 7-9 of 15**, occasional full
survivals. Playable, not balanced.

Three structural problems were found and fixed via `tools/balance.lua`, worth
knowing because they can be reintroduced:

1. Enemy shots had a hardcoded 5s lifetime — Spitters sniped from four times
   their own engagement range. Now `shotLife`, a tunable.
2. Gold income was ~90 per run against a shop that needs to fund 25-35
   purchases, since all progression choice lives there.
3. **Enemy HP outgrew player damage**, so kill rate fell every wave while spawn
   rate climbed 16×. By wave 15 the horde arrived 27× faster than it could be
   cleared. This is the failure mode to watch: keep `scale.hpPerWave` below the
   rate player damage grows, and re-check both the Waves and Economy pages after
   touching either.

### Still open

- **The Blaster does ~85% of all damage** in every configuration tested. It
  starts equipped, is always in range, and has the cheapest upgrades. Either the
  alternatives need to be more attractive or it needs to fall off.
- **Static Field contributes <4%.** Area damage should be the late-game horde
  answer and currently is not.

### On the balance harness

`tools/balance.lua --bubble N` sets how much personal space the scripted pilot
keeps. It swings results a lot — during tuning, two bubble values produced
opposite conclusions about the same build. **Sweep it before trusting any
verdict.** A result that only holds at one bubble size is a fact about the bot,
not the game. The pilot is a crude approximation of a player and should never be
the last word on whether something is fun.

## Questions never answered

Defaulted during the build. All are editor dials now, so changing them is a
slider, not a refactor:

- Weapon slot count → **6**
- Contact damage model → **one hit + 0.5s i-frames**, not continuous DPS
- Palette → three foreground colours on `#0b0c14`, all editable under Render
- Internal resolution → **384×216**, integer-scaled
- Arena → **bounded 1200×900**, not infinite scroll
- Meta-progression → **none**; gold is run-only

Other things raised but deferred: enemy archetype count for v1 (six exist), a
boss at 15:00 (currently surviving to the timer just wins), and damage numbers
(built, off by default).

## Suggested next moves

1. Run it. Fix whatever the draw code does on first contact with a GPU.
2. Play three runs before touching a single number. The sim says wave 7-9; a
   human will find something different, and that difference is the real signal.
3. Then go at the Blaster dominance — it is the clearest content problem and the
   one most likely to make the shop feel meaningful.
