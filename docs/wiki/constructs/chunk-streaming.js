(function () {
  const { DIRMAP, blockRng, drawCells, margolus } = Sand;
  // 10×6 chunks of 12×12 cells, 3 px per cell. One chunk stands for 256 WU; the camera is the 640×360 WU view.
  const CW = 10, CH = 6, N = 12, CS = 3, W = CW * N, H = CH * N, PX = N * CS;
  const CAMW = 640 / 256 * PX, CAMH = 360 / 256 * PX, GRACE = 30, MAXUN = 4, WALL = 3;
  const M = [{}, { loose: 1, d: 2 }, { stat: 1, d: 3 }, { wall: 1 }];
  const mod = (a, n) => ((a % n) + n) % n;

  function generate(S, cx, cy) { // streamer.lua: seeded once per chunk, seed + cx·10007 + cy·7919
    const r = S.kit.rng(12345 + cx * 10007 + cy * 7919), c = S.sim.c, x0 = cx * N, y0 = cy * N;
    const shelf = 6 + r.int(0, 4), a = r.int(0, 4), b = a + r.int(4, 8);
    for (let x = a; x < Math.min(N, b); x++) for (let y = shelf; y < shelf + 2; y++) c[(y0 + y) * W + x0 + x] = 2;
    for (let k = 0; k < 14; k++) c[(y0 + r.int(0, 4)) * W + x0 + r.int(0, N - 1)] = 1;
    S.gen[cy * CW + cx] = 1;
  }
  function chunksIn(x, y, w, h, pad) {
    const out = new Set();
    for (let j = Math.floor(y / PX) - pad; j <= Math.floor((y + h) / PX) + pad; j++)
      for (let i = Math.floor(x / PX) - pad; i <= Math.floor((x + w) / PX) + pad; i++) out.add(mod(j, CH) * CW + mod(i, CW));
    return out;
  }

  Wiki.construct({
    id: "chunk-streaming",
    name: "Chunk streaming on a wrapping world",
    origin: "shmuprouge",
    status: "built",
    summary: "The world is a toroidal grid of 256-WU chunks; only those around the camera are simulated, each with a two-cell halo copied from its neighbours, while everything else is frozen in a cache exactly as it was left.",
    tags: ["streaming", "toroidal", "chunks", "ECS"],

    intent:
      "<p>A per-pixel sand sim cannot run over a whole solar system, and the player never sees more than a screen of it. Streaming chunks around the camera gives a full simulation where it matters and a world of any size beyond it. Two choices make this a design property rather than plumbing: off-screen terrain <em>pauses</em> (an avalanche you leave behind waits for you), and off-screen entities sleep, so distant turrets do not exist computationally until you come within a chunk of them.</p>" +
      "<p>The arena wraps at both edges. There are no corners to camp in, and gravity wells and vortices act across the seam.</p>",

    how:
      "<h3>Chunks and halos</h3>" +
      "<p>Each chunk is 256×256 WU (one cell per WU), stored as a 260×260 texture: a 2-WU ghost halo all round. Before every [[falling-sand]] step each chunk copies its neighbours' edge strips (their owned rows and columns 2–3 and 256–257) into its halo. A missing neighbour fills the halo with material 255, an immovable solid, so sand cannot flow into unloaded space: piles press against an unloaded edge as if walled. Margolus blocks that straddle a boundary are computed by each chunk for its own cells, and the neighbour sees the result one frame later.</p>" +
      "<h3>Which chunks run</h3>" +
      "<p>Visible chunks are those intersecting the 640×360 viewport; the loaded set adds one ring (<code>LOAD_AHEAD_CHUNKS = 1</code>), typically about 20 chunks. The doc's budget: at the 500 WU/s top speed a ship crosses a chunk in 0.51 s, which one ring covers. A chunk leaving the set waits 30 frames (<code>UNLOAD_GRACE_FRAMES</code>), and at most 4 unload per frame. Unloading caches the cell data, its quads and cooldowns ([[destructible-terrain]]); reloading restores them, and <code>snapshotToCache</code> supports saving to disk. Nothing simulates at a reduced rate off-screen: the world simply stops.</p>" +
      "<h3>Content streaming</h3>" +
      "<p><code>engine/terrain/streamer.lua</code> samples a 120° cone ahead of the player's velocity, 8 chunks deep on 7 rays. Each unpopulated chunk it finds is spawned once by a zone/biome callback after <code>math.randomseed(seed + cx·10007 + cy·7919)</code>, so the same chunk always generates the same content. Zones flagged <code>pregenerate</code> (planets) skip this and are built at load ([[world-gen-stack]]).</p>" +
      "<h3>Entities sleep too</h3>" +
      "<p>Every positioned ECS entity lives in a chunk bucket: STATIC entities are assigned once, DYNAMIC ones re-bucket when they cross a chunk edge, GLOBAL ones (the player) belong to no chunk and are always included. Systems ask <code>querySpatial(Region.VISIBLE | LOADED | ALL, …)</code>. Gravity sources, wakes and turret visibility use LOADED; renderers use VISIBLE. One consequence: a black hole's lifetime only counts down while loaded, so a hole you fly away from does not expire.</p>" +
      "<h3>The torus</h3>" +
      "<p>Distances, ray casts, field sums, chunk neighbours and drawing all use the shortest wrapped delta: subtract the level size when the difference exceeds half of it. Chunk ids wrap with <code>((c − 1) % n) + 1</code>, the camera draws up to nine offset copies near seams, and the coordinate doc requires power-of-two level sizes.</p>",

    knobs: [
      ["Chunk size", "256 WU", "Streaming and simulation unit; largest quad", "CHUNK_SIZE_WU"],
      ["Ghost halo", "2 WU", "Border copied from each neighbour every step", "GHOST_HALO_WU, CHUNK_TEXTURE_SIZE 260"],
      ["Load-ahead", "1 chunk", "Ring of simulated chunks beyond the visible ones", "LOAD_AHEAD_CHUNKS"],
      ["Unload grace", "30 frames, max 4/frame", "Delay and budget for freezing chunks", "UNLOAD_GRACE_FRAMES, MAX_UNLOADS_PER_FRAME"],
      ["Content cone", "120°, 8 chunks, 7 rays", "Where new content is generated ahead of the player", "Terrain.json coneAngle; streamer.lua"],
      ["World seed", "12345", "Per-chunk generation seed base", "world/Terrain.json seed"],
    ],

    related: [
      { id: "falling-sand", how: "Runs per chunk with the halo as its border." },
      { id: "destructible-terrain", how: "Quads and cooldowns are cached with the chunk." },
      { id: "flow-field-gravity", how: "Uses the wrapped delta; sources tick only while loaded." },
      { id: "world-gen-stack", how: "Supplies the per-chunk generation callback." },
      { id: "spatial-awareness", how: "Turrets are tested only in the LOADED region." },
    ],

    questions: [
      "Frozen world: feature or bug? Off-screen chunks could run at a reduced rate instead.",
      "Should black holes and other timed entities keep ageing while unloaded?",
      "A camera parked on a seam makes the solid boundary visible. Is a two-ring load-ahead worth the cost?",
    ],

    sparks: [
      "Time-frozen ruins: leave mid-avalanche, come back and it resumes, a diegetic \"the world only lives where you look\".",
      "Load-ahead as fog of war: content only exists in your travel cone, so turning round reveals new territory.",
      "Seam walls as a hidden mechanic: keep a chunk unloaded to dam a sand sea.",
      "Sleeping sentries: ambushes tuned by chunk geometry, because turrets do not exist until you are a chunk away.",
    ],

    terms: [
      { term: "Chunk", def: "The 256-WU unit of streaming and simulation.", code: "CHUNK_SIZE_WU, ChunkTexture" },
      { term: "Ghost halo", def: "The 2-WU border a chunk copies from its neighbours each step; 255 where none is loaded.", code: "ChunkHaloManager" },
      { term: "Loaded region", def: "Visible chunks plus one ring; what gets simulated and ticked.", code: "Region.LOADED" },
      { term: "Placement", def: "How an entity is bucketed: STATIC, DYNAMIC or GLOBAL.", code: "Placement" },
      { term: "Toroidal world", def: "A level that wraps at both edges; every distance uses the shortest wrapped delta.", code: "wrapDelta" },
      { term: "Travel cone", def: "The 120° sector ahead of the player where new chunks are populated.", code: "engine/terrain/streamer.lua" },
    ],

    sources: [
      "shmuprouge:engine/physics/sand/chunk_halo_manager.lua",
      "shmuprouge:engine/physics/sand/chunk_texture_pool.lua",
      "shmuprouge:engine/physics/sand/chunk_texture_pool_visibility.lua",
      "shmuprouge:engine/physics/sand/chunk_texture_pool_cache.lua",
      "shmuprouge:engine/terrain/streamer.lua",
      "shmuprouge:engine/ecs/entity_manager_spatial.lua",
      "shmuprouge:engine/ecs/region.lua",
      "shmuprouge:engine/rendering/camera/wrap.lua",
      "shmuprouge:shared/constants/init.lua",
      "shmuprouge:docs/engine/physics/Sand_Physics_Streaming.md",
      "shmuprouge:docs/engine/Spatial_Chunk_Storage.md",
      "shmuprouge:docs/engine/physics/Coordinate_System.md",
    ],

    toy: {
      title: "The camera wakes the world",
      hint: "drag to move the camera; it drifts on its own otherwise",
      caption: "Each chunk is 12×12 cells here. Green outline = visible, gold = the loaded ring, dithered = frozen in cache, blank = never generated. Halo strips are violet where copied from a loaded neighbour, red where they read as wall (material 255). Sand only moves in loaded chunks and piles against frozen ones; dots are entities that only tick while loaded. South gravity, and the halo copy is instant rather than one frame late.",
      w: 384, h: 216,
      controls: [
        { type: "toggle", key: "halo", label: "halos", value: true },
        { type: "range", key: "ahead", label: "load-ahead", min: 0, max: 2, value: 1 },
        { type: "range", key: "speed", label: "drift", min: 0, max: 60, value: 24, fmt: "{} px/s" },
      ],
      init(S, P, kit) {
        S.kit = kit; S.sim = { c: new Uint8Array(W * H), W, H, M, frame: 0, wrapX: true, wrapY: true, shade: 0.3 };
        S.gen = new Uint8Array(CW * CH); S.loaded = new Uint8Array(CW * CH); S.grace = new Int16Array(CW * CH);
        S.cam = { x: 60, y: 60 }; S.drag = null; S.vis = new Set(); S.ticked = 0;
        S.ents = []; for (let i = 0; i < 40; i++) S.ents.push({ x: kit.rand() * CW * PX, y: kit.rand() * CH * PX, a: kit.rand() * 6.28, on: false });
      },
      update(S, P, dt) {
        if (!S.drag) { S.cam.x = mod(S.cam.x + P.speed * dt, CW * PX); S.cam.y = mod(S.cam.y + P.speed * 0.45 * dt, CH * PX); }
        S.vis = chunksIn(S.cam.x, S.cam.y, CAMW, CAMH, 0);
        const want = chunksIn(S.cam.x, S.cam.y, CAMW, CAMH, P.ahead);
        let unloads = 0;
        for (let i = 0; i < CW * CH; i++) {
          if (want.has(i)) { if (!S.loaded[i]) { if (!S.gen[i]) generate(S, i % CW, (i / CW) | 0); S.loaded[i] = 1; } S.grace[i] = GRACE; }
          else if (S.loaded[i] && --S.grace[i] <= 0 && unloads < MAXUN) { S.loaded[i] = 0; unloads++; }
        }
        const c = S.sim.c, saved = c.slice();
        for (let i = 0; i < c.length; i++) if (!S.loaded[((i / W / N) | 0) * CW + (((i % W) / N) | 0)]) c[i] = WALL;
        margolus(S.sim, () => [0, 1, 0]);
        for (let i = 0; i < c.length; i++) if (!S.loaded[((i / W / N) | 0) * CW + (((i % W) / N) | 0)]) c[i] = saved[i];
        S.ticked = 0;
        for (const e of S.ents) {
          e.on = !!S.loaded[mod(Math.floor(e.y / PX), CH) * CW + mod(Math.floor(e.x / PX), CW)];
          if (!e.on) continue;
          S.ticked++; e.a += (S.kit.rand() - 0.5) * 0.3;
          e.x = mod(e.x + Math.cos(e.a) * 14 * dt, CW * PX); e.y = mod(e.y + Math.sin(e.a) * 14 * dt, CH * PX);
        }
      },
      pointer(e, S) {
        if (e.type === "down") S.drag = { x: e.x, y: e.y, cx: S.cam.x, cy: S.cam.y };
        else if (e.type === "up") S.drag = null;
        else if (S.drag && e.down) { S.cam.x = mod(S.drag.cx + e.x - S.drag.x, CW * PX); S.cam.y = mod(S.drag.cy + e.y - S.drag.y, CH * PX); }
      },
      draw(g, S, P) {
        const C = g.C;
        g.clear();
        for (let i = 0; i < CW * CH; i++) if (S.gen[i] && !S.loaded[i]) g.tone((i % CW) * PX, ((i / CW) | 0) * PX, PX, PX, 0.15, C.ink3);
        drawCells(g, S.sim, CS, (v) => (v === 1 ? C.gold : v === 2 ? C.orange : null));
        for (let i = 0; i < CW * CH; i++) {
          const x = (i % CW) * PX, y = ((i / CW) | 0) * PX;
          if (P.halo && S.loaded[i]) {
            const nb = [[0, -1], [0, 1], [-1, 0], [1, 0]].map(([dx, dy]) => S.loaded[mod((i / CW | 0) + dy, CH) * CW + mod(i % CW + dx, CW)]);
            const strip = (k, rx, ry, rw, rh) => g.tone(rx, ry, rw, rh, 0.35, nb[k] ? C.violet : C.enemy);
            strip(0, x, y, PX, CS); strip(1, x, y + PX - CS, PX, CS); strip(2, x, y, CS, PX); strip(3, x + PX - CS, y, CS, PX);
          }
        }
        for (let i = 0; i < CW * CH; i++) {
          const x = (i % CW) * PX, y = ((i / CW) | 0) * PX;
          if (S.vis.has(i)) g.rect(x + 1, y + 1, PX - 2, PX - 2, C.accent, 1.5);
          else if (S.loaded[i]) g.rect(x + 1, y + 1, PX - 2, PX - 2, C.gold, 0.75);
        }
        for (const e of S.ents) g.circle(e.x, e.y, 1.6, e.on ? C.sky : C.ink3);
        for (const ox of [0, -CW * PX]) for (const oy of [0, -CH * PX]) g.rect(S.cam.x + ox, S.cam.y + oy, CAMW, CAMH, C.ink, 1.5);
      },
      readout(S) {
        let l = 0, f = 0; for (let i = 0; i < CW * CH; i++) { if (S.loaded[i]) l++; else if (S.gen[i]) f++; }
        return "loaded " + l + "  frozen " + f + "\nentities ticked " + S.ticked + "/" + S.ents.length;
      },
    },
  });
})();
