// Toy helpers. Zones are stage rectangles; headings use screen angles (y down).
var PLC_ZONES = [
  { name: "FREE_ROAM", heading: "free", x: 116, y: 30, w: 86, h: 150 },
  { name: "CORRIDOR", heading: "E", x: 202, y: 70, w: 110, h: 70 },
  { name: "BOSS_ARENA", heading: "N", x: 312, y: 30, w: 70, h: 150 },
];
var PLC_ANG = { N: -Math.PI / 2, E: 0 };
function plcInit(S) {
  S.t = 0; S.x = 140; S.y = 105; S.vx = 0; S.vy = 0; S.face = 0; S.play = "FREE_ROAM"; S.head = "free"; S.ctx = "Gameplay"; S.over = false;
  S.parts = []; S.ptr = null; S.zone = "FREE_ROAM"; S.note = ""; S.noteT = 0; S.deaths = 0; S.respawnT = 0;
}
function plcKill(S, kit) {
  if (S.over || S.respawnT > 0) return;
  for (let i = 0; i < 24; i++) { const a = kit.rand.range(0, 6.283), v = kit.rand.range(20, 70); S.parts.push({ x: S.x, y: S.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, l: 1 }); }
  S.deaths++;
  if (S.ctx === "Gameplay") { S.ctx = "GameOver"; S.over = true; }
  else { S.respawnT = 0.8; S.note = "death ignored: context is " + S.ctx; S.noteT = 2; }
}

