// Toy constants: 1 stage px = 2 wu.
var HTS_WU = 2, HTS_AX = 236, HTS_AY = 112;

Wiki.construct({
  id: "hold-to-scan",
  name: "Hold to scan",
  origin: "shmuprouge",
  status: "built",
  statusNote: "Built as a reusable <code>Proximity</code> object; the game uses it once, for the tutorial's artifact scan.",
  summary: "Progress fills while you stay inside a radius and drains, rather than resets, when you leave, so holding position is a skill with forgiveness.",
  tags: ["interaction", "objective", "capture point", "decay"],

  intent:
    "<p>&quot;Get close and hold still&quot; is the simplest objective a shmup can ask for, and the hardest to make fair while things are shooting at you. A reset-on-exit timer punishes one dodge with total loss; a timer that only pauses lets the player dip in and out for free. Draining progress sits between them: a short excursion costs a little, a long one costs it all.</p>" +
    "<p>In the tutorial it teaches approach and loiter, and the tether and expanding ring drawn from the artifact show the link while it fills.</p>",

  how:
    "<h3>The rule</h3>" +
    "<p><code>Proximity.new(target, radius, duration)</code>. Each frame <code>update</code> measures the toroidal-wrapped delta to the target (<code>bounds:wrapDelta</code>):</p>" +
    "<ul><li>inside the radius: <code>progress += dt / duration</code>; at 1 it clamps and returns true (complete);</li>" +
    "<li>outside: <code>progress = max(0, progress &minus; dt &times; decayRate)</code>.</li></ul>" +
    "<p>Fill is measured in time to full; drain is a rate per second. With the shipped values (<code>scanDuration</code> 3.0 s, <code>decayRate</code> 0.5 /s) a full bar takes 3 s to fill and 2 s to empty, so drain is 1.5&times; faster than fill. A one-second step outside costs 1.5 s of holding to win back.</p>" +
    "<h3>Wiring</h3>" +
    "<p>The scan objective's <code>on_start</code> runs <code>start_scan</code>; the processor then updates the proximity by objective id (<code>Processor.updateSpecial</code>, <code>obj.id == \"scan\"</code>) and sets <code>scanComplete</code>, which the <code>scan_complete</code> condition reads ([[mission-system]]). The radius and duration come from <code>Objectives.json</code>; the decay rate is read from <code>entities/Artifact.json</code> on every outside frame, so it is a property of the artifact rather than of the objective. The scan ring (<code>expandSpeed</code> 2.0, 32 segments, green, fill alpha 0.3) and tether (alpha 0.8) are drawn from the artifact.</p>",

  knobs: [
    ["Scan radius", "120 wu", "How close counts as inside", "Objectives.json tutorial.scan.scanRadius"],
    ["Scan duration", "3.0 s", "Time inside to fill from empty", "tutorial.scan.scanDuration"],
    ["Decay rate", "0.5 /s", "Progress lost per second outside", "entities/Artifact.json interaction.decayRate"],
    ["Ring expand speed", "2.0", "Visual pulse of the scan ring", "Artifact.json scanRing.expandSpeed"],
  ],

  related: [
    { id: "mission-system", how: "The scan objective that owns it, wired by objective id." },
    { id: "combat-pressure", how: "Pair a hold with spawn pressure and it becomes a capture point under fire." },
    { id: "build-and-defend", how: "Its sibling: the gate also asks you to stay near the artifact while time passes." },
    { id: "harvest-bar", how: "Another fill-and-hold bar the tutorial introduces." },
  ],

  questions: [
    "Should decay belong to the target (as now, read from Artifact.json) or to the objective, so two scans of one artifact can differ?",
    "Should progress fill faster nearer the centre, to reward commitment rather than edge-hugging?",
    "Nothing interrupts the scan in the tutorial. Is it meant to be done under fire later, and if so, does damage also drain it?",
  ],

  sparks: [
    "Capture under fire: enemies whose attacks knock you outward instead of damaging you, so the drain is the punishment.",
    "Juggling: three zones with a shared decay clock, so the player must cycle between them before any one empties.",
    "Scan a moving target: put the radius on a boss, and the hold becomes a chase at matched speed.",
    "Make decay the difficulty dial: at 0 it is a pause, at 1/duration it is symmetric, above that a dodge is expensive.",
  ],

  terms: [
    { term: "Proximity zone", def: "A target, radius and duration that fills progress while the player is inside.", code: "game/entities/proximity.lua Proximity" },
    { term: "Decay rate", def: "Progress lost per second outside the radius.", code: "Artifact.json interaction.decayRate" },
    { term: "Tether", def: "The line drawn from the artifact to the ship during the scan.", code: "Artifact.json scanRing.tetherAlpha" },
    { term: "Scan", def: "The tutorial objective that uses the proximity zone.", code: "objective id \"scan\", scan_complete" },
  ],

  sources: [
    "shmuprouge:game/entities/proximity.lua",
    "shmuprouge:game/objectives/processor.lua",
    "shmuprouge:shared/data/progression/Objectives.json",
    "shmuprouge:shared/data/entities/Artifact.json",
    "shmuprouge:docs/tutorial/Tutorial.md",
  ],

  toy: {
    title: "Fill inside, drain outside",
    hint: "drag the ship; until you do, it wanders in and out",
    caption: "Same update rule as Proximity:update at the shipped numbers, 1 px = 2 wu. The plot shows the last 10 s of progress. Pushers are invented: they shove the ship outward every 2.5 s, as an enemy might.",
    w: 384, h: 216,
    controls: [
      { type: "range", key: "radius", label: "radius", min: 40, max: 200, step: 10, value: 120, fmt: "{} wu" },
      { type: "range", key: "dur", label: "duration", min: 1, max: 8, step: 0.5, value: 3, fmt: "{} s" },
      { type: "range", key: "decay", label: "decay", min: 0, max: 2, step: 0.1, value: 0.5, fmt: "{} /s" },
      { type: "toggle", key: "push", label: "pushers", value: false },
    ],
    init(S) { S.t = 0; S.p = 0; S.x = HTS_AX + 90; S.y = HTS_AY; S.user = false; S.drag = false; S.hist = []; S.done = 0; S.wins = 0; S.pushT = 2.5; S.kick = 0; S.ka = 0; },
    pointer(e, S) {
      if (e.type === "down") { S.user = true; S.drag = true; }
      if (e.type === "up") S.drag = false;
      if (S.drag) { S.x = e.x; S.y = e.y; }
    },
    update(S, P, dt) {
      S.t += dt;
      if (!S.user) { const r = 60 + 48 * Math.sin(S.t * 1.1 + Math.sin(S.t * 0.23) * 2), a = S.t * 0.35; S.x = HTS_AX + Math.cos(a) * r; S.y = HTS_AY + Math.sin(a) * r * 0.8; }
      if (P.push) {
        S.pushT -= dt;
        if (S.pushT <= 0) { S.pushT = 2.5; S.kick = 0.3; S.ka = Math.atan2(S.y - HTS_AY, S.x - HTS_AX); }
        if (S.kick > 0) { S.kick -= dt; S.x += Math.cos(S.ka) * 160 * dt; S.y += Math.sin(S.ka) * 160 * dt; }
      }
      S.x = Math.max(4, Math.min(380, S.x)); S.y = Math.max(4, Math.min(212, S.y));
      if (S.done > 0) { S.done -= dt; if (S.done <= 0) S.p = 0; }
      else {
        const d = Math.hypot(S.x - HTS_AX, S.y - HTS_AY) * HTS_WU;
        S.inside = d < P.radius;
        if (S.inside) { S.p += dt / P.dur; if (S.p >= 1) { S.p = 1; S.done = 1.2; S.wins++; } }
        else S.p = Math.max(0, S.p - dt * P.decay);
      }
      if (Math.round(S.t * 60) % 6 === 0) { S.hist.push(S.p); if (S.hist.length > 100) S.hist.shift(); }
    },
    draw(g, S, P) {
      const C = g.C; g.clear();
      const r = P.radius / HTS_WU;
      g.toneCircle(HTS_AX, HTS_AY, r, S.inside ? 0.18 : 0.08, C.accent);
      g.circle(HTS_AX, HTS_AY, r, C.accent, 1);
      const ring = r * ((S.t * 2) % 1);
      g.circle(HTS_AX, HTS_AY, ring, C.accent, 0.5);
      g.arc(HTS_AX, HTS_AY, r + 5, -Math.PI / 2, -Math.PI / 2 + S.p * Math.PI * 2, S.done > 0 ? C.gold : C.accent, 3);
      g.circle(HTS_AX, HTS_AY, 7, C.violet);
      if (S.inside) g.line(HTS_AX, HTS_AY, S.x, S.y, C.accent, 1, [3, 3]);
      g.poly([[S.x, S.y - 5], [S.x + 4, S.y + 4], [S.x - 4, S.y + 4]], S.kick > 0 ? C.enemy : C.ink);
      if (S.done > 0) g.text("SCAN COMPLETE", HTS_AX, HTS_AY - r - 12, { color: C.gold, align: "center" });
      // history plot
      g.rect(8, 150, 104, 52, C.rule, 1);
      g.plot(8, 150, 104, 52, S.hist, C.accent, 1.5);
      g.label("progress, last 10 s", 8, 146, C.ink3);
      g.label("fill " + P.dur.toFixed(1) + " s", 8, 60, C.ink2);
      g.label(P.decay > 0 ? "drain " + (1 / P.decay).toFixed(1) + " s" : "drain: never", 8, 72, C.ink2);
      g.label("1 s outside costs", 8, 90, C.ink3);
      g.label((P.decay * P.dur).toFixed(1) + " s inside", 8, 100, C.ink3);
    },
    readout(S) { return "progress " + Math.round(S.p * 100) + "%  " + (S.inside ? "inside" : "outside") + "\nscans " + S.wins; },
  },
});
