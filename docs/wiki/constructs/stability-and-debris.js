(function () {
  const { DIRMAP, blockRng, drawCells, margolus } = Sand;
  const W = 96, H = 54, CS = 4, BW = W / 2, LW = W / 4, LH = Math.floor(H / 4);
  // 1 SAND (loose, hardens to SANDSTONE p 0.5), 2 SANDSTONE (static, crumbles to SAND)
  const M = [{}, { loose: 1, d: 2, hd: 2, solid: 1 }, { stat: 1, d: 3, cr: 1, solid: 1 }];
  const DEBRIS = { gravity: 450, friction: 0.99, svx: 5, svy: 10, life: 4, chance: 0.9, variance: 0.4, jitter: 60 };

  function pregen(S) {
    const c = S.sim.c;
    for (let x = 0; x < W; x++) {
      const top = 36 + Math.round(4 * Math.sin(x * 0.11) + 2 * Math.sin(x * 0.31));
      for (let y = top; y < H; y++) c[y * W + x] = 2;
    }
    for (let ly = 0; ly < LH; ly++) for (let lx = 0; lx < LW; lx++) if (lithonMat(S, lx, ly) === 2) S.lith[ly * LW + lx] = 1;
  }
  function lithonMat(S, lx, ly) {
    const c = S.sim.c, x = lx * 4, y = ly * 4, v = c[y * W + x];
    if (!v || !M[v].solid) return 0;
    return c[y * W + x + 2] === v && c[(y + 2) * W + x] === v && c[(y + 2) * W + x + 2] === v ? v : 0;
  }
  // Every 120 steps: terrain_quad_scanner.lua + terrain_quad_conversion.lua, at small scale.
  function scan(S, p) {
    const c = S.sim.c;
    for (let ly = 0; ly < LH; ly++) for (let lx = 0; lx < LW; lx++) {
      const b = ly * 2 * BW + lx * 2, i = ly * LW + lx;
      const still = !(S.chg[b] || S.chg[b + 1] || S.chg[b + BW] || S.chg[b + BW + 1]);
      const v = still ? lithonMat(S, lx, ly) : 0;
      if (!v) { S.lith[i] = 0; continue; }
      if (S.lith[i] || S.cool[i] > S.t) continue;
      if (M[v].hd && S.rand() > p) continue;
      S.lith[i] = 1;
      if (M[v].hd) for (let y = ly * 4; y < ly * 4 + 4; y++) for (let x = lx * 4; x < lx * 4 + 4; x++) if (c[y * W + x] === v) c[y * W + x] = M[v].hd;
    }
    S.chg.fill(0);
  }
  function blast(S, P, cx, cy) {
    const c = S.sim.c, r = P.radius, kit = S.rand;
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if (y < 0 || y >= H) continue;
      const wx = (x + W) % W, d = Math.hypot(x - cx, y - cy), v = c[y * W + wx];
      if (d > r) continue;
      if (v && kit() < DEBRIS.chance) {
        const sp = P.power * 150 * (0.6 + 0.6 * d / r) * (1 + (kit() * 2 - 1) * DEBRIS.variance);
        const nx = d > 0 ? (x - cx) / d : 0, ny = d > 0 ? (y - cy) / d : -1;
        S.parts.push({ x: x + 0.5, y: y + 0.5, vx: nx * sp + (kit() - 0.5) * DEBRIS.jitter, vy: ny * sp - kit() * DEBRIS.jitter,
          life: DEBRIS.life * (0.75 + 0.5 * kit()), m: M[v].cr || v });
      }
      c[y * W + wx] = 0;
    }
    for (let ly = Math.max(0, Math.floor((cy - r) / 4)); ly <= Math.min(LH - 1, Math.floor((cy + r) / 4)); ly++)
      for (let lx = Math.floor((cx - r) / 4); lx <= Math.floor((cx + r) / 4); lx++) {
        const i = ly * LW + ((lx + LW) % LW); S.lith[i] = 0; S.cool[i] = S.t + 120;
      }
  }
  function place(S, x, y, m) {
    const c = S.sim.c;
    for (const [dx, dy] of [[0, 0], [0, -1], [-1, 0], [1, 0], [-1, -1], [1, -1]]) {
      const px = (x + dx + W) % W, py = y + dy;
      if (py >= 0 && py < H && !c[py * W + px]) { c[py * W + px] = m; S.landed++; return; }
    }
  }
  function moveParts(S, dt) {
    const c = S.sim.c, solid = (x, y) => y >= H || (y >= 0 && c[y * W + ((x + W) % W)] !== 0);
    S.parts = S.parts.filter((p) => {
      p.vy += DEBRIS.gravity * dt; p.vx *= DEBRIS.friction; p.vy *= DEBRIS.friction;
      const ox = Math.floor(p.x), oy = Math.floor(p.y);
      p.x = (p.x + p.vx * dt + W) % W; p.y += p.vy * dt; p.life -= dt;
      const x = Math.floor(p.x), y = Math.floor(p.y), slow = Math.abs(p.vx) < DEBRIS.svx && Math.abs(p.vy) < DEBRIS.svy;
      if (p.life <= 0) { if (y >= 0 && y < H && !solid(x, y)) place(S, x, y, p.m); return false; }
      if (solid(x, y)) {
        if (slow) { place(S, ox, Math.min(oy, H - 1), p.m); return false; }
        if (solid(x, oy)) p.vx = -p.vx * 0.5;
        if (solid(ox, y)) p.vy = -p.vy * 0.5;
        p.x = ox + 0.5; p.y = oy + 0.5;
      } else if (slow && p.vy > 0 && y >= 0) { place(S, x, y, p.m); return false; }
      return true;
    });
  }

  Wiki.construct({
    id: "stability-and-debris",
    name: "Settle, harden, crumble: terrain with a memory",
    family: "world",
    origin: "shmuprouge",
    status: "built",
    statusNote: "The whole cycle is built. The falloff-based crumble (<code>damageRadius</code>) and ring damage exist only as unused code and spec; every live blast clears its full radius.",
    summary: "Loose sand that stays still for one 2-second window may harden into rock; a blast deletes a disc of terrain and throws it back out as loose debris that lands, settles and can harden again.",
    tags: ["destruction", "materials", "lifecycle", "debris"],

    intent:
      "<p>Destroyed ground in ShmupRouge heals if it is left alone and stays soft while it is being disturbed. That one rule ties three systems together without extra code: only <em>hardened</em> rock blocks line of sight, only <em>loose</em> material can be mined, and only hardened cells collide reliably with ships. \"Is this matter settled?\" decides what you can see, what you can collect and what the map looks like.</p>" +
      "<p>Explosions conserve most of their matter. A crater throws its contents as debris that flies, bounces, lands and re-enters the sand, so blasting rock produces a harvestable spray of loose grains, and you race the hardening clock to collect them.</p>",

    how:
      "<h3>Settle: the stability map</h3>" +
      "<p>Every sim step the GPU writes a 128×128 stability map per 256-WU chunk, one pixel per 2×2 cell block: R marks \"changed\" (any cell's variant ID differs before and after the step), G the top-left cell's variant, B \"eroded\". It is drawn with a lighten blend, so a change latches until cleared. Every <code>QUADTREE_UPDATE_INTERVAL</code> = 120 frames (about 2 s; the code comment says 1 s) a chunk's map is read back, two frames later, at most one chunk per frame, then cleared.</p>" +
      "<h3>Harden: lithons</h3>" +
      "<p>The CPU scanner looks at each 4×4-WU <b>lithon</b> (2×2 stability pixels). It is a valid candidate if none of the four pixels changed, all four share one base material, and that material is SOLID. Existing lithons that are no longer valid are removed. A new lithon is created only if it is not inside a larger quad, not on cooldown, and <code>math.random() ≤ hardening_probability</code>. SAND has p = 0.5, so a still patch hardens with 50% chance per scan, about 4 s on average. If the material has a <code>hardens_to</code>, every matching cell in the 4×4 is rewritten (SAND → SANDSTONE) with a deterministic dither <code>(x·7 + y·13) mod 3</code> and mirrored into the CPU persistent overlay, which is what sight and collision read. Lithons then merge into larger quads ([[destructible-terrain]]). The material check samples only the top-left cell of each 2×2, and a single jittering grain blocks its lithon for the whole window.</p>" +
      "<h3>Crumble: blast and debris</h3>" +
      "<p>A <code>terrain_damage</code> hit snapshots the area, then <code>clearRadius</code> empties every cell within the radius whatever its material or hardness. Quads in the blast rectangle split and every lithon in it gets a 2 s no-reharden cooldown (<code>AOE_COOLDOWN_TIME</code>). Each captured cell spawns a debris particle with chance 0.9, as its debris type (static cells become their <code>crumbles_to</code>):</p>" +
      "<ul><li>speed = <code>power · debrisSpeed · (0.6 + 0.6·d/r) · (1 ± variance)</code> radially outward, so outer cells fly faster; plus ±jitter/2 sideways and an upward bias of up to <code>jitter</code>;</li>" +
      "<li>life = <code>debrisLife · (0.75…1.25)</code>; each frame <code>v += gravity·450·dt</code> plus a weak pull from the [[flow-field-gravity|field]] (×10), then <code>v ×= 0.99</code>;</li>" +
      "<li>on a non-empty cell: if <code>|vx| &lt; 5</code> and <code>|vy| &lt; 10</code> it is placed in the first free of that cell, above, left, right, up-left, up-right; otherwise it bounces with restitution 0.5. In empty space it settles only when slow, falling and gravity is on; at end of life it is placed if its cell is empty, else lost.</li></ul>" +
      "<p>Placing writes a runtime overlay cell, so the grain re-enters the [[falling-sand]] sim as loose material that can harden again. Under the shipped zero gravity, debris in open space never settles mid-air: space blasts leave a floating dust cloud. A black hole's spawn <em>destabilises</em> instead: static cells within 100 WU turn into their <code>crumbles_to</code> without being removed. Acid holes are synced back through the stability map's B channel.</p>" +
      "<h3>Unused damage model</h3>" +
      "<p><code>DamageCalculator.damageRadius</code> crumbles a solid when <code>power·(1 − d/(0.7r)) &gt; 0.15</code> and displaces liquid above 0.5, with values in <code>combat/Damage.json</code>. No effect handler calls it. The <code>splashRadius = radius·4</code> ring is computed and ignored (\"ring damage deferred\" to the material health layer).</p>",

    knobs: [
      ["Stability window", "120 frames (2 s)", "How long a block must stay still before a scan", "QUADTREE_UPDATE_INTERVAL"],
      ["Lithon", "4×4 WU", "Smallest unit that hardens", "LITHON_SIZE, LITHON_LEVEL"],
      ["hardening_probability", "SAND 0.5", "Chance per scan that a still lithon converts", "materials/sand.json"],
      ["Re-harden cooldown", "2.0 s", "Blocked lithons after a blast", "AOE_COOLDOWN_TIME"],
      ["Blast", "radius 8, power 2", "Cleared disc and debris speed scale", "combat/effects/medium_explosion.json"],
      ["Debris", "speed 150, life 4, variance 0.4, jitter 60, chance 0.9", "How ejecta flies", "medium_explosion.json debris*"],
      ["Debris physics", "gravity 450, friction 0.99, settle 5/10", "Fall, drag and the slow-enough test", "combat/Debris.json"],
      ["Restitution", "0.5", "Bounce off solid cells", "combat/TerrainCollision.json"],
    ],

    related: [
      { id: "falling-sand", how: "Produces the change map, and settled debris continues as sand." },
      { id: "destructible-terrain", how: "Lithons merge into quads; blasts split them." },
      { id: "harvest-bar", how: "Only loose matter can be collected, so harvesting races the hardening scan." },
      { id: "spatial-awareness", how: "Only hardened rock blocks sight." },
      { id: "material-properties", how: "Owns hardens_to, crumbles_to and the probabilities." },
    ],

    questions: [
      "Should <code>hardness</code> matter? Today TNT and iron ore vanish identically.",
      "There is no \"unsupported rock falls\" rule: hardened cells float wherever they set. Is structural collapse wanted?",
      "Should debris in zero-g eventually settle, or is a lasting dust cloud the point?",
      "Is a whole-window, all-or-nothing scan right, or should stillness accumulate per lithon?",
    ],

    sparks: [
      "A mining race: blasted ore is collectable only while loose, and each scan re-hardens it at p, so speed is yield.",
      "Sand bridges: pour sand across a gap, hold still, and it sets into a wall; a fly-by's wake keeps it soft.",
      "Fortification by stillness: defenders hunker so their sand walls harden into cover; attackers keep them stirred.",
      "Ejecta burial that fails on purpose: debris landing on a turret does not hide you from it, because loose sand never blocks sight.",
    ],

    terms: [
      { term: "Stability map", def: "Per-chunk 128×128 texture latching which 2×2 blocks changed since the last scan.", code: "ChunkStabilityTracker" },
      { term: "Lithon", def: "The 4×4-WU minimum unit of hardened terrain.", code: "LITHON_SIZE, TerrainQuad at LITHON_LEVEL" },
      { term: "Hardening", def: "A still lithon converting to its material's hardens_to.", code: "TerrainQuadConversion" },
      { term: "Cooldown", def: "2 s after a blast during which a lithon cannot re-form.", code: "AOE_COOLDOWN_TIME" },
      { term: "Debris", def: "CPU ballistic particles that carry blasted cells and re-enter the grid.", code: "Debris, DebrisRenderer" },
      { term: "Persistent overlay", def: "The CPU copy of authored and hardened terrain that sight and collision read.", code: "OverlayManager" },
    ],

    sources: [
      "shmuprouge:engine/physics/sand/chunk_shader/stability.lua",
      "shmuprouge:engine/physics/sand/chunk_stability_tracker.lua",
      "shmuprouge:engine/physics/sand/terrain_quad_scanner.lua",
      "shmuprouge:engine/physics/sand/terrain_quad_conversion.lua",
      "shmuprouge:engine/physics/sand/terrain_quad_damage.lua",
      "shmuprouge:engine/physics/sand/readback_sync.lua",
      "shmuprouge:game/world/sandbox_damage_api.lua",
      "shmuprouge:game/world/sand/damage_calculator.lua",
      "shmuprouge:engine/physics/debris/debris_renderer.lua",
      "shmuprouge:engine/physics/debris/debris_collision.lua",
      "shmuprouge:shared/constants/init.lua",
      "shmuprouge:docs/engine/rendering/Terrain_Quad_System_Specification_v0_5.md",
      "shmuprouge:docs/design/World_Generation_Stack_Design_v0_1.md",
    ],

    toy: {
      title: "Let it settle, then blow it up",
      hint: "click to blast; watch the debris land and the gold sand turn to rock",
      caption: "Gold = loose SAND, dithered orange = SANDSTONE. Scans every 2 s at p 0.5 with the real lithon test; blasts clear the radius and throw 0.9 of the cells as debris. South gravity (the game's default is none); the box is 96 WU wide, so power starts below the game's 2.",
      w: 384, h: 216,
      controls: [
        { type: "range", key: "p", label: "harden p", min: 0, max: 100, value: 50, fmt: (v) => (v / 100).toFixed(2) },
        { type: "range", key: "radius", label: "radius", min: 3, max: 14, value: 8 },
        { type: "range", key: "power", label: "power", min: 0.25, max: 2, step: 0.25, value: 1 },
        { type: "toggle", key: "lith", label: "lithons", value: true },
        { type: "button", label: "pour sand", press(S) { S.pour += 700; } },
      ],
      init(S, P, kit) {
        S.sim = { c: new Uint8Array(W * H), W, H, M, frame: 0, shade: 0.4, wrapX: true };
        S.chg = new Uint8Array(BW * (H / 2)); S.lith = new Uint8Array(LW * LH); S.cool = new Float64Array(LW * LH);
        S.parts = []; S.t = 0; S.pour = 900; S.rand = kit.rand; S.landed = 0; S.blasts = 0;
        pregen(S);
      },
      update(S, P, dt) {
        const c = S.sim.c;
        if (S.pour > 0) for (let k = 0; k < 6; k++) { const x = 20 + Math.floor(S.rand() * 56); if (!c[x]) { c[x] = 1; S.pour--; } }
        const before = c.slice();
        margolus(S.sim, () => [0, 1, 0]);
        moveParts(S, dt);
        for (let i = 0; i < c.length; i++) if (before[i] !== c[i]) S.chg[((i / W / 2) | 0) * BW + ((i % W) >> 1)] = 1;
        S.t++;
        if (S.t % 120 === 0) scan(S, P.p / 100);
        if (S.t === 420 && !S.blasts) { blast(S, P, 48, 38); }
      },
      pointer(e, S, P) { if (e.type === "down") { blast(S, P, e.x / CS, e.y / CS); S.blasts++; } },
      draw(g, S, P) {
        const C = g.C;
        g.clear();
        if (P.lith) for (let i = 0; i < S.chg.length; i++) if (S.chg[i]) g.tone((i % BW) * 8, ((i / BW) | 0) * 8, 8, 8, 0.12, C.enemy);
        drawCells(g, S.sim, CS, (v) => (v === 1 ? C.gold : C.orange));
        if (P.lith) for (let i = 0; i < S.lith.length; i++) {
          const x = (i % LW) * 16, y = ((i / LW) | 0) * 16;
          if (S.lith[i]) g.rect(x, y, 16, 16, C.ink3, 0.5);
          if (S.cool[i] > S.t) g.tone(x, y, 16, 16, 0.3, C.enemy);
        }
        for (const p of S.parts) g.rect(p.x * CS - 1, p.y * CS - 1, 2.5, 2.5, p.m === 1 ? C.gold : C.orange);
        const k = 1 - (S.t % 120) / 120;
        g.meter(300, 6, 76, 3, k, C.ink3);
        g.label("next scan", 300, 18, C.ink3);
      },
      readout(S) {
        let loose = 0, hard = 0; for (const v of S.sim.c) { if (v === 1) loose++; else if (v === 2) hard++; }
        return "loose " + loose + "  hardened " + hard + "\ndebris in flight " + S.parts.length + "  landed " + S.landed;
      },
    },
  });
})();
