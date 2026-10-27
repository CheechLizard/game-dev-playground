Wiki.construct({
  id: "combat-pressure",
  name: "Combat pressure: multipliers and density zones",
  origin: "shmuprouge",
  status: "spec",
  statusNote: "Spec only (<code>docs/design/Combat_Pressure.md</code>). No multiplier code exists. The two built spawners, [[formation-waves]] and [[encounter-spawner]], each have a cap but no time, progress or zone scaling.",
  summary: "Spawn rate is a product of four factors: a base rate, how long you have lingered, how many bosses you have killed, and how dangerous the place you are standing is.",
  tags: ["spawning", "difficulty", "multiplier", "spatial", "spec"],

  intent:
    "<p>ShmupRouge is pitched as &ldquo;Defender meets horde survivor&rdquo;: the player harvests a destructible solar system and must never be able to ignore combat while doing it. Combat pressure is the rule that keeps the fight on. It grows the longer you stay in the arena, rises permanently with each boss killed, and varies by place, so the player controls the pace by choosing where to be.</p>" +
    "<p>The spatial part is the interesting design move. Open space is quiet and a planet surface is loud, so routing becomes a pressure decision, and the minimap colours zones by danger to make that decision readable.</p>",

  how:
    "<h3>The formula</h3>" +
    "<p><code>spawn_rate = base_rate &times; time_multiplier &times; progress_multiplier &times; zone_multiplier</code>. The factors multiply, so a late-run player standing in a dangerous zone sees all of them at once.</p>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>Time in arena</th><th>0&ndash;5 min</th><th>5&ndash;10</th><th>10&ndash;20</th><th>20&ndash;30</th><th>30+</th></tr></thead><tbody>" +
    "<tr><td>Time multiplier</td><td>1.0&times;</td><td>1.2&times;</td><td>1.5&times;</td><td>2.0&times;</td><td>2.5&times;+</td></tr></tbody></table></div>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>Bosses killed</th><th>0</th><th>1&ndash;2</th><th>3&ndash;4</th><th>5&ndash;6</th><th>7&ndash;8</th></tr></thead><tbody>" +
    "<tr><td>Progress multiplier</td><td>1.0&times;</td><td>1.1&times;</td><td>1.3&times;</td><td>1.5&times;</td><td>1.8&times;</td></tr></tbody></table></div>" +
    "<p>The worst case of the two tables is 2.5 &times; 1.8 = 4.5&times; before the zone factor.</p>" +
    "<h3>Density zones</h3>" +
    "<p>Zone density is given only qualitatively: open space Low; near a planet Medium; near a point of interest Medium; planet surface High; near Sol Very High; asteroid belt Variable (ambush). The parameter list gives <code>zone_density_*</code> a range of 0.5&ndash;3.0. The minimap shows the same scale as Green, Yellow, Orange and Red.</p>" +
    "<h3>What spawns and how</h3>" +
    "<p>Archetypes: Fodder, Fighter, Bomber, Turret, Elite, Mini-boss. Patterns: continuous trickle, wave burst, pursuit squad (spawns behind the player), ambush (triggered on zone entry), escalation. A cap, <code>max_active_enemies</code> (50&ndash;500), bounds the whole system.</p>" +
    "<h3>The spec contradicts itself</h3>" +
    "<p>The time table is stepped, but the parameter list has <code>time_scale_rate</code> of 0.01&ndash;0.1 per minute, which reads as linear growth. The toy offers both. Solar_System_Arena Q15 asks how the three factors combine at all, so even multiplication is not settled.</p>",

  knobs: [
    ["Base spawn rate", "TBD (1–50 /min)", "Spawns per minute before any multiplier", "base_spawn_rate"],
    ["Time scale", "step table, or 0.01–0.1 /min", "How fast lingering raises pressure", "time_scale_rate"],
    ["Progress scale", "0.1–0.3 per boss", "Permanent rise per boss kill", "progress_scale"],
    ["Zone density", "0.5–3.0", "Spatial factor per zone type", "zone_density_*"],
    ["Max active", "50–500", "Hard cap on live enemies", "max_active_enemies"],
  ],

  related: [
    { id: "formation-waves", how: "The built director; its maxActive 300 is the spec's cap, and it would be the natural host for the multipliers." },
    { id: "encounter-spawner", how: "The other built spawner: a fixed cooldown that a multiplier could scale directly." },
    { id: "escalation-curve", how: "The same problem solved in the playground with a single curve over waves." },
    { id: "fuel", how: "Enemies are the fuel source, so pressure is also supply." },
    { id: "escaped-boss", how: "Adds a persistent hunter on top of the spawn rate." },
  ],

  questions: [
    "Stepped or linear time scaling? The table and the parameter list disagree.",
    "Do the factors multiply, or does one dominate? (Solar_System_Arena Q15.)",
    "How are distant enemies despawned? The Menagerie code answers it with <code>cullRadius</code> 760 and <code>maxAge</code> 30 s; the arena has no answer.",
    "How are safe and dangerous routes generated, and should the asteroid mesh's density metrics feed the zone factor?",
  ],

  sparks: [
    "Show the four factors as a heat dial and let the player spike it on purpose for a loot multiplier, the way Balatro lets you choose a harder blind.",
    "Drive the zone factor from a live map of player-caused destruction, so loud players attract more company.",
    "Let the progress factor decay in directions you have not visited lately: pressure as a freshness economy that pushes the player outward.",
    "Invert it: pressure drains while you stand still near a safe anchor, so defensive play buys a breather at the cost of time.",
  ],

  terms: [
    { term: "Combat pressure", def: "The product of base rate and the time, progress and zone multipliers, as spawns per minute.", code: "spawn_rate (spec)" },
    { term: "Time multiplier", def: "Stepped factor on minutes spent in the arena.", code: "time_scale_rate (spec)" },
    { term: "Progress multiplier", def: "Permanent factor on bosses killed.", code: "progress_scale (spec)" },
    { term: "Density zone", def: "A region with its own zone factor and minimap danger colour.", code: "zone_density_* (spec)" },
  ],

  sources: [
    "shmuprouge:docs/design/Combat_Pressure.md",
    "shmuprouge:docs/levels/solar_system/Solar_System_Arena.md",
    "shmuprouge:shared/data/entities/MenagerieSpawns.json",
  ],

  toy: {
    title: "Four factors, one rate",
    hint: "drag the ship between zones; kill bosses",
    caption: "The arena clock runs fast (sim speed) so a 30-minute run takes about a minute; spawns run in real time. Zone factors (Low 0.5, Medium 1, High 2, Very high 3) are an illustrative reading of the spec's 0.5–3.0 range. Enemies chase for 6 s and vanish.",
    w: 384, h: 216,
    controls: [
      { type: "range", key: "base", label: "base rate", min: 1, max: 50, value: 20, fmt: "{} /min" },
      { type: "select", key: "mode", label: "time", value: "step", options: [["step", "step table"], ["linear", "linear 0.05/min"]] },
      { type: "range", key: "speed", label: "sim speed", min: 1, max: 60, value: 30, fmt: "{}x" },
      { type: "range", key: "cap", label: "max active", min: 10, max: 300, value: 150 },
      { type: "button", label: "kill boss", press(S) { S.bosses = Math.min(8, S.bosses + 1); } },
      { type: "button", label: "new run", press(S) { S.t = 0; S.bosses = 0; S.enemies = []; S.hist = []; } },
    ],
    init(S) {
      S.t = 0; S.bosses = 0; S.enemies = []; S.hist = []; S.px = 60; S.py = 150; S.tx = 60; S.ty = 150; S.hits = 0; S.acc = 0;
      S.zones = [
        { x: 120, y: 120, r: 48, name: "near planet", lvl: 1 },
        { x: 120, y: 120, r: 20, name: "planet surface", lvl: 2 },
        { x: 300, y: 70, r: 28, name: "near POI", lvl: 1 },
        { x: 290, y: 165, r: 34, name: "near Sol", lvl: 3 },
      ];
    },
    pointer(e, S) { if (e.down) { S.tx = e.x; S.ty = e.y; } },
    update(S, P, dt, kit) {
      S.t += dt * P.speed / 60;
      const dx = S.tx - S.px, dy = S.ty - S.py, d = Math.hypot(dx, dy);
      if (d > 1) { const m = Math.min(d, 90 * dt); S.px += dx / d * m; S.py += dy / d * m; }
      const f = this.factors(S, P);
      S.rate = f.rate;
      // Poisson arrivals in real seconds
      S.acc += f.rate / 60 * dt;
      while (S.acc > 0 && kit.rand() < S.acc) {
        S.acc -= 1;
        if (S.enemies.length >= P.cap) { S.acc = 0; break; }
        const side = kit.rand() * 4 | 0, u = kit.rand();
        const x = side === 0 ? 0 : side === 1 ? 384 : u * 384, y = side === 2 ? 0 : side === 3 ? 216 : u * 216;
        S.enemies.push({ x, y, life: 6 });
      }
      if (S.acc > 1) S.acc = 1;
      for (const en of S.enemies) {
        const ex = S.px - en.x, ey = S.py - en.y, el = Math.hypot(ex, ey) || 1;
        en.x += ex / el * 38 * dt; en.y += ey / el * 38 * dt; en.life -= dt;
        if (el < 5) { en.life = 0; S.hits++; }
      }
      S.enemies = S.enemies.filter((en) => en.life > 0);
      S.histT = (S.histT || 0) + dt;
      if (S.histT > 0.25) { S.histT = 0; S.hist.push(f.rate); if (S.hist.length > 120) S.hist.shift(); }
    },
    factors(S, P) {
      const m = S.t;
      let T;
      if (P.mode === "step") T = m < 5 ? 1 : m < 10 ? 1.2 : m < 20 ? 1.5 : m < 30 ? 2 : 2.5;
      else T = 1 + 0.05 * m;
      const b = S.bosses, Pm = b === 0 ? 1 : b <= 2 ? 1.1 : b <= 4 ? 1.3 : b <= 6 ? 1.5 : 1.8;
      let lvl = 0, name = "open space";
      for (const z of S.zones) if (Math.hypot(S.px - z.x, S.py - z.y) < z.r && z.lvl >= lvl) { lvl = z.lvl; name = z.name; }
      const Z = [0.5, 1, 2, 3][lvl];
      return { T, Pm, Z, lvl, name, rate: P.base * T * Pm * Z };
    },
    draw(g, S, P) {
      const C = g.C;
      g.clear();
      const f = this.factors(S, P);
      for (const z of S.zones) {
        g.toneCircle(z.x, z.y, z.r, [0, 0.12, 0.25, 0.4][z.lvl], C.enemy);
        g.circle(z.x, z.y, z.r, C.rule, 1);
      }
      g.circle(120, 120, 12, C.ink3);
      g.circle(290, 165, 9, C.gold);
      g.label("PLANET", 120, 176, C.ink3, "center");
      g.label("POI", 300, 106, C.ink3, "center");
      g.label("SOL", 290, 208, C.ink3, "center");
      for (const en of S.enemies) g.rect(en.x - 1.5, en.y - 1.5, 3, 3, C.enemy);
      g.circle(S.px, S.py, 4, C.ink);
      g.circle(S.px, S.py, 7, C.accent, 1);
      // factor bars (log scale so the product reads as a sum of lengths)
      const bx = 200, by = 8, scale = 26;
      const parts = [["T", f.T, C.sky], ["P", f.Pm, C.violet], ["Z", f.Z, C.enemy]];
      let x = bx;
      for (const [k, v, col] of parts) {
        const w = Math.max(0, Math.log2(v)) * scale;
        g.rect(x, by, Math.max(1, w), 8, col);
        g.label(k + " " + v.toFixed(2), x + 1, by + 18, col);
        x += Math.max(w, 40) + 2;
      }
      g.plot(4, 186, 110, 26, S.hist.map((r) => r / 400), C.accent, 1);
      g.label("RATE", 4, 184, C.ink3);
    },
    readout(S, P) {
      const f = this.factors(S, P);
      return "t " + S.t.toFixed(1) + " min  bosses " + S.bosses + "\n" + f.name + "  rate " + f.rate.toFixed(0) + "/min\nalive " + S.enemies.length + "/" + P.cap + "  hits " + S.hits;
    },
  },
});
