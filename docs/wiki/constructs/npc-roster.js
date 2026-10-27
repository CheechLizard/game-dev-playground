Wiki.construct({
  id: "npc-roster",
  name: "NPC roster: goals, roles and symmetry",
  origin: "shmuprouge",
  status: "spec",
  statusNote: "Spec only as a framework. Two NPCs exist: the [[kamikaze-dive|Kamikaze]], built as specified, and the Midge, built as a tutorial squadron that does not match its spec. Dive Bomber, Cordon, Flanker, Interceptor and Encircler have no code; nor do miners, burrowers, builders or defence types.",
  summary: "Every enemy is designed around one tactical goal against the player's movement mode (disrupt flight, deny flight, encircle, chase), and is classified on three independent axes, all under the same physics as the player.",
  tags: ["enemy design", "taxonomy", "tactical goals", "movement mode", "spec"],

  intent:
    "<p>Open space in ShmupRouge is a hostile gauntlet, but individual enemies are meant to stay simple. Variety comes from what each one is <em>for</em>. The player has two movement modes from the arcade controls, flight (scrolling) and mech (stopped), and most enemies exist to attack one of them: knock you out of flight, stop you getting back into it, surround you while you sit still.</p>" +
    "<p>The second idea is entity symmetry: NPCs use the same components and physics as the player. If the player can dig through rock, so can a worm; if a hazard hurts the player, it should hurt them too. Emergence comes from shared rules rather than special cases.</p>",

  how:
    "<h3>Tactical goals</h3>" +
    "<p>0 Damage, 1 Territory, 2 Disrupt Flight, 3 Deny Flight, 4 Encircle, 5 Chase.</p>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>NPC</th><th>Goal</th><th>Mode</th><th>Mechanic</th><th>Code</th></tr></thead><tbody>" +
    "<tr><td>Midge</td><td>0 Damage</td><td>any (tutorial)</td><td>Squad of 3 swarms; if it fails to hurt you, withdraws and dives</td><td>built, differs</td></tr>" +
    "<tr><td>Kamikaze</td><td>2 Disrupt</td><td>flight</td><td>Pace in a slot, then dive</td><td>built</td></tr>" +
    "<tr><td>Dive Bomber</td><td>2 Disrupt</td><td>flight</td><td>Repeated bombing passes, retreat, cooldown</td><td>spec</td></tr>" +
    "<tr><td>Cordon</td><td>3 Deny</td><td>mech</td><td>Splits into two at the trigger-box edge with a damaging field between</td><td>spec</td></tr>" +
    "<tr><td>Flanker</td><td>2 Disrupt</td><td>flight</td><td>Matches speed alongside, then broadsides</td><td>spec</td></tr>" +
    "<tr><td>Interceptor</td><td>2 Disrupt</td><td>flight</td><td>Predicts your path and parks in it</td><td>spec</td></tr>" +
    "<tr><td>Encircler</td><td>4 Encircle</td><td>mech</td><td>8+ units form a contracting laser ring; hit every unit to break it</td><td>spec</td></tr>" +
    "</tbody></table></div>" +
    "<p>The &ldquo;trigger box&rdquo; is the arcade scroll box on [[ship-control]]: pushing its edge starts flight, so a Cordon field on that edge denies it.</p>" +
    "<h3>Three axes</h3>" +
    "<p>From <code>NPC_Behavior.md</code>, independent of the goal:</p>" +
    "<ul>" +
    "<li><b>Allegiance</b>: Hostile, Neutral, Territorial, Competing.</li>" +
    "<li><b>Terrain interaction</b>: Standard, Miner (harvests and competes), Burrower (tunnels, flanks, flees into rock), Builder (webs, walls, nests), Destroyer (worms, area denial).</li>" +
    "<li><b>Movement</b>: Flying, Walking, Amphibious.</li>" +
    "</ul>" +
    "<p>Damage is point-versus-circle; projectiles are Consumable or Retriggerable; friendly fire is on by default. Planned defence types (Unarmored, Armored, Organic, Shielded) cross a weapon-type matrix.</p>" +
    "<h3>Symmetry in the code</h3>" +
    "<p>Partly true. NPCs and the player share <code>Transform</code>, <code>Velocity</code>, <code>Collider</code>, <code>contactRadius</code> and <code>waterDamping</code>. But collision is asymmetric: a hazard such as a [[black-holes|black hole]] destroys enemies and ignores the player. The only terrain-navigating NPC, the [[voronoi-walkers|spider mech]], walks a precomputed mesh rather than reading sand.</p>" +
    "<h3>Implementation contract</h3>" +
    "<p>Each NPC is a JSON data file, a component, a factory, a pure-function AI module, an AI system and a render system, registered through a <code>*_encounters.lua</code> file with the [[encounter-spawner]].</p>",

  knobs: [
    ["Goal", "0–5", "What the enemy is for", "NPC_OpenSpace_Specification_v0_3.md §2"],
    ["Spawn mode", "scrolling / stopped", "Which movement mode it hunts", "registerType mode"],
    ["Squad size", "3 (Midge), 4 (Kamikaze), 8+ (Encircler)", "Members per group", "Squadron.json, Kamikaze.json spawnGroupSize"],
  ],

  related: [
    { id: "kamikaze-dive", how: "The one roster entry built to spec." },
    { id: "encounter-spawner", how: "Where each roster entry registers its mode." },
    { id: "fair-attack-contract", how: "The rules every scrolling roster entry is supposed to follow." },
    { id: "ship-control", how: "Flight and mech are the arcade scroll box's two states." },
    { id: "enemy-behaviours", how: "The playground's roster, built around movement styles instead of goals." },
  ],

  questions: [
    "Cordon: does the field last a fixed time or until a unit dies, and does it remerge and reposition?",
    "Encircler: below 8 units it cannot form a ring. Is waiting it out an exploit?",
    "Should hazards damage NPCs and the player alike, as symmetry says, or keep today's asymmetry?",
    "When should Midges spawn outside the tutorial?",
  ],

  sparks: [
    "Goal-first enemy authoring for any genre: a racing game with &ldquo;deny boost&rdquo; enemies and &ldquo;force off the racing line&rdquo; enemies.",
    "The Encircler ring as a co-op puzzle: every node must be hit within one window.",
    "A competing Miner whose death drops its haul, turning a PvE race for ore into a reason to fight.",
    "A Cordon as a moving door: outrun it to the edge before it splits.",
  ],

  terms: [
    { term: "Tactical goal", def: "The one thing an enemy type exists to do to the player, numbered 0&ndash;5.", code: "spec only" },
    { term: "Flight / mech mode", def: "The player's scrolling and stopped states.", code: "ArcadeMovement.state" },
    { term: "Trigger box", def: "The arcade scroll box whose edges switch mode.", code: "areaHalfWidth, areaWorldX" },
    { term: "Entity symmetry", def: "NPCs and the player share components and physics.", code: "Entities_Overview.md" },
    { term: "Hot path / cold path", def: "Pure ECS for many simple entities; domain objects for a few rich ones.", code: "Entities_Overview.md" },
  ],

  sources: [
    "shmuprouge:docs/entities/npcs/NPC_OpenSpace_Specification_v0_3.md",
    "shmuprouge:docs/entities/npcs/NPC_Behavior.md",
    "shmuprouge:docs/entities/Entities_Overview.md",
    "shmuprouge:game/entities/midge_ai.lua",
    "shmuprouge:game/systems/entity_collision_system.lua",
  ],

  toy: {
    title: "Goal against mode",
    hint: "spawn a goal, click enemies to shoot, switch mode",
    caption: "A sketch of four roster goals, not their real tuning. Kamikazes only come while you fly; the Cordon and Encircler only while you stand. A Cordon field on the front edge blocks the switch to flight. Click an enemy to destroy it.",
    w: 384, h: 216,
    controls: [
      { type: "select", key: "kind", label: "spawn", value: "kamikaze", options: [["kamikaze", "Kamikaze (disrupt)"], ["cordon", "Cordon (deny)"], ["encircler", "Encircler (encircle)"], ["midge", "Midge (damage)"]] },
      { type: "button", label: "spawn", press(S, P) { S.want = P.kind; } },
      { type: "button", label: "switch mode", press(S) { S.switch = true; } },
    ],
    init(S) { S.flight = true; S.en = []; S.want = "kamikaze"; S.switch = false; S.msg = ""; S.msgT = 0; S.t = 0; S.hits = 0; },
    say(S, m) { S.msg = m; S.msgT = 2; },
    pointer(e, S) {
      if (e.type !== "down") return;
      for (const u of S.en) if (!u.dead && Math.hypot(u.x - e.x, u.y - e.y) < 8) { u.dead = true; return; }
    },
    update(S, P, dt) {
      S.t += dt; S.msgT -= dt;
      const PX = 150, PY = 108, BX = 150, BW = S.flight ? 18 : 60;
      if (S.switch) {
        S.switch = false;
        const field = S.en.some((u) => u.kind === "cordon" && u.set && !u.dead) && S.en.filter((u) => u.kind === "cordon" && !u.dead).length >= 2;
        if (!S.flight && field) this.say(S, "DENIED: CORDON FIELD ON THE EDGE");
        else { S.flight = !S.flight; this.say(S, S.flight ? "FLIGHT" : "MECH"); }
      }
      if (S.want) {
        const k = S.want; S.want = null;
        const needFlight = k === "kamikaze", needMech = k === "cordon" || k === "encircler";
        if ((needFlight && !S.flight) || (needMech && S.flight)) this.say(S, k.toUpperCase() + " ONLY SPAWNS IN " + (needFlight ? "FLIGHT" : "MECH"));
        else if (k === "kamikaze") [-1, 0, 1].forEach((s, i) => S.en.push({ kind: k, x: 420, y: PY + s * 40, tx: 330, ty: PY + s * 40, t: -i * 0.6, dive: false }));
        else if (k === "cordon") [-1, 1].forEach((s) => S.en.push({ kind: k, x: 400, y: PY, tx: BX + 60, ty: PY + s * 60, set: false }));
        else if (k === "encircler") for (let i = 0; i < 8; i++) S.en.push({ kind: k, a: i / 8 * Math.PI * 2, r: 110, x: 0, y: 0 });
        else for (let i = 0; i < 3; i++) S.en.push({ kind: k, a: i * 2.1, x: 300, y: 40 + i * 60, t: 0 });
      }
      const ring = S.en.filter((u) => u.kind === "encircler" && !u.dead);
      for (const u of S.en) {
        if (u.dead) continue;
        if (u.kind === "kamikaze") {
          u.t += dt;
          if (!u.dive) { u.x += (u.tx - u.x) * 2 * dt; u.y += (u.ty - u.y) * 2 * dt; if (u.t > 2) { u.dive = true; const d = Math.hypot(PX - u.x, PY - u.y); u.vx = (PX - u.x) / d * 260; u.vy = (PY - u.y) / d * 260; } }
          else { u.x += u.vx * dt; u.y += u.vy * dt; if (Math.hypot(PX - u.x, PY - u.y) < 6) { u.dead = true; S.hits++; if (S.flight) { S.flight = false; this.say(S, "DISRUPTED: KNOCKED OUT OF FLIGHT"); } } if (u.x < -10) u.dead = true; }
        } else if (u.kind === "cordon") {
          u.x += (u.tx - u.x) * 1.5 * dt; u.y += (u.ty - u.y) * 1.5 * dt;
          if (Math.hypot(u.tx - u.x, u.ty - u.y) < 2) u.set = true;
        } else if (u.kind === "encircler") {
          u.r = Math.max(14, u.r - (ring.length >= 8 ? 9 : 0) * dt); u.a += 0.3 * dt;
          u.x = PX + Math.cos(u.a) * u.r; u.y = PY + Math.sin(u.a) * u.r * 0.8;
          if (u.r <= 14 && ring.length >= 8) { for (const v of ring) v.dead = true; S.hits++; this.say(S, "ENCIRCLED"); }
        } else {
          u.t += dt; u.a += 2 * dt;
          const swarm = u.t % 6 < 4;
          const tx = swarm ? PX + Math.cos(u.a) * 40 : PX, ty = swarm ? PY + Math.sin(u.a) * 30 : PY;
          u.x += (tx - u.x) * (swarm ? 2 : 4) * dt; u.y += (ty - u.y) * (swarm ? 2 : 4) * dt;
          if (!swarm && Math.hypot(PX - u.x, PY - u.y) < 5) { S.hits++; u.t = 0; u.x = 380; }
        }
      }
      if (ring.length > 0 && ring.length < 8) for (const v of ring) v.r = Math.min(110, v.r + 20 * dt);
      S.en = S.en.filter((u) => !u.dead);
    },
    draw(g, S) {
      const C = g.C, PX = 150, PY = 108;
      g.clear();
      if (S.flight) for (let i = 0; i < 30; i++) { const x = ((i * 71 - S.t * 120) % 384 + 384) % 384; g.rect(x, (i * 37) % 216, 3, 1, C.ink3); }
      const BW = S.flight ? 18 : 60;
      g.rect(PX - BW, PY - BW, BW * 2, BW * 2, S.flight ? C.accent : C.violet, 1);
      g.label(S.flight ? "FLIGHT (SCROLLING)" : "MECH (STOPPED)", PX - BW, PY - BW - 4, S.flight ? C.accent : C.violet);
      const cords = S.en.filter((u) => u.kind === "cordon" && u.set);
      if (cords.length >= 2) { g.line(cords[0].x, cords[0].y, cords[1].x, cords[1].y, C.enemy, 3); }
      const ring = S.en.filter((u) => u.kind === "encircler");
      if (ring.length >= 8) for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; g.line(a.x, a.y, b.x, b.y, C.enemy, 1, [3, 2]); }
      for (const u of S.en) {
        const col = { kamikaze: C.gold, cordon: C.violet, encircler: C.enemy, midge: C.sky }[u.kind];
        g.circle(u.x, u.y, 4, col);
        if (u.kind === "kamikaze" && !u.dive && u.t > 1.5) g.line(u.x, u.y, PX, PY, C.enemy, 1);
      }
      g.poly([[PX + 6, PY], [PX - 4, PY - 4], [PX - 4, PY + 4]], C.ink);
      if (S.msgT > 0) g.text(S.msg, 192, 206, { color: C.ink, align: "center" });
    },
    readout(S) { return "hits " + S.hits + "   enemies " + S.en.length; },
  },
});
