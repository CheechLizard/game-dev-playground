Wiki.construct({
  id: "formation-waves",
  name: "Formation waves: the Menagerie Director",
  origin: "shmuprouge",
  status: "built",
  statusNote: "Built, code only: no design document describes it. It runs only on the <code>menagerie</code> level and is inert everywhere else.",
  summary: "Authored waves of rigid geometric formations enter from a bearing relative to where you are flying, each announced by an edge telegraph whose warning is longest for entries from behind.",
  tags: ["waves", "formations", "telegraph", "authored", "bearing"],

  intent:
    "<p>The Menagerie level wants a dense bullet-heaven stream that still feels fair. Every formation is announced before it arrives, and the warning time depends on where it comes from: a formation from in front, which you can already see coming, gets the shortest warning, and one from behind gets the longest, because you have no other way to know it is there.</p>" +
    "<p>Waves are also authored relative to the player's heading, not the map. &ldquo;Back&rdquo; means behind <em>you</em>, wherever you are flying, so one wave file works in every direction. And waves overlap: the next one starts as soon as the last beat is scheduled, so there is never a clear-the-screen pause.</p>",

  how:
    "<h3>Waves and beats</h3>" +
    "<p>Wave files in <code>shared/data/world/waves/*.json</code> are sorted by <code>tier</code> then <code>name</code> and played in order. After the last one the director enters <code>randomPhase</code>: random waves forever, never the same name twice in a row. Each wave names an enemy <code>kind</code> and a list of beats <code>{t, formation, count, spacing, bearing, motion, kind?, lead?}</code>.</p>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>File</th><th>Tier</th><th>Kind</th><th>Beats</th></tr></thead><tbody>" +
    "<tr><td>01 Grunt Lines</td><td>1</td><td>Grunt</td><td>t 0, 2, 4, 6, 8: lines and vees of 11&ndash;14, all front</td></tr>" +
    "<tr><td>02 Grunt Geometry</td><td>1</td><td>Grunt</td><td>grids of 16&ndash;20 and arcs of 11, front</td></tr>" +
    "<tr><td>03 Weaver Ripple</td><td>2</td><td>Weaver</td><td>lines, then echelons from left and right</td></tr>" +
    "<tr><td>04 Wing Squadrons</td><td>2</td><td>Wing</td><td>vees from left, right, front</td></tr>" +
    "<tr><td>05 Striker Wall</td><td>3</td><td>Striker</td><td>front, front, left, back at t 0, 3, 6, 9</td></tr>" +
    "<tr><td>06 Sentry Crossfire</td><td>3</td><td>Sentry</td><td>left, right, front vee, back at t 0, 3, 6, 9</td></tr>" +
    "</tbody></table></div>" +
    "<h3>Bearing and telegraph</h3>" +
    "<p>The reference heading is the scroll heading while the player is scrolling (see [[ship-control]]), otherwise the last nonzero velocity heading. Named bearings are <code>front = 0</code>, <code>left = &minus;&pi;/2</code>, <code>right = &pi;/2</code>, <code>back = &pi;</code>; a number is degrees. At beat time <code>t</code> the director pushes a telegraph; the formation spawns <code>lead</code> seconds later.</p>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>Bearing</th><th>Lead</th><th>Threat</th></tr></thead><tbody>" +
    "<tr><td>front (and numeric)</td><td><code>leadFront</code> 0.8 s</td><td>low</td></tr>" +
    "<tr><td>left / right</td><td><code>leadSide</code> 1.2 s</td><td>mid</td></tr>" +
    "<tr><td>back</td><td><code>leadBack</code> 1.5 s</td><td>high</td></tr></tbody></table></div>" +
    "<p>The bearing angle is fixed when the beat is scheduled, so turning during the lead does not move the entry point.</p>" +
    "<h3>Spawning the shape</h3>" +
    "<p>The entry point is the camera look-at point plus the bearing direction times (distance to the viewport edge along that angle + <code>spawnMargin</code> 90 wu). <code>Formations.build</code> returns member offsets in (perp, back) units of <code>spacing</code>: <b>line</b>, <b>column</b>, <b>echelon</b> (back = i), <b>arc</b> (back = p&sup2; &times; 0.18), <b>vee</b> (alternating &plusmn;k, back = k), <b>grid</b> (ceil(&radic;n) columns). All members share one inward velocity so the shape stays rigid; pass-through kinds (Grunt 130 wu/s) then steer toward their moving slot with their own inertia and wander. A formation is skipped entirely if the live count is already at <code>maxActive</code>.</p>" +
    "<h3>Overlap and cleanup</h3>" +
    "<p>Once every beat is scheduled and every telegraph has fired, an <code>interWaveGap</code> of 0.8 s starts the next wave, whether or not the screen is clear. Enemies farther than <code>cullRadius</code> from the camera, or older than <code>maxAge</code>, are destroyed.</p>",

  knobs: [
    ["Spawn margin", "90 wu", "How far past the viewport edge formations spawn", "MenagerieSpawns.json spawn.spawnMargin"],
    ["Inter-wave gap", "0.8 s", "Pause after the last telegraph before the next wave", "spawn.interWaveGap"],
    ["Max active", "300", "Hard cap; a whole formation is skipped at the cap", "spawn.maxActive"],
    ["Default spacing", "24 wu", "Slot spacing when a beat omits it", "spawn.defaultSpacing"],
    ["Cull radius / max age", "760 wu / 30 s", "Despawn far or stuck enemies", "spawn.cullRadius, spawn.maxAge"],
    ["Lead front / side / back", "0.8 / 1.2 / 1.5 s", "Warning time by entry bearing", "telegraph.leadFront, leadSide, leadBack"],
  ],

  related: [
    { id: "spawn-telegraph", how: "The playground's warning ring; here the warning is on the screen edge and scales with how blind the entry is." },
    { id: "combat-pressure", how: "Implements its wave-burst and pursuit patterns with a hard cap, but none of its multipliers." },
    { id: "encounter-spawner", how: "The other ShmupRouge spawner: mode-gated cooldowns instead of a script." },
    { id: "ship-control", how: "Supplies the scroll heading that bearings are measured from." },
  ],

  questions: [
    "Nothing scales over time except tier ordering, and the random phase ignores tier entirely.",
    "Lead time is not scaled by enemy speed, so a fast kind from the back gets the same 1.5 s as a slow one.",
    "Should a formation that hits the cap be delayed rather than dropped?",
  ],

  sparks: [
    "Make lead time an upgrade: better sensors buy a longer warning from behind.",
    "Use telegraph honesty as a late-game difficulty axis: some edges flash and nothing comes, or the formation enters from the mirrored side.",
    "Author any moving-camera game in bearings (&ldquo;from behind you, then both flanks&rdquo;) instead of world positions.",
    "Snap beat times to music bars and the wave file becomes a chart in a rhythm shooter.",
  ],

  terms: [
    { term: "Wave", def: "An authored list of beats sharing one enemy kind and a tier.", code: "wave.name, wave.tier, wave.kind, wave.beats" },
    { term: "Beat", def: "One formation entry at time t, with shape, count, spacing, bearing and motion.", code: "beat.t" },
    { term: "Bearing", def: "Entry direction relative to the player's travel heading.", code: "BEARINGS" },
    { term: "Lead time", def: "Seconds between a telegraph appearing and its formation spawning.", code: "leadFront, leadSide, leadBack" },
    { term: "Formation", def: "Member offsets in (perp, back) units of spacing.", code: "Formations.build" },
    { term: "Random phase", def: "Endless random waves after the authored list runs out.", code: "randomPhase" },
  ],

  sources: [
    "shmuprouge:game/systems/ai/menagerie_director_system.lua",
    "shmuprouge:game/entities/menagerie/formations.lua",
    "shmuprouge:game/entities/menagerie/wave_loader.lua",
    "shmuprouge:game/entities/menagerie/behaviors/pass.lua",
    "shmuprouge:shared/data/entities/MenagerieSpawns.json",
    "shmuprouge:shared/data/world/waves/01_grunt_lines.json",
  ],

  toy: {
    title: "Telegraph, then formation",
    hint: "drag to turn your heading; fire beats from behind",
    caption: "The inner rectangle is the 640×360 viewport at 0.3 scale. Formations fly straight or weave across at 130 wu/s; the real pass behaviour adds per-ship inertia and wander. Auto plays the first three wave files in order.",
    w: 384, h: 216,
    controls: [
      { type: "select", key: "formation", label: "shape", value: "vee", options: [["line", "line"], ["column", "column"], ["echelon", "echelon"], ["arc", "arc"], ["vee", "vee"], ["grid", "grid"]] },
      { type: "range", key: "count", label: "count", min: 1, max: 20, value: 11 },
      { type: "select", key: "bearing", label: "bearing", value: "back", options: [["front", "front"], ["left", "left"], ["right", "right"], ["back", "back"], ["45", "45°"]] },
      { type: "range", key: "spacing", label: "spacing", min: 10, max: 60, value: 22, fmt: "{} wu" },
      { type: "button", label: "fire beat", press(S, P) { S.fire = { t: 0, formation: P.formation, count: P.count, spacing: P.spacing, bearing: isNaN(+P.bearing) ? P.bearing : +P.bearing, motion: "straight" }; } },
      { type: "toggle", key: "auto", label: "auto waves", value: true },
    ],
    init(S) {
      S.heading = 0; S.tele = []; S.ships = []; S.clock = 0; S.wave = -1; S.beat = 0; S.gap = 0.8; S.fire = null; S.time = 0;
      S.waves = [
        { name: "Grunt Lines", beats: [[0, "line", 12, 22, "front", "weave"], [2, "line", 12, 22, "front", "weave"], [4, "vee", 11, 22, "front", "straight"], [6, "line", 14, 20, "front", "weave"], [8, "vee", 11, 22, "front", "straight"]] },
        { name: "Grunt Geometry", beats: [[0, "grid", 16, 24, "front", "straight"], [3, "arc", 11, 24, "front", "straight"], [5, "grid", 20, 24, "front", "weave"], [8, "arc", 11, 24, "front", "straight"]] },
        { name: "Weaver Ripple", beats: [[0, "line", 10, 24, "front", "weave"], [2, "line", 10, 24, "front", "weave"], [4, "echelon", 9, 24, "left", "weave"], [6, "echelon", 9, 24, "right", "weave"], [9, "line", 12, 24, "front", "weave"]] },
      ];
    },
    pointer(e, S) { if (e.down) S.heading = Math.atan2(e.y - 108, e.x - 192); },
    update(S, P, dt) {
      const LEAD = { front: 0.8, left: 1.2, right: 1.2, back: 1.5 }, BEAR = { front: 0, back: Math.PI, left: -Math.PI / 2, right: Math.PI / 2 };
      const schedule = (b) => {
        const num = typeof b.bearing === "number";
        const angle = S.heading + (num ? b.bearing * Math.PI / 180 : BEAR[b.bearing]);
        const lead = num ? 0.8 : LEAD[b.bearing];
        S.tele.push({ angle, lead, timer: lead, threat: b.bearing === "back" ? 2 : (b.bearing === "left" || b.bearing === "right") ? 1 : 0, b });
      };
      S.time += dt;
      if (S.fire) { schedule(S.fire); S.fire = null; }
      if (P.auto) {
        if (S.wave < 0 || (S.beat >= S.waves[S.wave].beats.length && !S.tele.some((t) => t.auto))) {
          S.gap -= dt;
          if (S.gap <= 0 || S.wave < 0) { S.gap = 0.8; S.wave = (S.wave + 1) % S.waves.length; S.beat = 0; S.clock = 0; }
        }
        const w = S.waves[S.wave];
        S.clock += dt;
        while (S.beat < w.beats.length && w.beats[S.beat][0] <= S.clock) {
          const r = w.beats[S.beat++];
          schedule({ formation: r[1], count: r[2], spacing: r[3], bearing: r[4], motion: r[5] });
          S.tele[S.tele.length - 1].auto = true;
        }
      }
      const HW = 320, HH = 180;
      for (const tg of S.tele) {
        tg.timer -= dt;
        if (tg.timer > 0) continue;
        if (S.ships.length >= 300) continue;
        const c = Math.cos(tg.angle), s = Math.sin(tg.angle);
        const edge = Math.min(Math.abs(c) > 1e-3 ? HW / Math.abs(c) : 1e9, Math.abs(s) > 1e-3 ? HH / Math.abs(s) : 1e9) + 90;
        const ex = c * edge, ey = s * edge, fx = -c, fy = -s, px = -fy, py = fx;
        for (const o of this.build(tg.b.formation, tg.b.count)) {
          S.ships.push({ x: ex + px * o.perp * tg.b.spacing - fx * o.back * tg.b.spacing, y: ey + py * o.perp * tg.b.spacing - fy * o.back * tg.b.spacing, fx, fy, px, py, age: 0, weave: tg.b.motion === "weave", threat: tg.threat });
        }
      }
      S.tele = S.tele.filter((t) => t.timer > 0);
      for (const sh of S.ships) {
        sh.age += dt;
        const wob = sh.weave ? Math.cos(sh.age * 2.4) * 60 : 0;
        sh.x += (sh.fx * 130 + sh.px * wob) * dt; sh.y += (sh.fy * 130 + sh.py * wob) * dt;
      }
      S.ships = S.ships.filter((sh) => sh.age < 30 && Math.hypot(sh.x, sh.y) < 760);
    },
    build(shape, n) {
      const out = [], c = (n - 1) / 2;
      if (shape === "vee") { out.push({ perp: 0, back: 0 }); for (let k = 1; out.length < n; k++) { out.push({ perp: -k, back: k }); if (out.length < n) out.push({ perp: k, back: k }); } return out; }
      const cols = Math.ceil(Math.sqrt(n));
      for (let i = 0; i < n; i++) {
        const p = i - c;
        if (shape === "line") out.push({ perp: p, back: 0 });
        else if (shape === "column") out.push({ perp: 0, back: i });
        else if (shape === "echelon") out.push({ perp: p, back: i });
        else if (shape === "arc") out.push({ perp: p, back: p * p * 0.18 });
        else out.push({ perp: (i % cols) - (cols - 1) / 2, back: Math.floor(i / cols) });
      }
      return out;
    },
    draw(g, S, P) {
      const C = g.C, k = 0.3, cx = 192, cy = 108;
      g.clear();
      g.tone(0, 0, 384, 216, 0.06, C.ink3);
      g.rect(cx - 96, cy - 54, 192, 108, C.bg);
      g.rect(cx - 96, cy - 54, 192, 108, C.rule, 1);
      const col = [C.gold, C.accent, C.enemy];
      for (const tg of S.tele) {
        const c = Math.cos(tg.angle), s = Math.sin(tg.angle);
        const edge = Math.min(Math.abs(c) > 1e-3 ? 96 / Math.abs(c) : 1e9, Math.abs(s) > 1e-3 ? 54 / Math.abs(s) : 1e9) - 4;
        const f = tg.timer / tg.lead;
        g.wedge(cx + c * edge, cy + s * edge, 6 + 10 * f, tg.angle + Math.PI - 0.5, tg.angle + Math.PI + 0.5, col[tg.threat]);
        g.arc(cx + c * edge, cy + s * edge, 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f, C.ink, 1.5);
      }
      for (const sh of S.ships) g.rect(cx + sh.x * k - 1.5, cy + sh.y * k - 1.5, 3, 3, col[sh.threat]);
      const h = S.heading;
      g.poly([[cx + Math.cos(h) * 7, cy + Math.sin(h) * 7], [cx + Math.cos(h + 2.5) * 5, cy + Math.sin(h + 2.5) * 5], [cx + Math.cos(h - 2.5) * 5, cy + Math.sin(h - 2.5) * 5]], C.ink);
      g.line(cx, cy, cx + Math.cos(h) * 30, cy + Math.sin(h) * 30, C.ink3, 1, [2, 2]);
      g.label("FRONT", cx + Math.cos(h) * 40, cy + Math.sin(h) * 40 + 3, C.ink3, "center");
      g.label("BACK", cx - Math.cos(h) * 40, cy - Math.sin(h) * 40 + 3, C.ink3, "center");
      if (P.auto && S.wave >= 0) {
        const w = S.waves[S.wave], x0 = 230, ww = 148, y0 = 206;
        g.line(x0, y0, x0 + ww, y0, C.rule, 1);
        for (const b of w.beats) g.rect(x0 + b[0] / 10 * ww - 1, y0 - 4, 2, 8, b[4] === "front" ? C.gold : C.accent);
        g.rect(x0 + Math.min(1, S.clock / 10) * ww - 0.5, y0 - 7, 1, 11, C.ink);
        g.label(w.name.toUpperCase(), x0, y0 - 9, C.ink2);
      }
    },
    readout(S) {
      return "live " + S.ships.length + "   telegraphs " + S.tele.length + "\nlead: front 0.8  side 1.2  back 1.5 s";
    },
  },
});
