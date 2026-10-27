(function () {
  const AW = 400, AH = 300, K = 0.6, OX = 4, OY = 34, LIMIT = 90, SWEEP = [45, 70, 95];

  function makeRng(seed) {
    let s = seed % 2147483647; if (s <= 0) s += 2147483646;
    return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }
  function newRun(seed) {
    const r = { rng: makeRng(seed), t: 0, p: { x: AW / 2, y: AH / 2, hp: 100, iframe: 0 }, e: [], shots: [],
      spawnT: 1, cd: 0, contact: 0, shot: 0, kills: 0, dead: false, contacts: 0, hits: 0, shooters: 0 };
    return r;
  }
  function edgePoint(r) {
    const u = r.rng(), side = Math.floor(r.rng() * 4);
    return side === 0 ? [u * AW, 0] : side === 1 ? [u * AW, AH] : side === 2 ? [0, u * AH] : [AW, u * AH];
  }
  // tools/simsuite.lua's pilot, rule for rule.
  function pilot(r, bubble) {
    const p = r.p; let ax = 0, ay = 0, crowd = 0;
    for (const e of r.e) {
      const dx = p.x - e.x, dy = p.y - e.y, d2 = dx * dx + dy * dy;
      if (d2 < bubble * bubble && d2 > 1e-6) { const d = Math.sqrt(d2), w = (bubble - d) / bubble; ax += dx / d * w * 3; ay += dy / d * w * 3; crowd++; }
      else if (d2 < (bubble + 34) * (bubble + 34) && d2 > 1e-6) { const d = Math.sqrt(d2); ax += -dy / d * 0.35; ay += dx / d * 0.35; }
    }
    if (crowd >= 5) { ax *= 2.5; ay *= 2.5; }
    const m = 80;
    if (p.x < m) ax += (m - p.x) / m; if (p.x > AW - m) ax -= (p.x - (AW - m)) / m;
    if (p.y < m) ay += (m - p.y) / m; if (p.y > AH - m) ay -= (p.y - (AH - m)) / m;
    const mag = Math.hypot(ax, ay);
    return mag < 1e-6 ? [0, 0] : [ax / mag, ay / mag];
  }
  function step(r, dt, bubble) {
    if (r.dead) return;
    const p = r.p; r.t += dt;
    const [mx, my] = pilot(r, bubble);
    p.x = Math.max(0, Math.min(AW, p.x + mx * 82 * dt)); p.y = Math.max(0, Math.min(AH, p.y + my * 82 * dt));
    r.spawnT -= dt;
    if (r.spawnT <= 0) {                                  // spawn rate climbs from 1/s
      r.spawnT = 1 / (1 + r.t * 0.06);
      const [x, y] = edgePoint(r);
      const shooter = r.shooters < 3;
      if (shooter) r.shooters++;
      r.e.push({ x, y, hp: shooter ? 18 : 12, shooter, cd: 1 + r.rng() * 2 });
    }
    for (const e of r.e) {
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
      if (e.shooter) {
        const sp = d > 110 ? 26 : d < 75 ? -26 : 0;      // hold a standoff band
        e.x += dx / d * sp * dt; e.y += dy / d * sp * dt; e.cd -= dt;
        if (e.cd <= 0 && d < 160) { e.cd = 2.4; r.shots.push({ x: e.x, y: e.y, vx: dx / d * 88, vy: dy / d * 88, life: 1.5 }); }
      } else { e.x += dx / d * 40 * dt; e.y += dy / d * 40 * dt; }
      if (d < 8 && p.iframe <= 0) { p.hp -= 8; p.iframe = 0.5; r.contact += 8; r.contacts++; }
    }
    for (const s of r.shots) {
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      if (s.life > 0 && Math.hypot(s.x - p.x, s.y - p.y) < 5) { s.life = 0; p.hp -= 6; r.shot += 6; r.hits++; }
    }
    r.shots = r.shots.filter((s) => s.life > 0);
    p.iframe -= dt; r.cd -= dt;
    if (r.cd <= 0) {
      let tgt = null, best = 120;
      for (const e of r.e) { const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < best) { best = d; tgt = e; } }
      if (tgt) { r.cd = 0.3; tgt.hp -= 6; r.lastShot = [tgt.x, tgt.y]; }
    }
    const n = r.e.length;
    for (const e of r.e) if (e.hp <= 0 && e.shooter) r.shooters--;
    r.e = r.e.filter((e) => e.hp > 0); r.kills += n - r.e.length;
    if (p.hp <= 0) r.dead = true;
  }
  function sweep(seeds) {
    return SWEEP.map((b) => {
      let time = 0, contact = 0, shot = 0;
      for (let i = 1; i <= seeds; i++) {
        const r = newRun(1000 + i * 7919);
        while (!r.dead && r.t < LIMIT) step(r, 1 / 30, b);
        time += r.t; contact += r.contact; shot += r.shot;
      }
      return { b, time: time / seeds, contact: contact / seeds, shot: shot / seeds };
    });
  }

  Wiki.construct({
    id: "balance-harness",
    name: "Balance harness with a scripted pilot",
    origin: "playground",
    status: "built",
    statusNote: "Built and the main balance instrument. It reads schema defaults, not the startup profile, unless given <code>--profile</code>, so it currently measures enemy speeds the shipped game does not use.",
    summary: "A headless tool plays whole runs with a scripted kiting pilot and a greedy shopper, sweeps the pilot's personal-space bubble, and reports the spread, because one pilot's verdict is a fact about the pilot.",
    tags: ["balance", "simulation", "bot", "sensitivity"],

    intent:
      "<p>A designer cannot play sixty waves after every number change. The harness plays them in seconds and answers relative questions: did this change make runs longer, did it shift which weapon does the damage, did it change what kills you.</p>" +
      "<p>The bubble sweep is the honest half of the tool. A bot is a playstyle; a verdict that holds for one playstyle and flips for another has not been established.</p>",

    how:
      "<h3>What a run is</h3>" +
      "<p><code>luajit tools/balance.lua</code> bootstraps the schema headless (<code>sim.bootstrap</code>), then for each seed <code>1000 + i&middot;7919</code> plays a run at a fixed dt of 1/30 s through [[headless-sim|<code>run:update</code>]]. Flags: <code>--runs N</code>, <code>--profile name</code>, <code>--seconds S</code>, <code>--csv file</code>, <code>--bubble N</code>.</p>" +
      "<h3>The pilot</h3>" +
      "<ul><li>Enemies inside <code>bubble</code> px repel with weight <code>(bubble &minus; d)/bubble &times; 3</code>.</li>" +
      "<li>Enemies within <code>bubble + 34</code> add a sideways slide of 0.35, so the pilot circles a group instead of backing off.</li>" +
      "<li>Five or more inside the bubble multiply the repulsion by 2.5: break out when surrounded.</li>" +
      "<li>Seek the nearest pickup within 150 px at weight 0.7; health pickups only below 70% HP.</li>" +
      "<li>Steer off the arena edge inside 80 px, then normalise.</li></ul>" +
      "<p><b>The shopper</b> buys by priority: heal if under 50% HP, then weapons, upgrades, passives, cheapest first within a rank, until nothing is affordable; it never rerolls. Buying cheapest-first stopped buying weapons once passives entered the pool, which collapsed damage onto the starting weapon.</p>" +
      "<h3>The bubble sweep</h3>" +
      "<p>By default the harness runs every seed at bubbles 45, 70 and 95 (<code>SWEEP</code>), prints a row per bubble, a \"survival spread across pilot styles\" line and pooled tables of damage share by weapon and damage taken by source, and ends with \"A change that moves only one row has not moved the balance.\" Commit <code>794f7b2</code> made this the default after the single bubble of 45 turned out to sit near the pilot's worst value: across the sweep mean survival moved 214 s to 336 s, the leading weapon's share 74% to 54%, and the top damage source flipped from Spitter to Brute. \"None of that is the game changing.\" A small bubble hugs the horde and dies to contact; a large one flees into corners and dies to ranged enemies.</p>" +
      "<h3>What it found</h3>" +
      "<p>HANDOFF lists three structural problems found this way: enemy shots with a hard-coded 5 s life sniping from four times their range (now <code>shotLife</code>); gold income of about 90 per run against a shop that must fund 25-35 purchases; enemy HP outgrowing player damage, so the horde arrived far faster than it could be cleared ([[kill-rate-race]]). Current verdicts: runs reach wave 54-60 of 60 and survive 58-92% of the time, and the Blaster does most of the damage.</p>",

    knobs: [
      ["Runs", "1", "Seeds per bubble", "--runs"],
      ["Bubble sweep", "45 / 70 / 95 px", "Pilot personal-space radii; --bubble N pins one and prints per-run rows", "SWEEP, --bubble"],
      ["Default bubble", "45 px", "Used by sim.play when no bubble is given", "sim.defaultBubble"],
      ["Profile", "none (schema defaults)", "Load a profile before running", "--profile"],
      ["Step", "1/30 s", "Fixed simulation dt", "sim.play dt"],
    ],

    related: [
      { id: "headless-sim", how: "The harness exists because run.lua takes a movement vector and never draws." },
      { id: "diff-profiles", how: "Without --profile it ignores default.json, which has drifted from the schema." },
      { id: "kill-rate-race", how: "The difficulty model the harness was used to diagnose." },
      { id: "shop-economy", how: "The scripted shopper's priorities shape every result." },
      { id: "escalation-curve", how: "Wave scaling is what the survival numbers mostly measure." },
    ],

    questions: [
      "Should the harness load the startup profile by default, so it measures the game a human launches?",
      "Is bubble the right axis to sweep, or should pickup greed and shop policy be swept too and balance read as a surface?",
      "Can tolerance bands on the spread run in CI, failing a change that moves survival outside them?",
    ],

    sparks: [
      "Pilot personas (greedy, cautious, melee) as a design matrix: a build is good if it survives across personas.",
      "Auto-tune toward a target survival curve: let the harness search one knob while a designer watches the spread.",
      "Rank enemies by how much they flip verdicts across pilots; the most pilot-sensitive enemy is the one players will argue about.",
    ],

    terms: [
      { term: "Balance harness", def: "The headless report that plays runs with a scripted pilot.", code: "tools/balance.lua" },
      { term: "Sim suite", def: "Headless bootstrap, pilot and run player shared by the harness and tests.", code: "tools/simsuite.lua" },
      { term: "Pilot", def: "Scripted movement policy that kites inside a personal-space bubble.", code: "pilot() in simsuite.lua" },
      { term: "Bubble", def: "The pilot's personal-space radius in px.", code: "sim.defaultBubble, --bubble" },
      { term: "Sweep", def: "Running every seed at several bubbles and reporting the spread.", code: "SWEEP" },
    ],

    sources: [
      "playground:tools/balance.lua:1",
      "playground:tools/balance.lua:26",
      "playground:tools/simsuite.lua:15",
      "playground:tools/simsuite.lua:37",
      "playground:tools/simsuite.lua:93",
      "playground:HANDOFF.md",
      "playground:CLAUDE.md",
    ],

    toy: {
      title: "The verdict depends on the bot",
      hint: "move the bubble, then press sweep",
      caption: "The pilot uses the harness's steering rules exactly; the inner ring is the bubble, the outer is bubble + 34. Sweep plays 3 seeds for up to 90 s at each bubble. Simplified: one chaser type, three standoff shooters, no pickups or shop. Here the small bubble dies to shots and the larger ones to contact, the reverse of the game; the lesson is that the top threat moves with the pilot at all.",
      w: 384, h: 216,
      controls: [
        { type: "range", key: "bubble", label: "bubble", min: 20, max: 140, value: 45, fmt: "{} px" },
        { type: "button", label: "sweep 45/70/95", press(S) { S.rows = sweep(3); } },
      ],
      init(S) { S.seed = 1; S.r = newRun(1000 + 7919); S.rows = null; S.wait = 0; },
      change(key, S) { S.seed = 1; S.r = newRun(1000 + 7919); S.wait = 0; },
      update(S, P, dt) {
        if (S.r.dead || S.r.t >= LIMIT) { S.wait += dt; if (S.wait > 1.2) { S.seed++; S.r = newRun(1000 + S.seed * 7919); S.wait = 0; } return; }
        step(S.r, dt, P.bubble);
      },
      draw(g, S, P) {
        const C = g.C, r = S.r, p = r.p, X = (x) => OX + x * K, Y = (y) => OY + y * K;
        g.clear();
        g.rect(OX, OY, AW * K, AH * K, C.rule, 1);
        for (const e of r.e) e.shooter ? g.poly([[X(e.x), Y(e.y) - 3], [X(e.x) + 3, Y(e.y)], [X(e.x), Y(e.y) + 3], [X(e.x) - 3, Y(e.y)]], C.violet) : g.circle(X(e.x), Y(e.y), 2, C.enemy);
        for (const s of r.shots) g.circle(X(s.x), Y(s.y), 1.2, C.violet);
        g.circle(X(p.x), Y(p.y), P.bubble * K, C.accent, 0.8);
        g.circle(X(p.x), Y(p.y), (P.bubble + 34) * K, C.ink3, 0.5);
        g.circle(X(p.x), Y(p.y), 3, p.iframe > 0 && Math.floor(r.t * 20) % 2 ? C.ink3 : C.ink);
        g.meter(OX, OY + AH * K + 2, AW * K, 3, Math.max(0, p.hp) / 100, C.accent);
        if (r.dead) g.label("DEAD AT " + r.t.toFixed(0) + "S", X(AW / 2), Y(AH / 2), C.enemy, "center");
        // results table
        const TX = 252;
        g.label("SWEEP (3 SEEDS)", TX, 42, C.ink);
        g.label("BUB  SURV  CONT  SHOT", TX, 58, C.ink3);
        if (!S.rows) { g.label("PRESS SWEEP", TX, 74, C.ink3); return; }
        S.rows.forEach((row, i) => {
          const top = row.contact >= row.shot ? "CONTACT" : "SHOTS";
          const y = 74 + i * 24;
          g.label(String(row.b).padStart(3) + "  " + row.time.toFixed(0).padStart(3) + "S  " + row.contact.toFixed(0).padStart(4) + "  " + row.shot.toFixed(0).padStart(4), TX, y, C.ink2);
          g.label("TOP THREAT " + top, TX, y + 10, top === "CONTACT" ? C.enemy : C.violet);
        });
        const ts = S.rows.map((x) => x.time);
        g.label("SPREAD " + Math.min(...ts).toFixed(0) + "-" + Math.max(...ts).toFixed(0) + "S", TX, 152, C.gold);
        g.label("ONE ROW IS ONE PILOT", TX, 166, C.ink3);
      },
      readout(S) {
        const r = S.r, m = Math.max(r.t, 1) / 60;
        return "t " + r.t.toFixed(0) + " s   hp " + Math.max(0, r.p.hp).toFixed(0) + "\ncontacts/min " + (r.contacts / m).toFixed(1) + "  shot hits/min " + (r.hits / m).toFixed(1);
      },
    },
  });
})();
