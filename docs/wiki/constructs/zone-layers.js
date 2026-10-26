// Toy helpers. Templates mirror shared/data/world/zones/*.json (depth-1.0 layer last).
var ZNL_T = {
  rocky_planet: { scale: 0.07, layers: [
    { suffix: "bg1", depth: 0.3, shape: "circle 3600", parallax: "outer_rings", r: 3600 },
    { suffix: "bg2", depth: 0.6, shape: "circle 1800", parallax: "atmosphere_glow", r: 1800 },
    { suffix: "core", depth: 0.99, shape: "circle 900", parallax: "planet_core", r: 900 },
    { suffix: "\"\"", depth: 1.0, shape: "circle 1000", note: "pregenerate, planetRadius 900" } ] },
  asteroid_belt: { scale: 0.034, layers: [
    { suffix: "bg1", depth: 0.35, shape: "ring 1000-3300", parallax: "medium_field", ri: 1000, ro: 3300, n: 140, sz: 2.2 },
    { suffix: "bg2", depth: 0.65, shape: "ring 2000-3000", parallax: "giant_field", ri: 2000, ro: 3000, n: 26, sz: 5 },
    { suffix: "\"\"", depth: 1.0, shape: "ring 1500-3000", note: "params.enemies: read by nothing" } ] },
};
var ZNL_CX = 262, ZNL_CY = 112;
function znlInit(S, P, kit) {
  const r = kit.rand; S.t = 0; S.cam = { x: 0, y: 0 }; S.drag = null; S.user = false;
  S.rings = [{ m: "BRICKS", t: r.range(180, 220) }, { m: "SKULLS", t: r.range(280, 320) }, { m: "IRON_ORE", t: r.range(80, 120) }];
  // planet cells: 1 cell = 3 px = 3 / 0.07 wu
  const cw = 3 / 0.07, R = 900, n = Math.ceil(R / cw); S.cw = cw; S.cells = [];
  const count = r.int(3, 7), craters = [];
  for (let i = 0; i < count; i++) { const a = (i / count) * Math.PI * 2 + (r() - 0.5) * 0.5, d = R * (0.6 + r() * 0.3); craters.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, s: r.range(80, 150) }); }
  S.craters = craters;
  for (let gy = -n; gy <= n; gy++) for (let gx = -n; gx <= n; gx++) {
    const x = (gx + 0.5) * cw, y = (gy + 0.5) * cw, d = Math.hypot(x, y);
    if (d > R) continue;
    let out = R, m = null;
    for (const ring of S.rings) { if (d > out - ring.t) { m = ring.m; break; } out -= ring.t; }
    if (!m) continue;
    for (const c of craters) {
      const dx = x - c.x, dy = y - c.y;
      if (Math.hypot(dx, dy) < c.s) {
        // gravity points at the planet centre; fill cells beyond the chord, as the game does
        const gl = Math.hypot(c.x, c.y), gx2 = -c.x / gl, gy2 = -c.y / gl, proj = dx * gx2 + dy * gy2;
        m = proj > c.s * znlChord(0.6) ? "WATER" : null;
      }
    }
    if (m) S.cells.push({ x, y, m });
  }
  // belt: random scatter with min-distance rejection, density 0.00006 / wu2
  S.ast = []; const area = Math.PI * (3000 * 3000 - 1500 * 1500), want = Math.round(area * 0.00006);
  for (let i = 0; i < want; i++) for (let k = 0; k < 30; k++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(1500 * 1500 + r() * (3000 * 3000 - 1500 * 1500)), x = Math.cos(a) * d, y = Math.sin(a) * d;
    if (S.ast.every((p) => Math.abs(p.x - x) > 60 || Math.abs(p.y - y) > 60)) { S.ast.push({ x, y, s: r.range(14, 25) }); break; }
  }
  S.bg = {}; for (const L of ZNL_T.asteroid_belt.layers) if (L.n) { S.bg[L.suffix] = []; for (let i = 0; i < L.n; i++) { const a = r() * 6.283, d = Math.sqrt(L.ri * L.ri + r() * (L.ro * L.ro - L.ri * L.ri)); S.bg[L.suffix].push({ x: Math.cos(a) * d, y: Math.sin(a) * d, s: r.range(0.6, 1) }); } }
}
// chord offset as a fraction of radius, solved the way ZoneDrawing.craterFill does it.
// Like the game, it fills the cap of area (1 - fill), so percent 0.6 leaves 40% wet.
function znlChord(fill) {
  const seg = (d) => Math.acos(d) - d * Math.sqrt(1 - d * d); let lo = -1, hi = 1;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (seg(mid) > (1 - fill) * Math.PI) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

Wiki.construct({
  id: "zone-layers",
  name: "Zones, biomes, features",
  family: "generation",
  origin: "shmuprouge",
  status: "built",
  statusNote: "Built, in a newer shape than the docs: levels place zone templates made of depth layers, where the docs put shape and biome inline on the level. Shapes are circle and ring only. Zone <code>params.enemies</code> (and the level's <code>npcs</code>, <code>storyTrigger</code>) are read by nothing.",
  summary: "A level places zone instances; each zone template is a stack of layers at different parallax depths; the gameplay layer hands its fill and feature scatter to a biome recipe that calls named draw primitives.",
  tags: ["procedural", "authoring", "JSON", "planets", "parallax"],

  intent:
    "<p>A designer should build a planet the way they would describe it: a rocky world, about this big, bricks over skulls over iron, some flooded craters, rings and a glow behind it. The zone hierarchy makes each of those a separate, reusable piece of JSON. The level only says where; the template says what layers at what depths; the biome says what material and features; the feature says how to draw.</p>" +
    "<p>Depth layering sells scale cheaply. Background layers are zones at depth below 1, drawn with parallax and no physics, so space feels deep while only the depth-1.0 layer is simulated sand.</p>",

  how:
    "<h3>Four files, four questions</h3>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>File</th><th>Answers</th><th>Example</th></tr></thead><tbody>" +
    "<tr><td><code>world/levels/alpha_arena.json</code></td><td>where</td><td><code>{id: \"alpha_prime\", zone: \"rocky_planet\", center_wu: [128, 128]}</code></td></tr>" +
    "<tr><td><code>world/zones/rocky_planet.json</code></td><td>which layers</td><td>bg1 0.3, bg2 0.6, core 0.99, gameplay 1.0 <code>pregenerate</code></td></tr>" +
    "<tr><td><code>world/biomes/rocky_planet.json</code></td><td>made of what</td><td><code>concentric_rings</code>, crater and debris features, parallax presets, darkening</td></tr>" +
    "<tr><td><code>world/features/crater.json</code></td><td>how to draw</td><td><code>carve_circle</code>, then fill 60% WATER</td></tr>" +
    "</tbody></table></div>" +
    "<h3>Zone template</h3>" +
    "<p><code>layers[]</code> each has <code>suffix</code>, <code>depth</code>, <code>shape</code> (circle <code>radius_wu</code>, or ring <code>innerRadius_wu</code>/<code>outerRadius_wu</code>), optional <code>parallax</code> preset name, <code>pregenerate</code> and <code>params</code>. <code>zone_loader.lua</code> builds the id <code>instance_suffix</code>, merges layer params with instance params and asserts <code>depth &gt; 0</code>. Layers at depth 1.0 are terrain; the rest become [[parallax-zones]].</p>" +
    "<h3>Biome and features</h3>" +
    "<p>The fill <code>concentric_rings</code> peels layers from the radius inward, each with a random thickness from <code>[min, max]</code>. Features scatter three ways:</p>" +
    "<ul><li><code>random</code>: <code>count</code> features spread evenly in angle with &plusmn;0.25 rad jitter, at 60&ndash;90% of the radius; or a <code>density</code> chance per 64 wu cell;</li>" +
    "<li><code>surface</code>: one call covering the zone (debris along the surface);</li>" +
    "<li><code>mesh</code>: one feature per vertex of the [[asteroid-mesh]], radius from the mesh.</li></ul>" +
    "<p>Feature draw primitives: <code>noisy_circle</code>, <code>debris_on_top</code>, <code>carve_circle</code>, <code>surface_scatter</code>, <code>concentric_rings</code>. A feature may add <code>fill</code>: crater water levelled along local gravity by a binary search for a chord. The search targets a cap of <code>(1 &minus; percent)</code> of the circle and then fills that cap, so <code>percent</code> 0.6 floods 40% of each crater; the fill also extends each column straight down in screen y, whatever the local gravity and <code>spawns</code> with a chance (an asteroid has a 10% turret).</p>" +
    "<h3>What is authored but unused</h3>" +
    "<p><code>asteroid_belt.json</code> gives its gameplay layer <code>params: {density: 0.3, enemies: [\"pirate_scout\", \"mining_drone\"]}</code>; neither key has a reader (asteroid count comes from the biome's feature density). <code>alpha_prime</code>'s <code>npcs</code> and <code>storyTrigger</code> are likewise read by nothing.</p>" +
    "<h3>Where the docs differ</h3>" +
    "<p><code>World_Generation_Stack_Design_v0_1.md</code> L5 shows zones with <code>shape</code> and <code>biome</code> inline on the level. <code>Procedural_Level_Generation.md</code> describes grid-step random asteroids, a <code>StabilityQuadtree</code> and hash-picked tiles. The code uses templates with layers, biome recipes and lithon quads.</p>",

  knobs: [
    ["Zone placement", "center_wu", "Where an instance sits in the level", "levels/*.json zones[].center_wu"],
    ["Layer depth", "0.3 / 0.6 / 0.99 / 1.0", "Parallax depth of each layer; 1.0 is terrain", "zones/*.json layers[].depth"],
    ["Ring thickness", "[180, 220], [280, 320], [80, 120]", "Planet onion, outside in", "biomes/rocky_planet.json fill.layers[].thickness"],
    ["Feature scatter", "crater: random, count [3, 7], size [80, 150]", "How features are placed", "biomes/*.json features[]"],
    ["Crater fill", "WATER, 0.6 (fills 40%)", "Liquid poured into a carved crater along gravity", "features/crater.json fill.percent"],
    ["Darkening", "maxDepth 20, intensity 0.3", "Interior shading per biome", "biomes/*.json darkening"],
  ],

  related: [
    { id: "parallax-zones", how: "Layers below depth 1.0, and how they wrap." },
    { id: "asteroid-mesh", how: "The mesh scatter mode for belts." },
    { id: "world-gen-stack", how: "L5 and L4 of the stack, as built." },
    { id: "zone-editor", how: "The planned tool that would author these files." },
    { id: "solar-system-arena", how: "The arena these zones populate." },
  ],

  questions: [
    "What should read zone params.enemies: the encounter spawner, the combat-pressure zones, or a new per-zone roster?",
    "Where is the biome registry's source of truth, the folder or a list the editor can validate against?",
    "How are boolean shapes (planet minus a cave) stored once rectangle and union arrive?",
    "Cross-zone transitions: two depth-1.0 zones that touch have no seam rule today.",
  ],

  sparks: [
    "Dive a layer: let a background zone swap to depth 1.0 when the player reaches it, so the scenery becomes the next level.",
    "Feature spawns as ecology: turrets grow on asteroids at 10%; give planets a 'nest' feature and enemies come from the terrain.",
    "Nested rings at one centre as difficulty bands: the void ring outside the inner belt is already authored this way.",
    "Recipes for any 2D world: planet = recipe + features + params is a grammar a level generator can mutate.",
  ],

  terms: [
    { term: "Zone instance", def: "A placed template with an id and centre.", code: "levels/*.json zones[]" },
    { term: "Zone template", def: "A named stack of layers, each with depth and shape.", code: "world/zones/*.json layers[]" },
    { term: "Biome", def: "Fill recipe, features, parallax presets and darkening.", code: "world/biomes/*.json" },
    { term: "Feature", def: "A drawable unit: primitives, optional fill and spawns.", code: "world/features/*.json draw[]" },
    { term: "Scatter mode", def: "How a biome places a feature: random, surface or mesh.", code: "features[].scatter" },
    { term: "Pregenerate", def: "Build and harden the layer at load.", code: "layer.pregenerate" },
  ],

  sources: [
    "shmuprouge:shared/data/world/levels/alpha_arena.json",
    "shmuprouge:shared/data/world/zones/rocky_planet.json",
    "shmuprouge:shared/data/world/zones/asteroid_belt.json",
    "shmuprouge:shared/data/world/biomes/rocky_planet.json",
    "shmuprouge:shared/data/world/features/crater.json",
    "shmuprouge:game/world/terrain/zone_loader.lua",
    "shmuprouge:game/world/terrain/biomes.lua",
    "shmuprouge:game/world/terrain/zone_drawing.lua",
    "shmuprouge:docs/design/World_Generation_Stack_Design_v0_1.md",
  ],

  toy: {
    title: "One template, four depths",
    hint: "drag to move the camera; reseed for new rings and craters",
    caption: "Built from the shipped JSON numbers. Each layer moves by camera offset times its depth. Craters fill 40%, not the 60% the JSON asks, because the toy solves the chord the way craterFill does. Parallax art is reduced to rings, a glow and dots; the belt's terrain asteroids are the 1,270 the biome's density asks for.",
    w: 384, h: 216,
    controls: [
      { type: "select", key: "tpl", label: "template", value: "rocky_planet", options: [["rocky_planet", "rocky_planet"], ["asteroid_belt", "asteroid_belt"]] },
      { type: "toggle", key: "outline", label: "layer outlines", value: true },
      { type: "button", label: "reseed", press(S, P, kit) { znlInit(S, P, kit); } },
    ],
    init(S, P, kit) { znlInit(S, P, kit); },
    pointer(e, S) {
      if (e.type === "down") { S.drag = { x: e.x, y: e.y, cx: S.cam.x, cy: S.cam.y }; S.user = true; }
      else if (e.type === "move" && S.drag && e.down) { S.cam.x = S.drag.cx - (e.x - S.drag.x); S.cam.y = S.drag.cy - (e.y - S.drag.y); }
      else if (e.type === "up") S.drag = null;
    },
    update(S, P, dt) {
      S.t += dt;
      if (!S.user) { S.cam.x = Math.cos(S.t * 0.5) * 60; S.cam.y = Math.sin(S.t * 0.7) * 30; }
      S.cam.x = Math.max(-200, Math.min(200, S.cam.x)); S.cam.y = Math.max(-150, Math.min(150, S.cam.y));
    },
    draw(g, S, P) {
      const C = g.C, T = ZNL_T[P.tpl], sc = T.scale; g.clear();
      const at = (d) => [ZNL_CX - S.cam.x * d, ZNL_CY - S.cam.y * d];
      for (const L of T.layers) {
        const [x, y] = at(L.depth);
        if (L.depth < 1) {
          if (P.tpl === "rocky_planet") {
            const R = L.r * L.depth * sc;
            if (L.parallax === "outer_rings") { g.circle(x, y, R * 0.85, C.gold, 2); g.circle(x, y, R * 0.95, C.ink3, 1); }
            else if (L.parallax === "atmosphere_glow") g.toneCircle(x, y, R * 0.95, 0.18, C.gold);
            else { g.toneCircle(x, y, R, 0.5, C.ink3); }
            if (P.outline) g.circle(x, y, R, C.rule, 1);
          } else {
            for (const p of S.bg[L.suffix]) g.toneCircle(x + p.x * L.depth * sc, y + p.y * L.depth * sc, L.sz * p.s, L.depth < 0.5 ? 0.35 : 0.55, C.ink3);
            if (P.outline) { g.circle(x, y, L.ro * L.depth * sc, C.rule, 1); g.circle(x, y, L.ri * L.depth * sc, C.rule, 1); }
          }
        } else if (P.tpl === "rocky_planet") {
          const col = { BRICKS: C.ink3, SKULLS: C.ink2, IRON_ORE: C.gold, WATER: C.sky }, cs = S.cw * sc;
          for (const c of S.cells) g.rect(x + c.x * sc - cs / 2, y + c.y * sc - cs / 2, cs + 0.4, cs + 0.4, col[c.m]);
          if (P.outline) g.circle(x, y, 1000 * sc, C.accent, 1);
        } else {
          for (const a of S.ast) g.rect(x + a.x * sc - 0.6, y + a.y * sc - 0.6, 1.4, 1.4, C.ink);
          if (P.outline) { g.circle(x, y, 3000 * sc, C.accent, 1); g.circle(x, y, 1500 * sc, C.accent, 1); }
        }
      }
      // layer list
      g.label(P.tpl + ".json layers", 6, 46, C.ink3);
      T.layers.forEach((L, i) => {
        const y = 60 + i * 26;
        g.text(L.suffix + "  " + L.depth.toFixed(2), 6, y, { color: L.depth === 1 ? C.accent : C.ink });
        g.label(L.parallax || L.shape, 6, y + 10, C.ink2);
        if (L.note) g.label(L.note, 6, y + 20, L.note.indexOf("nothing") >= 0 ? C.enemy : C.ink3);
      });
      if (P.tpl === "rocky_planet") g.label("rings " + S.rings.map((r) => Math.round(r.t)).join(" / ") + " wu, craters " + S.craters.length, 6, 208, C.ink3);
    },
    readout(S, P) { return P.tpl + "\ncamera " + Math.round(S.cam.x / ZNL_T[P.tpl].scale) + ", " + Math.round(S.cam.y / ZNL_T[P.tpl].scale) + " wu"; },
  },
});
