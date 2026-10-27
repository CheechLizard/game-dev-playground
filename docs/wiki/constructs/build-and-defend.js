// Toy constants: 1 stage px = 4 wu.
var BAD_WU = 4, BAD_AX = 236, BAD_AY = 112;
function badInit(S) {
  S.phase = "return"; S.t = 0; S.wt = 0; S.wave = 0; S.hp = 100; S.kills = 0; S.x = BAD_AX - 140; S.y = BAD_AY + 60; S.vx = 0; S.vy = 0;
  S.en = []; S.shots = []; S.cd = 0; S.ptr = null; S.end = 0; S.bar = 1; S.flash = 0;
}
function badSquad(S, P, kit) {
  const a = kit.rand.range(0, Math.PI * 2), d = 500 / BAD_WU, cx = S.x + Math.cos(a) * d, cy = S.y + Math.sin(a) * d;
  const hx = -Math.cos(a), hy = -Math.sin(a), sp = 40 / BAD_WU;
  for (let i = 0; i < P.squad; i++) {
    const rank = Math.ceil(i / 2), side = i % 2 ? -1 : 1;
    S.en.push({ x: cx - hx * rank * sp + hy * side * rank * sp, y: cy - hy * rank * sp - hx * side * rank * sp, vx: 0, vy: 0 });
  }
  S.wave++;
}

