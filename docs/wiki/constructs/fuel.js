Wiki.construct({
  id: "fuel",
  name: "Fuel: kill to keep flying",
  origin: "shmuprouge",
  status: "spec",
  statusNote: "Spec only (docs/design/Fuel.md and Solar_System_Arena.md). No fuel code, data or HUD exists; every parameter is TBD.",
  summary: "Fuel drains every second and with every boost, shot and shield; the only refill is the cells enemies drop when they die, and an empty tank ends the run.",
  tags: ["survival", "pacing", "drain", "combat mandatory"],

  intent:
    "<p>The harvest loop has a weak point: a careful player can find a quiet corner and mine forever. Fuel closes it. Because the tank only refills from kills, combat is mandatory, and the enemy spawn rate becomes the fuel supply. Skilled players build a surplus; poor play produces what the spec calls \"fuel anxiety\".</p>" +
    "<p>It is the inverse of a survivors-style XP drip: a clock that runs down rather than a meter that fills, so time spent away from the fight is a cost you can see.</p>",

  how:
    "<h3>The loop</h3>" +
    "<p>Kill NPC &rarr; it drops cells &rarr; collect cells &rarr; fuel. Fuel drains constantly and per action. Empty = run over.</p>" +
    "<p><code>drain_per_second = base_drain + (action_costs / time)</code>: a baseline that always ticks, plus boost, weapon and shield costs averaged over time. The player has to out-kill the drain.</p>" +
    "<h3>Cell values</h3>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>Source</th><th>Value</th></tr></thead><tbody>" +
    "<tr><td>Fodder</td><td>Low: many kills needed</td></tr><tr><td>Elite</td><td>Medium: worth hunting</td></tr>" +
    "<tr><td>Mini-boss</td><td>High</td></tr><tr><td>Boss</td><td>Very high (corridor bosses)</td></tr>" +
    "</tbody></table></div>" +
    "<h3>States</h3>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>State</th><th>Tank</th><th>Feedback</th></tr></thead><tbody>" +
    "<tr><td>Full</td><td>100%</td><td>Normal HUD</td></tr><tr><td>Healthy</td><td>50&ndash;99%</td><td>Normal HUD</td></tr>" +
    "<tr><td>Low</td><td>20&ndash;49%</td><td>Warning colour, audio cue</td></tr><tr><td>Critical</td><td>1&ndash;19%</td><td>Flashing, alarm, maybe a screen effect</td></tr>" +
    "<tr><td>Empty</td><td>0%</td><td>Run over</td></tr>" +
    "</tbody></table></div>" +
    "<h3>Coupling</h3>" +
    "<p>Fuel ties three systems together: [[combat-pressure]] (more enemies, more fuel opportunity), harvesting (every second mining is a second not refuelling) and density zones (dense areas pay more and hurt more). It exists only in the Solar System version of the economy; Game_Overview's crate loop has no fuel. See [[resource-economy]].</p>",

  knobs: [
    ["Base drain", "TBD (0.1–10 /s)", "Fuel lost per second, always", "base_drain"],
    ["Boost cost", "TBD (1–20)", "Fuel per boost", "boost_cost"],
    ["Weapon cost", "TBD (0–10)", "Fuel per shot; flat or per weapon is open", "weapon_cost"],
    ["Shield cost", "TBD (1–10 /s)", "Fuel per second while the shield is up", "shield_cost"],
    ["Tank", "TBD (100–1000)", "Capacity", "max_fuel"],
  ],

  related: [
    { id: "combat-pressure", how: "Pressure is also the fuel supply; the two are tuned together." },
    { id: "kill-rate-race", how: "Fuel is a kill-rate race against a drain instead of against a spawn rate." },
    { id: "pickup-magnet", how: "Cell magnet versus manual pickup is an open fuel question." },
    { id: "resource-economy", how: "Fuel belongs to the Solar System economy model, not Game_Overview's." },
  ],

  questions: [
    "Drain numbers: none exist yet, and the break-even kill rate is the whole design.",
    "Do weapons cost fuel per shot, and if so per weapon or flat? A fuel-costed weapon makes killing for fuel cost fuel.",
    "Do cells auto-collect (magnet) or must you fly over them? Do they decay?",
    "Are fuel capacity and drain upgrades sold in the store?",
  ],

  sparks: [
    "Cells as falling-sand particles: they sink into gravity wells and can be lost in the terrain if you do not chase them.",
    "Overcharge: fuel past the tank cap turns into a temporary damage bonus, so surplus has a use beyond safety.",
    "Fuel as the store currency, so every purchase shortens your life and hoarding competes with upgrading.",
    "Streak multipliers on cells, so a run of quick kills refuels more than the same kills spread out.",
  ],

  terms: [
    { term: "Fuel", def: "Spec: the survival resource; empty ends the run." },
    { term: "Fuel cell", def: "Spec: the pickup an NPC drops on death; value scales with NPC rank." },
    { term: "Base drain", def: "Spec: the constant per-second loss.", code: "base_drain" },
    { term: "Action cost", def: "Spec: fuel spent per boost, shot or second of shield.", code: "boost_cost, weapon_cost, shield_cost" },
    { term: "Fuel state", def: "Spec: Full, Healthy, Low, Critical, Empty, each with its own feedback." },
  ],

  sources: [
    "shmuprouge:docs/design/Fuel.md",
    "shmuprouge:docs/levels/solar_system/Solar_System_Arena.md",
    "shmuprouge:docs/design/Combat_Pressure.md",
  ],

  toy: {
    title: "Find the break-even kill rate",
    hint: "click enemies to kill them; hold the button down to boost toward the pointer",
    caption: "All numbers are invented (the spec's are TBD): 100-fuel tank, 4 cells of 3 fuel per kill, a pickup radius of 18. Clicking stands in for shooting. The gauge bands are the spec's five states.",
    w: 384, h: 216,
    controls: [
      { type: "range", key: "drain", label: "base drain", min: 1, max: 10, value: 3, fmt: "{}/s" },
      { type: "range", key: "boost", label: "boost cost", min: 0, max: 20, value: 8, fmt: "{}/s" },
      { type: "range", key: "dens", label: "enemies", min: 1, max: 12, value: 5 },
    ],
    init(S, P, kit) {
      S.fuel = 100; S.x = 200; S.y = 120; S.tx = 200; S.ty = 120; S.boost = false;
      S.en = []; S.cells = []; S.kills = 0; S.over = false; S.t = 0; S.inLog = []; S.outLog = [];
      for (let i = 0; i < 5; i++) S.en.push({ x: kit.rand.range(80, 370), y: kit.rand.range(40, 205), a: kit.rand() * 6.28 });
    },
    pointer(e, S, P, kit) {
      S.tx = e.x; S.ty = e.y; S.boost = e.down && e.type !== "up";
      if (e.type === "down") {
        if (S.over) { const fresh = {}; this.init(fresh, P, kit); Object.assign(S, fresh); return; }
        for (const n of S.en) if (Math.hypot(n.x - e.x, n.y - e.y) < 10) {
          n.dead = true; S.kills++;
          for (let k = 0; k < 4; k++) S.cells.push({ x: n.x, y: n.y, vx: kit.rand.range(-40, 40), vy: kit.rand.range(-40, 40) });
        }
      }
    },
    update(S, P, dt, kit) {
      if (S.over) return;
      S.t += dt;
      S.en = S.en.filter((n) => !n.dead);
      while (S.en.length < P.dens) {
        const side = kit.rand() < 0.5;
        S.en.push({ x: side ? 380 : kit.rand.range(80, 380), y: side ? kit.rand.range(40, 205) : 210, a: kit.rand() * 6.28 });
      }
      for (const n of S.en) {
        n.a += kit.rand.range(-1, 1) * dt * 2;
        const d = Math.hypot(S.x - n.x, S.y - n.y) || 1;
        n.x += (Math.cos(n.a) * 20 + (S.x - n.x) / d * 14) * dt; n.y += (Math.sin(n.a) * 20 + (S.y - n.y) / d * 14) * dt;
        n.x = Math.max(70, Math.min(380, n.x)); n.y = Math.max(36, Math.min(210, n.y));
      }
      const sp = S.boost ? 160 : 45, dx = S.tx - S.x, dy = S.ty - S.y, d = Math.hypot(dx, dy);
      if (d > 2) { S.x += dx / d * Math.min(d, sp * dt); S.y += dy / d * Math.min(d, sp * dt); }
      S.x = Math.max(70, S.x);
      const out = (P.drain + (S.boost ? P.boost : 0)) * dt;
      let inn = 0;
      for (const c of S.cells) {
        c.x += c.vx * dt; c.y += c.vy * dt; c.vx *= 0.96; c.vy *= 0.96;
        if (Math.hypot(c.x - S.x, c.y - S.y) < 18) { c.got = true; inn += 3; }
      }
      S.cells = S.cells.filter((c) => !c.got);
      S.fuel = Math.min(100, S.fuel - out + inn);
      S.inLog.push([S.t, inn]); S.outLog.push([S.t, out]);
      while (S.inLog.length && S.inLog[0][0] < S.t - 5) S.inLog.shift();
      while (S.outLog.length && S.outLog[0][0] < S.t - 5) S.outLog.shift();
      if (S.fuel <= 0) { S.fuel = 0; S.over = true; }
    },
    draw(g, S) {
      const C = g.C; g.clear();
      const gx = 14, gy = 40, gh = 160, gw = 16, f = S.fuel / 100;
      const bands = [[0.5, 1, C.accent], [0.2, 0.5, C.gold], [0, 0.2, C.enemy]];
      for (const [a, b, col] of bands) g.tone(gx, gy + gh * (1 - b), gw, gh * (b - a), 0.18, col);
      const col = f >= 0.5 ? C.accent : f >= 0.2 ? C.gold : C.enemy;
      const blink = f < 0.2 && Math.floor(S.t * 6) % 2 === 0;
      if (!blink) g.rect(gx, gy + gh * (1 - f), gw, gh * f, col);
      g.rect(gx, gy, gw, gh, C.ink3, 1);
      g.label("LOW", gx + gw + 4, gy + gh * 0.5 + 3, C.ink3); g.label("CRIT", gx + gw + 4, gy + gh * 0.8 + 3, C.ink3);
      for (const c of S.cells) g.rect(c.x - 2, c.y - 2, 4, 4, C.gold);
      for (const n of S.en) g.circle(n.x, n.y, 6, C.enemy);
      g.circle(S.x, S.y, 18, C.ink3, 1);
      g.circle(S.x, S.y, 5, S.boost ? C.sky : C.accent);
      if (S.over) { g.text("RUN OVER", 220, 104, { size: 16, align: "center", color: C.enemy }); g.label("CLICK TO RESTART", 220, 122, C.ink2, "center"); }
    },
    readout(S) {
      const w = Math.min(5, Math.max(0.5, S.t));
      const inn = S.inLog.reduce((a, v) => a + v[1], 0) / w, out = S.outLog.reduce((a, v) => a + v[1], 0) / w;
      return "fuel " + S.fuel.toFixed(0) + "   kills " + S.kills + "\nin " + inn.toFixed(1) + "/s  out " + out.toFixed(1) + "/s  net " + (inn - out >= 0 ? "+" : "") + (inn - out).toFixed(1);
    },
  },
});
