// Toy helpers (top level so handlers can share them).
var MSN_CHAIN = [
  { id: "traveling", cond: "timer 8 s", done: "spawn_artifact" },
  { id: "investigate", cond: "near_artifact 200" },
  { id: "scan", cond: "hold 120 wu, 3 s" },
  { id: "retrieve", cond: "near_miners 200" },
  { id: "combat", cond: "enemies_dead", start: "spawn_squadron", done: "drop_harvester" },
  { id: "harvest", cond: "material_full" },
  { id: "return", cond: "near_artifact 150", done: "start_gate" },
  { id: "survive", cond: "timer 30 s", start: "waves / 5 s", msg: "THE GATE IS COMPLETE. ESCAPE." },
];
var MSN_WU = 8; // world units per stage pixel
function msnInit(S) {
  S.cur = 0; S.timer = 0; S.ship = { x: 150, y: 190, vx: 18, vy: -6 }; S.art = null; S.miners = { x: 352, y: 40 };
  S.enemies = []; S.dots = []; S.held = 0; S.scan = 0; S.wave = 0; S.msg = null; S.ended = false; S.shots = []; S.cd = 0; S.ptr = null; S.log = "";
}
function msnStart(S, kit) {
  const o = MSN_CHAIN[S.cur]; S.timer = 0;
  if (!o) return;
  if (o.id === "combat") msnSquad(S, kit, true);
  if (o.id === "survive") { S.wave = 0; msnSquad(S, kit, false); }
}
function msnSquad(S, kit, drone) {
  const a = kit.rand.range(0, Math.PI * 2), d = 500 / MSN_WU;
  const cx = kit.clamp(S.ship.x + Math.cos(a) * d, 125, 378), cy = kit.clamp(S.ship.y + Math.sin(a) * d, 10, 206);
  for (let i = 0; i < 3; i++) S.enemies.push({ x: cx + (i - 1) * 5, y: cy + Math.abs(i - 1) * 5, kind: "midge", hp: 1 });
  if (drone) S.enemies.push({ x: cx, y: cy - 14, kind: "drone", hp: 1 });
}
function msnComplete(S, kit) {
  const o = MSN_CHAIN[S.cur];
  if (o.done === "spawn_artifact") S.art = { x: 250, y: 100 };
  if (o.done === "drop_harvester") for (let i = 0; i < 5; i++) S.dots.push({ x: kit.rand.range(140, 370), y: kit.rand.range(20, 200) });
  S.log = o.done ? "on_complete: " + o.done : "";
  if (o.msg) { S.msg = o.msg; return; }
  S.cur++; msnStart(S, kit);
}

