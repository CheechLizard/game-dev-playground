(function () {
  const TS = 24, Q = TS / 2, GW = 16, GH = 9;
  const BIT = { N: 1, NE: 2, E: 4, S: 8, SE: 16, SW: 32, W: 64, NW: 128 };
  // autotile_tables.lua: clamp diagonals, build the four quarter indices (NW<<3|NE<<2|SW<<1|SE), dedupe -> 47.
  function quarters(m) {
    const h = (b) => (m & b) > 0, n = h(BIT.N), e = h(BIT.E), s = h(BIT.S), w = h(BIT.W);
    const nw = h(BIT.NW) && n && w, ne = h(BIT.NE) && n && e, sw = h(BIT.SW) && s && w, se = h(BIT.SE) && s && e;
    return [(nw ? 8 : 0) + (n ? 4 : 0) + (w ? 2 : 0) + 1, (n ? 8 : 0) + (ne ? 4 : 0) + 2 + (e ? 1 : 0),
      (w ? 8 : 0) + 4 + (sw ? 2 : 0) + (s ? 1 : 0), 8 + (e ? 4 : 0) + (s ? 2 : 0) + (se ? 1 : 0)];
  }
  const TABLE = [], KEYS = new Map();
  for (let m = 0; m < 256; m++) {
    const k = quarters(m).join(",");
    if (!KEYS.has(k)) KEYS.set(k, KEYS.size);
    TABLE[m] = KEYS.get(k);
  }
  // A marching-squares quarter: walk the corners clockwise, cutting at edge midpoints. Ambiguous 6 and 9 stay connected.
  function quarterPoly(qi, x, y) {
    const b = [qi & 8, qi & 4, qi & 1, qi & 2].map((v) => v > 0); // NW, NE, SE, SW (clockwise)
    const P = [[x, y], [x + Q, y], [x + Q, y + Q], [x, y + Q]], pts = [], mids = [];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      if (b[i]) pts.push(P[i]);
      if (b[i] !== b[j]) { const m = [(P[i][0] + P[j][0]) / 2, (P[i][1] + P[j][1]) / 2]; pts.push(m); mids.push(pts.length - 1); }
    }
    return { pts, mids };
  }
  function mask(S, x, y) {
    const v = S.g[y * GW + x], at = (i, j) => i >= 0 && j >= 0 && i < GW && j < GH && S.g[j * GW + i] === v;
    return (at(x, y - 1) ? 1 : 0) | (at(x + 1, y - 1) ? 2 : 0) | (at(x + 1, y) ? 4 : 0) | (at(x, y + 1) ? 8 : 0) |
      (at(x + 1, y + 1) ? 16 : 0) | (at(x - 1, y + 1) ? 32 : 0) | (at(x - 1, y) ? 64 : 0) | (at(x - 1, y - 1) ? 128 : 0);
  }

  Wiki.construct({
    id: "autotiling",
    name: "Blob autotiling and the in-game tile editor",
    origin: "shmuprouge",
    status: "built",
    statusNote: "Single-LOD autotiling of 32-WU tiles is built; the multi-LOD design is superseded. The in-game editor has pencil, eraser, planet creation and save, but no line, rectangle, ellipse, bucket or undo.",
    summary: "An 8-neighbour bitmask with corner clamping picks one of 47 blob tiles for each 32-WU block of hardened terrain, assembled from four quarter-tiles of a small artist sheet, and an in-game editor paints those tiles straight into the live sand.",
    tags: ["autotile", "art pipeline", "editor", "47-blob"],

    intent:
      "<p>Destructible terrain changes shape every second, so hand-placed edge art cannot keep up. With a blob autotile an artist draws one small sheet per material and every lump of rock, however it was carved, gets correct edges, outer corners, inner corners and fills, recomputed as it breaks.</p>" +
      "<p>The in-game editor lets a designer paint those tiles inside the running game, in the real renderer and physics, then unpause and blow the set piece up straight away.</p>",

    how:
      "<h3>The bitmask</h3>" +
      "<p>Each tile looks at its eight neighbours: N 1, NE 2, E 4, S 8, SE 16, SW 32, W 64, NW 128. A diagonal counts only if both cardinals beside it are set (corner clamping), which folds the 256 masks into 47 distinct tiles. A 48th, all-outside tile is kept for fringe painting.</p>" +
      "<h3>Quarter-tiles</h3>" +
      "<p>Tiles are not drawn whole. Each is assembled from four quarter-tiles, and each quarter is one of 16 marching-squares shapes indexed <code>NW&lt;&lt;3 | NE&lt;&lt;2 | SW&lt;&lt;1 | SE</code> from the four tiles that meet at its corner (the tile itself is always one of them). The two ambiguous diagonal cases, 6 and 9, are always drawn connected through the centre. The artist's sheet is a 5×5 grid of quarters: rows 0–2 hold the 15 inside shapes, rows 3–4 an outside tile as a 2×2 block (<code>SHEET_POSITIONS</code>, <code>OUTSIDE_POSITIONS</code>).</p>" +
      "<h3>The pass</h3>" +
      "<p><code>AutotilePass</code> only handles quads of level 5 (<code>AUTOTILE_MIN_LEVEL = MAX_RENDER_LEVEL = 5</code>, 32-WU tiles) from the [[destructible-terrain|quad map]]. For each tile position in the buffer it searches down from level 8 to level 5 for a covering quad, takes its material, computes the mask and draws the atlas quarters into a screen-space tile buffer. The buffer wins over material texture and [[material-fx|interior darkening]] in the display shader. It is skipped when the camera origin and every chunk's quad-map generation are unchanged. Different materials count as empty to each other: there is no transition art between materials.</p>" +
      "<h3>What was superseded</h3>" +
      "<p><code>Autotile_System_Specification_v0_1.md</code> built 47 tiles from 16 sources with majority sampling of the terrain-properties texture; the code looks quads up directly. <code>Multi_LOD_Autotile_Specification_v0_1.md</code> drew seven LODs from 4 to 256 WU in painter's order, so older, larger stable masses would show richer \"rings of stability\"; v0.5 locked it to one LOD, though the level loop is still in place. <code>Tile_Atlas_Pipeline.md</code>'s per-level patterns and hash-picked variants were dropped.</p>" +
      "<h3>The in-game editor and Magrathea</h3>" +
      "<p>The IGE is a context in the game's router: it pauses the sim, frees the camera and paints 32-WU tiles into the active zone. Only two tools exist, pencil (<code>b</code>) and eraser (<code>e</code>). <code>TileWriter</code> converts zone-relative (col, row) to world space, allocates the chunk, splits any larger quad down to level 5, writes the level-5 quad and fills all 32×32 cells with random variants of the material, so the art is real sand. Tiles are saved as <code>{col, row, material}</code> relative to the zone centre and replayed at load. <b>Magrathea</b> builds a whole planet in one dialog: radius 100 to 2000 in steps of 100 and a biome, placed by scanning the world in 256-WU steps for a free spot with a 512-WU buffer and edge margin, then registered as a new zone. The spec's line, rectangle, ellipse, bucket, undo history and menu bar are not built, and the documented save folder <code>shared/data/world/planets/</code> is empty.</p>",

    knobs: [
      ["Tile size", "32 WU", "Size of one autotile", "TILE_SIZE_WU"],
      ["Autotile level", "5 only", "Quad level that gets tile art", "AUTOTILE_MIN_LEVEL, MAX_RENDER_LEVEL"],
      ["Quarter size", "32 px in the sheet", "Art resolution of a quarter", "AutotileTables.QUARTER_SIZE"],
      ["Atlases", "per material", "Which materials have tile art", "autotile_atlas_cache.lua"],
      ["Planet radius", "100–2000, step 100", "Magrathea dialog range", "RADIUS_MIN, RADIUS_MAX, RADIUS_STEP"],
      ["Planet placement", "256 step, 512 buffer", "Where a new planet may go", "PLACEMENT_STEP, PLACEMENT_BUFFER, EDGE_MARGIN"],
    ],

    related: [
      { id: "destructible-terrain", how: "Supplies the level-5 quads; tiles are written as quads." },
      { id: "planet-tilemap", how: "The editor-only planet tile map that came before the IGE." },
      { id: "zone-editor", how: "The planned L5 authoring tool the IGE partly stands in for." },
      { id: "material-fx", how: "Tile art overrides texture and darkening." },
    ],

    questions: [
      "Is transition art between materials worth the sheet count, or is the hard seam part of the look?",
      "Would multi-LOD \"rings of stability\" earn their art cost as a readout of how old ground is?",
      "Should re-hardened ground get its tile art back, or is losing it the visible cost of destruction?",
    ],

    sparks: [
      "Rings of stability as a diegetic timer: rich tiles mean old, safe ground.",
      "Inner-corner tiles as weak points that crack first.",
      "A player-facing builder: the same TileWriter places 32-WU blocks of real sand as a construction verb.",
      "Planet roulette: Magrathea as a run-start generator.",
    ],

    terms: [
      { term: "Blob autotile", def: "47-case tile choice from eight neighbours with corner clamping.", code: "AutotileTables.bitmaskToAtlas" },
      { term: "Corner clamping", def: "A diagonal neighbour counts only if both adjacent cardinals do.", code: "effNW = NW and N and W" },
      { term: "Quarter-tile", def: "One of 16 marching-squares shapes; four make a tile.", code: "computeQuarterIndices" },
      { term: "Tile composite buffer", def: "Screen-space layer the autotile pass draws into.", code: "TileCompositeBuffer" },
      { term: "IGE", def: "The in-game tile editor context.", code: "ige/" },
      { term: "Magrathea", def: "The one-dialog planet builder inside the IGE.", code: "ige/magrathea.lua" },
    ],

    sources: [
      "shmuprouge:engine/rendering/autotile_tables.lua",
      "shmuprouge:engine/rendering/autotile_pass.lua",
      "shmuprouge:ige/tile_writer.lua",
      "shmuprouge:ige/tools/pencil.lua",
      "shmuprouge:ige/magrathea.lua",
      "shmuprouge:ige/tile_map_loader.lua",
      "shmuprouge:docs/engine/rendering/autotile-schema.md",
      "shmuprouge:docs/engine/rendering/Multi_LOD_Autotile_Specification_v0_1.md",
      "shmuprouge:docs/editor/In_Game_Tile_Editor_Specification_v0_1.md",
    ],

    toy: {
      title: "Paint and watch the edges",
      hint: "click or drag to paint tiles; switch material to see seams",
      caption: "The 47-entry table is built at load exactly as autotile_tables.lua builds it. Each quarter is a procedurally drawn marching-squares shape in place of the artist's sheet; edges are outlined.",
      w: 384, h: 216, static: true,
      controls: [
        { type: "select", key: "mat", label: "paint", value: "1", options: [["1", "rock"], ["2", "ice"], ["0", "erase"]] },
        { type: "toggle", key: "nums", label: "tile index", value: false },
        { type: "toggle", key: "quarters", label: "quarter grid", value: false },
      ],
      init(S) {
        S.g = new Uint8Array(GW * GH);
        const blob = [[3, 2, 5, 4], [9, 4, 4, 3], [10, 1, 2, 2], [2, 6, 2, 2]];
        for (const [x, y, w, h] of blob) for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) S.g[j * GW + i] = 1;
        S.g[3 * GW + 5] = 0; S.g[2 * GW + 3] = 0;
        for (let i = 12; i < 15; i++) S.g[6 * GW + i] = 2;
      },
      update() {},
      pointer(e, S, P) {
        const x = Math.floor(e.x / TS), y = Math.floor(e.y / TS);
        if (x < 0 || y < 0 || x >= GW || y >= GH) return;
        if (e.type === "down") S.paint = S.g[y * GW + x] === Number(P.mat) ? 0 : Number(P.mat);
        if (e.down && S.paint != null) S.g[y * GW + x] = S.paint;
        if (e.type === "up") S.paint = null;
      },
      draw(g, S, P) {
        const C = g.C, fill = [null, C.orange, C.sky];
        g.clear();
        for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) g.rect(x * TS + TS / 2, y * TS + TS / 2, 1, 1, C.rule);
        S.used = new Set();
        for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
          const v = S.g[y * GW + x]; if (!v) continue;
          const m = mask(S, x, y), qs = quarters(m), ox = x * TS, oy = y * TS;
          S.used.add(TABLE[m]);
          [[0, 0], [Q, 0], [0, Q], [Q, Q]].forEach(([dx, dy], k) => {
            const { pts, mids } = quarterPoly(qs[k], ox + dx, oy + dy);
            g.poly(pts, fill[v]);
            for (let i = 0; i < pts.length; i++) {
              const j = (i + 1) % pts.length;
              if (mids.includes(i) && mids.includes(j)) g.line(pts[i][0], pts[i][1], pts[j][0], pts[j][1], C.ink, 1.5);
            }
            if (P.quarters) g.rect(ox + dx, oy + dy, Q, Q, C.rule, 0.5);
          });
          if (P.nums) g.text(TABLE[m], ox + TS / 2, oy + TS / 2 + 3, { color: C.bg, align: "center" });
        }
      },
      readout(S) { return "distinct tiles in use " + (S.used ? S.used.size : 0) + " of 47\nmasks fold 256 to " + KEYS.size; },
    },
  });
})();
