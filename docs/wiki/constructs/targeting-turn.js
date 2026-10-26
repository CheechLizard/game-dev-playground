(function () {
  const RAD = Math.PI / 180, OX = 56, OY = 120, ER = 6, CR = 2, STEP = 1 / 60;
  // Reach of the Striker downstream, as R:inTargetRange: [outer, inner].
  function reach(P) {
    if (P.stk === "ranged") return [Math.min(P.range, 150 * 1), 0];
    if (P.stk === "area") return [0, 0];
    if (P.stk === "orbit") return [35, 35];
    return [P.range, 0];
  }
  function radius(P) { return P.stk === "area" ? 20 : CR; }
  function eligible(e, P) {
    const [out, inner] = reach(P), m = radius(P) + ER, d = Math.hypot(e.x - OX, e.y - OY);
    return d <= out + m && d >= inner - m;
  }

  Wiki.construct({
    id: "targeting-turn",
    name: "Targeting with turn speed",
    family: "weapons",
    origin: "playground",
    status: "built",
    statusNote: "Seeking, Weakling and Bossling are built in the MWS v2 runtime (commits <code>d405040</code> and <code>8fe86e1</code>). Every bench preset uses Seeking. Targeting criteria and fallbacks are partly open in the spec, and the 180°/s default is provisional.",
    summary: "A targeting Barrel picks the nearest, weakest or strongest enemy that its Striker can actually reach, then turns toward it at a limited angular speed every tick, so beams visibly swing.",
    tags: ["aim", "targeting", "beam", "auto-aim"],

    intent:
      "<p>Auto-aim in a game where weapons fire themselves still needs weight. A beam that snaps instantly to each new target reads as a cheat; one that sweeps across at a fixed rate reads as a heavy tool, and gives the player something to plan around: line enemies up so the swing passes over all of them.</p>" +
      "<p>Choosing the rule is a build decision. Seeking clears what is closest, Weakling finishes the wounded, Bossling ignores the swarm for the big one.</p>",

    how:
      "<h3>Pick a target the Striker can reach</h3>" +
      "<p>Every tick, the Barrel filters live enemies by the reach of its Striker, then ranks them:</p>" +
      "<div class=\"tbl-wrap\"><table><thead><tr><th>Subclass</th><th>Lowest score wins</th></tr></thead><tbody>" +
      "<tr><td>Seeking</td><td>Distance squared: the nearest</td></tr>" +
      "<tr><td>Weakling</td><td><code>hp</code>: the weakest</td></tr>" +
      "<tr><td>Bossling</td><td><code>-hp</code>: the strongest</td></tr></tbody></table></div>" +
      "<p>Reach comes from the Striker this Barrel serves. A Barrel after a Striker uses that Striker; otherwise it uses the first Strikers on its downstream paths in the same sequence, never one in a later event sequence. A shared Barrel may target inside any of them.</p>" +
      "<div class=\"tbl-wrap\"><table><thead><tr><th>Striker</th><th>Reach used for the filter</th></tr></thead><tbody>" +
      "<tr><td>Ranged, Piercing</td><td><code>min(range, speed &times; duration)</code></td></tr>" +
      "<tr><td>Stab, Sweep</td><td><code>range</code></td></tr>" +
      "<tr><td>Area</td><td>0, so only the collider radius (at most 20 px) counts</td></tr>" +
      "<tr><td>Orbit</td><td>An annulus around <code>orbitRadius</code></td></tr>" +
      "</tbody></table></div>" +
      "<p>The collider radius plus the enemy's radius is added as a margin at both edges. This is a geometric filter: it does not predict energy or target movement.</p>" +
      "<h3>Turn at a limited speed</h3>" +
      "<p>The desired angle points at the chosen target, or back at the incoming DOI if nothing is in reach. The aim then moves toward it along the shortest arc by at most <code>turnSpeed &times; 1/60</code> per tick; 0 means instant. Aiming starts from the incoming DOI, changing targets has no acquisition delay, and a hot signal with nothing in reach still fires, along the current aim.</p>" +
      "<h3>When aim updates</h3>" +
      "<p>Each execution route keeps its own aim state (<code>ctx.aims</code>), advanced once per tick, including between pulses, so the next shot does not snap. Live sustained strikes (beams, sweeps, fields, orbits) follow the aim and keep their age, hit count and funding when they swing. Launched projectiles keep their launch heading. Split children keep their lane offsets relative to the tracked aim. After a [[delay-echo|Delay]], the Barrel aims from the captured origin at execution time.</p>",

    knobs: [
      ["Turn speed", "180°/s", "Maximum angular speed of the aim; 0 is instant", "turnSpeed (0-1440)"],
      ["Angle offset", "0°", "Added after the target direction", "angle"],
      ["Striker range", "180 px", "Reach used to filter targets", "range, speed × duration"],
    ],

    related: [
      { id: "barrels", how: "The other Barrels, and what composes with targeting." },
      { id: "strikers", how: "The downstream Striker sets the reach filter." },
      { id: "sustained-drain", how: "A swinging beam keeps draining the same strike's budget." },
      { id: "aim-lead", how: "Turn speed versus leading a moving target." },
    ],

    questions: [
      "Targeting criteria and fallbacks are partly open: should a Barrel with nothing in reach hold fire instead of firing along the DOI? (The legacy <code>aimMode = nearest</code> held fire.)",
      "Should projectiles ever track after launch, or is that the job of the spec-only Drone Striker?",
      "Is 180°/s the right default, and should turn speed scale with tier?",
    ],

    sparks: [
      "Make turn speed the main upgrade stat for a beam weapon; the visible swing is the progress bar.",
      "Enemies designed to exploit slow turns: fast strafers that circle the player faster than the beam can follow.",
      "A boss-rush mode that hands out Bossling Barrels, and an execute build that runs Weakling plus a high-damage Payload.",
      "Turret defence where towers have a turn speed you can see, so placing two towers at right angles covers each other's swing.",
    ],

    terms: [
      { term: "Turn speed", def: "Degrees per second a Seeking, Weakling or Bossling Barrel can turn toward its target, along the shortest arc. 0 is instant.", code: "turnSpeed, ctx.aims" },
      { term: "Target strikers", def: "The Strikers whose reach a targeting Barrel filters by: the preceding Striker, or the first ones downstream in the same sequence.", code: "info.targetStrikers" },
      { term: "Reach filter", def: "Discarding enemies the downstream Striker cannot reach before ranking targets.", code: "R:inTargetRange" },
    ],

    sources: [
      "playground:shared/framework/mws/v2runtime.lua:70",
      "playground:shared/framework/mws/v2runtime.lua:88",
      "playground:shared/framework/mws/v2graph.lua:68",
      "playground:shared/framework/mws/v2modules.lua:49",
      "playground:docs/MWS_Implementation.md",
    ],

    toy: {
      title: "Drag an enemy and watch the beam follow",
      hint: "drag enemies; numbers are their HP",
      caption: "One targeting Barrel feeding one Striker; no energy or damage. Greyed enemies are outside the Striker's reach. The ring marks the chosen target. Ranged uses speed 150 for 1 s, so its reach is at most 150 px.",
      w: 384, h: 216,
      controls: [
        { type: "select", key: "mode", label: "barrel", value: "seeking", options: [["seeking", "Seeking"], ["weakling", "Weakling"], ["bossling", "Bossling"]] },
        { type: "range", key: "turn", label: "turn speed", min: 0, max: 1440, step: 10, value: 180, fmt: "{}°/s" },
        { type: "select", key: "stk", label: "striker", value: "stab", options: [["stab", "Stab beam"], ["ranged", "Ranged"], ["area", "Area"], ["orbit", "Orbit"]] },
        { type: "range", key: "range", label: "range", min: 40, max: 300, value: 180, fmt: "{} px" },
      ],
      init(S) {
        S.aim = 0; S.target = null; S.drag = null; S.tick = 0; S.shots = [];
        S.enemies = [[150, 100, 20], [210, 60, 90], [240, 160, 50], [310, 110, 140], [120, 175, 70]].map(([x, y, hp]) => ({ x, y, hp }));
      },
      pointer(e, S) {
        if (e.type === "down") S.drag = S.enemies.find((n) => Math.hypot(n.x - e.x, n.y - e.y) < 12) || null;
        if (e.type === "move" && S.drag) { S.drag.x = Math.max(8, Math.min(376, e.x)); S.drag.y = Math.max(36, Math.min(208, e.y)); }
        if (e.type === "up") S.drag = null;
      },
      update(S, P, dt) {
        let best = null, score = Infinity;
        for (const e of S.enemies) {
          if (!eligible(e, P)) continue;
          let v = (e.x - OX) ** 2 + (e.y - OY) ** 2;
          if (P.mode === "weakling") v = e.hp; else if (P.mode === "bossling") v = -e.hp;
          if (v < score) { best = e; score = v; }
        }
        S.target = best;
        const desired = best ? Math.atan2(best.y - OY, best.x - OX) : 0;
        const delta = ((desired - S.aim + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
        const limit = P.turn * RAD * STEP;
        S.aim = P.turn === 0 ? desired : S.aim + Math.max(-limit, Math.min(limit, delta));
        S.aim = ((S.aim + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
        if (P.stk === "ranged" && S.tick % 18 === 0) S.shots.push({ a: S.aim, d: 0 });
        for (const s of S.shots) s.d += 150 * dt;
        S.shots = S.shots.filter((s) => s.d < reach(P)[0]);
        S.tick++;
      },
      draw(g, S, P) {
        const C = g.C, [out, inner] = reach(P);
        g.clear();
        if (out > 0) g.circle(OX, OY, out, C.rule, 1);
        if (inner > 0) { g.circle(OX, OY, inner - radius(P) - ER, C.rule, 1); g.circle(OX, OY, inner + radius(P) + ER, C.rule, 1); }
        for (const e of S.enemies) {
          const ok = eligible(e, P);
          if (ok) g.circle(e.x, e.y, ER, C.enemy); else g.toneCircle(e.x, e.y, ER, 0.4, C.ink3);
          g.label(String(e.hp), e.x, e.y - 10, ok ? C.ink2 : C.ink3, "center");
        }
        if (S.target) g.circle(S.target.x, S.target.y, ER + 4, C.gold, 1.5);
        const ax = Math.cos(S.aim), ay = Math.sin(S.aim);
        if (P.stk === "stab") { g.line(OX, OY, OX + ax * P.range, OY + ay * P.range, C.violet, 4); g.line(OX, OY, OX + ax * P.range, OY + ay * P.range, C.ink, 1); }
        if (P.stk === "area") g.toneCircle(OX, OY, 20, 0.4, C.violet);
        if (P.stk === "orbit") { const a = S.aim + S.tick * STEP * Math.PI; g.circle(OX + Math.cos(a) * 35, OY + Math.sin(a) * 35, 4, C.violet); }
        for (const s of S.shots) g.circle(OX + Math.cos(s.a) * s.d, OY + Math.sin(s.a) * s.d, 2.5, C.gold);
        g.circle(OX, OY, 6, C.accent);
        g.arrow(OX, OY, OX + ax * 22, OY + ay * 22, C.gold, 1.5);
        g.line(OX + 8, OY, OX + 18, OY, C.ink3, 1, [2, 2]);
      },
      readout(S, P) {
        const deg = (S.aim / RAD).toFixed(0);
        return "aim " + deg + "°   target " + (S.target ? "hp " + S.target.hp : "none, turning back to DOI") + "   reach " + reach(P)[0] + " px";
      },
    },
  });
})();
