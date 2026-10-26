// Toy helpers. A 2400 wu toroidal strip seen through the game's 640 wu viewport.
var PLX_W = 2400, PLX_VIEW = 640, PLX_SC = 384 / 640;
var PLX_Z = [
  { name: "A", origin: 2250, r: 700, band: [36, 92] },
  { name: "B", origin: 300, r: 450, band: [96, 150], depth: 0.6 },
  { name: "C", origin: 1200, r: 1200, band: [154, 208], depth: 1.0 },
];
function plxInit(S, P, kit) {
  S.cam = 1900; S.t = 0; S.drag = null; S.user = false; S.snap = [0, 0, 0]; S.prev = null; S.items = [];
  for (const z of PLX_Z) { const it = []; for (let i = 0; i < 26; i++) it.push({ u: kit.rand.range(-1, 1), v: kit.rand.range(0.15, 0.85), s: kit.rand.range(2, 5) }); S.items.push(it); }
}
function plxDepth(z, P) { return z.name === "A" ? P.depthA : z.depth; }
function plxWrap(d) { return d - Math.round(d / PLX_W) * PLX_W; }
// screen x (px) of a zone's origin for camera position cam, in each mode
function plxOriginX(z, d, cam, mode) {
  if (mode === "zu") return 192 + plxWrap(z.origin - cam) * d * PLX_SC;
  return 192 + (z.origin * d - cam * d) * PLX_SC; // naive: wrapped camera times depth
}

