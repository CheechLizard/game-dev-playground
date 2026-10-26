// Toy helpers. Slot and orientation rules are ports of the editor's TypeScript.
var PTM_T = 32, PTM_CX = 250, PTM_CY = 110;
var PTM_G = { N: [0, 1], E: [-1, 0], S: [0, -1], W: [1, 0], NE: [-1, 1], SE: [-1, -1], SW: [1, -1], NW: [1, 1] };
function ptmOrient(col, row) {
  const cx = (col + 0.5) * PTM_T, cy = (row + 0.5) * PTM_T, eps = PTM_T * 0.01;
  if (Math.abs(cy - cx) < eps || Math.abs(cy + cx) < eps) {
    if (cx > 0 && cy < 0) return "NE"; if (cx > 0 && cy > 0) return "SE"; if (cx < 0 && cy > 0) return "SW"; if (cx < 0 && cy < 0) return "NW";
  }
  const ax = Math.abs(cx), ay = Math.abs(cy);
  if (cy < 0 && ay > ax) return "N"; if (cx > 0 && ax > ay) return "E"; if (cy > 0 && ay > ax) return "S"; return "W";
}
function ptmSlots(S, r) {
  const n = Math.ceil(r / PTM_T), r2 = r * r; S.valid = new Map();
  for (let c = -n; c <= n; c++) for (let w = -n; w <= n; w++) {
    const x0 = c * PTM_T, y0 = w * PTM_T, x1 = x0 + PTM_T, y1 = y0 + PTM_T;
    if (x0 * x0 + y0 * y0 <= r2 && x1 * x1 + y0 * y0 <= r2 && x0 * x0 + y1 * y1 <= r2 && x1 * x1 + y1 * y1 <= r2) S.valid.set(c + "," + w, { c, w, o: ptmOrient(c, w) });
  }
  S.px = Math.max(3, Math.min(10, Math.floor(200 / (2 * n))));
  S.r = r;
}
function ptmInit(S, P) {
  S.paint = new Set(); S.balls = []; S.dropT = 0; S.hover = null; S.down = false;
  ptmSlots(S, P.radius);
  // a seeded floor: one ring of tiles at about 55% of the radius, with doorways
  const rr = P.radius * 0.55 / PTM_T;
  for (const s of S.valid.values()) {
    const d = Math.hypot(s.c + 0.5, s.w + 0.5), a = Math.atan2(s.w + 0.5, s.c + 0.5);
    if (Math.abs(d - rr) < 0.7 && Math.sin(a * 6) > -0.6) S.paint.add(s.c + "," + s.w);
  }
}
function ptmAt(S, x, y) { return [Math.floor((x - PTM_CX) / S.px), Math.floor((y - PTM_CY) / S.px)]; }

