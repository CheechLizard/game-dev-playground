(function () {
  const PX = 52; // player x
  function nearest(S, x, y) {
    let best = null, d2 = Infinity;
    for (const e of S.enemies) { const d = (e.x - x) ** 2 + (e.y - y) ** 2; if (d < d2) { d2 = d; best = e; } }
    return best;
  }

  Wiki.construct({
    id: "delay-echo",
    name: "Delay echo",
    origin: "playground",
    status: "built",
    statusNote: "Built in the MWS v2 runtime; the <em>Delayed single</em> bench preset (Single &rarr; Delay 60 &rarr; Battery &rarr; Seeking &rarr; Ranged) shows it. Delay units and rounding are an open spec decision; the code uses integer ticks.",
    summary: "A Delay Trigger shifts the shot in space as well as time: it fires from where you were and in the direction you were facing, unless a targeting Barrel after it aims at the moment of firing.",
    tags: ["timing", "position", "echo", "order matters"],

    intent:
      "<p>A delayed shot that comes from your current position is only a slow gun. One that comes from where you stood a second ago is a different weapon: you leave turrets of intent behind you, and moving away from your own fire becomes a tactic. It also gives you time-offset attacks (echoes, afterimages, delayed detonations) as a property of the weapon rather than a backlog of input.</p>" +
      "<p>The order of parts decides what is remembered. Aim before the Delay and the echo keeps the old heading; aim after it and the echo picks its target when it fires.</p>",

    how:
      "<h3>The signal side</h3>" +
      "<p>The Delay Trigger keeps a ring of <code>delayTicks</code> bits and outputs the one written that many ticks ago (see [[trigger-chain]]). Hot and cold both echo, so the whole pattern, releases included, repeats later. Later input cannot cancel or reset an earlier echo. 60 ticks is one second.</p>" +
      "<h3>The spatial side</h3>" +
      "<p>Alongside the bits, the runtime keeps a parallel ring of execution packets: origin <code>x, y</code> and heading <code>dx, dy</code> (the DOI), copied each tick with any live targeting reference stripped (<code>h[i].steering = nil</code>). When a delayed bit comes out, the packet that went in with it replaces the current one and is marked <code>fixed</code>. Consequences:</p>" +
      "<ul><li>The strike starts from the <b>captured origin</b>, not from the wielder. A sustained strike from a delayed packet stays there rather than following the wielder.</li>" +
      "<li>The heading is the one the packet had when it entered the Delay. A Seeking Barrel <em>before</em> the Delay aims at where the target was.</li>" +
      "<li>A targeting Barrel <em>after</em> the Delay works on the replayed packet, so it aims from the captured origin at execution time. The bench preset puts Seeking after Delay for exactly this reason.</li></ul>" +
      "<h3>Keeping echoes alive</h3>" +
      "<p>An execution context spawned by an event normally ends once it has no live strikes. A sequence containing Delays keeps its contexts alive <code>delayTicks + 2</code> ticks after their last hot tick (<code>seq.delayTicks</code> sums every Delay in the sequence), so a pending echo inside an event sequence still fires.</p>" +
      "<h3>What it replaced</h3>" +
      "<p>Delay replaces the Trigger previously called Timer. The Timer <em>Battery</em> in the spec is unrelated and keeps its name.</p>",

    knobs: [
      ["Delay", "1 tick (preset 60)", "How many ticks the bit and its packet wait", "delayTicks (0-36000)"],
      ["Barrel position", "after Delay (preset)", "Before: heading captured. After: target picked at execution", "graph order"],
      ["Shot speed", "200 px/s (preset)", "How far the echo travels; preset range 250 px", "speed, range"],
    ],

    related: [
      { id: "trigger-chain", how: "The Delay's signal rule and how it chains with Single and Repeater." },
      { id: "targeting-turn", how: "Seeking after a Delay aims at execution time." },
      { id: "sequences", how: "Event contexts stay alive until their echoes fire." },
      { id: "barrels", how: "Every Barrel before the Delay is baked into the captured heading." },
    ],

    questions: [
      "Should designers author Delay in seconds, with rounding to ticks, or in ticks as the code does now?",
      "Should a delayed sustained strike be able to follow the wielder after all? The prototype keeps it at the captured origin; the spec lists origin attachment as open Striker work.",
    ],

    sparks: [
      "A ghost weapon: every shot repeats one second later from your old position, so the best players fire, then move to put enemies between the two lines of fire.",
      "Canon fire: three Delays of 20, 40 and 60 ticks on parallel branches make a round played in bullets.",
      "A time-loop game where your last five seconds of fire replay from your old positions while you play the next five.",
      "Trap-laying stealth: a long Delay with no Barrel after it turns every shot into a planted charge facing the way you looked.",
    ],

    terms: [
      { term: "Captured origin", def: "The position and heading a Delay stored with a bit, used in place of the wielder's when that bit comes out.", code: "ctx.buffers, packet.fixed" },
      { term: "Packet", def: "The spatial context that flows with the signal: origin, DOI, collision normal and any live targeting reference.", code: "R:packet" },
    ],

    sources: [
      "playground:shared/framework/mws/v2runtime.lua:324",
      "playground:shared/framework/mws/v2runtime.lua:534",
      "playground:shared/framework/mws/triggers.lua:45",
      "playground:games/horde-survivor/weaponprototypes.lua:59",
      "playground:docs/MWS_Implementation.md",
    ],

    toy: {
      title: "Fire, then watch where it comes from",
      hint: "click to fire; drag the player to move it",
      caption: "The player drifts up and down; each ring is a captured origin counting down. Seeking aims instantly here (the game turns at 180°/s). Battery, payload and damage are left out.",
      w: 384, h: 216,
      controls: [
        { type: "range", key: "delay", label: "delayTicks", min: 0, max: 180, value: 60, reset: true },
        { type: "select", key: "aim", label: "Seeking", value: "after", options: [["after", "after Delay (aims at firing)"], ["before", "before Delay (heading captured)"]] },
        { type: "select", key: "trig", label: "trigger", value: "single", options: [["single", "Single"], ["rep", "Repeater 18"]], reset: true },
        { type: "toggle", key: "drift", label: "player drifts", value: true },
      ],
      init(S) {
        S.t = 0; S.tick = 0; S.py = 110; S.held = false; S.press = false; S.drag = false; S.prev = 0; S.phase = 0;
        S.bits = []; S.pk = []; S.inRow = []; S.outRow = []; S.shots = []; S.fired = 0; S.hits = 0;
        S.enemies = [{ x: 300, y0: 70, ph: 0, y: 70 }, { x: 330, y0: 150, ph: 2, y: 150 }];
      },
      pointer(e, S) {
        if (e.type === "down") {
          if (Math.hypot(e.x - PX, e.y - S.py) < 14) S.drag = true;
          else { S.press = true; S.held = true; }
        }
        if (e.type === "move" && S.drag) S.py = Math.max(40, Math.min(185, e.y));
        if (e.type === "up") { S.held = false; S.drag = false; }
      },
      update(S, P, dt) {
        S.t += dt;
        if (P.drift && !S.drag) S.py = 112 + 60 * Math.sin(S.t * 0.8);
        for (const e of S.enemies) e.y = e.y0 + 40 * Math.sin(S.t * 0.9 + e.ph);
        const input = S.press || S.held ? 1 : 0; S.press = false;
        // first Trigger: Single or Repeater (period 18, width 1)
        let v;
        if (P.trig === "single") v = input === 1 && S.prev === 0 ? 1 : 0;
        else if (!input) { S.phase = 0; v = 0; } else { v = S.phase < 1 ? 1 : 0; S.phase = (S.phase + 1) % 18; }
        S.prev = input;
        // packet entering the Delay; Seeking before Delay bakes its heading in now
        let a = 0;
        if (P.aim === "before") { const t = nearest(S, PX, S.py); a = Math.atan2(t.y - S.py, t.x - PX); }
        let pk = { x: PX, y: S.py, a, t: S.tick }, out = v;
        if (P.delay > 0) {
          const i = S.tick % P.delay;
          out = S.bits[i] || 0; const old = S.pk[i];
          S.bits[i] = v; S.pk[i] = pk;
          pk = old || pk;
        }
        if (out) {
          let dir = pk.a;
          if (P.aim === "after") { const t = nearest(S, pk.x, pk.y); dir = Math.atan2(t.y - pk.y, t.x - pk.x); }
          S.shots.push({ x: pk.x, y: pk.y, ox: pk.x, oy: pk.y, a: dir, d: 0 }); S.fired++;
        }
        S.inRow.push(v); S.outRow.push(out);
        if (S.inRow.length > 150) { S.inRow.shift(); S.outRow.shift(); }
        for (const s of S.shots) {
          const step = Math.min(200 * dt, 250 - s.d);
          s.x += Math.cos(s.a) * step; s.y += Math.sin(s.a) * step; s.d += step;
          for (const e of S.enemies) if (!s.dead && Math.hypot(e.x - s.x, e.y - s.y) < 10) { s.dead = true; e.hit = 0.15; S.hits++; }
          if (s.d >= 250) s.dead = true;
        }
        S.shots = S.shots.filter((s) => !s.dead);
        for (const e of S.enemies) e.hit = Math.max(0, (e.hit || 0) - dt);
        S.tick++;
      },
      draw(g, S, P) {
        const C = g.C;
        g.clear();
        for (const e of S.enemies) g.circle(e.x, e.y, 7, e.hit ? C.ink : C.enemy);
        // pending captured origins: entries in the ring whose bit is hot
        if (P.delay > 0) for (let i = 0; i < P.delay; i++) {
          if (!S.bits[i] || !S.pk[i]) continue;
          const p = S.pk[i], left = p.t + P.delay - S.tick, f = Math.max(0, left / P.delay);
          g.circle(p.x, p.y, 8, C.ink3, 1);
          g.arc(p.x, p.y, 8, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2, C.gold, 2);
          if (P.aim === "before") g.line(p.x, p.y, p.x + Math.cos(p.a) * 16, p.y + Math.sin(p.a) * 16, C.gold, 1, [2, 2]);
        }
        for (const s of S.shots) {
          g.line(s.ox, s.oy, s.x, s.y, C.ink3, 1);
          g.circle(s.x, s.y, 3, C.gold);
        }
        g.circle(PX, S.py, 7, C.accent);
        g.arrow(PX + 8, S.py, PX + 20, S.py, C.accent, 1);
        // bit rows: what entered the Delay, what came out
        const n = S.inRow.length;
        g.label("IN", 6, 199, C.ink3); g.label("OUT", 6, 211, C.ink3);
        for (let i = 0; i < n; i++) {
          const x = 30 + i * 2.3;
          if (S.inRow[i]) g.rect(x, 192, 2, 8, C.ink);
          if (S.outRow[i]) g.rect(x, 204, 2, 8, C.gold);
        }
      },
      readout(S, P) {
        return "delay " + P.delay + " ticks = " + (P.delay / 60).toFixed(2) + " s   fired " + S.fired + "   hits " + S.hits;
      },
    },
  });
})();
