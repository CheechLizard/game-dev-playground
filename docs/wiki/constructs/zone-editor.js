// Toy helpers. Arena: 12,800 wu square drawn 200 px wide (1 px = 64 wu).
var ZED_W = 12800, ZED_S = 200 / 12800, ZED_OX = 178, ZED_OY = 8;
function zedInit(S) {
  S.z = [
    { id: "alpha_prime", x: 128, y: 128, ri: 0, ro: 1000 },
    { id: "aqua_prime", x: 2500, y: 128, ri: 0, ro: 1000 },
    { id: "inner_belt", x: 6400, y: 6400, ri: 1500, ro: 3000 },
    { id: "void_space", x: 6400, y: 6400, ri: 4500, ro: 6000 },
  ];
  S.sel = 0; S.drag = null; S.made = 0;
}
function zedDelta(a, b, wrap) {
  let dx = b.x - a.x, dy = b.y - a.y;
  if (wrap) { dx -= Math.round(dx / ZED_W) * ZED_W; dy -= Math.round(dy / ZED_W) * ZED_W; }
  return Math.hypot(dx, dy);
}
// Gap between two annuli (negative = overlap). A circle is an annulus with ri = 0.
function zedGap(a, b, wrap) {
  const d = zedDelta(a, b, wrap);
  if (d + a.ro <= b.ri) return b.ri - (d + a.ro);
  if (d + b.ro <= a.ri) return a.ri - (d + b.ro);
  return d - a.ro - b.ro;
}
function zedCheck(S, P) {
  const warn = [];
  for (const z of S.z) if (!P.wrap && (z.x - z.ro < 0 || z.y - z.ro < 0 || z.x + z.ro > ZED_W || z.y + z.ro > ZED_W)) warn.push([z.id, "extends beyond arena"]);
  for (let i = 0; i < S.z.length; i++) for (let j = i + 1; j < S.z.length; j++) if (zedGap(S.z[i], S.z[j], P.wrap) < 0) warn.push([S.z[i].id, "overlaps " + S.z[j].id]);
  return warn;
}
function zedHit(S, x, y) {
  for (let i = S.z.length - 1; i >= 0; i--) {
    const z = S.z[i], d = Math.hypot(x - z.x, y - z.y);
    if (d <= z.ro && d >= z.ri) return i;
  }
  return -1;
}

