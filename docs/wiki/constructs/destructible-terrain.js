(function () {
  // A small re-implementation of the v0.5 quad map: lithons (4×4) merge by fours into power-of-2 quads.
  const W = 128, H = 64, CS = 3, LI = 4, MAXLV = 4, CHUNK = 64;
  const key = (lv, x, y) => lv + "," + x + "," + y;
  const size = (lv) => LI << lv;

  function fullLithon(S, x, y) {
    for (let j = y; j < y + LI; j++) for (let i = x; i < x + LI; i++) if (!S.c[j * W + i]) return false;
    return true;
  }
  function scan(S) { // lithon candidates not covered by any quad become lithons
    const cov = new Uint8Array((W / LI) * (H / LI));
    for (const q of S.q.values()) { const n = size(q.lv) / LI; for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) cov[(q.y / LI + j) * (W / LI) + q.x / LI + i] = 1; }
    for (let y = 0; y < H; y += LI) for (let x = 0; x < W; x += LI)
      if (!cov[(y / LI) * (W / LI) + x / LI] && fullLithon(S, x, y)) S.q.set(key(0, x, y), { lv: 0, x, y, born: S.t });
  }
  function mergeStep(S, budget) { // MAX_MERGES_PER_FRAME, bottom-up by level
    let n = 0;
    for (let lv = 0; lv < MAXLV && n < budget; lv++) for (const q of [...S.q.values()]) {
      if (n >= budget) break;
      if (q.lv !== lv || !S.q.has(key(lv, q.x, q.y))) continue;
      const ps = size(lv + 1), px = q.x - (q.x % ps), py = q.y - (q.y % ps), s = size(lv);
      if (Math.floor(px / CHUNK) !== Math.floor((px + ps - 1) / CHUNK)) continue; // quads never span chunks
      const sib = [[0, 0], [s, 0], [0, s], [s, s]].map(([dx, dy]) => key(lv, px + dx, py + dy));
      if (!sib.every((k) => S.q.has(k))) continue;
      sib.forEach((k) => S.q.delete(k));
      S.q.set(key(lv + 1, px, py), { lv: lv + 1, x: px, y: py, born: S.t }); n++; S.merges++;
    }
    return n;
  }
  function splitRect(S, x0, y0, x1, y1) { // split every quad touching the rect down to lithons, drop broken lithons
    let again = true;
    while (again) {
      again = false;
      for (const q of [...S.q.values()]) {
        const s = size(q.lv);
        if (q.x >= x1 || q.x + s <= x0 || q.y >= y1 || q.y + s <= y0) continue;
        if (q.lv > 0) {
          S.q.delete(key(q.lv, q.x, q.y)); S.splits++; again = true;
          const h = s / 2;
          for (const [dx, dy] of [[0, 0], [h, 0], [0, h], [h, h]]) S.q.set(key(q.lv - 1, q.x + dx, q.y + dy), { lv: q.lv - 1, x: q.x + dx, y: q.y + dy, born: -99 });
        } else if (!fullLithon(S, q.x, q.y)) S.q.delete(key(0, q.x, q.y));
      }
    }
  }
  function brush(S, cx, cy, r, v) {
    for (let y = Math.max(0, cy - r); y <= Math.min(H - 1, cy + r); y++)
      for (let x = Math.max(0, cx - r); x <= Math.min(W - 1, cx + r); x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) S.c[y * W + x] = v;
    if (!v) splitRect(S, cx - r, cy - r, cx + r + 1, cy + r + 1);
  }

  Wiki.construct({
    id: "destructible-terrain",
    name: "Destructible terrain: quads, cracks and collisions",
    family: "world",
    origin: "shmuprouge",
    status: "partial",
    statusNote: "The quad hierarchy (v0.5), ship bounce and impact damage, and painted tile zones are built. The material health and crack layer, impact cracks, and debris that remembers its tile art are spec only.",
    summary: "Hardened terrain is stored as 4×4-WU lithons that merge by fours into power-of-two quads up to a whole chunk, and split back down wherever something breaks them.",
    tags: ["destruction", "quadtree", "collision", "authoring"],

    intent:
      "<p>Sand-per-pixel terrain needs a cheaper description for everything that is not moving. The quad map answers \"how big is this stable mass, and since when?\" with a handful of power-of-two squares instead of thousands of cells. That answer drives what gets tile art, what darkens with depth, and gives a hook for objectives like \"is this asteroid gone yet?\"</p>" +
      "<p>Around it sit the other parts of breakable ground: ships bounce off it and take damage, designers paint set pieces into it that shatter like anything else, and a planned health layer would let terrain take several hits and show cracks first.</p>",

    how:
      "<h3>The quad map (v0.5)</h3>" +
      "<p>Each 256-WU chunk keeps a flat hash of quads keyed <code>level·256·256 + y·256 + x</code> in chunk-local coordinates. Level 2 is a 4-WU lithon, level 8 the whole chunk (<code>MAX_QUAD_LEVEL</code>). Lithons come from the [[stability-and-debris|hardening scan]]; materials without a <code>hardening_probability</code> always qualify.</p>" +
      "<ul><li><b>Merge:</b> four siblings of the same material at level L become one parent at L+1, keeping the earliest <code>stable_since</code> and latest <code>cooldown_until</code>. Bottom-up, at most <code>MAX_MERGES_PER_FRAME</code> = 4 across all active chunks. Quads never span chunks, so 256 WU is the largest stable unit.</li>" +
      "<li><b>Split:</b> a blast splits every quad in its rectangle and puts its lithons on a 2 s cooldown. After each scan a coroutine also checks <b>one merged quad per frame</b>; if any lithon under it is no longer valid, the quad splits.</li>" +
      "<li><b>Pre-gen:</b> authored and planet terrain is scanned at lithon resolution at load time and merged to completion, so planets start fully hardened without waiting for the stability pipeline.</li>" +
      "<li><b>Persistence:</b> quads and cooldowns are saved with the chunk when it unloads ([[chunk-streaming]]).</li></ul>" +
      "<p><code>TerrainPropertiesBuilder</code> rasterises the quads into a 64×64 texture per chunk (4 WU per pixel): R = material, G = health, always 255. The display shader uses it to darken interiors ([[material-fx]]) and the [[autotiling|autotile pass]] reads level-5 (32 WU) quads. Earlier versions: v0.3 had 4×4 lithons with damage moved out of quads; v0.4 grew lithons to 16×16 with an LOD lock at 32 and a boundary shader; v0.5 went back to 4×4 and added the tile/quad split and interior darkening.</p>" +
      "<h3>Health and cracks (spec only)</h3>" +
      "<p><code>Material_Health_Layer_Specification_v0_1.md</code> stores a uint8 health per lithon in that G channel. Damage would be <code>power · (1 − hardness) · (1 + current damage)</code>, so damaged ground takes more and hardness 1 is immune; bombs zero their area and hurt concentric rings with falloff; tiles show one of four crack tiers from the minimum health of their lithons (thresholds 0.75 / 0.5 / 0.25 / 0). Nothing of this runs: G is written as 255, <code>hardness</code> is unread, and <code>markBlockDamaged</code> only sets a dirty flag.</p>" +
      "<h3>Ship against terrain</h3>" +
      "<p>Entities collide with SOLID cells in the CPU persistent overlay (authored plus hardened terrain, minus erosion and black-hole clears). Moving loose sand mostly is not in that overlay, so ships fly through falling sand. A hit needs a <b>formation</b>: at least <code>minFormationSize</code> = 5 solid cells in the 3×3 around it, so lone grains never snag. Slow movers test 8 perimeter points; faster than 12 WU per frame, a sweep line. The response is restitution 0.5, a 0.3 s control lock, damage <code>speed·0.1</code> at 100 WU/s or more, a safe-exit search up to 50 WU, and at 150 WU/s a crack call that does nothing yet.</p>" +
      "<h3>Hand-authored tile zones</h3>" +
      "<p>Painting a tile in the in-game editor ([[autotiling]]) splits any larger quad down to level 5, writes a 32-WU quad and fills all 32×32 cells with random variants of the material. The art is real sand: a blast turns it into debris like any rock, and re-hardened ground gets procedural quads, not the tile back. A \"tile-reference material\" whose debris remembers its UV in the source art, so a shattered statue piles up as its own pixels, is spec only.</p>",

    knobs: [
      ["Lithon size", "4 WU (level 2)", "Smallest hardened unit", "LITHON_SIZE, LITHON_LEVEL"],
      ["Top level", "8 (256 WU, one chunk)", "Largest quad", "MAX_QUAD_LEVEL"],
      ["Merge budget", "4 per frame", "Merges across all active chunks per frame", "MAX_MERGES_PER_FRAME"],
      ["Formation size", "5 of 9", "Solid cells needed in a 3×3 to count as a hit", "TerrainCollision.json minFormationSize"],
      ["Bounce", "restitution 0.5, lock 0.3 s", "Ship response to a hit", "TerrainCollision.json restitution, bounceCooldown"],
      ["Impact damage", "speed × 0.1 above 100", "Hull damage from ramming", "damageMultiplier, damageMinSpeed"],
      ["Crack speed", "150 (no effect)", "Impact speed that calls the crack stub", "crackMinSpeed"],
    ],

    related: [
      { id: "stability-and-debris", how: "Creates lithons and splits quads on blasts." },
      { id: "autotiling", how: "Paints tile art on level-5 quads and writes them from the editor." },
      { id: "material-fx", how: "Interior darkening applies only inside quads." },
      { id: "asteroid-mesh", how: "Plans to read quads to know which mesh vertices still stand." },
      { id: "chunk-streaming", how: "Quads live per chunk and are cached when it unloads." },
    ],

    questions: [
      "Feature tagging: should top-level quads carry a feature ID so \"destroy the asteroid\" is checkable for free?",
      "Does a re-hardened lithon reset to full health when the health layer exists?",
      "Make the CPU/GPU split explicit to players? Ships pass through moving sand but bounce off the same grains once they harden.",
    ],

    sparks: [
      "Stability as score: the largest quad you kept intact through a siege.",
      "Visible age rings: outline quads by level so old, solid ground reads differently from fresh fill.",
      "Ramming as mining once impact cracks reach the health layer.",
      "Statues that shatter into their own pixels and pile up as scrambled fragments of the art.",
    ],

    terms: [
      { term: "Quad", def: "A power-of-two square of one stable material, 4 to 256 WU.", code: "TerrainQuad" },
      { term: "Quad key", def: "level·65536 + y·256 + x in chunk-local units.", code: "TerrainQuad.key" },
      { term: "Pre-gen", def: "Load-time quad build for authored terrain, skipping the stability wait.", code: "terrain_quad_pregen.lua" },
      { term: "Formation", def: "The minimum count of solid cells around a contact for it to count as terrain.", code: "minFormationSize" },
      { term: "Health layer", def: "Planned per-lithon health in the terrain properties G channel.", code: "TerrainPropertiesBuilder (G = 255)" },
    ],

    sources: [
      "shmuprouge:engine/physics/sand/terrain_quad.lua",
      "shmuprouge:engine/physics/sand/terrain_quad_merger.lua",
      "shmuprouge:engine/physics/sand/terrain_quad_splitter.lua",
      "shmuprouge:engine/physics/sand/terrain_quad_pregen.lua",
      "shmuprouge:engine/physics/sand/terrain_properties_builder.lua",
      "shmuprouge:engine/ecs/components/terrain_collider.lua",
      "shmuprouge:engine/physics/collision/terrain_collision_util.lua",
      "shmuprouge:shared/data/combat/TerrainCollision.json",
      "shmuprouge:ige/tile_writer.lua",
      "shmuprouge:docs/engine/rendering/Terrain_Quad_System_Specification_v0_5.md",
      "shmuprouge:docs/engine/rendering/Material_Health_Layer_Specification_v0_1.md",
    ],

    toy: {
      title: "Carve the quad map",
      hint: "drag to carve; switch to rock and drag to fill",
      caption: "Two 64-cell chunks (the game's are 256 WU). Lithons are 4 cells; new ones appear at a scan every 0.5 s (the game waits 2 s); at most 4 merges a frame, flashing gold. Carving splits every quad it touches down to lithons.",
      w: 384, h: 216,
      controls: [
        { type: "select", key: "tool", label: "tool", value: "carve", options: [["carve", "carve"], ["rock", "rock"]] },
        { type: "range", key: "budget", label: "merges/frame", min: 1, max: 16, value: 4 },
        { type: "button", label: "rebuild", press(S) { S.q.clear(); scan(S); while (mergeStep(S, 999)); } },
      ],
      init(S) {
        S.c = new Uint8Array(W * H); S.q = new Map(); S.t = 0; S.merges = 0; S.splits = 0; S.hover = null;
        const blobs = [[34, 34, 26], [92, 30, 22], [70, 54, 14]];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
          for (const [bx, by, r] of blobs) if (Math.hypot(x - bx, (y - by) * 1.1) < r + 3 * Math.sin(x * 0.3 + y * 0.2)) S.c[y * W + x] = 1;
        scan(S); while (mergeStep(S, 999)); // pre-gen: merged to completion
        brush(S, 40, 30, 6, 0);
      },
      update(S, P) {
        S.t++;
        if (S.t % 30 === 0) scan(S);
        mergeStep(S, P.budget);
      },
      pointer(e, S, P) {
        const x = Math.floor(e.x / CS), y = Math.floor(e.y / CS);
        S.hover = null;
        for (const q of S.q.values()) if (x >= q.x && x < q.x + size(q.lv) && y >= q.y && y < q.y + size(q.lv)) S.hover = q;
        if (e.down && y < H) brush(S, x, y, P.tool === "carve" ? 4 : 3, P.tool === "carve" ? 0 : 1);
      },
      draw(g, S) {
        const C = g.C, cols = [C.rule, C.ink3, C.teal, C.accent, C.sky];
        g.clear();
        for (let y = 0; y < H; y++) {
          let x = 0;
          while (x < W) { const v = S.c[y * W + x]; let e = x + 1; while (e < W && S.c[y * W + e] === v) e++; if (v) g.tone(x * CS, y * CS, (e - x) * CS, CS, 0.5, C.ink3); x = e; }
        }
        for (const q of S.q.values()) {
          const s = size(q.lv) * CS;
          if (q.lv > 0) g.tone(q.x * CS, q.y * CS, s, s, 0.08 * q.lv, cols[q.lv]);
          g.rect(q.x * CS, q.y * CS, s, s, S.t - q.born < 20 ? C.gold : cols[q.lv], q.lv > 1 ? 1 : 0.5);
        }
        g.line(CHUNK * CS, 0, CHUNK * CS, H * CS, C.violet, 1, [3, 3]);
        const hist = [0, 0, 0, 0, 0];
        for (const q of S.q.values()) hist[q.lv]++;
        for (let l = 0; l <= MAXLV; l++) {
          const x = 8 + l * 76;
          g.rect(x, 200, 10, 8, cols[l]);
          g.label(size(l) + ": " + hist[l], x + 14, 208, C.ink2);
        }
        if (S.hover) {
          const q = S.hover, cx = q.x % CHUNK, lvl = q.lv + 2;
          g.rect(q.x * CS, q.y * CS, size(q.lv) * CS, size(q.lv) * CS, C.ink, 1.5);
          g.label("key " + (lvl * 65536 + q.y * 256 + cx) + " (L" + lvl + ")", 250, 12, C.ink);
        }
      },
      readout(S) { return "quads " + S.q.size + "\nmerges " + S.merges + "  splits " + S.splits; },
    },
  });
})();