Wiki.construct({
  id: "planet-tilemap",
  name: "Planet tile map",
  family: "generation",
  origin: "shmuprouge",
  status: "partial",
  statusNote: "The editor MVP is built (planet list, radius and core config, slot grid, wedge lines, corner highlights, pen, eraser, rectangle and line tools, stroke undo). Force fields, entities, autotile art and the whole game side are not: <code>shared/data/world/planets/</code> is empty and no Lua reads a planet map.",
  summary: "Planet interiors authored as sparse tiles on a circular grid split into four 45° wedges; a tile's wedge fixes its local gravity toward the core, so each quarter of the planet is a platformer room with its own floor.",
  tags: ["authoring", "editor", "gravity", "tiles", "planets"],

  intent:
    "<p>Procedural ring fills make a planet's crust; they cannot make a trap room, a corridor or a puzzle around a generator. The planet tile map is where a designer hand-builds the inside of a planet at volume, with as little configuration as possible: pick a radius and paint.</p>" +
    "<p>The four wedges answer the question every round-world platformer has to answer, &quot;which way is down here?&quot;, with a rule simple enough to see on the canvas. Above the diagonals, down is down; right of them, down is left; and so on round the planet, always toward the core.</p>",

  how:
    "<h3>Valid slots</h3>" +
    "<p>A 32 wu slot (<code>TILE_SIZE</code>, matching <code>TILE_SIZE_WU</code>) is valid only if all four of its corners lie within the radius (<code>computeValidSlots</code>). Slots are recomputed from the radius and never stored; only painted tiles are saved, as <code>{col, row, material, layer}</code>. The ring between the outermost whole slots and the circle is the cellular backfill zone, to be filled procedurally.</p>" +
    "<h3>Orientation and gravity</h3>" +
    "<p><code>computeTileOrientation(col, row)</code> takes the slot centre <code>((col + 0.5) &times; 32, (row + 0.5) &times; 32)</code>. If it lies on a diagonal (within 1% of a tile) it is a corner type by quadrant (NE, SE, SW, NW); otherwise N if above both diagonals, E if right of both, S if below, else W.</p>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>Wedge</th><th>N</th><th>E</th><th>S</th><th>W</th><th>NE</th><th>SE</th><th>SW</th><th>NW</th></tr></thead><tbody>" +
    "<tr><td>Gravity</td><td>down</td><td>left</td><td>up</td><td>right</td><td>down-left</td><td>up-left</td><td>up-right</td><td>down-right</td></tr>" +
    "</tbody></table></div>" +
    "<p>The canvas draws the two diagonals in red and borders corner slots in yellow.</p>" +
    "<h3>Layers (spec)</h3>" +
    "<p>Terrain (collision), Force Fields (colour regions that protect everything under them while the matching generator lives; overlapping colours need both generators destroyed; about 6 colours suggested), Entities (generator, NPC anchored to its wedge's floor, door, treasure, spawn point), Decorative. A destroyed tile releases its 32&times;32 sand cells. Core types: <code>void</code>, <code>deadly</code>, <code>boss</code>, <code>puzzle</code>, <code>secret</code>.</p>" +
    "<h3>Where code and spec differ</h3>" +
    "<p>The spec has even and odd grid alignment, chosen by the radius: odd puts a tile on the centre. The editor always places a tile corner at the centre (slot <code>col</code> spans <code>col &times; 32</code> to <code>(col + 1) &times; 32</code>), so every grid is even and corner tiles are exactly the two diagonal lines of slots. The spec gives radius in px; the editor's field is wu (32&ndash;4000, step 32, default 640). <code>forceFields</code> and <code>entities</code> are typed <code>unknown[]</code>.</p>",

  knobs: [
    ["Radius", "640 wu (32-4000, step 32)", "Planet size; sets the slot set", "PlanetData.radius, usePlanetStore"],
    ["Tile size", "32 wu", "Slot size; must match the game", "TILE_SIZE / TILE_SIZE_WU"],
    ["Quadrants", "4 (fixed)", "Number of gravity wedges", "Planet_Tile_Map_Editor_Specification_v0_1.md"],
    ["Core type", "void", "What sits at the centre", "CORE_TYPES"],
  ],

  related: [
    { id: "zone-layers", how: "The procedural planet fill these maps would sit inside." },
    { id: "flow-field-gravity", how: "The game's continuous radial gravity, which wedge gravity would replace inside a planet." },
    { id: "autotiling", how: "The tile art the MVP renders as solid colour for now." },
    { id: "zone-editor", how: "The sibling editor view, still a spec." },
    { id: "destructible-terrain", how: "Tiles are meant to break back into sand." },
  ],

  questions: [
    "Who owns TILE_SIZE: the game constant, the editor constant, or a shared file both read?",
    "Should odd alignment come back (a centre tile for a boss core), and if so is it a radius rule or a toggle?",
    "How does the game load a map: replay tiles into the sand grid like the in-game tile editor, or keep a separate tile layer?",
    "Wedge gravity versus the flow field: which wins where a planet's tile map meets its attractor?",
  ],

  sparks: [
    "Four rooms, one planet: each wedge is a side-on room with its own floor, and the diagonals are doors where gravity turns 90°.",
    "Corner tiles as traps: the diagonal slots pull at 45°, so a player who lands on one slides toward the core.",
    "Force-field colours as a hunt: every colour is a generator somewhere on the planet, and overlapping fields make the order of the hunt the puzzle.",
    "Reuse the wedge rule for any radial interior: a tower seen from above, a drain, a space station ring.",
  ],

  terms: [
    { term: "Valid slot", def: "A grid cell whose four corners are all inside the radius.", code: "computeValidSlots" },
    { term: "Wedge", def: "One of four regions between the 45° diagonals; fixes gravity.", code: "TileOrientation N/E/S/W" },
    { term: "Corner tile", def: "A slot on a diagonal, with diagonal gravity.", code: "isCornerTile, NE/SE/SW/NW" },
    { term: "Backfill zone", def: "The gap between the outer whole slots and the circle, filled procedurally.", code: "(spec)" },
    { term: "Core type", def: "What the planet centre is.", code: "CORE_TYPES" },
  ],

  sources: [
    "shmuprouge:docs/design/Planet_Tile_Map_Editor_Specification_v0_1.md",
    "shmuprouge:editor/src/components/planet/TileOrientationUtils.ts",
    "shmuprouge:editor/src/components/planet/PlanetCanvasRenderer.ts",
    "shmuprouge:editor/src/components/planet/PlanetCanvasTiles.ts",
    "shmuprouge:editor/src/types/planet.ts",
    "shmuprouge:editor/src/stores/usePlanetStore.ts",
  ],

  toy: {
    title: "Which way is down?",
    hint: "drag to paint tiles; switch to erase to cut doorways",
    caption: "Slot validity and orientation are ports of the editor code. The falling balls are invented (the game never loads these maps): each one falls along its slot's gravity until the next slot is painted or off the grid.",
    w: 384, h: 216,
    controls: [
      { type: "range", key: "radius", label: "radius", min: 160, max: 960, step: 32, value: 640, fmt: "{} wu", reset: true },
      { type: "select", key: "tool", label: "tool", value: "pen", options: [["pen", "pen"], ["erase", "eraser"]] },
      { type: "toggle", key: "play", label: "drop balls", value: true },
      { type: "button", label: "clear tiles", press(S) { S.paint.clear(); } },
    ],
    init(S, P) { ptmInit(S, P); },
    pointer(e, S, P) {
      const [c, w] = ptmAt(S, e.x, e.y), key = c + "," + w;
      S.hover = S.valid.get(key) || null;
      if (e.type === "down") S.down = true; if (e.type === "up") S.down = false;
      if ((e.type === "down" || (e.type === "move" && e.down)) && S.valid.has(key)) { if (P.tool === "pen") S.paint.add(key); else S.paint.delete(key); }
    },
    update(S, P, dt, kit) {
      if (P.play) {
        S.dropT -= dt;
        if (S.dropT <= 0 && S.balls.length < 8) {
          S.dropT = 0.7; const list = [...S.valid.values()].filter((s) => !S.paint.has(s.c + "," + s.w));
          if (list.length) { const s = kit.rand.pick(list); S.balls.push({ c: s.c, w: s.w, f: 0, rest: 0 }); }
        }
      }
      for (const b of S.balls) {
        if (b.rest > 0) { b.rest += dt; continue; }
        b.f += dt * 9;
        if (b.f >= 1) {
          b.f = 0;
          const s = S.valid.get(b.c + "," + b.w), g = PTM_G[s ? s.o : "N"], nk = (b.c + g[0]) + "," + (b.w + g[1]);
          const ns = S.valid.get(nk), ng = ns && PTM_G[ns.o];
          // stop on a painted or missing slot, or where gravity reverses (the core)
          if (!ns || S.paint.has(nk) || ng[0] * g[0] + ng[1] * g[1] < 0) b.rest = 0.01; else { b.c += g[0]; b.w += g[1]; }
        }
      }
      S.balls = S.balls.filter((b) => b.rest < 2.5);
    },
    draw(g, S, P) {
      const C = g.C, px = S.px; g.clear();
      const tint = { N: C.sky, S: C.sky, E: C.violet, W: C.violet };
      for (const s of S.valid.values()) {
        const x = PTM_CX + s.c * px, y = PTM_CY + s.w * px, k = s.c + "," + s.w;
        if (S.paint.has(k)) g.rect(x, y, px + 0.4, px + 0.4, C.ink2);
        else if (tint[s.o]) g.tone(x, y, px, px, 0.18, tint[s.o]);
        if (s.o.length === 2) g.rect(x + 0.5, y + 0.5, px - 1, px - 1, C.gold, 1);
      }
      const rpx = S.r / PTM_T * px;
      g.circle(PTM_CX, PTM_CY, rpx, C.ink3, 1);
      g.line(PTM_CX - rpx * 0.72, PTM_CY - rpx * 0.72, PTM_CX + rpx * 0.72, PTM_CY + rpx * 0.72, C.enemy, 1);
      g.line(PTM_CX - rpx * 0.72, PTM_CY + rpx * 0.72, PTM_CX + rpx * 0.72, PTM_CY - rpx * 0.72, C.enemy, 1);
      g.circle(PTM_CX, PTM_CY, 1.5, C.enemy);
      for (const b of S.balls) {
        const s = S.valid.get(b.c + "," + b.w), gv = PTM_G[s ? s.o : "N"];
        const x = PTM_CX + (b.c + 0.5 + (b.rest ? 0 : gv[0] * b.f)) * px, y = PTM_CY + (b.w + 0.5 + (b.rest ? 0 : gv[1] * b.f)) * px;
        g.circle(x, y, Math.max(1.5, px * 0.4), b.rest ? C.ink3 : C.accent);
      }
      // legend with gravity arrows
      const leg = [["N", 0, 1], ["E", -1, 0], ["S", 0, -1], ["W", 1, 0], ["NE", -1, 1]];
      g.label("wedge  gravity", 6, 50, C.ink3);
      leg.forEach(([o, gx, gy], i) => { const y = 64 + i * 16; g.label(o, 8, y + 3, o.length === 2 ? C.gold : C.ink); g.arrow(40 - gx * 6, y - gy * 6, 40 + gx * 6, y + gy * 6, C.accent, 1, 4); });
      if (S.hover) g.label("slot " + S.hover.c + "," + S.hover.w + "  " + S.hover.o, 6, 160, C.ink2);
      g.label("grid: even (corner at centre)", 6, 206, C.ink3);
    },
    readout(S) { return "radius " + S.r + " wu  " + Math.floor(S.r / 32) + " tiles\nslots " + S.valid.size + "  painted " + S.paint.size; },
  },
});
