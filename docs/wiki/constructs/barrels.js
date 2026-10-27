(function () {
  const RAD = Math.PI / 180, OX = 192, OY = 120, BINS = 180;
  const OPTS = [
    ["none", "(none)"], ["forward", "Forward"], ["directional", "Directional +45°"], ["spread", "Spread 30°"],
    ["multi", "Multi 3 × 30°"], ["alternating", "Alternating 3 × 30°"], ["rotating", "Rotating 90°/s"],
    ["blind", "Blind"], ["bounce", "Bounce (no normal)"], ["refract", "Refract (no normal)"],
  ];
  const wrap = (a) => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  // One Barrel applied to every incoming lane, as R:barrel: base angle, then evenly spaced lane offsets.
  function barrel(kind, lanes, S, P, slot, kit) {
    if (kind === "none") return lanes;
    const out = [];
    for (const l of lanes) {
      let a = l.a, base = 0, count = 1;
      if (kind === "directional") base = 45 * RAD;
      else if (kind === "spread") { let sum = 0; for (let i = 0; i < P.samples; i++) sum += kit.rand(); base = (sum / P.samples - 0.5) * 30 * RAD; }
      else if (kind === "rotating") base = S.t * 90 * RAD; // runtime clock, not time since activation
      else if (kind === "blind") { base = 0; a = kit.rand() * 2 * Math.PI; }
      else if (kind === "bounce") a = a + Math.PI;
      if (kind === "multi" || kind === "alternating") count = 3;
      let first = 0, last = count - 1;
      if (kind === "alternating") { const i = (S.alt[slot] || 0) % count; S.alt[slot] = i + 1; first = last = i; }
      for (let i = first; i <= last; i++) {
        const off = count > 1 ? (i / (count - 1) - 0.5) * 30 * RAD : 0;
        out.push({ a: a + base + off, aimed: true });
      }
    }
    return out;
  }
  function chain(S, P, kit) {
    let lanes = [{ a: 0, aimed: false }];
    [P.b1, P.b2, P.b3].forEach((k, i) => { lanes = barrel(k, lanes, S, P, i, kit); });
    // no Barrel anywhere: the Striker picks a random direction
    return lanes.map((l) => (l.aimed ? l.a : kit.rand() * 2 * Math.PI));
  }

  Wiki.construct({
    id: "barrels",
    name: "Barrel transforms",
    origin: "playground",
    status: "partial",
    statusNote: "Twelve Barrel subclasses are built in the MWS v2 runtime. Oscillating, Zig-zag, Mixer, Revolver and Random are spec only: the last three need several inputs, which the single-parent graph cannot express yet. Rotating behaves differently from its spec description.",
    summary: "Barrels are the aiming parts: each takes the incoming direction and passes a transformed one on, in order, and a weapon with no Barrel at all fires in a random direction.",
    tags: ["direction", "aim", "spread", "order matters"],

    intent:
      "<p>Aim is built, not given. A rear gun is a Directional 180&deg;, a sprinkler is a Rotating Barrel on a fast Repeater, a shotgun is a Multi, a drunk gun is a Blind. Because Barrels compose in series, two cheap parts make a third behaviour: Rotating then Multi is a spinning fan.</p>" +
      "<p>Making the bare gun random gives Barrels value. A starter weapon with none sprays everywhere; the first Forward Barrel a player finds is a real upgrade.</p>",

    how:
      "<h3>DOI and the packet</h3>" +
      "<p>The <b>DOI</b> (direction of input) travels with the signal in a packet, together with the origin and, in event sequences, the collision normal. A root packet takes the wielder's position and aim (<code>aimX, aimY</code>); an event packet takes the event's point, direction and normal. Each Barrel rotates the packet it receives and marks it <code>aimed</code>. At spawn, a packet that never passed a Barrel gets a uniformly random angle: no Barrel means random fire, ignoring the DOI.</p>" +
      "<h3>The direction Barrels</h3>" +
      "<div class=\"tbl-wrap\"><table><thead><tr><th>Subclass</th><th>Code behaviour</th></tr></thead><tbody>" +
      "<tr><td>Forward</td><td>Passes the DOI unchanged; has no angle setting.</td></tr>" +
      "<tr><td>Directional</td><td>Adds <code>angle</code> to the DOI. At 0 it equals Forward.</td></tr>" +
      "<tr><td>Rotating</td><td>Adds <code>angle + time &times; rotationSpeed</code>, where time is the runtime clock since the last rebuild.</td></tr>" +
      "<tr><td>Blind</td><td>A uniformly random absolute direction; drops any targeting.</td></tr>" +
      "<tr><td>Spread</td><td>Adds <code>(mean of 6 uniform draws &minus; 0.5) &times; spread</code>.</td></tr>" +
      "<tr><td>Multi</td><td><code>count</code> lanes at once, evenly spaced across <code>spread</code>. Before a Striker: a full volley; after: a split ([[multi-ordering]]).</td></tr>" +
      "<tr><td>Alternating</td><td>One of <code>count</code> evenly spaced lanes per firing opportunity, round-robin.</td></tr>" +
      "<tr><td>Seeking, Weakling, Bossling</td><td>Turn toward a chosen enemy at limited speed; see [[targeting-turn]].</td></tr>" +
      "<tr><td>Bounce</td><td>With a normal: reflect, <code>d &minus; 2(d&middot;n)n</code>. Without: reverse.</td></tr>" +
      "<tr><td>Refract</td><td>With a normal: point along <code>&minus;n</code>. Without: unchanged.</td></tr>" +
      "</tbody></table></div>" +
      "<p><b>Code vs spec, Rotating:</b> the spec says it should \"rotate around a point, starting at incoming DOI\". The code spins the heading by the global runtime time, so it does not start at the DOI when you begin firing; it is wherever the clock has turned it.</p>" +
      "<h3>Spread is a bell, bounded</h3>" +
      "<p>The mean of six uniform draws is an Irwin-Hall distribution (n = 6) scaled to the cone: most shots land near the centre, and none can exceed &plusmn;spread/2. Nothing is clamped, so shots never pile up at the edges as they would with a clamped normal distribution. The legacy runtime used a uniform <code>spreadVariance</code> wobble instead.</p>" +
      "<h3>Alternating counts opportunities</h3>" +
      "<p>The lane index advances each time the Barrel runs with a hot signal. Before a Striker that is once per hot tick; after a Striker it is once per strike request. Lanes map cyclically onto connected children by port, so three lanes into three Strikers rotate through three different weapons. The battery mark for an Alternating route uses its most expensive lane.</p>" +
      "<h3>Bounce and Refract need a normal</h3>" +
      "<p>They are meant for event sequences: Hit &rarr; Bounce &rarr; Ranged is a ricochet. The contact normal is the unit vector from the enemy's centre to the contact point; sustained strikes give an approximate one. In a root sequence there is no normal, so Bounce reverses and Refract passes through.</p>" +
      "<h3>Spec-only Barrels</h3>" +
      "<div class=\"tbl-wrap\"><table><thead><tr><th>Subclass</th><th>Intended behaviour</th><th>Blocked by</th></tr></thead><tbody>" +
      "<tr><td>Oscillating</td><td>Sinusoidal motion perpendicular to the DOI</td><td>How motion Barrels interact with Striker movement</td></tr>" +
      "<tr><td>Zig-zag</td><td>Sawtooth motion perpendicular to the DOI</td><td>Same</td></tr>" +
      "<tr><td>Mixer</td><td>N inputs into one output at their average DOI</td><td>Multi-input joins; circular averaging of opposing inputs</td></tr>" +
      "<tr><td>Revolver</td><td>N inputs output one after another</td><td>Multi-input joins; synchronisation</td></tr>" +
      "<tr><td>Random</td><td>Pick one of N inputs, output at the average DOI</td><td>Joins; which input's metadata is kept</td></tr>" +
      "</tbody></table></div>" +
      "<p>The legacy Striker's <code>motionType = sine</code> with <code>waveAmplitude</code>/<code>waveFrequency</code> is the closest built cousin of Oscillating.</p>",

    knobs: [
      ["Angle offset", "0°", "Added to the DOI (not on Forward or Blind)", "angle (-180..180)"],
      ["Spread arc", "30°", "Cone of Spread; fan width of Multi and Alternating", "spread (0-360)"],
      ["Directions", "3", "Lanes of Multi or Alternating", "count (2-8)"],
      ["Rotation", "90°/s", "Rotating's spin rate", "rotationSpeed (-720..720)"],
      ["Output ports", "8", "Children a Barrel can feed; lanes wrap onto them", "M.byId.barrel.outputs"],
    ],

    related: [
      { id: "targeting-turn", how: "The three targeting Barrels and their turn speed." },
      { id: "multi-ordering", how: "The Multi Barrel means two things depending on its side of the Striker." },
      { id: "delay-echo", how: "Barrels before a Delay are baked into the captured heading." },
      { id: "sequences", how: "Bounce and Refract use the collision normal an event carries." },
    ],

    questions: [
      "Should Rotating start at the incoming DOI each time firing begins, as the spec says, or keep the global clock?",
      "Mixer and Random average directions: circular or vector mean, and what happens with exactly opposing inputs?",
      "How should Oscillating and Zig-zag combine with a Striker's own movement?",
      "What is the right refraction maths? The spec lists it as open; the code simply points along the reversed normal.",
    ],

    sparks: [
      "Rotating into a three-lane Multi on a fast Repeater is a bullet-hell sprinkler built from two common parts.",
      "Make Blind a debuff: an enemy status that swaps every Barrel on the player's weapon for Blind for three seconds.",
      "Ship starter guns with no Barrel and sell aiming as loot, so the first Forward Barrel feels like learning to shoot.",
      "Alternating into three different Strikers is a weapon wheel that turns one notch per shot, cheap, expensive, cheap.",
    ],

    terms: [
      { term: "DOI", def: "Direction of input: the heading supplied by the wielder or an upstream event, transformed by Barrels in order.", code: "packet.dx, packet.dy" },
      { term: "Spread Barrel", def: "Samples a direction inside its cone from the mean of six uniform draws: bell-shaped, centre-weighted, hard-bounded.", code: "R:barrel, spread" },
      { term: "Alternating Barrel", def: "Round-robin through evenly spaced directions, one per firing opportunity.", code: "ctx.states[\"barrel:\"..]" },
      { term: "Collision normal", def: "Unit vector from an enemy's centre to the contact point, carried by Hit events for Bounce and Refract.", code: "event.nx, event.ny" },
    ],

    sources: [
      "playground:shared/framework/mws/v2runtime.lua:126",
      "playground:shared/framework/mws/v2runtime.lua:296",
      "playground:shared/framework/mws/v2modules.lua:39",
      "playground:docs/Modular_Weapon_System.md",
      "playground:docs/MWS_Implementation.md",
    ],

    toy: {
      title: "Three Barrel slots on a Repeater",
      hint: "stack Barrels, then switch to the histogram",
      caption: "Repeater 6 ticks (10 shots/s), shots at 150 px/s for 180 px, DOI to the right. Each line is one shot's path. The histogram bins 20 chain evaluations per tick by angle from the DOI. Empty slots are skipped; all three empty means no Barrel at all.",
      w: 384, h: 216,
      controls: [
        { type: "select", key: "b1", label: "barrel 1", value: "spread", options: OPTS, reset: true },
        { type: "select", key: "b2", label: "barrel 2", value: "none", options: OPTS, reset: true },
        { type: "select", key: "b3", label: "barrel 3", value: "none", options: OPTS, reset: true },
        { type: "select", key: "view", label: "view", value: "fire", options: [["fire", "fire"], ["hist", "histogram"]], reset: true },
        { type: "range", key: "samples", label: "spread samples", min: 1, max: 6, value: 6, reset: true },
      ],
      init(S) { S.t = 0; S.tick = 0; S.alt = []; S.shots = []; S.hist = new Array(BINS).fill(0); S.n = 0; },
      update(S, P, dt, kit) {
        S.t += dt;
        if (P.view === "hist") {
          for (let k = 0; k < 20; k++) for (const a of chain(S, P, kit)) {
            const b = Math.floor((wrap(a) + Math.PI) / (2 * Math.PI) * BINS);
            S.hist[Math.min(BINS - 1, b)]++; S.n++;
          }
        } else {
          if (S.tick % 6 === 0) for (const a of chain(S, P, kit)) S.shots.push({ a, d: 0 });
          for (const s of S.shots) s.d = Math.min(180, s.d + 150 * dt);
          S.shots = S.shots.filter((s) => s.d < 180);
        }
        S.tick++;
      },
      draw(g, S, P) {
        const C = g.C;
        g.clear();
        if (P.view === "hist") {
          const max = Math.max(1, ...S.hist), w = 360 / BINS;
          for (let i = 0; i < BINS; i++) {
            const h = S.hist[i] / max * 150;
            g.rect(12 + i * w, 196 - h, Math.max(1, w - 0.5), h, C.gold);
          }
          g.line(12, 196, 372, 196, C.ink3, 1);
          g.line(192, 40, 192, 196, C.accent, 1, [2, 3]);
          g.label("-180°", 12, 208, C.ink3); g.label("DOI", 192, 208, C.accent, "center"); g.label("+180°", 372, 208, C.ink3, "right");
          return;
        }
        g.circle(OX, OY, 75, C.rule, 1);
        for (const s of S.shots) {
          const x = OX + Math.cos(s.a) * s.d, y = OY + Math.sin(s.a) * s.d;
          g.line(OX, OY, x, y, C.ink3, 1);
          g.circle(x, y, 2.5, C.gold);
        }
        g.circle(OX, OY, 6, C.accent);
        g.arrow(OX + 8, OY, OX + 26, OY, C.accent, 1.5);
        g.label("DOI", OX + 30, OY + 3, C.accent);
        const names = [P.b1, P.b2, P.b3].filter((k) => k !== "none");
        g.label(names.length ? "REPEATER > " + names.join(" > ").toUpperCase() + " > RANGED" : "NO BARREL: RANDOM DIRECTION", 8, 208, C.ink2);
      },
      readout(S, P) { return P.view === "hist" ? "samples " + S.n : "shots in flight " + S.shots.length + "   t " + S.t.toFixed(1) + " s"; },
    },
  });
})();