Wiki.construct({
  id: "mission-system",
  name: "Mission system: the objective chain",
  family: "structure",
  origin: "shmuprouge",
  status: "built",
  statusNote: "Built and running the whole Level 1 tutorial, but linear only: no branching <code>next</code>, no fail conditions, no multi-mission, and mission end is a TODO. Two beats are still special-cased by id in Lua.",
  summary: "A mission is a JSON list of objectives, each a condition to wait for plus actions to run on start and on completion; one generic processor walks the list every frame.",
  tags: ["scripting", "tutorial", "data-driven", "objectives", "state machine"],

  intent:
    "<p>The tutorial teaches one mechanic per beat, wrapped in story: fly, approach the artifact, scan it, get possessed, fetch the harvester, fight, harvest, come back, survive. Writing that as code would bury the pacing in conditionals. Writing it as data lets a designer read the level as a flowchart, reorder beats, retune a radius, and reuse the same condition and action vocabulary for the next mission.</p>" +
    "<p>It also paces the interface. UI appears only when earned: the minimap after possession, the material bar with the harvester, the gate progress during the hold-out.</p>",

  how:
    "<h3>The objective record</h3>" +
    "<p>Each entry in <code>shared/data/progression/Objectives.json</code> under <code>tutorial.objectives</code> has an <code>id</code>, an optional <code>name</code> (no name means a silent objective with no HUD line), <code>on_start</code> and <code>on_complete</code> action lists, a <code>complete_when</code> condition, an optional <code>message</code>, and <code>next</code>. Two fields the spec does not mention: <code>giveWeapon</code> hands a weapon on start, and <code>type: \"cinematic\"</code> hands the frame to the possession controller ([[possession-leash]]).</p>" +
    "<h3>The processor</h3>" +
    "<p><code>Processor.startObjective</code> zeroes <code>objectiveTimer</code>, gives the weapon, runs <code>on_start</code>. Each frame <code>update</code> adds dt and evaluates <code>Conditions[complete_when.type]</code>. <code>completeObjective</code> runs <code>on_complete</code>; if there is a <code>message</code>, it shows it and transitions only when the player dismisses it (a message gate), otherwise it starts <code>next</code> at once. No <code>next</code> ends the mission at a <code>-- TODO: Level complete</code>.</p>" +
    "<p>Conditions: <code>distance</code>, <code>near_artifact</code>, <code>near_miners</code>, <code>artifact_attacked</code>, <code>scan_complete</code>, <code>enemies_dead</code>, <code>harvester_picked_up</code>, <code>material_full</code>, <code>timer</code>, <code>cinematic_complete</code>, <code>never</code>. Actions spawn the artifact, squadron, miners and harvester, enable the minimap, start the gate and the waves.</p>" +
    "<h3>The tutorial chain as shipped</h3>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>id</th><th>complete_when</th><th>side effects</th></tr></thead><tbody>" +
    "<tr><td>traveling</td><td>timer 8 s</td><td>then <code>spawn_artifact</code></td></tr>" +
    "<tr><td>investigate</td><td>near_artifact 200</td><td>camera focus assist</td></tr>" +
    "<tr><td>destroy</td><td>artifact_attacked</td><td>gives bomb</td></tr>" +
    "<tr><td>scan</td><td>scan_complete</td><td>[[hold-to-scan]], 120 wu, 3 s</td></tr>" +
    "<tr><td>possession</td><td>cinematic</td><td>gives basic_gun; minimap, miners; checkpoint set</td></tr>" +
    "<tr><td>retrieve</td><td>near_miners 200</td><td>miners are a marker 3000 wu away</td></tr>" +
    "<tr><td>combat</td><td>enemies_dead</td><td>3 Midges in a vic at 500 wu; then drop harvester</td></tr>" +
    "<tr><td>acquire / harvest</td><td>harvester_picked_up / material_full</td><td>bar of 2500 ([[harvest-bar]])</td></tr>" +
    "<tr><td>return</td><td>near_artifact 150</td><td>then <code>start_gate</code></td></tr>" +
    "<tr><td>survive</td><td>timer 30 s</td><td>[[build-and-defend]]; message gate &quot;The gate is complete. Escape.&quot;</td></tr>" +
    "</tbody></table></div>" +
    "<h3>Where the data is not the whole story</h3>" +
    "<p><code>enemies_dead</code> is not generic: it returns <code>MidgeFactory.getAliveCount(world) == 0</code>, so any other enemy type alive is ignored. The scan and survive beats run extra Lua keyed by objective id in <code>Processor.updateSpecial</code>, and the cinematic sets the checkpoint to the hard-coded string <code>\"retrieve\"</code>. After that, any death restarts the chain at <em>retrieve</em>.</p>",

  knobs: [
    ["Traveling timer", "8 s", "Delay before the artifact appears", "Objectives.json traveling.complete_when.duration"],
    ["Near radii", "200 / 150 wu", "Arrive distances for investigate, retrieve and return", "complete_when.radius"],
    ["Scan", "120 wu, 3.0 s", "Hold radius and fill time", "tutorial.scan.scanRadius / scanDuration"],
    ["Material required", "2500", "Bar size for material_full", "tutorial.harvest.materialRequired"],
    ["Miners distance", "3000 wu", "How far the retrieve marker spawns", "tutorial.miners.spawnDistance"],
    ["Survive", "30 s, waves every 5 s", "Length and pressure of the hold-out", "survive timer, tutorial.survive.waveInterval"],
  ],

  related: [
    { id: "hold-to-scan", how: "The scan beat's primitive, wired in by objective id." },
    { id: "possession-leash", how: "The cinematic objective; sets the checkpoint." },
    { id: "build-and-defend", how: "The last two beats: deliver, then survive the timer." },
    { id: "play-contexts", how: "The cinematic swaps the game context so its scripted death is not a game over." },
    { id: "harvest-bar", how: "material_full reads the harvester bar." },
  ],

  questions: [
    "Branching: should next become a map of outcome to id, and who decides the outcome, the condition or an action?",
    "Fail conditions: today the only failure is death, which rewinds to the checkpoint. Should an objective be able to fail on its own (timer runs out, artifact destroyed)?",
    "Should the id-keyed special cases (scan, survive) move into data as continuous on_update actions?",
    "Should enemies_dead take a type or a spawn-group tag, so a squad of anything can be the target?",
  ],

  sparks: [
    "Missions and weapon graphs are both event graphs; one node editor could author both, and a mission could fire a weapon module.",
    "Silent objectives as invisible director beats: an unnamed timer that spawns an ambush is already expressible.",
    "Message gates as pacing valves: a mission that waits for the player to dismiss a line gives them a breath they control.",
    "Checkpoint as story: death restarts at the beat after the character was changed, so the fiction explains why some progress sticks.",
  ],

  terms: [
    { term: "Objective", def: "One beat: on_start actions, a complete_when condition, on_complete actions, optional message, next.", code: "Objectives.json tutorial.objectives[]" },
    { term: "Condition", def: "A named predicate polled each frame.", code: "game/objectives/conditions.lua Conditions.*" },
    { term: "Action", def: "A named side effect run on start or completion.", code: "game/objectives/actions.lua Actions.*" },
    { term: "Message gate", def: "An objective whose completion waits for the player to dismiss its message.", code: "objective.message" },
    { term: "Silent objective", def: "An objective with no name: no HUD line, still a beat.", code: "objective.name absent" },
    { term: "Checkpoint", def: "Objective id the chain restarts from after death.", code: "checkpointObjectiveId" },
  ],

  sources: [
    "shmuprouge:docs/systems/Mission_System.md",
    "shmuprouge:docs/tutorial/Tutorial.md",
    "shmuprouge:shared/data/progression/Objectives.json",
    "shmuprouge:game/objectives/processor.lua",
    "shmuprouge:game/objectives/conditions.lua",
    "shmuprouge:game/objectives/actions.lua",
  ],

  toy: {
    title: "Flowchart runner",
    hint: "hold to steer, or leave the autopilot on",
    caption: "A cut-down chain (destroy, possession and acquire are folded away, harvest is five dots). 1 px = 8 wu. The combat beat adds one violet drone the shipped game never spawns, to show that enemies_dead counts only Midges.",
    w: 384, h: 216,
    controls: [
      { type: "toggle", key: "auto", label: "autopilot", value: true },
      { type: "toggle", key: "midge", label: "enemies_dead counts Midges only (as built)", value: true },
      { type: "range", key: "speed", label: "time x", min: 1, max: 4, value: 2 },
      { type: "button", label: "restart", press(S, P, kit) { msnInit(S); msnStart(S, kit); } },
    ],
    init(S, P, kit) { msnInit(S); msnStart(S, kit); },
    pointer(e, S) {
      if (S.msg && e.type === "down") { S.msg = null; S.cur++; S.ended = S.cur >= MSN_CHAIN.length; return; }
      S.ptr = e.down ? { x: e.x, y: e.y } : null;
    },
    update(S, P, dt0, kit) {
      for (let k = 0; k < P.speed; k++) this.step(S, P, dt0, kit);
    },
    step(S, P, dt, kit) {
      const o = MSN_CHAIN[S.cur], sh = S.ship;
      if (!o || S.msg) return;
      S.timer += dt;
      // steering
      let tx = null, ty = null;
      if (S.ptr) { tx = S.ptr.x; ty = S.ptr.y; }
      else if (P.auto) {
        const near = S.enemies[0], dot = S.dots[0];
        if ((o.id === "investigate" || o.id === "scan" || o.id === "return") && S.art) { tx = S.art.x; ty = S.art.y; }
        else if (o.id === "retrieve") { tx = S.miners.x; ty = S.miners.y; }
        else if (o.id === "combat" && near) { tx = near.x - 30; ty = near.y; }
        else if (o.id === "harvest" && dot) { tx = dot.x; ty = dot.y; }
        else if (o.id === "survive" && S.art) { tx = S.art.x + Math.cos(S.timer) * 25; ty = S.art.y + Math.sin(S.timer) * 25; }
      }
      if (tx !== null) { const d = Math.hypot(tx - sh.x, ty - sh.y) || 1, sp = Math.min(70, d * 3); sh.vx = (tx - sh.x) / d * sp; sh.vy = (ty - sh.y) / d * sp; }
      else { sh.vx *= 0.995; sh.vy *= 0.995; }
      sh.x = kit.clamp(sh.x + sh.vx * dt, 118, 380); sh.y = kit.clamp(sh.y + sh.vy * dt, 4, 212);
      // enemies drift toward the ship; auto-fire at the nearest
      for (const e of S.enemies) { const d = Math.hypot(sh.x - e.x, sh.y - e.y) || 1; if (d > 20) { e.x += (sh.x - e.x) / d * 22 * dt; e.y += (sh.y - e.y) / d * 22 * dt; } }
      S.cd -= dt;
      if (S.cd <= 0 && S.enemies.length) {
        let best = null, bd = 80;
        for (const e of S.enemies) { const d = Math.hypot(e.x - sh.x, e.y - sh.y); if (d < bd) { bd = d; best = e; } }
        if (best) { best.hp = 0; S.shots.push({ x1: sh.x, y1: sh.y, x2: best.x, y2: best.y, l: 0.1 }); S.cd = 0.45; }
      }
      S.enemies = S.enemies.filter((e) => e.hp > 0);
      for (const s of S.shots) s.l -= dt; S.shots = S.shots.filter((s) => s.l > 0);
      S.dots = S.dots.filter((d) => Math.hypot(d.x - sh.x, d.y - sh.y) > 6 || (S.held++, false));
      const nearArt = (r) => S.art && Math.hypot(S.art.x - sh.x, S.art.y - sh.y) < r / MSN_WU;
      if (o.id === "scan") { if (nearArt(120)) S.scan += dt / 3; else S.scan = Math.max(0, S.scan - dt * 0.5); }
      if (o.id === "survive" && S.timer - S.wave * 5 >= 5) { S.wave++; msnSquad(S, kit, false); }
      let ok = false;
      if (o.id === "traveling") ok = S.timer >= 8;
      else if (o.id === "investigate") ok = nearArt(200);
      else if (o.id === "scan") ok = S.scan >= 1;
      else if (o.id === "retrieve") ok = Math.hypot(S.miners.x - sh.x, S.miners.y - sh.y) < 200 / MSN_WU;
      else if (o.id === "combat") ok = S.enemies.filter((e) => !P.midge || e.kind === "midge").length === 0;
      else if (o.id === "harvest") ok = S.held >= 5;
      else if (o.id === "return") ok = nearArt(150);
      else if (o.id === "survive") ok = S.timer >= 30;
      if (ok) { S.timer = 0; msnComplete(S, kit); }
    },
    draw(g, S, P) {
      const C = g.C; g.clear();
      g.line(116, 0, 116, 216, C.rule);
      MSN_CHAIN.forEach((o, i) => {
        const y = 36 + i * 22, act = i === S.cur && !S.ended, done = i < S.cur;
        if (act) { g.tone(2, y - 2, 110, 19, 0.12, C.accent); g.rect(2, y - 2, 110, 19, C.accent, 1); }
        g.text((done ? "+ " : act ? "> " : "  ") + o.id, 5, y + 7, { color: done ? C.ink3 : act ? C.ink : C.ink2 });
        g.label(o.cond, 13, y + 15, done ? C.ink3 : C.ink3);
        if (i < MSN_CHAIN.length - 1) g.line(8, y + 17, 8, y + 20, C.rule);
      });
      const sh = S.ship, o = MSN_CHAIN[S.cur];
      if (S.art) {
        g.circle(S.art.x, S.art.y, 5, C.violet);
        g.circle(S.art.x, S.art.y, 200 / MSN_WU, C.rule, 1);
        if (o && o.id === "scan") { g.circle(S.art.x, S.art.y, 120 / MSN_WU, C.accent, 1); if (S.scan > 0) g.arc(S.art.x, S.art.y, 120 / MSN_WU + 3, -Math.PI / 2, -Math.PI / 2 + S.scan * Math.PI * 2, C.accent, 2); }
        if (o && o.id === "survive") g.arc(S.art.x, S.art.y, 250 / MSN_WU, -Math.PI / 2, -Math.PI / 2 + S.timer / 30 * Math.PI * 2, C.gold, 2);
      }
      if (S.cur >= 3) { g.rect(S.miners.x - 3, S.miners.y - 3, 6, 6, C.ink2); g.label("MINERS", S.miners.x - 14, S.miners.y - 6, C.ink3); }
      for (const d of S.dots) g.circle(d.x, d.y, 2, C.gold);
      for (const e of S.enemies) g.circle(e.x, e.y, 3, e.kind === "midge" ? C.enemy : C.violet);
      for (const s of S.shots) g.line(s.x1, s.y1, s.x2, s.y2, C.gold);
      g.circle(sh.x, sh.y, 3.5, C.ink);
      if (S.log) g.label(S.log, 122, 210, C.ink3);
      if (S.msg) { g.rect(140, 90, 230, 36, C.bg); g.rect(140, 90, 230, 36, C.ink, 1); g.text(S.msg, 255, 106, { align: "center" }); g.label("click to dismiss (message gate)", 255, 119, C.ink3, "center"); }
      if (S.ended) g.text("MISSION END: next is nil (TODO level complete)", 250, 30, { color: C.ink2, align: "center" });
    },
    readout(S) {
      const o = MSN_CHAIN[S.cur];
      const alive = S.enemies.length ? "  alive " + S.enemies.length : "";
      return (o ? o.id : "done") + "  objectiveTimer " + S.timer.toFixed(1) + "\n" + (o && o.id === "scan" ? "scan " + Math.round(S.scan * 100) + "%" : "held " + S.held) + alive;
    },
  },
});
