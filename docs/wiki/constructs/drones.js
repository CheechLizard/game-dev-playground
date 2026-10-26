Wiki.construct({
  id: "drones",
  name: "Drones: the summon cycle",
  family: "agents",
  origin: "shmuprouge",
  status: "spec",
  statusNote: "Spec only (<code>docs/entities/Drone_Systems.md</code>). No drone code exists; the only built helper is the ship-bound harvester behind the [[harvest-bar]]. The spec names parameters but gives no numbers.",
  summary: "Drones follow a roguelike summon loop: deploy, work until destroyed, wait out a cooldown, redeploy at full health, so cooldown length is the lever that decides which helper is worth risking.",
  tags: ["companions", "cooldown", "loadout", "spec"],

  intent:
    "<p>ShmupRouge's run is a tension between harvesting and defending. Drones give that tension bodies: a mining drone you send out to a rich rock, a combat drone you keep close, a hybrid that does both badly. The player chooses which to risk, which to escort, and which to sacrifice as bait.</p>" +
    "<p>Because a lost drone comes back after a cooldown at full health, losing one is a setback with a clock on it, not a permanent loss. The one exception, a captured alien harvester, is lost for good, which makes it the drone you protect.</p>",

  how:
    "<h3>The summon model</h3>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>Phase</th><th>Behaviour</th></tr></thead><tbody>" +
    "<tr><td>Deploy</td><td>Summon from the ship; costs energy or cooldown</td></tr>" +
    "<tr><td>Active</td><td>Performs its function</td></tr>" +
    "<tr><td>Damaged</td><td>Takes damage from NPCs, environment and explosions</td></tr>" +
    "<tr><td>Destroyed</td><td>Cooldown timer starts</td></tr>" +
    "<tr><td>Regenerate</td><td>After cooldown, can be summoned again at full health</td></tr>" +
    "</tbody></table></div>" +
    "<h3>Types</h3>" +
    "<ul>" +
    "<li><b>Harvester</b>: ship-bound (R-Type Force style), auto-collects particles in range and feeds the harvest bar. Always active. The <em>captured alien harvester</em> variant follows as a separate entity, carries more, and has no regeneration.</li>" +
    "<li><b>Mining</b>: flies to a target and extracts over time. Unarmed, vulnerable.</li>" +
    "<li><b>Combat</b>: a turret with modes Follow, Guard, Escort, Aggressive. Does not harvest.</li>" +
    "<li><b>Hybrid</b>: both functions, weaker at each.</li>" +
    "</ul>" +
    "<h3>Filtration and loadout</h3>" +
    "<p>Harvesters filter what they keep: None, Basic (drop rock and sand), Advanced (by material), Quantum (by state). Upgrades run Basic, Improved, Armored, Advanced, Quantum. The loadout is picked before the run, from examples like 2&times;Mining, 2&times;Combat, 1+1, or 2&times;Hybrid.</p>" +
    "<p>Named but unvalued: base health, cooldown, deploy energy, extraction speed, range, damage.</p>",

  knobs: [
    ["Cooldown", "TBD", "Time from destruction to redeploy; the main balance lever", "Drone_Systems.md (no data key)"],
    ["Deploy cost", "TBD", "Energy or cooldown spent to summon", "Drone_Systems.md"],
    ["Base health", "TBD", "Hits a drone survives", "Drone_Systems.md"],
    ["Extraction speed / range / damage", "TBD", "Per-type work rate", "Drone_Systems.md"],
  ],

  related: [
    { id: "harvest-bar", how: "The ship-bound harvester, the only drone that exists, feeds it." },
    { id: "resource-economy", how: "Mining drones are a second pair of hands on the same matter loop." },
    { id: "npc-roster", how: "Drones obey the same physics and damage rules as NPCs (entity symmetry)." },
    { id: "mws-lineage", how: "Open question whether drones mount module-graph weapons." },
  ],

  questions: [
    "How many drones can be out at once, and do they persist from arena to corridor?",
    "How smart is drone AI about hazards, and is there a command UI or only modes?",
    "Do drones carry MWS weapons or fixed ones? Do drones synergise with each other?",
  ],

  sparks: [
    "Make the cooldown clock the life system: no lives, just how many drones are currently on cooldown.",
    "Escort inversion: the mining drone is the objective and the ship is its bodyguard.",
    "A bait drone whose only job is to pull aggro and die, so the cooldown becomes a resource you spend.",
    "Filtration as a puzzle: the wrong filter clogs the bar with slop you then have to dump.",
  ],

  terms: [
    { term: "Summon model", def: "Deploy, active, destroyed, cooldown, regenerate at full health.", code: "Drone_Systems.md (spec)" },
    { term: "Loadout", def: "The drone set chosen before a run.", code: "spec only" },
    { term: "Filtration level", def: "What a harvester keeps: none, basic, advanced, quantum.", code: "spec only" },
    { term: "Captured alien harvester", def: "A non-regenerating harvester that follows as its own entity.", code: "spec only" },
  ],

  sources: [
    "shmuprouge:docs/entities/Drone_Systems.md",
    "shmuprouge:shared/data/world/zones/asteroid_belt.json",
  ],

  toy: {
    title: "Which drone is worth losing?",
    hint: "change the loadout and the cooldown",
    caption: "Every number here is invented, because the spec gives none: drones have 3 hp (hybrids 2), miners carry 5 ore, combat drones shoot every 0.5 s (hybrids 1 s). Destroyed drones show a cooldown pie and redeploy at full health.",
    w: 384, h: 216,
    controls: [
      { type: "select", key: "load", label: "loadout", value: "mc", reset: true, options: [["mm", "2x Mining"], ["cc", "2x Combat"], ["mc", "1 Mining + 1 Combat"], ["hh", "2x Hybrid"]] },
      { type: "range", key: "cool", label: "cooldown", min: 2, max: 20, value: 8, fmt: "{} s" },
      { type: "range", key: "rate", label: "enemies", min: 5, max: 60, value: 24, fmt: "{} /min" },
    ],
    init(S, P) {
      S.ore = 0; S.hull = 0; S.lost = 0; S.enemies = []; S.acc = 0; S.t = 0; S.shots = [];
      S.nodes = [[70, 50], [320, 60], [330, 170], [60, 175], [200, 200]].map(([x, y]) => ({ x, y }));
      S.drones = P.load.split("").map((k, i) => {
        const type = { m: "mining", c: "combat", h: "hybrid" }[k];
        return { type, x: 192, y: 108, hp: 0, max: type === "hybrid" ? 2 : 3, cd: 0.01 + i * 0.5, carry: 0, node: i % 5, fire: 0, ang: i * Math.PI };
      });
    },
    update(S, P, dt, kit) {
      S.t += dt;
      S.acc += P.rate / 60 * dt;
      if (S.acc >= 1) {
        S.acc -= 1;
        const a = kit.rand() * Math.PI * 2;
        S.enemies.push({ x: 192 + Math.cos(a) * 230, y: 108 + Math.sin(a) * 150, hp: 2 });
      }
      for (const d of S.drones) {
        if (d.hp <= 0) { d.cd -= dt; if (d.cd <= 0) { d.hp = d.max; d.x = 192; d.y = 108; d.carry = 0; } continue; }
        const mines = d.type !== "combat", fights = d.type !== "mining";
        let tx = 192, ty = 108;
        if (mines) {
          const n = S.nodes[d.node];
          if (d.carry >= 5) { tx = 192; ty = 108; if (Math.hypot(d.x - 192, d.y - 108) < 8) { S.ore += d.carry; d.carry = 0; d.node = (d.node + 2) % 5; } }
          else { tx = n.x; ty = n.y; if (Math.hypot(d.x - n.x, d.y - n.y) < 8) d.carry += (d.type === "hybrid" ? 0.5 : 1) * dt; }
        } else { d.ang += dt * 1.2; tx = 192 + Math.cos(d.ang) * 30; ty = 108 + Math.sin(d.ang) * 30; }
        const dx = tx - d.x, dy = ty - d.y, dl = Math.hypot(dx, dy);
        if (dl > 1) { const m = Math.min(dl, 70 * dt); d.x += dx / dl * m; d.y += dy / dl * m; }
        if (fights) {
          d.fire -= dt;
          if (d.fire <= 0) {
            let best = null, bd = 90;
            for (const e of S.enemies) { const ed = Math.hypot(e.x - d.x, e.y - d.y); if (ed < bd) { bd = ed; best = e; } }
            if (best) { best.hp -= 1; d.fire = d.type === "hybrid" ? 1 : 0.5; S.shots.push({ x1: d.x, y1: d.y, x2: best.x, y2: best.y, life: 0.1 }); }
          }
        }
      }
      for (const e of S.enemies) {
        let tx = 192, ty = 108, bd = 1e9;
        for (const d of S.drones) if (d.hp > 0) { const dd = Math.hypot(d.x - e.x, d.y - e.y); if (dd < bd) { bd = dd; tx = d.x; ty = d.y; } }
        if (Math.hypot(e.x - 192, e.y - 108) < bd) { tx = 192; ty = 108; }
        const dx = tx - e.x, dy = ty - e.y, dl = Math.hypot(dx, dy) || 1;
        e.x += dx / dl * 32 * dt; e.y += dy / dl * 32 * dt;
        if (dl < 6) {
          e.hp = 0;
          const hit = S.drones.find((d) => d.hp > 0 && Math.hypot(d.x - e.x, d.y - e.y) < 8);
          if (hit) { hit.hp -= 1; if (hit.hp <= 0) { hit.cd = P.cool; S.lost++; hit.carry = 0; } } else S.hull++;
        }
      }
      S.enemies = S.enemies.filter((e) => e.hp > 0);
      for (const s of S.shots) s.life -= dt;
      S.shots = S.shots.filter((s) => s.life > 0);
    },
    draw(g, S, P) {
      const C = g.C;
      g.clear();
      for (const n of S.nodes) { g.toneCircle(n.x, n.y, 9, 0.4, C.gold); g.circle(n.x, n.y, 9, C.gold, 1); }
      g.circle(192, 108, 7, C.ink);
      for (const s of S.shots) g.line(s.x1, s.y1, s.x2, s.y2, C.sky, 1);
      for (const e of S.enemies) g.rect(e.x - 2, e.y - 2, 4, 4, C.enemy);
      S.drones.forEach((d, i) => {
        const col = d.type === "mining" ? C.gold : d.type === "combat" ? C.sky : C.violet;
        if (d.hp > 0) {
          g.circle(d.x, d.y, 4, col);
          g.meter(d.x - 6, d.y - 9, 12, 2, d.hp / d.max, col);
          if (d.carry > 0) g.label(d.carry.toFixed(0), d.x + 6, d.y + 3, C.gold);
        }
        const bx = 250 + i * 66, by = 14;
        g.circle(bx, by, 8, col, 1);
        if (d.hp <= 0) g.wedge(bx, by, 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - d.cd / P.cool), col);
        else g.circle(bx, by, 5, col);
        g.label(d.type.toUpperCase(), bx + 11, by + 3, d.hp > 0 ? C.ink2 : C.ink3);
      });
    },
    readout(S) {
      return "ore " + S.ore.toFixed(0) + "   hull hits " + S.hull + "\ndrones lost " + S.lost + "   t " + S.t.toFixed(0) + " s";
    },
  },
});