Wiki.construct({
  id: "parallax-zones",
  name: "Parallax zones",
  family: "generation",
  origin: "shmuprouge",
  status: "partial",
  statusNote: "Background layers (depth below 1) are built and drawn from zone templates. Overlays (depth above 1) are spec only: the code would accept one, but draws every parallax zone in one pass before the terrain, so it would land behind the gameplay layer.",
  summary: "A parallax layer is just a zone at a depth other than 1.0, and each one keeps its own coordinate space, zone units = (world units minus the zone's origin) times depth, so a wrap-around world never makes layers jump at the seam.",
  tags: ["rendering", "parallax", "toroidal", "zones", "foreshadowing"],

  intent:
    "<p>Space needs depth to feel big, and a level needs a way to show what is coming. Background zones do both: distant asteroid fields and planet glows scroll slower than the terrain, and because a background zone can be larger than the gameplay zone it belongs to, the player glimpses the next biome before arriving.</p>" +
    "<p>The construct is what makes this work in a toroidal arena. The obvious parallax, camera position times depth, breaks the moment the camera wraps; per-zone coordinates move the break to a place nobody can see.</p>",

  how:
    "<h3>Depth is a zone property</h3>" +
    "<p>There is no separate parallax system in the data. A zone template's layer has a <code>depth</code>; <code>&lt; 1</code> is background, <code>1.0</code> is the gameplay layer (the only one with physics), <code>&gt; 1</code> is overlay. Depth must be &gt; 0 (asserted at load). <code>ParallaxSystem.init</code> builds a <code>ParallaxZone</code> for every layer whose depth is not 1.0 and that names a <code>parallax</code> preset in its biome, then sorts them by depth.</p>" +
    "<h3>Zone units</h3>" +
    "<p><code>zu = (wu &minus; origin) &times; depth</code>, with the origin at the zone's centre. Each frame <code>ParallaxZone:draw</code> takes the wrapped delta from the zone origin to the camera (<code>bounds:wrapDelta</code>, always the short way round), multiplies it by depth, and draws. Near the seam it draws up to three more passes for the wrap neighbours, when the zone is within its radius plus <code>HALF_VIEW_X + CHUNK_SIZE / depth</code> of them. Chunks are 256 ZU, so a chunk at depth 0.35 covers about 731 wu of camera travel; chunks not seen this frame are evicted, and content is regenerated from the seed rather than stored.</p>" +
    "<h3>Why the naive way snaps</h3>" +
    "<p>With <code>screen = layerPos &minus; camX &times; depth</code> and <code>camX</code> wrapped into <code>[0, W)</code>, crossing the seam changes <code>camX</code> by W and every layer jumps by <code>W &times; depth</code>, a different amount per layer. With zone units, each zone's discontinuity sits where its wrapped delta flips sign: half a world away from that zone, where none of it is on screen.</p>" +
    "<h3>Shipped layers</h3>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>Template</th><th>Layer</th><th>Depth</th><th>Content</th></tr></thead><tbody>" +
    "<tr><td>asteroid_belt</td><td>bg1</td><td>0.35</td><td>mesh sprites 64&ndash;192, density 0.00006</td></tr>" +
    "<tr><td>asteroid_belt</td><td>bg2</td><td>0.65</td><td>mesh sprites 256&ndash;512, density 0.000008</td></tr>" +
    "<tr><td>rocky_planet</td><td>bg1 / bg2 / core</td><td>0.3 / 0.6 / 0.99</td><td>rings, glow, black core fill</td></tr>" +
    "</tbody></table></div>" +
    "<p>Content types: <code>mesh</code> (an [[asteroid-mesh]] per layer), <code>scatter_circles</code>, <code>scatter_sprites</code>, and planet <code>ring</code>, <code>glow</code>, <code>fill</code>.</p>",

  knobs: [
    ["Layer depth", "0.3-0.99 in shipped data", "Scroll speed relative to the camera", "zones/*.json layers[].depth"],
    ["Chunk", "256 ZU", "Streaming unit; covers 256 / depth wu", "Constants.CHUNK_SIZE_WU"],
    ["Preset", "e.g. medium_field", "Which biome parallax preset fills the layer", "layers[].parallax, biome.parallax.*"],
    ["Element density / size", "0.00006, [64, 192]", "How much art per ZU and how big", "biome.parallax.*.elements[]"],
  ],

  related: [
    { id: "zone-layers", how: "Parallax layers are the depth-below-1 layers of a zone template." },
    { id: "asteroid-mesh", how: "Each background field is its own mesh in its own ZU space." },
    { id: "chunk-streaming", how: "Same 256-unit chunks, measured in ZU per layer." },
    { id: "world-gen-stack", how: "Visual-only zones sit beside L5 without touching the simulation." },
  ],

  questions: [
    "Overlays: should depth above 1 be drawn after terrain and entities, and may it ever carry gameplay (debris that hits)?",
    "Same-depth zones must not overlap, with no runtime check. Should the zone editor enforce it?",
    "Is foreshadowing authored per level (zone sizes chosen by hand) or derived (every background extends N wu past its gameplay zone)?",
  ],

  sparks: [
    "Depth as a gameplay axis: dive from a background layer to depth 1.0 and the scenery becomes the level; the 0.99 planet core already sits one step away.",
    "Foreshadow enemies: draw the next wave flying on a background layer before it arrives.",
    "Borrow the ZU trick for any wrap-around world with parallax: a looping racetrack, a cylinder planet, a scrolling ring.",
    "Let depth change in play: a zone that rises from 0.3 toward 1.0 over a run is an approaching body.",
  ],

  terms: [
    { term: "Depth", def: "A zone layer's scroll factor; 1.0 is gameplay.", code: "layer.depth, ParallaxZone.depth" },
    { term: "Zone units (ZU)", def: "(wu - zone origin) x depth: each parallax zone's own coordinates.", code: "ParallaxZone, parallax_chunk_gen.lua" },
    { term: "Gameplay layer", def: "The depth-1.0 layer; the only one with physics.", code: "zone.depth == 1.0" },
    { term: "Background / overlay", def: "Layers below or above depth 1.", code: "Parallax_Zones.md" },
    { term: "Foreshadowing", def: "A background zone extending past its gameplay zone so the next biome is seen early.", code: "(authoring rule)" },
  ],

  sources: [
    "shmuprouge:docs/world/Parallax_Zones.md",
    "shmuprouge:game/world/parallax/parallax_zone.lua",
    "shmuprouge:game/world/parallax/parallax_system.lua",
    "shmuprouge:game/world/parallax/parallax_chunk_gen.lua",
    "shmuprouge:game/render_pipeline.lua",
    "shmuprouge:shared/data/world/zones/asteroid_belt.json",
  ],

  toy: {
    title: "Wrap without snap",
    hint: "watch the seam, or drag to scrub the camera",
    caption: "A 2400 wu world (the game's is 12,800) through the 640 wu viewport. Each band is one zone; the outline is its extent. Naive mode uses wrapped camera x times depth, as Parallax_Zones.md warns against. The strip at the top marks the seam (red) and each zone's own flip point (grey).",
    w: 384, h: 216,
    controls: [
      { type: "select", key: "mode", label: "mode", value: "zu", options: [["zu", "zone units (built)"], ["naive", "naive cam x depth"]] },
      { type: "range", key: "depthA", label: "depth of A", min: 0.1, max: 0.9, step: 0.05, value: 0.35 },
      { type: "toggle", key: "chunks", label: "chunk lines", value: false },
    ],
    init(S, P, kit) { plxInit(S, P, kit); },
    pointer(e, S) {
      if (e.type === "down") { S.drag = { x: e.x, cam: S.cam }; S.user = true; }
      else if (e.type === "move" && S.drag && e.down) S.cam = ((S.drag.cam - (e.x - S.drag.x) / PLX_SC) % PLX_W + PLX_W) % PLX_W;
      else if (e.type === "up") { S.drag = null; S.user = false; }
    },
    update(S, P, dt) {
      S.t += dt;
      if (!S.user) S.cam = (S.cam + 260 * dt) % PLX_W;
      const xs = PLX_Z.map((z) => plxOriginX(z, plxDepth(z, P), S.cam, P.mode));
      // in ZU mode the origin also flips, but half a world away and covered by the wrap copy
      if (S.prev && P.mode === "naive" && !S.drag) xs.forEach((x, i) => { if (Math.abs(x - S.prev[i]) > 40 && plxDepth(PLX_Z[i], P) < 1) S.snap[i] = 0.8; });
      S.prev = xs;
      S.snap = S.snap.map((s) => Math.max(0, s - dt));
    },
    draw(g, S, P) {
      const C = g.C; g.clear();
      // world strip: seam, camera window, per-zone flip points
      const sx = (x) => 120 + (x / PLX_W) * 256;
      g.rect(120, 8, 256, 8, C.rule, 1);
      g.tone(sx(S.cam - PLX_VIEW / 2), 8, (PLX_VIEW / PLX_W) * 256, 8, 0.4, C.accent);
      if (S.cam - PLX_VIEW / 2 < 0) g.tone(sx(S.cam - PLX_VIEW / 2 + PLX_W), 8, (PLX_VIEW / PLX_W) * 256, 8, 0.4, C.accent);
      g.line(120, 4, 120, 20, C.enemy, 2); g.line(376, 4, 376, 20, C.enemy, 2);
      for (const z of PLX_Z) { const f = ((z.origin + PLX_W / 2) % PLX_W); g.line(sx(f), 6, sx(f), 18, C.ink3, 1); g.label(z.name, sx(z.origin) - 2, 28, C.ink2); }
      PLX_Z.forEach((z, i) => {
        const d = plxDepth(z, P), [y0, y1] = z.band, ox = plxOriginX(z, d, S.cam, P.mode);
        g.rect(0, y0, 384, y1 - y0, C.rule, 1);
        const copies = P.mode === "zu" ? [0, -PLX_W * d, PLX_W * d] : [0, -PLX_W, PLX_W];
        g.ctx.save(); g.ctx.beginPath(); g.ctx.rect(0, y0, 384, y1 - y0); g.ctx.clip();
        for (const c of copies) {
          const cx = ox + c * PLX_SC, half = z.r * d * PLX_SC;
          g.tone(cx - half, y0 + 2, half * 2, y1 - y0 - 4, 0.08, i === 2 ? C.accent : C.sky);
          g.line(cx - half, y0 + 2, cx - half, y1 - 2, C.ink3); g.line(cx + half, y0 + 2, cx + half, y1 - 2, C.ink3);
          for (const it of S.items[i]) g.circle(cx + it.u * half, y0 + it.v * (y1 - y0), it.s * (0.5 + d * 0.6), i === 2 ? C.ink : C.ink2);
          if (P.chunks) for (let k = -8; k <= 8; k++) { const lx = cx + k * 256 * PLX_SC; if (Math.abs(k * 256) < z.r * d) g.line(lx, y0, lx, y1, C.gold, 1, [2, 3]); }
        }
        g.ctx.restore();
        g.text(z.name + "  depth " + d.toFixed(2), 4, y0 + 10, { color: C.ink });
        if (P.chunks) g.label("chunk = " + Math.round(256 / d) + " wu", 4, y0 + 20, C.gold);
        if (S.snap[i] > 0) g.text("SNAP", 380, y0 + 12, { color: C.enemy, align: "right" });
      });
    },
    readout(S, P) { return "camera x " + Math.round(S.cam) + " / " + PLX_W + " wu\n" + (P.mode === "zu" ? "zone units" : "naive"); },
  },
});
