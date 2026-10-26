// Toy helpers: a 46x46 radial-gravity sand grid with hardened and loose cells.
var WGS_N = 46, WGS_CS = 4, WGS_OX = 196, WGS_OY = 16;
var WGS_BANDS = [
  ["L6", "Stages", "conceptual"], ["L5", "Zone graph", "built"], ["L4", "Biome fill", "built (JSON, no WFC)"],
  ["L3", "Tile maps", "partial"], ["L2", "Stability & debris", "built"], ["L1", "Sand physics", "built"],
];
function wgsInit(S, kit) {
  const N = WGS_N; S.mat = new Array(N * N).fill(0); S.loose = new Array(N * N).fill(false); S.still = new Array(N * N).fill(0);
  S.gen = 0; S.genT = 0; S.flow = []; S.t = 0; S.blastT = 2.5; S.hardened = 0; S.blasts = 0; S.r1 = kit.rand.range(3.5, 5.5); S.r2 = kit.rand.range(6, 8);
}
function wgsPulse(S, dir, from, to) { S.flow.push({ dir, from, to, t: 0 }); }
function wgsFill(S, upto) {
  const N = WGS_N;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const r = Math.hypot(x - N / 2 + 0.5, y - N / 2 + 0.5), i = y * N + x;
    S.mat[i] = r > 19 ? 0 : r > 19 - S.r1 ? 1 : r > 19 - S.r1 - S.r2 ? 2 : r > 6 ? 3 : 0;
    S.loose[i] = false; S.still[i] = 0;
  }
}
function wgsBlast(S, cx, cy) {
  const N = WGS_N;
  for (let y = cy - 7; y <= cy + 7; y++) for (let x = cx - 7; x <= cx + 7; x++) {
    if (x < 0 || y < 0 || x >= N || y >= N) continue;
    const d = Math.hypot(x - cx, y - cy), i = y * N + x;
    if (!S.mat[i]) continue;
    if (d < 3) S.mat[i] = 0; else if (d < 6.5) { S.loose[i] = true; S.still[i] = 0; }
  }
  S.blasts++; wgsPulse(S, 1, 3, 5);
}

