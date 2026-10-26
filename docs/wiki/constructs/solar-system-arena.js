// Toy helpers (top level so buttons and handlers can share them).
function ssaInit(S, P) {
  const N = 56; S.N = N; S.cs = 3; S.ox = 250 - N * 1.5; S.oy = 112 - N * 1.5;
  S.g = new Array(N * N).fill(null); S.fire = []; S.parts = []; S.hull = 100; S.cut = 0; S.msg = ""; S.msgT = 0; S.breach = 0; S.breached = false; S.t = 0;
  const M = {
    reg: { n: "regolith", h: 1, k: "solid", c: "ink3" }, ore: { n: "dense ore", h: 2, k: "solid", c: "ink2" },
    core: { n: "molten core", h: 3, k: "core", c: "enemy" }, gas: { n: "gas", h: 0, k: "gas", c: "violet" },
    dense: { n: "dense core", h: 3, k: "solid", c: "ink" },
    bricks: { n: "BRICKS", h: 0.4, k: "solid", c: "ink3" }, skulls: { n: "SKULLS", h: 0.4, k: "solid", c: "ink2" }, iron: { n: "IRON_ORE", h: 0.8, k: "solid", c: "gold" },
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const r = Math.hypot(x - N / 2 + 0.5, y - N / 2 + 0.5);
    let m = null;
    if (P.planet === "rocky") m = r > 26 ? null : r > 21 ? M.reg : r > 9 ? M.ore : M.core;
    else if (P.planet === "gas") m = r > 26 ? null : r > 9 ? M.gas : M.dense;
    else m = r > 26 ? null : r > 20 ? M.bricks : r > 11 ? M.skulls : r > 8 ? M.iron : null;
    S.g[y * N + x] = m ? Object.assign({}, m) : null;
  }
}
function ssaSay(S, m) { S.msg = m; S.msgT = 2.2; }
function ssaBreach(S) {
  if (S.breach > 0 || S.breached) return;
  const N = S.N;
  for (let i = N; i < N * N - N; i++) {
    const m = S.g[i]; if (!m || m.k !== "core") continue;
    if (!S.g[i - 1] || !S.g[i + 1] || !S.g[i - N] || !S.g[i + N]) {
      S.breach = 3; S.breached = true; S.bx = i % N; S.by = (i / N) | 0; S.hull -= 40; ssaSay(S, "CORE BREACH: ERUPTION"); return;
    }
  }
}

