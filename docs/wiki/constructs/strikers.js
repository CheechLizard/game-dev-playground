(function () {
  const OX = 40, OY = 112, ER = 6, STEP = 1 / 60, RAD = Math.PI / 180;
  const DUMMIES = [[58, 112], [100, 108], [140, 118], [180, 112], [220, 104], [262, 112], [302, 120], [40, 147], [92, 60], [100, 168]];
  const segDist2 = (ex, ey, x, y, dx, dy, len) => { const t = Math.max(0, Math.min(len, (ex - x) * dx + (ey - y) * dy)); return (ex - x - t * dx) ** 2 + (ey - y - t * dy) ** 2; };

  Wiki.construct({
    id: "strikers",
    name: "Striker shapes",
    origin: "playground",
    status: "built",
    statusNote: "Ranged, Piercing, Stab, Sweep, Area and Orbit are built in the MWS v2 runtime (F8 bench). The spec's Drone Striker is not. Origin attachment, release and cancellation rules, and beam and field hit counting are still open in the spec.",
    summary: "The Striker is the part that exists in the world: it places and moves a collider, applies Payloads on contact, and reports Hits and one Complete, ending for a reason a later sequence can read.",
    tags: ["collider", "beam", "projectile", "field", "lifecycle"],

    intent:
      "<p>Bullet, spear, sword arc, aura, orbiting blade: the shape of an attack is what the player reads first. Separating the shape from its damage ([[payloads]]) and its power ([[sequence-reservoir]]) means one sword swing can carry fire or plasma, and one beam can run on a tiny battery or a huge one, without new code.</p>" +
      "<p>The completion reason is the Striker's other output. \"Ended by range\", \"ended on a hit\", \"ran out of energy\" are distinct events, so later sequences and feedback can react to <em>how</em> a strike ended.</p>",

    how:
      "<h3>The six shapes</h3>" +
      "<div class=\"tbl-wrap\"><table><thead><tr><th>Subclass</th><th>Collider</th><th>Ends with</th><th>Pays</th></tr></thead><tbody>" +
      "<tr><td>Ranged</td><td>Circle of <code>radius</code> moved <code>min(speed&times;dt, range left)</code> per tick, swept along its segment</td><td><code>hit</code> on first contact, <code>range</code>, <code>duration</code></td><td>Shot energy once</td></tr>" +
      "<tr><td>Piercing</td><td>Same, passing through targets</td><td><code>hit_limit</code> after <code>hitLimit</code> distinct targets, <code>range</code>, <code>duration</code></td><td>Shot energy once</td></tr>" +
      "<tr><td>Stab</td><td>Thick line from the origin along the aim, growing to <code>range</code> over <code>extendTime</code></td><td><code>duration</code>, <code>release</code>, <code>energy</code></td><td>Start charge, then drain</td></tr>" +
      "<tr><td>Sweep</td><td>The same line, its angle moving <code>base + arc &times; (min(1, age/duration) &minus; 0.5)</code></td><td>Same as Stab</td><td>Start charge, then drain</td></tr>" +
      "<tr><td>Area</td><td>A sector of <code>radius</code> around the origin, <code>arc</code> wide around the aim</td><td>Same as Stab</td><td>Start charge, then drain</td></tr>" +
      "<tr><td>Orbit</td><td>A circle at <code>orbitRadius</code> from the origin, starting at the aim, moving <code>orbitSpeed</code></td><td>Same as Stab</td><td>Start charge, then drain</td></tr>" +
      "</tbody></table></div>" +
      "<p>Enemies are circles, and a contact counts when the distance is within collider radius plus enemy radius. Projectile contacts in one tick are sorted by distance along the path, then by enemy order, so a Piercing shot hits in travel order. Each collider hits each distinct target once (<code>hitSet</code>); sustained Plasma keeps dealing damage while it overlaps but adds no further Hits.</p>" +
      "<h3>Extend time</h3>" +
      "<p>Stab and Sweep grow linearly from the origin to full reach over <code>extendTime</code> (0.08 s). The drawn length and the collision length are the same number, so a far target cannot be hit before the tip arrives. Every fresh strike re-extends, including restarts after exhaustion ([[sustained-drain]]).</p>" +
      "<h3>Sweep and release</h3>" +
      "<p>The sweep covers its full arc over the strike's <code>duration</code>, not over a separate swing time. With the defaults (3 s, release ends on) a 1-second tap sweeps only a third of the arc before release ends it; the <em>Sweep</em> preset uses a 0.8 s duration with release off so each pulse completes its arc.</p>" +
      "<h3>The 20 px cap</h3>" +
      "<p>Collider radius is limited to 0.5-20 px (commit <code>bf153cc</code>). That limits Area fields to small circles: the field presets all sit at the 20 px maximum. Larger shapes are meant to come from Payload-owned geometry, which is deferred.</p>" +
      "<h3>Origins and aim</h3>" +
      "<p>Sustained strikes from the root sequence follow the wielder; those from an event or a Delay stay at their captured origin. Projectiles keep their launch heading. Sustained strikes follow a targeting Barrel's aim as it turns ([[targeting-turn]]). Ranged and Piercing request a strike on every hot tick; a sustained Striker keeps at most one live strike per route and ignores hot ticks while it lives.</p>" +
      "<h3>Completion reasons</h3>" +
      "<p><code>hit</code>, <code>hit_limit</code>, <code>range</code>, <code>duration</code>, <code>release</code>, <code>energy</code>. Each strike has exactly one Complete with its final hit count ([[sequences]]). A paid projectile can never end by <code>energy</code>.</p>",

    knobs: [
      ["Speed", "150 px/s", "Projectile travel per second", "speed (0-500)"],
      ["Range / reach", "180 px", "Projectile distance limit; beam length", "range (5-500)"],
      ["Max duration", "3 s", "Lifetime limit; also the Sweep's sweep time", "duration (0.05-20)"],
      ["Collider radius", "3 px", "Thickness of every shape; Area's size", "radius (0.5-20)"],
      ["Piercing hit limit", "4", "Distinct targets before hit_limit", "hitLimit (2-30)"],
      ["Sweep / area arc", "120°", "Sweep angle covered; Area sector width", "arc (1-360)"],
      ["Orbit radius, speed", "35 px, 180°/s", "Orbit path and rate", "orbitRadius, orbitSpeed"],
      ["Extend time", "0.08 s", "Stab/Sweep growth to full reach", "extendTime"],
    ],

    related: [
      { id: "sustained-drain", how: "How Stab, Sweep, Area and Orbit are paid for and exhaust." },
      { id: "sequences", how: "Where Hit and Complete go next." },
      { id: "payloads", how: "What a contact does is the Payload's job, not the Striker's." },
      { id: "targeting-turn", how: "Reach sets which enemies a targeting Barrel may pick." },
      { id: "drones", how: "The spec's Drone Striker: a guided projectile not yet built." },
    ],

    questions: [
      "Should a beam or field count a Hit per contact, per distinct target (the current code) or per damage tick?",
      "How should origin attachment, release and cancellation work per subclass? The code follows the wielder for root sustained strikes and offers one <code>releaseEnds</code> switch.",
      "Should the Sweep have its own swing time instead of reusing <code>duration</code>?",
      "Who owns large shapes once the 20 px collider cap stays: the Striker or the Payload?",
    ],

    sparks: [
      "Extend time as the weight of a weapon: a greatsword is a Stab with a slow extend, so near enemies are hit before far ones and positioning matters.",
      "Feed Piercing Hits into a second sequence for chain-per-pierce: every body the spear passes through throws a spark.",
      "Orbit around an event point is a satellite mine that circles where the shot landed.",
      "Range against speed &times; duration as two upgrades that fight: buying speed is wasted until duration is long enough to use it.",
    ],

    terms: [
      { term: "Strike", def: "One logical activation of a Striker, possibly with several child colliders, ending in one Complete.", code: "group" },
      { term: "Collider", def: "One physical shape a strike places in the world.", code: "s (strike child)" },
      { term: "Extend time", def: "Time for a Stab or Sweep and its collision shape to grow from the origin to full reach; 0.08 s by default.", code: "extendTime, s.reach" },
      { term: "Completion reason", def: "Why a strike ended: hit, hit_limit, range, duration, release or energy.", code: "s.endReason" },
    ],

    sources: [
      "playground:shared/framework/mws/v2runtime.lua:380",
      "playground:shared/framework/mws/v2modules.lua:54",
      "playground:shared/framework/mws/v2runtime.lua:277",
      "playground:docs/Modular_Weapon_System.md",
      "playground:docs/MWS_Implementation.md",
    ],

    toy: {
      title: "One strike at a time against a field of dummies",
      hint: "pick a Striker; shorten the hold to see release",
      caption: "Game defaults. The trigger is held for the hold time, then released; a new strike starts 0.8 s after the last Complete. Numbers mark hit order. Starved gives the sustained strike exactly its 8 e start charge, 4 e/s drain, no refill.",
      w: 384, h: 216,
      controls: [
        { type: "select", key: "stk", label: "striker", value: "piercing", options: [["ranged", "Ranged"], ["piercing", "Piercing"], ["stab", "Stab"], ["sweep", "Sweep"], ["area", "Area"], ["orbit", "Orbit"]], reset: true },
        { type: "range", key: "radius", label: "radius", min: 0.5, max: 20, step: 0.5, value: 3, fmt: "{} px", reset: true },
        { type: "range", key: "range", label: "range", min: 5, max: 300, value: 180, fmt: "{} px", reset: true },
        { type: "range", key: "hold", label: "hold", min: 0.2, max: 4, step: 0.1, value: 1.5, fmt: "{} s", reset: true },
        { type: "toggle", key: "release", label: "releaseEnds", value: true, reset: true },
        { type: "toggle", key: "starved", label: "starved battery", value: false, reset: true },
      ],
      init(S) { S.s = null; S.wait = 0.3; S.log = []; S.marks = []; },
      update(S, P, dt) {
        const sustained = !(P.stk === "ranged" || P.stk === "piercing");
        if (!S.s) {
          S.wait -= dt;
          if (S.wait <= 0) { S.s = { x: OX, y: OY, age: 0, dist: 0, hits: 0, set: new Set(), hold: 0, E: P.starved ? 8 : 1e9 }; S.marks = []; S.log = []; }
          return;
        }
        const s = S.s, log = (t) => { S.log.push(t); if (S.log.length > 6) S.log.shift(); };
        const finish = (why) => { log("COMPLETE  " + s.hits + "  " + why); S.s = null; S.wait = 0.8; };
        s.hold += dt;
        if (sustained && P.release && s.hold > P.hold) return finish("RELEASE");
        if (sustained) { const spent = Math.min(s.E, 4 * dt); s.E -= spent; dt *= spent / (4 * dt); }
        const ox = s.x, oy = s.y, step = Math.min(150 * dt, Math.max(0, P.range - s.dist));
        s.age += dt;
        let dx = 1, dy = 0, reach = P.range * Math.min(1, s.age / 0.08);
        if (!sustained) { s.x += step; s.dist += step; }
        if (P.stk === "sweep") { const a = 120 * RAD * (Math.min(1, s.age / 3) - 0.5); dx = Math.cos(a); dy = Math.sin(a); s.dx = dx; s.dy = dy; }
        if (P.stk === "orbit") { const a = s.age * 180 * RAD; s.x = OX + Math.cos(a) * 35; s.y = OY + Math.sin(a) * 35; }
        const r = P.radius + ER;
        const hits = [];
        DUMMIES.forEach(([ex, ey], i) => {
          let over;
          if (!sustained) over = segDist2(ex, ey, ox, oy, 1, 0, step) <= r * r;
          else if (P.stk === "stab" || P.stk === "sweep") over = segDist2(ex, ey, OX, OY, dx, dy, reach) <= r * r;
          else if (P.stk === "area") over = (ex - OX) ** 2 + (ey - OY) ** 2 <= r * r && Math.abs(Math.atan2(ey - OY, ex - OX)) <= 60 * RAD;
          else over = (ex - s.x) ** 2 + (ey - s.y) ** 2 <= r * r;
          if (over && !s.set.has(i)) hits.push({ i, t: ex - ox });
        });
        hits.sort((a, b) => a.t - b.t || a.i - b.i);
        for (const h of hits) {
          if (!S.s) break;
          s.set.add(h.i); s.hits++; log("HIT  " + s.hits); S.marks.push([h.i, s.hits]);
          if (P.stk === "ranged") { s.x = DUMMIES[h.i][0] - r; return finish("HIT"); }
          if (P.stk === "piercing" && s.hits >= 4) return finish("HIT_LIMIT");
        }
        if (s.age + 1e-8 >= 3) return finish("DURATION");
        if (!sustained && s.dist + 1e-8 >= P.range) return finish("RANGE");
        if (sustained && s.E <= 1e-8) return finish("ENERGY");
      },
      draw(g, S, P) {
        const C = g.C, s = S.s;
        g.clear();
        DUMMIES.forEach(([x, y], i) => {
          const m = S.marks.find((k) => k[0] === i);
          g.circle(x, y, ER, m ? C.ink : C.enemy);
          if (m) g.label(String(m[1]), x, y - 9, C.gold, "center");
        });
        g.circle(OX, OY, 5, C.accent);
        if (s) {
          const w = Math.max(1, P.radius * 2);
          if (P.stk === "ranged" || P.stk === "piercing") { g.line(OX, OY, s.x, s.y, C.rule, 1); g.circle(s.x, s.y, P.radius, C.gold); }
          else if (P.stk === "stab" || P.stk === "sweep") {
            const reach = P.range * Math.min(1, s.age / 0.08), dx = s.dx || 1, dy = s.dy || 0;
            if (P.stk === "sweep") g.wedge(OX, OY, P.range, -60 * RAD, 60 * RAD, C.rule);
            g.line(OX, OY, OX + dx * reach, OY + dy * reach, C.violet, w);
          } else if (P.stk === "area") { g.wedge(OX, OY, P.radius, -60 * RAD, 60 * RAD, C.violet); g.arc(OX, OY, 20, -60 * RAD, 60 * RAD, C.ink3, 1); }
          else { g.circle(OX, OY, 35, C.rule, 1); g.circle(s.x, s.y, P.radius, C.violet); }
          if (P.starved && !(P.stk === "ranged" || P.stk === "piercing")) g.meter(OX - 20, OY + 50, 40, 4, s.E / 8, C.violet);
        }
        g.label("EVENTS", 250, 150, C.ink3);
        S.log.forEach((l, i) => g.label(l, 250, 160 + i * 9, i === S.log.length - 1 ? C.ink : C.ink2));
      },
      readout(S, P) {
        const s = S.s;
        return (s ? "age " + s.age.toFixed(2) + " s   hits " + s.hits : "waiting") + "   " + P.stk + (P.stk === "area" ? "   radius caps at 20 px" : "");
      },
    },
  });
})();