Wiki.construct({
  id: "world-gen-stack",
  name: "World generation stack (L1-L6)",
  family: "generation",
  origin: "shmuprouge",
  status: "partial",
  statusNote: "L1 sand physics, L2 stability and L5 zones are built; L4 is built as JSON ring recipes rather than the WFC the doc names; L3 is a single-size 47-blob autotile rather than the doc's 13 tiles &times; 4 crack levels; L6 stages is conceptual.",
  summary: "Six layers from falling sand up to stages: authoring flows down at generation time, settled sand flows up into terrain at runtime, and destruction flows back down to particles.",
  tags: ["architecture", "procedural", "layers", "destructible", "authoring"],

  intent:
    "<p>A world where everything breaks still has to be authored. The stack separates the questions a designer asks at different altitudes: which stages make a level (L6), where the bodies sit and how far apart (L5), what a body is made of (L4), what its edges look like (L3), when loose matter becomes rock (L2), and how matter moves (L1). Each layer is authored once at its own scale and the simulation keeps the result destructible.</p>" +
    "<p>The important property is the loop between the bottom three layers. Terrain is never only art: blast it and it becomes particles; leave the particles alone and they become terrain again.</p>",

  how:
    "<h3>The layers</h3>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>Layer</th><th>Doc says</th><th>Code has</th></tr></thead><tbody>" +
    "<tr><td>L6 Stages</td><td>Arena, Corridor, Boss, Store, and their sequence</td><td>Nothing; a level is one arena</td></tr>" +
    "<tr><td>L5 Zone graph</td><td>Shapes, sizes, distances, biome refs</td><td>Level zones placing templates of depth layers ([[zone-layers]])</td></tr>" +
    "<tr><td>L4 Biome fill (WFC)</td><td>Pattern-based material placement</td><td><code>concentric_rings</code> recipes and feature scatter in JSON; no WFC</td></tr>" +
    "<tr><td>L3 Tile maps</td><td>2&times;2 classification, 16 patterns, 13 tiles &times; 4 crack levels</td><td>47-blob quarter-tile autotile on 32 wu quads only ([[autotiling]]); cracks not built</td></tr>" +
    "<tr><td>L2 Stability &amp; debris</td><td>Quadtree detects settled sand, debris on destruction</td><td>Lithon quads, <code>hardens_to</code> / <code>crumbles_to</code>, 2 s window ([[stability-and-debris]])</td></tr>" +
    "<tr><td>L1 Sand physics</td><td>Cellular automata, flow fields, reactions</td><td>Margolus-block GPU sand with field-rotated gravity ([[falling-sand]])</td></tr>" +
    "</tbody></table></div>" +
    "<h3>Three flows</h3>" +
    "<p><b>Generation, top down.</b> Stage chosen, zone graph generated, biomes fill zones, autotile textures the result, stability initialised, sand ready. In code, <code>pregenerate</code> planets skip the wait at L2: <code>terrain_quad_pregen.lua</code> scans the fill at lithon resolution and merges it to completion, so a planet is fully hardened on frame one.</p>" +
    "<p><b>Stability, bottom up.</b> Sand that stops moving becomes a solid quad, which gets a tile. The GPU marks every 2&times;2 block that changed; every 120 frames (about 2 s) a chunk is read back, and fully still 4&times;4 lithons of one material harden.</p>" +
    "<p><b>Destruction, top down.</b> A blast clears the core of its area and turns static cells in the rest back into their <code>crumbles_to</code> loose material, with a 2 s cooldown before they may harden again. The loose grains fall, settle, and the loop closes.</p>",

  knobs: [
    ["Stability window", "120 frames (~2 s)", "How long sand must be still to harden", "QUADTREE_UPDATE_INTERVAL"],
    ["Lithon", "4 x 4 wu", "Smallest hardened unit", "LITHON_LEVEL, TerrainQuad"],
    ["Autotile size", "32 wu", "The only quad size that gets tile art", "TILE_SIZE_WU, AUTOTILE_MIN_LEVEL"],
    ["Blast cooldown", "2.0 s", "No re-hardening right after a blast", "AOE_COOLDOWN_TIME"],
    ["Chunk", "256 wu", "Streaming unit for all layers", "Constants.CHUNK_SIZE_WU"],
  ],

  related: [
    { id: "zone-layers", how: "L5 and L4 as built: zones, templates, biomes, features." },
    { id: "stability-and-debris", how: "L2: the settle, harden, crumble loop." },
    { id: "falling-sand", how: "L1: the simulation every layer feeds." },
    { id: "autotiling", how: "L3: the tile art on hardened quads." },
    { id: "level-loop", how: "L6 would sequence the stages that loop describes." },
  ],

  questions: [
    "L5: is the zone graph a template per stage or generated per run? The doc lists both and the code only loads fixed levels.",
    "What does L6 hand L5: a seed, a stage type, a list of required zones?",
    "Cross-zone transitions: where two zones meet, which biome wins, and how is the seam drawn?",
    "Should L4 still become WFC from PNG examples, or are ring recipes plus features enough for planets and belts?",
  ],

  sparks: [
    "Teach the stack as a zoom: an editor that scrolls from the stage map down to single grains, with each layer's authoring tool appearing at its altitude.",
    "Make the bottom-up loop visible as healing: ground that has been still longest shows richer tiles, a readable map of safe footing.",
    "Use the loop as a timer: an enemy that can only cross hardened ground, so blasting a path buys exactly the 2 s window.",
    "Swap the top layer: the same L1 to L5 under a different L6 (a single endless zone, a daily stage list) is a different game.",
  ],

  terms: [
    { term: "L1-L6", def: "Sand physics, stability, tile maps, biome fill, zone graph, stages.", code: "World_Generation_Stack_Design_v0_1.md" },
    { term: "Lithon", def: "A 4x4 wu block of one still material; the unit that hardens.", code: "TerrainQuad at LITHON_LEVEL" },
    { term: "Pregen", def: "Hardening a zone at load instead of waiting for stability.", code: "terrain_quad_pregen.lua" },
    { term: "Crumble / harden", def: "Material links between the loose and static form of a material.", code: "crumbles_to, hardens_to" },
  ],

  sources: [
    "shmuprouge:docs/design/World_Generation_Stack_Design_v0_1.md",
    "shmuprouge:game/world/terrain/generator.lua",
    "shmuprouge:engine/physics/sand/terrain_quad_pregen.lua",
    "shmuprouge:engine/rendering/autotile_pass.lua",
    "shmuprouge:shared/constants/init.lua",
  ],

  toy: {
    title: "Down, up, down again",
    hint: "click the planet to blast it",
    caption: "A small radial-gravity sand grid stands in for L1-L3: loose cells (dithered) step toward the core, and a cell still for 2 s hardens (solid, with edges drawn as a stand-in for autotiling). Pulses on the left show which layers each event passes through.",
    w: 384, h: 216,
    controls: [
      { type: "button", label: "generate (reseed)", press(S, P, kit) { kit.rand.range(0, 1); wgsInit(S, kit); } },
      { type: "toggle", key: "auto", label: "auto-blast", value: true },
    ],
    init(S, P, kit) { wgsInit(S, kit); },
    pointer(e, S) {
      if (e.type !== "down" || S.gen < 6) return;
      const cx = Math.floor((e.x - WGS_OX) / WGS_CS), cy = Math.floor((e.y - WGS_OY) / WGS_CS);
      if (cx >= 0 && cy >= 0 && cx < WGS_N && cy < WGS_N) wgsBlast(S, cx, cy);
    },
    update(S, P, dt, kit) {
      const N = WGS_N; S.t += dt;
      if (S.gen < 6) {
        S.genT += dt;
        if (S.genT > 0.45) { S.genT = 0; S.gen++; if (S.gen === 3) wgsFill(S); wgsPulse(S, 1, S.gen - 1, S.gen - 1); }
        return;
      }
      if (P.auto) { S.blastT -= dt; if (S.blastT <= 0) { S.blastT = 3.5; const a = kit.rand.range(0, 6.283), r = kit.rand.range(12, 19); wgsBlast(S, Math.round(N / 2 + Math.cos(a) * r), Math.round(N / 2 + Math.sin(a) * r)); } }
      // loose cells fall toward the core; still ones harden after 120 frames
      const order = []; for (let i = 0; i < N * N; i++) if (S.mat[i] && S.loose[i]) order.push(i);
      let hardenedNow = 0;
      for (const i of order) {
        const x = i % N, y = (i / N) | 0, dx = N / 2 - 0.5 - x, dy = N / 2 - 0.5 - y;
        if (Math.hypot(dx, dy) < 6.5) { S.still[i]++; } else {
          const sx = Math.sign(dx), sy = Math.sign(dy), cand = Math.abs(dx) > Math.abs(dy) ? [[sx, 0], [sx, sy], [sx, -sy]] : [[0, sy], [sx, sy], [-sx, sy]];
          let moved = false;
          for (const [mx, my] of cand) {
            const j = (y + my) * N + (x + mx);
            if ((mx || my) && j >= 0 && j < N * N && !S.mat[j] && kit.rand() < 0.5) { S.mat[j] = S.mat[i]; S.loose[j] = true; S.still[j] = 0; S.mat[i] = 0; S.loose[i] = false; moved = true; break; }
          }
          if (!moved) S.still[i]++;
        }
        if (S.mat[i] && S.loose[i] && S.still[i] >= 120) { S.loose[i] = false; hardenedNow++; }
      }
      if (hardenedNow) { S.hardened += hardenedNow; if (!S.flow.some((f) => f.dir < 0 && f.t < 0.6)) wgsPulse(S, -1, 5, 3); }
      for (const f of S.flow) f.t += dt;
      S.flow = S.flow.filter((f) => f.t < 1.4);
    },
    draw(g, S) {
      const C = g.C, N = WGS_N, cs = WGS_CS; g.clear();
      // bands L6 (top) to L1 (bottom)
      WGS_BANDS.forEach((b, k) => {
        const y = 40 + k * 28;
        let lit = S.gen < 6 ? k === S.gen - 1 : false;
        for (const f of S.flow) { const span = Math.abs(f.to - f.from) + 1, step = Math.min(span - 1, Math.floor(f.t / 1.4 * span)); const at = f.from + f.dir * step; if (at === k) lit = true; }
        g.tone(4, y, 150, 24, lit ? 0.45 : 0.06, lit ? C.accent : C.ink3);
        g.rect(4, y, 150, 24, lit ? C.accent : C.rule, 1);
        g.text(b[0] + " " + b[1], 9, y + 10, { color: C.ink });
        g.label(b[2], 9, y + 20, b[2] === "built" ? C.ink3 : C.gold);
      });
      g.label("gen", 166, 46, C.ink3); g.arrow(172, 50, 172, 120, C.ink3);
      g.label("settle", 160, 206, C.ink3); g.arrow(178, 196, 178, 150, C.accent);
      // sandbox
      if (S.gen >= 2) g.circle(WGS_OX + N / 2 * cs, WGS_OY + N / 2 * cs, 19 * cs, S.gen === 2 ? C.accent : C.rule, 1);
      const col = [null, C.ink3, C.ink2, C.gold];
      for (let i = 0; i < N * N; i++) {
        const m = S.mat[i]; if (!m) continue;
        const x = WGS_OX + (i % N) * cs, y = WGS_OY + ((i / N) | 0) * cs;
        if (S.loose[i]) g.tone(x, y, cs, cs, 0.55, col[m]);
        else {
          g.rect(x, y, cs + 0.4, cs + 0.4, col[m]);
          if (S.gen >= 4) {
            if (!S.mat[i - N]) g.line(x, y, x + cs, y, C.ink, 1);
            if (!S.mat[i + N]) g.line(x, y + cs, x + cs, y + cs, C.ink, 1);
            if (i % N && !S.mat[i - 1]) g.line(x, y, x, y + cs, C.ink, 1);
            if ((i + 1) % N && !S.mat[i + 1]) g.line(x + cs, y, x + cs, y + cs, C.ink, 1);
          }
        }
      }
      if (S.gen >= 1 && S.gen < 6) g.label(["", "L6: stage = arena", "L5: place zone", "L4: fill rings", "L3: tile edges", "L2: pregen harden"][S.gen], WGS_OX + N * cs / 2, 210, C.accent, "center");
    },
    readout(S) {
      let loose = 0; for (let i = 0; i < S.mat.length; i++) if (S.mat[i] && S.loose[i]) loose++;
      return "blasts " + S.blasts + "  loose " + loose + "\nhardened again " + S.hardened;
    },
  },
});
