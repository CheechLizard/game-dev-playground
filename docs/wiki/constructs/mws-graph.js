(function () {
  const STEP = 1 / 60, PX = 30, PY = 160, TW = 44, TG = 6;
  // The eight bench presets (weaponprototypes.lua), reduced to what the toy simulates.
  const PRE = {
    pulse: { t: ["REP 18", "BAT 60/35", "SEEK", "RANGED", "SHARP 8"], trig: "rep", period: 18, C: 60, R: 35, k: "ranged", e: 8, speed: 150, range: 180 },
    beam: { t: ["TOGGLE", "BAT 40/10", "SEEK", "STAB", "PLASMA"], trig: "toggle", C: 40, R: 10, k: "stab", e: 5, drain: 35, range: 180, dur: 12 },
    pierce: { t: ["SINGLE", "BAT 80/30", "SEEK", "PIERCE", "SHARP 8"], trig: "single", C: 80, R: 30, k: "piercing", e: 8, speed: 130, range: 220, limit: 5,
      two: { on: "miss", t: ["MISS", "BAT 30/10", "AREA", "PLASMA"], C: 30, R: 10, dur: 1 } },
    complete: { t: ["REP 90", "BAT 60/20", "SEEK", "RANGED", "SHARP 8"], trig: "rep", period: 90, C: 60, R: 20, k: "ranged", e: 8, speed: 130, range: 90, life: 1,
      two: { on: "complete", t: ["COMPLETE", "BAT 50/15", "AREA", "PLASMA"], C: 50, R: 15, dur: 1.2 } },
    delay: { t: ["SINGLE", "DELAY 60", "BAT 60/20", "SEEK", "RANGED", "SHARP 8"], trig: "single", delay: 60, C: 60, R: 20, k: "ranged", e: 8, speed: 200, range: 250 },
    sweep: { t: ["REP 90", "BAT 60/20", "SEEK", "SWEEP", "SHARP 12"], trig: "rep", period: 90, C: 60, R: 20, k: "sweep", e: 8, drain: 10, range: 95, dur: 0.8, arc: 160 },
    volley: { t: ["REP 30", "BAT 36/18", "MULTI 3", "RANGED", "SHARP 12"], trig: "rep", period: 30, C: 36, R: 18, k: "ranged", e: 8, speed: 130, range: 180, n: 3 },
    split: { t: ["REP 30", "BAT 36/18", "RANGED", "MULTI 3", "SHARP 12"], trig: "rep", period: 30, C: 36, R: 18, k: "ranged", e: 8, speed: 130, range: 180, n: 3, split: true },
  };
  const NAMES = [["pulse", "Pulse"], ["beam", "Beam exhaustion"], ["pierce", "Piercing + Miss"], ["complete", "Complete + Field"], ["delay", "Delayed single"], ["sweep", "Sweep"], ["volley", "Full volley"], ["split", "Split strike"]];
  const DUMMIES = [[112, 150], [178, 128], [196, 176], [160, 198]];
  const stkIndex = (p) => p.t.findIndex((s) => /RANGED|STAB|SWEEP|PIERCE/.test(s));
  function aimAt(x, y, reach, on) {
    if (!on) return 0;
    let best = null, d = Infinity;
    for (const [dx, dy] of DUMMIES) { const q = Math.hypot(dx - x, dy - y); if (q <= reach + 9 && q < d) { d = q; best = [dx, dy]; } }
    return best ? Math.atan2(best[1] - y, best[0] - x) : 0;
  }

  Wiki.construct({
    id: "mws-graph",
    name: "Modular weapon graph",
    origin: "playground",
    status: "partial",
    statusNote: "The v2 graph and runtime are built and playable only in the F8 bench, through eight prototype weapons. The survival game and its shop weapons still run the legacy graph model ([[mws-lineage]]). Multi-input joins, cycles, several subclasses and the Drone Striker are spec only.",
    summary: "A weapon is a graph of configured modules from five classes (Trigger, Battery, Barrel, Striker, Payload), and a signal bit walks it once per tick to decide when, with what power, in which direction, in what shape and with what damage to strike.",
    tags: ["composition", "modules", "graph", "overview"],

    intent:
      "<p>A weapon built from parts can be found, bought, swapped and understood one part at a time. Five roles cover everything: <em>when</em> (Trigger), <em>with what power</em> (Battery), <em>which way</em> (Barrel), <em>what shape</em> (Striker) and <em>what it does</em> (Payload). A shotgun, a sputtering beam and a cluster bomb are the same five roles in different arrangements, so a player who has learned one can read the others.</p>" +
      "<p>The same graph serves three possible uses the spec keeps open: players assembling found modules, a free creative mode, and developers (human or AI) authoring weapons under one rule set.</p>",

    how:
      "<h3>Classes, subclasses, instances</h3>" +
      "<div class=\"tbl-wrap\"><table><thead><tr><th>Class</th><th>Job</th><th>Built subclasses</th><th>Ports out</th></tr></thead><tbody>" +
      "<tr><td>Trigger</td><td>Turn the input bit into a firing signal; never touches energy ([[trigger-chain]])</td><td>Inverter, Single, Toggle, Delay, Repeater, Proximity, Hit, Miss, Complete</td><td>1</td></tr>" +
      "<tr><td>Battery</td><td>Add capacity and refill to its sequence's reservoir ([[sequence-reservoir]])</td><td>Infinite (a finite tank in practice)</td><td>1</td></tr>" +
      "<tr><td>Barrel</td><td>Transform or fan out the direction ([[barrels]], [[targeting-turn]])</td><td>Forward, Directional, Spread, Multi, Alternating, Blind, Seeking, Weakling, Bossling, Rotating, Bounce, Refract</td><td>8</td></tr>" +
      "<tr><td>Striker</td><td>Place colliders, spend energy, emit Hit and Complete ([[strikers]])</td><td>Ranged, Piercing, Stab, Sweep, Area, Orbit</td><td>8</td></tr>" +
      "<tr><td>Payload</td><td>Damage and identity on contact; free ([[payloads]])</td><td>Sharp, Impact, Plasma</td><td>1</td></tr>" +
      "</tbody></table></div>" +
      "<p>A <b>class</b> is a role, a <b>subclass</b> a behaviour within it, an <b>instance</b> a configured module in one graph with its own runtime state. Properties, defaults, editor controls and validation are declared once in <code>v2modules.lua</code> (Trigger props imported from <code>triggers.lua</code>), the way the schema declares settings elsewhere in the project. A saved graph is <code>{version = 2, id, name, nodes = [{id, type, x, y, props, outputs}]}</code>; unversioned graphs stay on the legacy runtime.</p>" +
      "<h3>Topology</h3>" +
      "<p>Each node has one parent, no cycles, and a Trigger at every root. A Striker wired straight into a Trigger starts a new <b>sequence</b> with its own battery ([[sequences]]). The order of nodes in the graph, then port order, fixes who is served first when several strikes compete in one tick. Barrel-free and Payload-free graphs are valid: no Barrel fires in a random direction, no Payload does no damage but still emits events.</p>" +
      "<h3>One tick, in order</h3>" +
      "<ol><li>Refill every sequence's reservoir: <code>E = min(C, E + R&middot;dt)</code>.</li>" +
      "<li>Turn last tick's accepted Hit and Complete events into new execution contexts.</li>" +
      "<li>Refresh the aim of live sustained strikes.</li>" +
      "<li>Walk every context from its root: Triggers transform the bit, Barrels transform the packet, Payloads are collected, and a hot Striker offers a strike request. Requests are admitted or skipped atomically in graph and port order; sustained strikes whose route went cold end by <code>release</code>; aim advances.</li>" +
      "<li>Sum sustained drain per sequence, pay it, and compute one shared fraction ([[sustained-drain]]).</li>" +
      "<li>Simulate every live strike: projectiles a full step, sustained ones for their funded fraction; contacts emit Hits and apply Payloads; ends emit Completes; sustained groups at zero energy end.</li>" +
      "<li>Prune dead strikes and finished contexts.</li></ol>" +
      "<p>Before the walk, the application input layer has reduced devices to one bit for the tick; the weapon never sees a key or a pad. Guards cap a weapon at 512 live colliders and 256 contexts.</p>" +
      "<h3>The eight bench presets as compositions</h3>" +
      "<p>All are built on one base, Trigger &rarr; Battery &rarr; Seeking &rarr; Striker &rarr; Sharp, with a 60 e / 20 e/s battery and 8 e strikes unless stated.</p>" +
      "<div class=\"tbl-wrap\"><table><thead><tr><th>Preset</th><th>Composition</th><th>What it shows</th></tr></thead><tbody>" +
      "<tr><td>Pulse</td><td>Repeater 18 &rarr; Battery 60/35 &rarr; Seeking &rarr; Ranged 8 e &rarr; Sharp 8</td><td>Sustainable autofire: 26.7 e/s demand under 35 e/s refill</td></tr>" +
      "<tr><td>Beam exhaustion</td><td>Toggle &rarr; Battery 40/10 &rarr; Seeking &rarr; Stab (start 5, drain 35, 12 s) &rarr; Plasma 30</td><td>Sputter: 1.6 s burn, 0.5 s gap, 0.2 s bursts</td></tr>" +
      "<tr><td>Piercing + Miss</td><td>Single &rarr; Battery 80/30 &rarr; Seeking &rarr; Piercing (limit 5) &rarr; Sharp 8; Piercing &rarr; Miss &rarr; Battery 30/10 &rarr; Area 20 px &rarr; Plasma 16</td><td>Two sequences, two reservoirs; a field only after a zero-hit shot</td></tr>" +
      "<tr><td>Complete + Field</td><td>Repeater 90 &rarr; Battery &rarr; Seeking &rarr; Ranged (range 90) &rarr; Sharp 8; Ranged &rarr; Complete &rarr; Battery 50/15 &rarr; Area 20 px &rarr; Plasma 21</td><td>The retired Emitter's cluster-bomb job, as composition</td></tr>" +
      "<tr><td>Delayed single</td><td>Single &rarr; Delay 60 &rarr; Battery &rarr; Seeking &rarr; Ranged (speed 200, range 250) &rarr; Sharp 8</td><td>Fires 1 s later from the captured origin, aimed at execution ([[delay-echo]])</td></tr>" +
      "<tr><td>Sweep</td><td>Repeater 90 &rarr; Battery &rarr; Seeking &rarr; Sweep (range 95, arc 160&deg;, 0.8 s, drain 10, release off) &rarr; Sharp 12</td><td>A melee arc that completes after its pulse goes cold</td></tr>" +
      "<tr><td>Full volley</td><td>Repeater 30 &rarr; Battery 36/18 &rarr; Multi 3 &times; 60&deg; &rarr; Ranged &rarr; Sharp 12</td><td>24 e per volley, all or nothing ([[multi-ordering]])</td></tr>" +
      "<tr><td>Split strike</td><td>Repeater 30 &rarr; Battery 36/18 &rarr; Ranged &rarr; Multi 3 &times; 60&deg; &rarr; Sharp 12</td><td>8 e for three dimmer bullets doing 4 each</td></tr>" +
      "</tbody></table></div>",

    knobs: [
      ["Simulation tick", "1/60 s", "Every signal, refill and step happens per tick", "STEP"],
      ["Collider limit", "512", "Live colliders per weapon before requests are dropped", "R:startRequests"],
      ["Context limit", "256", "Execution contexts per weapon before events are dropped", "R:step"],
      ["Output ports", "Barrel 8, Striker 8, others 1", "How many children a node can feed", "define(..., outputs)"],
    ],

    related: [
      { id: "sequences", how: "How graphs divide into self-funded sequences." },
      { id: "trigger-chain", how: "The first stage of every tick." },
      { id: "multi-ordering", how: "The clearest case of order changing meaning." },
      { id: "mws-lineage", how: "The legacy graph the survival game still runs." },
      { id: "schema-editor", how: "Module declarations play the schema's part for graphs." },
    ],

    questions: [
      "Multi-input joins: which sequence owns a module fed by two sequences, and how are their ticks synchronised?",
      "Are cycles ever allowed? A sequence that re-triggers itself is recursion, forbidden today.",
      "Which configuration abilities does each product mode expose: found modules only, free authoring, or both?",
      "How should graphs migrate and serialise across versions, and what should an edit reset?",
    ],

    sparks: [
      "A visual programming puzzle game where each level's solution is a weapon graph that clears a fixed wave.",
      "Use the same five roles for traps and turrets in a tower defence: a trap is a graph whose root is a Proximity Trigger.",
      "Give enemies graphs too, driven by scripted bitstreams, so the player can steal a module from a boss and see it work in their own gun.",
      "Ship modules as the only loot: no weapons drop, only parts, and the inventory screen is the editor.",
    ],

    terms: [
      { term: "Module class", def: "A role: Trigger, Battery, Barrel, Striker or Payload.", code: "M.types" },
      { term: "Module subclass", def: "A behaviour within a class, such as Repeater Trigger or Sweep Striker.", code: "node.props.subclass" },
      { term: "Module instance", def: "A configured module placed in a graph, with runtime state separate from its configuration.", code: "g.nodes[id]" },
      { term: "Weapon graph (v2)", def: "A saved graph with version 2, run by the sequence runtime; unversioned graphs stay legacy.", code: "version = 2, G.toTable" },
    ],

    sources: [
      "playground:shared/framework/mws/v2modules.lua",
      "playground:shared/framework/mws/v2graph.lua:146",
      "playground:shared/framework/mws/v2runtime.lua:466",
      "playground:games/horde-survivor/weaponprototypes.lua",
      "playground:games/horde-survivor/arsenal.lua:244",
      "playground:docs/Modular_Weapon_System.md",
    ],

    toy: {
      title: "A signal pulse through each bench preset",
      hint: "pick a preset",
      caption: "Pulses crawl along the tiles so the eye can follow; in the game the whole walk happens inside one tick. Battery tiles fill to their sequence's stored energy. Seeking aims instantly, dummies never die, payload damage is left out. Single presets are tapped every 2 s; Toggle once.",
      w: 384, h: 216,
      controls: [
        { type: "select", key: "pre", label: "preset", value: "complete", options: NAMES, reset: true },
        { type: "toggle", key: "dummies", label: "dummies", value: true },
      ],
      init(S, P) {
        const p = PRE[P.pre];
        S.tick = 0; S.E = p.C; S.E2 = p.two ? p.two.C : 0; S.prev = 0; S.phase = 0; S.latched = 0; S.ring = [];
        S.tokens = []; S.shots = []; S.beam = null; S.fields = []; S.last = "";
      },
      update(S, P) {
        const p = PRE[P.pre], si = stkIndex(p);
        S.E = Math.min(p.C, S.E + p.R * STEP); if (p.two) S.E2 = Math.min(p.two.C, S.E2 + p.two.R * STEP);
        const input = p.trig === "single" ? (S.tick % 120 === 10 ? 1 : 0) : p.trig === "toggle" ? (S.tick === 10 ? 1 : 0) : 1;
        let v;
        if (p.trig === "single") v = input && !S.prev ? 1 : 0;
        else if (p.trig === "toggle") { if (input && !S.prev) S.latched = 1 - S.latched; v = S.latched; }
        else { v = S.phase < 1 ? 1 : 0; S.phase = (S.phase + 1) % p.period; }
        S.prev = input;
        if (p.delay) { const i = S.tick % p.delay, o = S.ring[i] || 0; S.ring[i] = v; if (v) S.tokens.push({ row: 0, age: 0, stop: 1, ok: true }); v = o; }
        if (v) {
          const reach = p.k === "ranged" || p.k === "piercing" ? Math.min(p.range, p.speed * (p.life || 3)) : p.range;
          const a = aimAt(PX, PY, reach, P.dummies);
          if (p.k === "ranged" || p.k === "piercing") {
            const n = p.n || 1, need = p.split ? p.e : p.e * n, ok = S.E + 1e-8 >= need;
            if (ok) {
              S.E -= need;
              for (let i = 0; i < n; i++) { const off = n > 1 ? (i / (n - 1) - 0.5) * Math.PI / 3 : 0; S.shots.push({ x: PX, y: PY, a: a + off, d: 0, hits: 0, set: new Set(), share: p.split ? 1 / n : 1 }); }
            }
            S.tokens.push({ row: 0, age: 0, stop: ok ? p.t.length - 1 : si, ok, from: p.delay ? 1 : 0 });
          } else if (!S.beam && S.E + 1e-8 >= p.e) { S.beam = { age: 0, a }; S.tokens.push({ row: 0, age: 0, stop: p.t.length - 1, ok: true }); }
        }
        if (S.beam) {
          const dt = Math.min(STEP, p.dur - S.beam.age), spent = Math.min(S.E, p.drain * dt);
          S.E -= spent; S.beam.age += dt * (spent / (p.drain * dt || 1));
          if (S.E <= 1e-8 || S.beam.age >= p.dur - 1e-8) { S.last = "COMPLETE " + (S.E <= 1e-8 ? "ENERGY" : "DURATION"); S.beam = null; }
        }
        const complete = (s, why) => {
          s.dead = true; S.last = "COMPLETE " + s.hits + " " + why;
          const t = p.two; if (!t || (t.on === "miss" && s.hits > 0)) return;
          const ok = S.E2 + 1e-8 >= 8;
          S.tokens.push({ row: 1, age: 0, stop: ok ? 3 : 2, ok });
          if (ok) S.fields.push({ x: s.x, y: s.y, age: 0 });
        };
        for (const s of S.shots) {
          const st = Math.min(p.speed * STEP, p.range - s.d);
          s.x += Math.cos(s.a) * st; s.y += Math.sin(s.a) * st; s.d += st;
          if (P.dummies) DUMMIES.forEach(([x, y], i) => {
            if (s.dead || s.set.has(i) || Math.hypot(x - s.x, y - s.y) > 9) return;
            s.set.add(i); s.hits++;
            if (p.k === "ranged") complete(s, "HIT"); else if (s.hits >= p.limit) complete(s, "HIT_LIMIT");
          });
          if (!s.dead && s.d >= p.range - 1e-8) complete(s, "RANGE");
        }
        S.shots = S.shots.filter((s) => !s.dead);
        const live = S.fields.filter((f) => f.age < p.two?.dur), demand = 8 * live.length * STEP;
        const frac = demand ? Math.min(S.E2, demand) / demand : 1; S.E2 -= Math.min(S.E2, demand);
        for (const f of live) f.age += STEP * frac;
        S.fields = live.filter((f) => S.E2 > 1e-8);
        for (const k of S.tokens) k.age += STEP;
        S.tokens = S.tokens.filter((k) => k.age < 0.6);
        S.tick++;
      },
      draw(g, S, P) {
        const C = g.C, p = PRE[P.pre], si = stkIndex(p);
        g.clear();
        const tile = (row, i, label) => {
          const x = 8 + (row ? si * (TW + TG) : 0) + i * (TW + TG), y = 36 + row * 34;
          g.rect(x, y, TW, 20, C.ink2, 1);
          if (/^BAT/.test(label)) { const f = row ? S.E2 / p.two.C : S.E / p.C; g.tone(x + 1, y + 1, TW - 1, 19, 0.15, C.gold); g.rect(x + 1, y + 20 - f * 19, 3, f * 19, C.gold); }
          g.label(label, x + TW / 2 + 3, y + 13, C.ink, "center");
          if (i) g.line(x - TG, y + 10, x, y + 10, C.ink3, 1);
          return [x, y];
        };
        p.t.forEach((l, i) => tile(0, i, l));
        if (p.two) {
          const sx = 8 + si * (TW + TG) + TW / 2;
          g.line(sx, 56, sx, 70, C.ink3, 1, [2, 2]);
          p.two.t.forEach((l, i) => tile(1, i, l));
          g.label("SEQ 2", 8 + si * (TW + TG) - 32, 84, C.ink3);
        }
        for (const k of S.tokens) {
          const base = k.row ? si * (TW + TG) : 0, f = Math.min(1, k.age / 0.4), from = k.from || 0;
          const pos = from + (k.stop - from) * f, x = 8 + base + pos * (TW + TG) + TW / 2, y = 36 + k.row * 34 + 10;
          g.circle(x, y, 3, k.ok || f < 1 ? C.accent : C.enemy);
          if (!k.ok && f >= 1) g.label("SKIP", x, y - 7, C.enemy, "center");
        }
        // arena
        g.line(8, 108, 376, 108, C.rule, 1);
        if (P.dummies) for (const [x, y] of DUMMIES) g.circle(x, y, 6, C.enemy);
        for (const f of S.fields) { g.toneCircle(f.x, f.y, 20, 0.4, C.violet); g.circle(f.x, f.y, 20, C.violet, 1); }
        for (const s of S.shots) { g.ctx.globalAlpha = Math.sqrt(s.share); g.circle(s.x, s.y, 3, C.gold); g.ctx.globalAlpha = 1; }
        if (S.beam) {
          let a = S.beam.a, r = p.range * Math.min(1, S.beam.age / 0.08);
          if (p.k === "sweep") a += p.arc * Math.PI / 180 * (Math.min(1, S.beam.age / p.dur) - 0.5);
          g.line(PX, PY, PX + Math.cos(a) * r, PY + Math.sin(a) * r, C.violet, 3);
        }
        g.circle(PX, PY, 6, C.accent);
        g.label(S.last, 370, 120, C.ink2, "right");
      },
      readout(S, P) {
        const p = PRE[P.pre];
        return "seq 1  " + S.E.toFixed(0) + " / " + p.C + " e" + (p.two ? "    seq 2  " + S.E2.toFixed(0) + " / " + p.two.C + " e" : "");
      },
    },
  });
})();