Wiki.construct({
  id: "zone-editor",
  name: "Zone editor",
  origin: "shmuprouge",
  status: "spec",
  statusNote: "Spec only. The React editor app exists, with planet, graph and material views, but has no zone view. The spec's export format is also older than the template-and-layers JSON the game now loads.",
  summary: "A low-fidelity 2D canvas for laying out a level's zones (draw circles and rings, assign biomes, read the distances between them) with validation that catches overlaps and out-of-bounds before the JSON is exported.",
  tags: ["tooling", "authoring", "validation", "layout"],

  intent:
    "<p>Hand-editing <code>alpha_arena.json</code> means placing planets by typing centres and radii and imagining the result. The zone editor replaces that with a canvas that shows the arena to scale, the shapes as they will be, and the gaps between them as numbers. Its principle is &quot;validate early&quot;: an overlap or a zone hanging off the edge should be visible while it is being dragged, not after a playtest.</p>" +
    "<p>For a designer, the distances are the real content. How far apart two planets sit is how long the player flies through open space between them, and that is a pacing decision.</p>",

  how:
    "<h3>Tools and canvas (spec)</h3>" +
    "<p>Select, Circle, Ring, Rectangle, Move, Resize, Delete, Pan, Zoom; boolean union, subtract and intersect are planned. Coordinates in wu, origin top-left, arena size from <code>widthChunks &times; heightChunks</code>, with a chunk-grid overlay. Distance arrows join nearest boundaries and are labelled in wu.</p>" +
    "<h3>Properties</h3>" +
    "<p>The panel shows biome-specific parameters: for <code>rocky_planet</code>, <code>planetRadius</code>, <code>attractorRadius</code>, <code>attractorStrength</code>, <code>orbitStrength</code>, <code>npcs</code>, <code>storyTrigger</code>; for asteroid fields, <code>density</code> (0&ndash;1) and <code>enemies</code>. Several of those keys are read by nothing in the game today ([[zone-layers]]).</p>" +
    "<h3>Validation (spec)</h3>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>Rule</th><th>Example message</th></tr></thead><tbody>" +
    "<tr><td>Overlapping zones</td><td>&quot;inner_belt overlaps with alpha_prime&quot;</td></tr>" +
    "<tr><td>Zone outside arena</td><td>&quot;void_space extends beyond arena bounds&quot;</td></tr>" +
    "<tr><td>Missing fields, invalid values</td><td>&mdash;</td></tr>" +
    "</tbody></table></div>" +
    "<p>Run against the shipped level, the out-of-bounds rule fails twice: <code>alpha_prime</code> at (128, 128) and <code>aqua_prime</code> at (2500, 128) both have 1000 wu shapes, so both hang 872 wu over the top edge (and <code>alpha_prime</code> over the left too). The arena is toroidal, so in the game the planets simply wrap. A validator for this world has to measure across the seam, and the spec does not say so. Overlap must also treat rings as annuli: <code>inner_belt</code> and <code>void_space</code> share a centre but do not overlap, because one sits in the other's hole.</p>" +
    "<h3>Later</h3>" +
    "<p>An L4 pattern importer: extract a PNG's palette, map colours to materials, export for WFC biome fill.</p>",

  knobs: [
    ["Arena size", "50 x 50 chunks (12,800 wu)", "Canvas extent", "levels/*.json size.widthChunks / heightChunks"],
    ["Chunk", "256 wu", "Grid overlay spacing", "Constants.CHUNK_SIZE_WU"],
    ["Shapes", "circle, ring (rectangle, booleans planned)", "What can be drawn", "layer.shape.type"],
  ],

  related: [
    { id: "zone-layers", how: "The files it would author: levels, zone templates, biomes." },
    { id: "planet-tilemap", how: "The sibling editor that is built: planet interiors on a tile grid." },
    { id: "schema-editor", how: "The playground's schema-driven editor, a model for generated property panels." },
    { id: "world-gen-stack", how: "It is the L5 authoring tool of the stack." },
  ],

  questions: [
    "Should validation be wrap-aware (the shipped level needs it), or should the toroidal arena be shown with a seam the designer must not cross?",
    "Which layers does it edit: only the depth-1.0 gameplay shapes, or every parallax layer of a template too?",
    "Biome registry: does the editor read the biomes folder, or a list it can validate names against?",
    "How are boolean shapes stored, and how granular is undo for a drag?",
  ],

  sparks: [
    "Distance arrows in seconds, not wu: label each gap with travel time at the ship's top speed, so layout is read as pacing.",
    "Overlay predicted combat pressure on the map, so empty space and danger are laid out together.",
    "Validation rules as design constraints: a minimum safe corridor between hazards, a maximum dead flight time.",
    "Let the player use it: a pre-run screen where the player arranges the system, and the gaps become the run's difficulty.",
  ],

  terms: [
    { term: "Zone canvas", def: "The scaled arena view zones are drawn on.", code: "Zone_Editor_Specification_v0_1.md" },
    { term: "Distance arrow", def: "A labelled line between the nearest boundaries of two zones.", code: "(spec)" },
    { term: "Validation warning", def: "An overlap, out-of-bounds or missing-field message shown before export.", code: "(spec)" },
    { term: "Biome parameters", def: "Per-biome properties shown for a selected zone.", code: "zones[].params" },
  ],

  sources: [
    "shmuprouge:docs/design/Zone_Editor_Specification_v0_1.md",
    "shmuprouge:shared/data/world/levels/alpha_arena.json",
    "shmuprouge:shared/data/world/zones/rocky_planet.json",
    "shmuprouge:shared/data/world/zones/sparse_asteroid_belt.json",
    "shmuprouge:editor/src/components/planet/PlanetCanvas.tsx",
  ],

  toy: {
    title: "Lay out the arena, check it as you go",
    hint: "drag a zone to move it; drag on empty space to draw a new one",
    caption: "Loaded with alpha_arena's depth-1.0 shapes; 1 px = 64 wu. Faint copies show where a zone wraps across the toroidal seam. Arrows show each zone's nearest gap. Turn on wrap-aware checks to see the shipped level pass.",
    w: 384, h: 216,
    controls: [
      { type: "toggle", key: "wrap", label: "wrap-aware checks (not in spec)", value: false },
      { type: "select", key: "tool", label: "draw", value: "circle", options: [["circle", "circle"], ["ring", "ring"]] },
      { type: "toggle", key: "grid", label: "chunk grid", value: false },
      { type: "button", label: "reload alpha_arena", press(S) { zedInit(S); } },
    ],
    init(S) { zedInit(S); },
    pointer(e, S, P) {
      const wx = (e.x - ZED_OX) / ZED_S, wy = (e.y - ZED_OY) / ZED_S;
      if (e.type === "down") {
        if (wx < 0 || wy < 0 || wx > ZED_W || wy > ZED_W) return;
        const h = zedHit(S, wx, wy);
        if (h >= 0) { S.sel = h; S.drag = { mode: "move", dx: wx - S.z[h].x, dy: wy - S.z[h].y }; }
        else { S.made++; S.z.push({ id: "zone_" + S.made, x: wx, y: wy, ri: 0, ro: 64, ring: P.tool === "ring" }); S.sel = S.z.length - 1; S.drag = { mode: "size" }; }
      } else if (e.type === "move" && S.drag && e.down) {
        const z = S.z[S.sel]; if (!z) return;
        if (S.drag.mode === "move") { z.x = Math.max(0, Math.min(ZED_W, wx - S.drag.dx)); z.y = Math.max(0, Math.min(ZED_W, wy - S.drag.dy)); }
        else { z.ro = Math.max(64, Math.hypot(wx - z.x, wy - z.y)); z.ri = z.ring ? z.ro * 0.5 : 0; }
      } else if (e.type === "up") S.drag = null;
    },
    update() {},
    draw(g, S, P) {
      const C = g.C; g.clear();
      const X = (x) => ZED_OX + x * ZED_S, Y = (y) => ZED_OY + y * ZED_S, side = ZED_W * ZED_S;
      if (P.grid) for (let k = 0; k <= 50; k += 5) { g.line(X(k * 256), Y(0), X(k * 256), Y(ZED_W), C.rule); g.line(X(0), Y(k * 256), X(ZED_W), Y(k * 256), C.rule); }
      const warn = zedCheck(S, P), bad = new Set(warn.map((w) => w[0]));
      g.ctx.save(); g.ctx.beginPath(); g.ctx.rect(ZED_OX, ZED_OY, side, side); g.ctx.clip();
      S.z.forEach((z, i) => {
        const col = bad.has(z.id) ? C.enemy : i === S.sel ? C.accent : C.ink2;
        for (const ox of [-ZED_W, 0, ZED_W]) for (const oy of [-ZED_W, 0, ZED_W]) {
          const ghost = ox || oy;
          if (ghost && (Math.abs(z.x + ox - ZED_W / 2) > ZED_W / 2 + z.ro || Math.abs(z.y + oy - ZED_W / 2) > ZED_W / 2 + z.ro)) continue;
          g.ctx.globalAlpha = ghost ? 0.35 : 1;
          if (z.ri > 0) { g.circle(X(z.x + ox), Y(z.y + oy), z.ro * ZED_S, col, 1); g.circle(X(z.x + ox), Y(z.y + oy), z.ri * ZED_S, col, 1); }
          else { g.toneCircle(X(z.x + ox), Y(z.y + oy), z.ro * ZED_S, 0.25, col); g.circle(X(z.x + ox), Y(z.y + oy), z.ro * ZED_S, col, 1); }
          g.ctx.globalAlpha = 1;
        }
      });
      g.ctx.restore();
      g.rect(ZED_OX, ZED_OY, side, side, C.ink3, 1);
      // nearest-gap arrows
      for (const a of S.z) {
        let best = null, bg = Infinity;
        for (const b of S.z) if (b !== a) { const gp = zedGap(a, b, P.wrap); if (gp >= 0 && gp < bg) { bg = gp; best = b; } }
        if (!best || best.ri > 0 && a.ri > 0) continue;
        const ang = Math.atan2(best.y - a.y, best.x - a.x), inner = best.ri > 0 && Math.hypot(best.x - a.x, best.y - a.y) + a.ro <= best.ri;
        const r1 = a.ro, sx = a.x + Math.cos(ang) * r1, sy = a.y + Math.sin(ang) * r1;
        const ex = inner ? sx + Math.cos(ang) * bg : best.x - Math.cos(ang) * best.ro, ey = inner ? sy + Math.sin(ang) * bg : best.y - Math.sin(ang) * best.ro;
        if (bg > 60) { g.arrow(X(sx), Y(sy), X(ex), Y(ey), C.gold, 1, 4); g.label(Math.round(bg) + "", (X(sx) + X(ex)) / 2 + 3, (Y(sy) + Y(ey)) / 2 - 2, C.gold); }
      }
      // validation panel
      g.text(warn.length ? warn.length + " WARNING" + (warn.length > 1 ? "S" : "") : "VALID", 6, 48, { color: warn.length ? C.enemy : C.accent });
      warn.slice(0, 6).forEach((w, k) => { g.label("! " + w[0], 6, 62 + k * 20, C.enemy); g.label(w[1], 14, 71 + k * 20, C.ink2); });
      const z = S.z[S.sel];
      if (z) {
        g.label("{ id: \"" + z.id + "\",", 6, 186, C.ink3);
        g.label("  center_wu: [" + Math.round(z.x) + ", " + Math.round(z.y) + "],", 6, 196, C.ink3);
        g.label(z.ri > 0 ? "  ring " + Math.round(z.ri) + "-" + Math.round(z.ro) + " }" : "  radius_wu: " + Math.round(z.ro) + " }", 6, 206, C.ink3);
      }
    },
    readout(S, P) { return "zones " + S.z.length + "  " + (P.wrap ? "wrap-aware" : "spec rules") + "\nselected " + (S.z[S.sel] ? S.z[S.sel].id : "-"); },
  },
});