Wiki.construct({
  id: "build-and-defend",
  name: "Build and defend",
  origin: "shmuprouge",
  status: "built",
  statusNote: "Built as the tutorial's last two objectives. The gate build is a plain 30 s timer: how much matter you delivered does not change it, and the gate has no health of its own.",
  summary: "Deliver a full load of matter to the artifact, then survive while it builds the gate: a fixed timer drawn as an arc, with a squadron arriving every five seconds.",
  tags: ["objective", "hold-out", "survival", "timer", "climax"],

  intent:
    "<p>The harvest loop needs a payoff that is more than a number going up. Turning the delivery into a hold-out gives the economy a climax: you bring the matter home, and then you have to stay alive while it becomes the way out. The tutorial doc calls it &quot;survival pressure, the stakes&quot;.</p>" +
    "<p>It is also the race from the resource economy design in miniature: the gate is the prize, the waves are the cost of waiting for it.</p>",

  how:
    "<h3>Deliver</h3>" +
    "<p>The <code>return</code> objective waits for <code>near_artifact</code> with radius 150 wu. Its <code>on_complete</code> runs <code>start_gate</code>, which empties the material bar ([[harvest-bar]]) and starts gate construction.</p>" +
    "<h3>Survive</h3>" +
    "<p>The <code>survive</code> objective is <code>complete_when {type: \"timer\", duration: 30}</code>. Its <code>on_start</code>, <code>start_survival_waves</code>, spawns one squadron at once; after that <code>Processor.updateSpecial</code> (keyed on the objective id <code>\"survive\"</code>) spawns another every <code>waveInterval</code> 5.0 s. Over 30 s that is six squadrons, or seven if the last interval and the timer land on the same frame.</p>" +
    "<p>A squadron (<code>entities/Squadron.json</code>) is 3 Midges in a vic, spacing 40, placed 500 wu from the player at a random angle and wrapped into the arena. They approach at 450 wu/s and attack at 600, with a 140 wu arrival radius and a 1.5 s charge. A Midge has 1 HP and 20 contact damage against the player's 100.</p>" +
    "<p><code>DrawEffects.gateConstruction</code> draws progress (<code>objectiveTimer / duration</code>) as an arc of radius 250 wu around the artifact, starting at 12 o'clock, with a white spark at the leading edge and the remainder in a dim colour. On completion, <code>stop_waves</code> runs and the message gate shows &quot;The gate is complete. Escape.&quot;</p>" +
    "<h3>Failure</h3>" +
    "<p>There is no fail state for the objective itself. Dying in the Gameplay context opens Game Over; restart resumes from the checkpoint, which the possession beat fixed at <code>\"retrieve\"</code>. So a death during the hold-out sends you back four objectives: fetch the harvester again, fight, re-harvest 2500 matter, deliver again.</p>",

  knobs: [
    ["Build time", "30 s", "Length of the hold-out", "Objectives.json survive.complete_when.duration"],
    ["Wave interval", "5.0 s", "Seconds between squadrons", "tutorial.survive.waveInterval"],
    ["Squad size", "3 Midges, vic, spacing 40", "Bodies per wave and their shape", "Squadron.json spawn.count, formation.*"],
    ["Spawn distance", "500 wu from the player", "How much warning a wave gives", "Squadron.json spawn.distance"],
    ["Deliver radius", "150 wu", "How close counts as home", "return.complete_when.radius"],
    ["Arc radius", "250 wu", "Size of the progress ring", "draw_effects.lua gateRadius (hard-coded)"],
  ],

  related: [
    { id: "mission-system", how: "Both beats are objectives; the survive waves are an id-keyed special case." },
    { id: "harvest-bar", how: "The bar that must be full before delivery, and that start_gate empties." },
    { id: "formation-waves", how: "The squadrons are formation flyers on a fixed cadence." },
    { id: "resource-economy", how: "The doc's warp-gate build time; this is its tutorial version." },
    { id: "combat-pressure", how: "A fixed-interval spawn pulse, with none of the pressure model's density zones." },
  ],

  questions: [
    "Should delivered matter or its purity shorten the build, so a better harvest buys a shorter hold-out?",
    "Is losing the whole harvest on death the intended stake, or a side effect of the checkpoint being fixed at \"retrieve\"?",
    "Should the waves target the gate rather than the player, making it protect-the-core?",
    "The resource economy doc leaves warp gate cost and build time TBD. Does the tutorial's 2500 and 30 s set the scale?",
  ],

  sparks: [
    "Double or nothing: start a second gate while the first builds, for twice the reward and overlapping waves.",
    "Build speed tied to proximity: the gate builds only while you are within its arc, so holding ground and dodging pull against each other.",
    "A gate with HP: enemies that ignore you and dive the arc force a choice between your hull and the clock.",
    "Hand the timer to the player: a build you can end early for a partial reward, cashing out under pressure.",
  ],

  terms: [
    { term: "Gate construction", def: "The build started on delivery; progress is the survive objective's timer.", code: "Actions.start_gate, startGateConstruction" },
    { term: "Survival waves", def: "Squadrons spawned at the start and every waveInterval during survive.", code: "SurvivalPhase:startSurvivalWaves, waveInterval" },
    { term: "Survival progress", def: "objectiveTimer / duration, drawn as the gate arc.", code: "getSurvivalProgress, DrawEffects.gateConstruction" },
    { term: "Squadron", def: "A vic of Midges spawned 500 wu from the player.", code: "entities/Squadron.json, Actions.spawn_squadron" },
  ],

  sources: [
    "shmuprouge:shared/data/progression/Objectives.json",
    "shmuprouge:game/objectives/tutorial/survival_phase.lua",
    "shmuprouge:game/objectives/draw_effects.lua",
    "shmuprouge:game/objectives/actions.lua",
    "shmuprouge:game/objectives/objectives_checkpoint.lua",
    "shmuprouge:shared/data/entities/Squadron.json",
    "shmuprouge:docs/tutorial/Tutorial.md",
  ],

  toy: {
    title: "Thirty seconds at the artifact",
    hint: "hold to steer; release and it orbits the artifact",
    caption: "1 px = 4 wu. Midges fly at 200 wu/s, under half the game's 450-600, so the waves can be watched; the ship auto-fires at the nearest. A death shows what the checkpoint costs, then restarts.",
    w: 384, h: 216,
    controls: [
      { type: "range", key: "dur", label: "build time", min: 10, max: 60, step: 5, value: 30, fmt: "{} s" },
      { type: "range", key: "iv", label: "wave interval", min: 2, max: 10, step: 0.5, value: 5, fmt: "{} s" },
      { type: "range", key: "squad", label: "squad size", min: 1, max: 7, value: 3 },
      { type: "button", label: "restart", press(S) { badInit(S); } },
    ],
    init(S) { badInit(S); },
    pointer(e, S) { S.ptr = e.down ? { x: e.x, y: e.y } : null; },
    update(S, P, dt, kit) {
      S.t += dt; S.flash = Math.max(0, S.flash - dt);
      if (S.phase === "done" || S.phase === "dead") { S.end += dt; if (S.end > 4) badInit(S); return; }
      let tx, ty;
      if (S.ptr) { tx = S.ptr.x; ty = S.ptr.y; }
      else if (S.phase === "return") { tx = BAD_AX; ty = BAD_AY; }
      else { tx = BAD_AX + Math.cos(S.t * 0.8) * 30; ty = BAD_AY + Math.sin(S.t * 0.8) * 30; }
      const d = Math.hypot(tx - S.x, ty - S.y) || 1, sp = Math.min(90, d * 3);
      S.x = kit.clamp(S.x + (tx - S.x) / d * sp * dt, 3, 381); S.y = kit.clamp(S.y + (ty - S.y) / d * sp * dt, 3, 213);
      if (S.phase === "return") {
        if (Math.hypot(S.x - BAD_AX, S.y - BAD_AY) < 150 / BAD_WU) { S.phase = "survive"; S.bar = 0; S.t = 0; S.wt = 0; badSquad(S, P, kit); }
        return;
      }
      S.wt += dt;
      if (S.wt >= P.iv) { S.wt = 0; badSquad(S, P, kit); }
      const spd = 200 / BAD_WU;
      for (const e of S.en) {
        const dx = S.x - e.x, dy = S.y - e.y, l = Math.hypot(dx, dy) || 1;
        e.vx += (dx / l * spd - e.vx) * 2 * dt; e.vy += (dy / l * spd - e.vy) * 2 * dt;
        e.x += e.vx * dt; e.y += e.vy * dt;
        if (l < 5) { e.dead = true; S.hp -= 20; S.flash = 0.2; }
      }
      S.cd -= dt;
      if (S.cd <= 0) {
        let best = null, bd = 70;
        for (const e of S.en) { const l = Math.hypot(e.x - S.x, e.y - S.y); if (!e.dead && l < bd) { bd = l; best = e; } }
        if (best) { best.dead = true; S.kills++; S.shots.push({ x: best.x, y: best.y, l: 0.08 }); S.cd = 0.55; }
      }
      S.en = S.en.filter((e) => !e.dead);
      for (const s of S.shots) s.l -= dt; S.shots = S.shots.filter((s) => s.l > 0);
      if (S.hp <= 0) { S.hp = 0; S.phase = "dead"; S.end = 0; }
      else if (S.t >= P.dur) { S.phase = "done"; S.end = 0; S.en = []; }
    },
    draw(g, S, P) {
      const C = g.C; g.clear();
      const R = 250 / BAD_WU, prog = S.phase === "survive" ? Math.min(1, S.t / P.dur) : S.phase === "done" ? 1 : 0, a0 = -Math.PI / 2, a1 = a0 + prog * Math.PI * 2;
      g.arc(BAD_AX, BAD_AY, R, a1, a0 + Math.PI * 2, C.rule, 1);
      if (prog > 0) { g.arc(BAD_AX, BAD_AY, R, a0, a1, C.violet, 4); if (prog < 1) { g.circle(BAD_AX + Math.cos(a1) * R, BAD_AY + Math.sin(a1) * R, 3 + Math.sin(S.t * 20), C.ink); } }
      if (S.phase === "return") g.circle(BAD_AX, BAD_AY, 150 / BAD_WU, C.accent, 1);
      g.toneCircle(BAD_AX, BAD_AY, 9, 0.5, C.violet); g.circle(BAD_AX, BAD_AY, 5, C.violet);
      for (const e of S.en) g.circle(e.x, e.y, 2.5, C.enemy);
      for (const s of S.shots) g.line(S.x, S.y, s.x, s.y, C.gold);
      if (S.phase !== "dead") g.poly([[S.x, S.y - 5], [S.x + 4, S.y + 4], [S.x - 4, S.y + 4]], S.flash > 0 ? C.enemy : C.sky);
      g.label("hull", 8, 60, C.ink3); g.meter(8, 64, 90, 5, S.hp / 100, S.hp > 30 ? C.accent : C.enemy);
      g.label("matter", 8, 82, C.ink3); g.meter(8, 86, 90, 5, S.bar, C.gold);
      g.label("next wave", 8, 104, C.ink3); g.meter(8, 108, 90, 5, S.phase === "survive" ? S.wt / P.iv : 0, C.enemy);
      if (S.phase === "return") g.text("DELIVER: REACH 150 WU", BAD_AX, 18, { color: C.accent, align: "center" });
      if (S.phase === "done") g.text("THE GATE IS COMPLETE. ESCAPE.", BAD_AX, 18, { color: C.gold, align: "center" });
      if (S.phase === "dead") {
        g.text("DEAD: RESTART AT CHECKPOINT 'RETRIEVE'", 192, 186, { color: C.enemy, align: "center" });
        g.label("harvester, combat, 2500 matter and delivery all to redo", 192, 200, C.ink2, "center");
      }
    },
    readout(S, P) {
      return (S.phase === "survive" ? "survive " + S.t.toFixed(1) + " / " + P.dur + " s" : S.phase) + "\nwave " + S.wave + "  hull " + S.hp + "  kills " + S.kills;
    },
  },
});
