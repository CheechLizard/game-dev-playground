(function () {
  // Park-Miller, as run.lua's makeRng.
  function makeRng(seed) {
    let s = seed % 2147483647; if (s <= 0) s += 2147483646;
    return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }
  const AW = 180, AH = 170;

  // The model: no drawing, no input. update takes dt and a movement vector.
  function newRun(seed) {
    return { t: 0, rng: makeRng(seed), fxRng: makeRng(seed * 7919 + 13), p: { x: AW / 2, y: AH / 2 },
      e: [], parts: [], spawnT: 0, cd: 0, kills: 0 };
  }
  function step(r, dt, mx, my, particles, shared) {
    r.t += dt;
    r.p.x = Math.max(4, Math.min(AW - 4, r.p.x + mx * 82 * dt));
    r.p.y = Math.max(4, Math.min(AH - 4, r.p.y + my * 82 * dt));
    r.spawnT -= dt;
    if (r.spawnT <= 0 && r.e.length < 24) {
      r.spawnT = 0.5;
      const a = r.rng() * Math.PI * 2;
      r.e.push({ x: AW / 2 + Math.cos(a) * 95, y: AH / 2 + Math.sin(a) * 85, hp: 12 });
    }
    for (const e of r.e) {
      const dx = r.p.x - e.x, dy = r.p.y - e.y, d = Math.hypot(dx, dy) || 1;
      e.x += dx / d * 30 * dt; e.y += dy / d * 30 * dt;
    }
    r.cd -= dt;
    if (r.cd <= 0) {
      r.cd = 0.4;
      let tgt = null, best = 70;
      for (const e of r.e) { const d = Math.hypot(e.x - r.p.x, e.y - r.p.y); if (d < best) { best = d; tgt = e; } }
      if (tgt) {
        tgt.hp -= 4 + Math.floor(r.rng() * 5);            // damage roll: gameplay stream
        const fx = shared ? r.rng : r.fxRng;                 // cosmetic: which stream?
        for (let i = 0; i < particles; i++) { const a = fx() * Math.PI * 2, s = 20 + fx() * 40; r.parts.push({ x: tgt.x, y: tgt.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 }); }
      }
    }
    for (const q of r.parts) { q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt; }
    r.parts = r.parts.filter((q) => q.life > 0);
    const n = r.e.length; r.e = r.e.filter((e) => e.hp > 0); r.kills += n - r.e.length;
  }
  function pilot(t) { const x = Math.cos(t * 0.7), y = Math.sin(t * 1.1), m = Math.hypot(x, y) || 1; return [x / m, y / m]; }
  function hash(r) { let h = 0; for (const e of r.e) h = (h * 31 + Math.round(e.x * 10) * 7 + Math.round(e.y * 10)) % 1000000007; return h; }

  Wiki.construct({
    id: "headless-sim",
    name: "Headless simulation and split random streams",
    origin: "playground",
    status: "built",
    summary: "The run is a pure model that takes a time step and a movement vector and never draws or reads input, and its randomness is split by purpose, so a seed replays a whole run without a window and cosmetic changes cannot reshuffle gameplay.",
    tags: ["simulation", "determinism", "seed", "rng", "architecture"],

    intent:
      "<p>Everything else in the tooling stands on this. The [[balance-harness]] plays full runs with a scripted pilot, the tests check simulation rules in about five seconds, the [[reproducible-capture|capture tool]] fast-forwards to the frame it wants: all because the game's model can run with no screen and no keyboard.</p>" +
      "<p>The split random streams protect the other thing a designer needs from a seed: comparability. Two harness runs on one seed before and after a change should differ only because of the change.</p>",

    how:
      "<h3>The boundary</h3>" +
      "<p><code>run.lua</code> opens with the rule: no <code>love.graphics</code> calls, no direct input reads. Its entry point is <code>run:update(dt, moveX, moveY)</code>. The only <code>love.</code> in the file is in that comment. Presentation reads the run's data:</p>" +
      "<ul><li>Effects and particles are capped plain data (80 and 400) that <code>render.lua</code> draws.</li>" +
      "<li>Feedback is data (<code>feedback.lua</code>); <code>sound.lua</code> is the only user of <code>love.audio</code>.</li>" +
      "<li>Debug switches such as god mode are applied around the simulation by <code>game.lua</code>, not inside it.</li></ul>" +
      "<p>HANDOFF names this the second rule that keeps the [[schema-editor|schema invariant]] useful: \"easy to break with one convenient <code>love.</code> call.\" <code>tools/test.lua</code> runs the simulation, framework and UI suites headless.</p>" +
      "<h3>Seeded generators, split by purpose</h3>" +
      "<p>The run owns Park-Miller generators (<code>state = state &times; 16807 mod 2<sup>31</sup>&minus;1</code>), not LÖVE's:</p>" +
      "<div class=\"tbl-wrap\"><table><thead><tr><th>Stream</th><th>Seed</th><th>Draws for</th></tr></thead><tbody>" +
      "<tr><td><code>rng</code></td><td>seed</td><td>Spawns, drops, crits, shop rolls</td></tr>" +
      "<tr><td><code>fxRng</code></td><td>seed &times; 7919 + 13</td><td>Weapon spread jitter, speed variance, particle scatter</td></tr>" +
      "<tr><td><code>feedbackRng</code></td><td>seed &times; 104729 + 37</td><td>Hit feedback and sound pitch</td></tr>" +
      "</tbody></table></div>" +
      "<p>The code comment gives the reason: without it, \"two balance runs on the same seed stop being comparable the moment a weapon changes, which is exactly when you most want to compare them.\" Adding a particle to a weapon draws from <code>fxRng</code>, so the next spawn is where it would have been.</p>" +
      "<p>LÖVE's own generator still drives camera shake and the inspection levels' seeds, which is why a capture's <code>--seed</code> pins both.</p>",

    knobs: [
      ["Seed", "os.time() (game), 1000 + i·7919 (harness)", "Reproduces a run exactly", "run.new(seed)"],
      ["Harness step", "1/30 s", "Fixed dt the headless pilot runs at", "sim.play dt"],
      ["Capture step", "1/60 s", "Fixed dt of a capture's warm-up", "capture.lua FIXED_DT"],
    ],

    related: [
      { id: "balance-harness", how: "Plays whole runs through run:update with a scripted movement vector." },
      { id: "reproducible-capture", how: "Fast-forwards the same model in fixed steps before drawing one frame." },
      { id: "schema-editor", how: "The simulation reads config built from the schema, so headless runs see every setting." },
      { id: "inspection-levels", how: "The zoo and range are the same run with spawning handed to the level." },
    ],

    questions: [
      "Nothing enforces the boundary except review. Should <code>tools/test.lua</code> fail if <code>run.lua</code> mentions <code>love.</code>?",
      "Should the inspection levels draw from a run stream instead of LÖVE's generator, so a seed alone describes them?",
    ],

    sparks: [
      "Replays for free: store the seed and the movement vector per tick, and a run plays back exactly.",
      "Rollback netcode or a server-authoritative mode on the same split: the model never needed a screen.",
      "Train or evolve pilots against the headless run, then ship the best ones as enemy AI or as ghost racers.",
      "A daily challenge is a seed plus a profile hash, shared as one short string.",
    ],

    terms: [
      { term: "Run", def: "The simulation of one play-through; takes dt and a movement vector.", code: "run.lua, run:update" },
      { term: "Headless", def: "Running the simulation with no window, for tests and the harness.", code: "tools/test.lua, tools/simsuite.lua" },
      { term: "Seeded rng", def: "The run's own Park-Miller generator.", code: "makeRng, run.rng" },
      { term: "Cosmetic stream", def: "A separate generator for jitter and particles, so they cannot shift gameplay rolls.", code: "run.fxRng, run.feedbackRng" },
    ],

    sources: [
      "playground:games/horde-survivor/run.lua:1",
      "playground:games/horde-survivor/run.lua:23",
      "playground:games/horde-survivor/run.lua:71",
      "playground:games/horde-survivor/run.lua:1395",
      "playground:tools/simsuite.lua:1",
      "playground:HANDOFF.md",
    ],

    toy: {
      title: "Same seed, two runs",
      hint: "change B's particles, then share the stream",
      caption: "Both panels run the same model with the same seed and the same scripted movement. Run B may add particles; with separate streams its spawns stay identical to A. Turning A's renderer off does not stop A. Simplified: one enemy type, one weapon, no shop.",
      w: 384, h: 216,
      controls: [
        { type: "range", key: "seed", label: "seed", min: 1, max: 99, value: 7, reset: true },
        { type: "range", key: "parts", label: "B particles", min: 0, max: 12, value: 3 },
        { type: "toggle", key: "shared", label: "B: cosmetics on main rng", value: false, reset: true },
        { type: "toggle", key: "render", label: "draw A", value: true },
      ],
      init(S, P) { S.A = newRun(P.seed); S.B = newRun(P.seed); S.div = null; S.ticks = 0; },
      update(S, P, dt) {
        const [mx, my] = pilot(S.A.t);
        step(S.A, dt, mx, my, 3, false);
        step(S.B, dt, mx, my, P.parts, P.shared);
        S.ticks++;
        if (S.div == null && hash(S.A) !== hash(S.B)) S.div = S.A.t;
      },
      draw(g, S, P) {
        const C = g.C;
        g.clear();
        const panel = (r, ox, label, on) => {
          const oy = 36;
          g.rect(ox, oy, AW, AH, C.rule, 1);
          g.label(label, ox + 4, oy + 10, C.ink2);
          if (!on) {
            g.tone(ox + 1, oy + 1, AW - 1, AH - 1, 0.12, C.ink);
            g.label("RENDERER OFF", ox + AW / 2, oy + AH / 2 - 8, C.ink3, "center");
            g.label("T " + r.t.toFixed(1) + "  ENEMIES " + r.e.length + "  KILLS " + r.kills, ox + AW / 2, oy + AH / 2 + 6, C.ink2, "center");
            return;
          }
          for (const q of r.parts) g.rect(ox + q.x - 0.5, oy + q.y - 0.5, 1.5, 1.5, C.gold);
          for (const e of r.e) g.circle(ox + e.x, oy + e.y, 3, C.enemy);
          g.circle(ox + r.p.x, oy + r.p.y, 3.5, C.ink);
        };
        panel(S.A, 6, "RUN A  SEED " + P.seed, P.render);
        panel(S.B, 198, "RUN B  SEED " + P.seed + (P.shared ? "  SHARED RNG" : ""), true);
        const same = S.div == null;
        g.label(same ? "SPAWNS IDENTICAL" : "DIVERGED AT T=" + S.div.toFixed(1) + "S", 198, 30, same ? C.accent : C.enemy);
      },
      readout(S) {
        return "ticks " + S.ticks + "   t " + S.A.t.toFixed(1) + " s\nkills A " + S.A.kills + " / B " + S.B.kills;
      },
    },
  });
})();