Wiki.construct({
  id: "solar-system-arena",
  name: "Solar System Arena",
  family: "structure",
  origin: "shmuprouge",
  status: "partial",
  statusNote: "Built: planets as concentric material rings with craters, a radial gravity attractor per planet, inside a toroidal arena. Not built: the sun, plasma, heat zones, Solar Dragons, the six planet archetypes, and every physics-consequence gate. Materials carry <code>hardness</code> and <code>explosive</code> values, but no code reads them.",
  summary: "One huge wrap-around arena of destructible planets, where what stops you going deeper is the physics of the material (too hard, explodes, erupts), not a locked door.",
  tags: ["progression", "gating", "planets", "destructible", "toroidal"],

  intent:
    "<p>The arena is the open half of a ShmupRouge level: a toroidal solar system with a sun, five to seven planets, belts and empty space, where every body is made of falling sand and can be dug into. The design pillar is &quot;dig smarter, not deeper&quot;. A planet is an onion of materials, and progress toward its valuable core is gated by consequences the player can predict from the material: the wrong tool cannot cut it, the wrong weapon sets off the gas layer, the wrong order breaches a molten core.</p>" +
    "<p>The point is that the gate teaches itself. A locked door says &quot;come back later&quot;. A layer that deflects your laser, or a gas ring that turns your bomb into your own death, says <em>why</em>, and an upgrade that changes the answer (a tool that cuts harder rock, a bomb that does not ignite gas) is legible the moment you get it.</p>",

  how:
    "<h3>What the design asks for</h3>" +
    "<p><code>docs/levels/solar_system/Solar_System_Arena.md</code> sets the scale: arena 65,536+ wu tested, sun radius about 5% of the arena, sun attractor about 2%, five to seven planets. Six archetypes, each an onion with a characteristic way to die:</p>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>Archetype</th><th>Core</th><th>Mid</th><th>Surface</th><th>Consequence</th></tr></thead><tbody>" +
    "<tr><td>Rocky</td><td>Molten iron</td><td>Dense ore</td><td>Regolith</td><td>Volcanic breach, eruption</td></tr>" +
    "<tr><td>Gas giant</td><td>Small dense solid</td><td>&mdash;</td><td>Swirling gas</td><td>Explosives detonate in the gas layer</td></tr>" +
    "<tr><td>Molten</td><td>Solid core</td><td>Magma sea</td><td>Thin crust</td><td>Constant eruption</td></tr>" +
    "</tbody></table></div>" +
    "<p>Ice, Dead/Shattered and Water complete the six. The sun is plasma (instant kill) behind a heat zone that is a soft gate until shields arrive. The doc's failure grammar: wrong tool, cannot penetrate; wrong weapon, backfire; wrong sequence, catastrophe; missing defence, environmental death. Interplanetary space is 95% NPC encounters and rare points of interest. Planet difficulty is enemy density &times; material depth &times; hazards.</p>" +
    "<h3>What the code builds</h3>" +
    "<p>The <code>alpha_arena</code> level is 50&times;50 chunks of 256 wu (12,800 wu square, toroidal) holding two planets and two concentric belts (see [[zone-layers]]). A planet is a zone template whose depth-1.0 layer is <code>pregenerate: true</code> and names the <code>rocky_planet</code> biome. <code>Biomes.spawnUpfront</code> registers the gravity attractor first (<code>attractorRadius</code> 2000, <code>attractorStrength</code> 0.8, <code>orbitStrength</code> 0.05), so later features settle toward the new local down ([[flow-field-gravity]]). Then it peels <code>concentric_rings</code> from <code>planetRadius</code> 900 inward:</p>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>Ring</th><th>Thickness (wu)</th><th><code>hardness</code></th></tr></thead><tbody>" +
    "<tr><td>BRICKS</td><td>180&ndash;220</td><td>0.4</td></tr>" +
    "<tr><td>SKULLS</td><td>280&ndash;320</td><td>0.4</td></tr>" +
    "<tr><td>IRON_ORE</td><td>80&ndash;120</td><td>0.8</td></tr>" +
    "</tbody></table></div>" +
    "<p>The rings add up to about 600 wu, so roughly the inner 300 wu is left empty, with a black depth-0.99 parallax core behind it. Three to seven craters (radius 80&ndash;150) are carved at 60&ndash;90% of the radius and filled with WATER along local gravity: nominally 60%, actually 40% (see [[zone-layers]]). The materials are placeholders: the biome's own description says granite crust, basalt mantle, iron core.</p>" +
    "<p>The gating itself does not exist. <code>hardness</code> is copied into the material table and never read. The <code>explosive</code> flag is packed into the material-properties texture, and the shader's <code>isExplosive()</code> is never called. Any weapon cuts any ring at the same rate. The ingredients for physics-consequence gating are in the data, waiting for rules.</p>",

  knobs: [
    ["Planet radius", "900 wu (shape 1000)", "Outer edge of the ring fill", "zones/rocky_planet.json params.planetRadius"],
    ["Attractor", "radius 2000, strength 0.8, orbit 0.05", "Gravity well each planet stamps into the flow field", "params.attractorRadius / attractorStrength / orbitStrength"],
    ["Ring thickness", "BRICKS 180-220, SKULLS 280-320, IRON_ORE 80-120", "The onion's layers, outside in", "biomes/rocky_planet.json fill.layers[].thickness"],
    ["Craters", "3-7, radius 80-150, fill.percent 0.6", "Pockets carved into the crust", "features[crater].count / size, features/crater.json fill.percent"],
    ["Material hardness", "0.4 / 0.4 / 0.8", "Meant to gate tools; currently unread", "materials/*.json hardness"],
    ["Arena", "50 x 50 chunks of 256 wu", "Toroidal arena size", "levels/alpha_arena.json size"],
  ],

  related: [
    { id: "zone-layers", how: "How a planet is assembled: template layers, biome rings, features." },
    { id: "flow-field-gravity", how: "Each planet is a gravity attractor; down points at the core." },
    { id: "material-properties", how: "Where hardness, explosive and reactions live, the raw material for consequence gates." },
    { id: "celestial-upgrades", how: "The tool upgrades that would change a gate's answer (a bomb that does not ignite gas)." },
    { id: "level-loop", how: "The arena is the first stage of arena, corridor, boss, store." },
  ],

  questions: [
    "Which planets must be cleared before the corridor opens, and can a player skip a planet entirely? (doc Q list)",
    "Gas detonation: radius, chain reaction, and is there an escape window? The doc leaves all three open.",
    "Should hardness gate by tool tier (a hard threshold) or by cutting speed (slower on harder rings)? The data stores a 0-1 float, which reads like speed.",
    "How is planet difficulty balanced across a generated system: enemy density x material depth x hazards needs a target ratio of easy to hard.",
  ],

  sparks: [
    "Hazards as reactions, not scripts: in any material sim, a gate is just a reagent the player must not bring. A water planet that floods the tunnel you dug with acid.",
    "The onion as a chosen difficulty curve: every planet is a dungeon whose depth the player picks, with the best loot behind the most dangerous layer.",
    "Make the backfire the tutorial: the first gas giant is placed where the player has only bombs, so the lesson is one spectacular death.",
    "Orbit strength as a conveyor: loose loot on a planet with high orbitStrength drifts around the surface, so harvesting becomes chasing a current.",
  ],

  terms: [
    { term: "Arena", def: "The toroidal open stage of a level: sun, planets, belts and space.", code: "levels/alpha_arena.json" },
    { term: "Planet archetype", def: "One of six layer recipes (Rocky, Gas Giant, Ice, Molten, Dead, Water), each with its own failure mode. Spec only.", code: "Solar_System_Arena.md" },
    { term: "Physics-consequence gating", def: "Progress blocked by what a material does (resists, explodes, erupts) rather than by a lock.", code: "material hardness / explosive (unread)" },
    { term: "Concentric rings", def: "Biome fill that peels material layers from the planet's radius inward.", code: "fill.type \"concentric_rings\"" },
    { term: "Pregenerate", def: "A zone layer built and fully hardened at level load instead of streamed.", code: "layer.pregenerate" },
  ],

  sources: [
    "shmuprouge:docs/levels/solar_system/Solar_System_Arena.md",
    "shmuprouge:docs/levels/solar_system/Solar_System_Overview.md",
    "shmuprouge:shared/data/world/zones/rocky_planet.json",
    "shmuprouge:shared/data/world/biomes/rocky_planet.json",
    "shmuprouge:game/world/terrain/biomes.lua",
    "shmuprouge:game/world/terrain/zone_drawing.lua",
    "shmuprouge:engine/physics/sand/materials.lua",
  ],

  toy: {
    title: "Dig smarter: a planet that answers back",
    hint: "pick a tool, click the planet",
    caption: "The two doc archetypes are invented as described in Solar_System_Arena.md; nothing in the game gates like this yet. The third planet is the shipped rocky_planet ring recipe, where hardness is stored but ignored, so every tool cuts everything. Hull loss stands in for the ship being caught in the blast.",
    w: 384, h: 216,
    controls: [
      { type: "select", key: "planet", label: "planet", value: "rocky", reset: true, options: [["rocky", "Rocky (doc)"], ["gas", "Gas giant (doc)"], ["game", "rocky_planet.json (game)"]] },
      { type: "select", key: "tool", label: "tool", value: "laser", options: [["laser", "laser (precise)"], ["bomb", "bomb (area)"]] },
      { type: "range", key: "tier", label: "tool tier", min: 1, max: 3, value: 1 },
      { type: "button", label: "reset", press(S, P) { ssaInit(S, P); } },
    ],
    init(S, P) { ssaInit(S, P); },
    pointer(e, S, P) {
      if (e.type !== "down" || S.hull <= 0) return;
      const N = S.N, cx = Math.floor((e.x - S.ox) / S.cs), cy = Math.floor((e.y - S.oy) / S.cs);
      if (cx < 0 || cy < 0 || cx >= N || cy >= N) return;
      const asBuilt = P.planet === "game";
      const rad = P.tool === "laser" ? 1.6 : 4.5, maxH = P.tool === "laser" ? P.tier : P.tier + 1;
      let blocked = null, gasHit = false;
      for (let y = cy - 5; y <= cy + 5; y++) for (let x = cx - 5; x <= cx + 5; x++) {
        if (x < 0 || y < 0 || x >= N || y >= N || Math.hypot(x - cx, y - cy) > rad) continue;
        const m = S.g[y * N + x]; if (!m) continue;
        if (m.k === "gas") { if (P.tool === "bomb" && !m.lit) { gasHit = true; m.lit = true; S.fire.push({ i: y * N + x, t: 0 }); } continue; }
        if (!asBuilt && m.h > maxH) { blocked = m; continue; }
        S.g[y * N + x] = null; S.cut++;
      }
      if (gasHit) { ssaSay(S, "GAS DETONATION"); S.hull -= 25; }
      else if (blocked) ssaSay(S, "DEFLECTED: " + blocked.n + " hardness " + blocked.h + " > tier " + maxH);
      else if (asBuilt) ssaSay(S, "cut (hardness ignored)");
      ssaBreach(S);
    },
    update(S, P, dt, kit) {
      const N = S.N; S.t += dt; S.msgT -= dt;
      const next = [];
      for (const f of S.fire) {
        f.t += dt;
        if (f.t > 0.12 && S.g[f.i]) {
          S.g[f.i] = null; S.cut++; S.hull -= 0.35;
          for (const d of [1, -1, N, -N]) {
            const j = f.i + d, m = S.g[j];
            if (m && m.k === "gas" && !m.lit) { m.lit = true; next.push({ i: j, t: 0 }); }
            else if (m && m.k === "solid" && m.h <= 1) S.g[j] = null;
          }
          S.parts.push({ x: S.ox + (f.i % N) * S.cs, y: S.oy + ((f.i / N) | 0) * S.cs, vx: kit.rand.range(-30, 30), vy: kit.rand.range(-30, 30), l: 0.5, c: "gold" });
        } else if (S.g[f.i]) next.push(f);
      }
      S.fire = next;
      if (S.breach > 0) {
        S.breach -= dt;
        for (let k = 0; k < 3; k++) {
          const a = Math.atan2(S.by - N / 2, S.bx - N / 2) + kit.rand.range(-0.5, 0.5), v = kit.rand.range(60, 140);
          S.parts.push({ x: S.ox + S.bx * S.cs, y: S.oy + S.by * S.cs, vx: Math.cos(a) * v, vy: Math.sin(a) * v, l: 1, c: "enemy" });
        }
      }
      for (const p of S.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.l -= dt; }
      S.parts = S.parts.filter((p) => p.l > 0).slice(-400);
      S.hull = Math.max(0, S.hull);
      if (S.fire.length === 0) ssaBreach(S);
    },
    draw(g, S, P) {
      const C = g.C, N = S.N, cs = S.cs;
      g.clear();
      g.circle(250, 112, 26 * cs + 1, C.rule, 1);
      for (let i = 0; i < N * N; i++) {
        const m = S.g[i]; if (!m) continue;
        const x = S.ox + (i % N) * cs, y = S.oy + ((i / N) | 0) * cs;
        if (m.k === "gas") g.tone(x, y, cs, cs, 0.35 + 0.15 * Math.sin(S.t * 3 + i * 0.7), m.lit ? C.gold : C.violet);
        else g.rect(x, y, cs + 0.4, cs + 0.4, C[m.c]);
      }
      if (P.planet === "game") g.circle(250, 112, 8 * cs, C.ink3, 1);
      for (const p of S.parts) g.rect(p.x, p.y, 2, 2, C[p.c]);
      const leg = P.planet === "rocky" ? [["regolith h1", "ink3"], ["dense ore h2", "ink2"], ["molten core h3", "enemy"]]
        : P.planet === "gas" ? [["gas: explodes", "violet"], ["dense core h3", "ink"]]
        : [["BRICKS .4", "ink3"], ["SKULLS .4", "ink2"], ["IRON_ORE .8", "gold"], ["hollow centre", "rule"]];
      leg.forEach((l, k) => { g.rect(8, 60 + k * 14, 8, 8, C[l[1]]); g.label(l[0], 20, 68 + k * 14); });
      g.label("hull", 8, 132, C.ink3); g.meter(8, 136, 90, 5, S.hull / 100, S.hull > 30 ? C.accent : C.enemy);
      if (S.hull <= 0) g.text("SHIP LOST - RESET", 250, 206, { color: C.enemy, align: "center" });
      else if (S.msgT > 0) g.text(S.msg, 250, 206, { color: S.msg.indexOf("cut") === 0 ? C.ink2 : C.enemy, align: "center" });
    },
    readout(S, P) {
      return P.tool + "  tier " + P.tier + "\nhull " + S.hull.toFixed(0) + "  cells cut " + S.cut;
    },
  },
});