Wiki.construct({
  id: "play-contexts",
  name: "Play contexts and game contexts",
  family: "structure",
  origin: "shmuprouge",
  status: "partial",
  statusNote: "The Context Router and its Gameplay / Cinematic / GameOver / Edit contexts are built and in use. Play Context is half-wired: movement reads its heading every frame, but nothing calls <code>PlayContext.set</code>, and no level JSON names a preset, so the ship is always in FreeRoam.",
  summary: "Two scopes of 'what mode are we in': a game context decides which loop runs and whether death counts, and a play context, owned by the level section, decides how the ship is steered there.",
  tags: ["architecture", "state machine", "control", "cinematic", "configuration scope"],

  intent:
    "<p>A shmup roguelike changes its rules between sections. The open arena is free flight; a corridor reads better if the ship always faces the way it scrolls; a boss arena might lock the ship facing up. Writing those as checks inside movement code couples every section to every system. A play context moves the decision to the level: the section says &quot;CORRIDOR&quot; and movement reads the answer.</p>" +
    "<p>Game contexts solve a related problem one level up. A scripted sequence may need to kill the player (the [[possession-leash]]) without the death ending the run, while still running the real simulation. A context that keeps the game loop but suppresses Game Over gives the story a free death without a separate simulation.</p>",

  how:
    "<h3>Game contexts: the Context Router</h3>" +
    "<p><code>engine/context_router</code>: <code>register(name, ctx)</code>; <code>setContext(name)</code> calls the old context's <code>onExit</code>, swaps <code>love.update</code> and <code>love.draw</code> if the new one provides them, then calls <code>onEnter</code>. <code>core/contexts.lua</code> registers four, by string name:</p>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>Context</th><th>Update (core/dispatch.lua)</th><th>Death</th></tr></thead><tbody>" +
    "<tr><td>Gameplay</td><td>full game loop</td><td>opens GameOver</td></tr>" +
    "<tr><td>Cinematic</td><td>full game loop</td><td>ignored</td></tr>" +
    "<tr><td>GameOver</td><td>game-over UI only</td><td>&mdash;</td></tr>" +
    "<tr><td>Edit</td><td>editor; terrain sim only if enabled</td><td>&mdash;</td></tr>" +
    "</tbody></table></div>" +
    "<p>The three game contexts are draw-only; one dispatcher owns update and branches on the context name. The death rule is one line in <code>core/init.lua</code>: on player death, open Game Over <em>only if</em> <code>getContext() == \"Gameplay\"</code>. The possession objective switches to Cinematic on start and back to Gameplay at the end.</p>" +
    "<h3>Play context</h3>" +
    "<p><code>game/play_context.lua</code> holds one current record. Presets: <code>FreeRoam {headingMode = \"free\"}</code>, <code>Corridor {\"E\"}</code>, <code>BossArena {\"N\"}</code>, with a <code>byName</code> table (<code>FREE_ROAM</code>, <code>CORRIDOR</code>, <code>BOSS_ARENA</code>) for JSON. The default is FreeRoam.</p>" +
    "<p>Readers: <code>DirectMovement</code> and <code>ThrustMovement</code> call <code>getHeadingMode()</code> each frame; when it is not <code>\"free\"</code> they set <code>facing.controlAngle</code> to the fixed angle (N, NE, E ... NW are all defined) and skip steering, while velocity stays free. <code>getControlMode()</code> does not come from the preset at all: it is delegated to the player's settings (direct or thrust).</p>" +
    "<p>Nobody writes it. The only <code>PlayContext.set</code> is its definition, and no level file has a <code>playContext</code> key.</p>" +
    "<h3>Where the docs differ</h3>" +
    "<p><code>docs/systems/PlayContext.md</code> gives each preset a <code>controlMode</code> and the path <code>gameplay.PlayContext</code>; code has neither. <code>docs/systems/GameContexts.md</code> describes object contexts with a <code>Menu</code> context for game over and pause; code uses string names, GameOver and Edit, and the pause menu is a check in the dispatcher, not a context.</p>",

  knobs: [
    ["Heading presets", "free / E / N", "Ship facing per section", "PlayContext.FreeRoam / Corridor / BossArena"],
    ["Heading angles", "N -90°, E 0°, ... NW -135°", "Fixed facing when locked", "CARDINAL_ANGLES (direct.lua, thrust.lua)"],
    ["Control mode", "player setting", "Direct or thrust steering; not part of the preset", "playerSettings:getControlMode()"],
    ["Contexts", "Gameplay, Cinematic, GameOver, Edit", "Which loop runs and whether death counts", "core/contexts.lua"],
  ],

  related: [
    { id: "possession-leash", how: "The scripted death that the Cinematic context makes free." },
    { id: "ship-control", how: "Direct and thrust movement, the readers of the heading mode." },
    { id: "mission-system", how: "The cinematic objective type that switches context." },
    { id: "level-loop", how: "Corridor and boss arena are the sections the presets were made for." },
    { id: "corridor-spine", how: "The corridor stage that would set CORRIDOR." },
  ],

  questions: [
    "Who should call PlayContext.set: the level on load, a zone on entry, or the stage sequencer (L6) that does not exist yet?",
    "Should a preset carry control mode again (as the doc says), or is steering always the player's choice?",
    "Do contexts need a stack, so a cinematic during a boss fight returns to the boss preset rather than to a default?",
  ],

  sparks: [
    "Per-zone contexts: entering a ring zone locks heading to the tangent, so a belt flies like a racetrack.",
    "A rehearsal context: damage is shown but not applied, for a practice run of a boss pattern inside the real game.",
    "Contexts that change more than heading: weapon slots, camera framing, or which enemies may spawn.",
    "A bullet-time context that wraps the same update with a scaled dt, so slow motion needs no system to know about it.",
  ],

  terms: [
    { term: "Game context", def: "A named route for update and draw; decides which loop runs.", code: "ContextRouter, core/contexts.lua" },
    { term: "Cinematic context", def: "Full game loop with the death-to-Game-Over rule suppressed.", code: "\"Cinematic\"" },
    { term: "Play context", def: "The current section's control preset, read by movement.", code: "game/play_context.lua PlayContext" },
    { term: "Heading mode", def: "free, or a fixed compass facing.", code: "PlayContext.getHeadingMode()" },
    { term: "Preset", def: "A named play context record.", code: "PlayContext.byName" },
  ],

  sources: [
    "shmuprouge:engine/context_router/init.lua",
    "shmuprouge:core/contexts.lua",
    "shmuprouge:core/dispatch.lua",
    "shmuprouge:core/init.lua",
    "shmuprouge:game/play_context.lua",
    "shmuprouge:game/systems/movement/direct.lua",
    "shmuprouge:docs/systems/PlayContext.md",
    "shmuprouge:docs/systems/GameContexts.md",
  ],

  toy: {
    title: "Two kinds of context",
    hint: "hold to steer; try killing the ship in each context",
    caption: "Zones calling PlayContext.set is the proposed wiring; switch it off to see the game as built, where the ship is FreeRoam everywhere. In a locked heading the nose is fixed but the ship still moves in any direction, as in DirectMovement.",
    w: 384, h: 216,
    controls: [
      { type: "toggle", key: "wire", label: "zones call PlayContext.set (not built)", value: true },
      { type: "select", key: "ctx", label: "context to run in", value: "Gameplay", options: [["Gameplay", "Gameplay"], ["Cinematic", "Cinematic"]] },
      { type: "button", label: "kill ship", press(S, P, kit) { plcKill(S, kit); } },
      { type: "button", label: "restart", press(S) { plcInit(S); } },
    ],
    init(S) { plcInit(S); },
    change(key, S, P) { if (key === "ctx" && !S.over) S.ctx = P.ctx; },
    pointer(e, S, P) {
      if (S.over && e.type === "down") { S.over = false; S.ctx = P.ctx; plcInit(S); S.ctx = P.ctx; return; }
      S.ptr = e.down ? { x: e.x, y: e.y } : null;
    },
    update(S, P, dt, kit) {
      S.t += dt; S.noteT -= dt;
      if (!S.over) S.ctx = P.ctx;
      for (const p of S.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.l -= dt; }
      S.parts = S.parts.filter((p) => p.l > 0);
      if (S.over) return; // GameOver: only the game-over UI updates
      if (S.respawnT > 0) { S.respawnT -= dt; if (S.respawnT <= 0) { S.x = 140; S.y = 105; S.vx = S.vy = 0; } return; }
      let tx, ty;
      if (S.ptr) { tx = S.ptr.x; ty = S.ptr.y; }
      else { const a = S.t * 0.5; tx = 247 + Math.cos(a) * 118; ty = 105 + Math.sin(a * 2) * 50; }
      const d = Math.hypot(tx - S.x, ty - S.y) || 1, sp = Math.min(80, d * 2.5);
      S.vx += ((tx - S.x) / d * sp - S.vx) * 4 * dt; S.vy += ((ty - S.y) / d * sp - S.vy) * 4 * dt;
      S.x = kit.clamp(S.x + S.vx * dt, 118, 380); S.y = kit.clamp(S.y + S.vy * dt, 4, 212);
      S.zone = "FREE_ROAM";
      for (const z of PLC_ZONES) if (S.x >= z.x && S.x < z.x + z.w && S.y >= z.y && S.y < z.y + z.h) S.zone = z.name;
      if (P.wire) S.play = S.zone; else S.play = "FREE_ROAM";
      S.head = PLC_ZONES.find((z) => z.name === S.play).heading;
      if (S.head !== "free") S.face = PLC_ANG[S.head];
      else if (Math.hypot(S.vx, S.vy) > 3) {
        const want = Math.atan2(S.vy, S.vx); let df = want - S.face;
        while (df > Math.PI) df -= 2 * Math.PI; while (df < -Math.PI) df += 2 * Math.PI;
        S.face += Math.sign(df) * Math.min(Math.abs(df), 5 * dt);
      }
    },
    draw(g, S, P) {
      const C = g.C; g.clear();
      const col = { FREE_ROAM: C.accent, CORRIDOR: C.gold, BOSS_ARENA: C.enemy };
      for (const z of PLC_ZONES) {
        g.tone(z.x, z.y, z.w, z.h, S.zone === z.name ? 0.16 : 0.06, col[z.name]);
        g.rect(z.x, z.y, z.w, z.h, col[z.name], 1);
        g.label(z.name + "  " + z.heading, z.x + 3, z.y + z.h - 4, col[z.name]);
      }
      for (const p of S.parts) g.rect(p.x, p.y, 2, 2, C.gold);
      if (!S.over && S.respawnT <= 0) {
        const c = Math.cos(S.face), s = Math.sin(S.face);
        g.poly([[S.x + c * 7, S.y + s * 7], [S.x - c * 4 - s * 4, S.y - s * 4 + c * 4], [S.x - c * 4 + s * 4, S.y - s * 4 - c * 4]], C.ink);
        g.line(S.x, S.y, S.x + S.vx * 0.25, S.y + S.vy * 0.25, C.ink3, 1, [2, 2]);
      }
      // the play context record
      g.label("PlayContext.get()", 6, 48, C.ink3);
      g.label("{ headingMode = " + S.head + " }", 6, 60, C.ink);
      g.label(P.wire ? "set() by zone" : "set() never called", 6, 72, P.wire ? C.ink2 : C.enemy);
      // context state machine
      const nodes = [["Gameplay", 30, 120], ["Cinematic", 86, 120], ["GameOver", 30, 168], ["Edit", 86, 168]];
      g.arrow(30, 128, 30, 158, C.rule); g.arrow(56, 120, 62, 120, C.rule);
      for (const [n, x, y] of nodes) {
        const on = S.ctx === n;
        if (on) g.tone(x - 26, y - 8, 52, 14, 0.4, C.accent);
        g.rect(x - 26, y - 8, 52, 14, on ? C.accent : C.rule, 1);
        g.label(n, x, y + 2, on ? C.ink : C.ink3, "center");
      }
      g.label("death -> GameOver", 6, 192, C.ink3);
      g.label("only from Gameplay", 6, 202, C.ink3);
      if (S.noteT > 0) g.label(S.note, 250, 206, C.ink2, "center");
      if (S.over) {
        g.rect(150, 86, 200, 40, C.bg); g.rect(150, 86, 200, 40, C.enemy, 1);
        g.text("GAME OVER", 250, 102, { color: C.enemy, align: "center" });
        g.label("click to restart", 250, 116, C.ink3, "center");
      }
    },
    readout(S) { return "zone " + S.zone + "  heading " + S.head + "\ncontext " + S.ctx + "  deaths " + S.deaths; },
  },
});
