(function () {
  // 1 logical px = 2 WU. Terrain cells are 6 px (12 WU); 1 = hardened rock (static), 2 = loose sand.
  const SW = 384, SH = 216, CC = 6, GW = SW / CC, GH = SH / CC, MAXD = 200, MOUNT = 6, RANGE = 100;
  const TAU = Math.PI * 2, norm = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const cell = (S, x, y) => (x < 0 || y < 0 || x >= SW || y >= SH ? 0 : S.g[Math.floor(y / CC) * GW + Math.floor(x / CC)]);
  function march(S, x, y, a) { // castRayLOS: step 2 WU, stop at the first static cell
    const dx = Math.cos(a), dy = Math.sin(a);
    for (let d = 0; d <= MAXD; d += 1) if (cell(S, x + dx * d, y + dy * d) === 1) return d;
    return MAXD;
  }
  function paint(S, px, py, v) {
    const cx = Math.floor(px / CC), cy = Math.floor(py / CC);
    for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) if (x >= 0 && y >= 0 && x < GW && y < GH) S.g[y * GW + x] = v;
  }

  Wiki.construct({
    id: "spatial-awareness",
    name: "Spatial awareness: who can see whom",
    origin: "shmuprouge",
    status: "partial",
    statusNote: "Built: 64 visibility rays from the player each frame and turrets that wake only when seen. Spec only: the overlapping-cell spatial grid, front/rear analytics, tiered updates, arc queries and NPC-to-NPC awareness.",
    summary: "Each frame 64 rays are cast from the player against hardened terrain; an enemy is awake only if it sits closer than the wall in its ray's sector, so seeing and being seen are one test.",
    tags: ["perception", "line of sight", "stealth", "turrets"],

    intent:
      "<p>A turret that shoots through rock feels unfair, and one that ignores you while you stare at it feels broken. ShmupRouge settles both with one cheap rule centred on the player: if you could see it, it is awake. Terrain becomes cover, and only <em>hardened</em> terrain counts, which ties perception to the [[stability-and-debris|settle and harden]] lifecycle: fresh sand and falling debris do not hide you until they set.</p>",

    how:
      "<h3>Rays</h3>" +
      "<p><code>SpatialIndexSystem</code> casts <code>RAY_COUNT</code> = 64 rays (5.625° apart) from the player every frame, out to <code>MAX_RAY_DISTANCE</code> = 400 WU in steps of <code>RAY_STEP_SIZE</code> = 2 WU, wrapping across the toroidal world. A ray stops at the first cell where <code>blocksLOS(mat) = Materials.isStatic(mat)</code>, reading the CPU persistent overlay: authored and hardened terrain, minus acid holes and black-hole clears. Loose sand, liquids and freshly blasted ground are invisible to it.</p>" +
      "<h3>Who is visible</h3>" +
      "<p>For every turret in the LOADED region within 400 WU, the system finds the ray whose sector contains it, <code>floor(angle / step)</code>, and calls it visible if <code>dist − mountRadius &lt; ray.distance</code> (mount radius 12 WU). <code>TurretAISystem</code> returns early for any turret not visible: no turning, no firing. A visible turret turns at 3 rad/s, reaching ±135° from its mounting direction (<code>rotationArc</code> 2.356), and fires when its aim error is under 0.1 rad, the player is within <code>firingRange</code> 200 WU, and its cooldown allows.</p>" +
      "<p>Visibility is sector-based, not exact: a turret just behind a thin pillar but inside a ray's angular bin is judged by that one ray. 400 WU is less than the 640-WU screen width, so a turret can be on screen and still asleep. The test is symmetric by construction: the turret sees you exactly when you see it.</p>" +
      "<h3>Front and rear</h3>" +
      "<p>Each ray is tagged front or rear of the player's facing. The code uses ±135° (<code>THREE_QUARTER_PI</code>); <code>Spatial_Awareness_System.md</code> says ±90°. The tag is computed and nothing reads it yet; the doc wants it for fairness analytics, such as softening attacks from behind on easy.</p>" +
      "<h3>The spec beyond it</h3>" +
      "<p>The same doc plans an overlapping-cell grid (stride s, cells 1.5s wide, 1–4 inserts per entity, single-cell queries), arc queries, tiered update rates, Midge integration and NPC-to-NPC awareness, with the ray constants made configurable. The live broad phase is still the string-keyed <code>SpatialHash</code>.</p>",

    knobs: [
      ["Rays", "64", "Angular resolution of the sectors", "RAY_COUNT (hard-coded)"],
      ["Ray step", "2 WU", "March step", "RAY_STEP_SIZE"],
      ["Range", "400 WU", "How far the player sees, and so wakes turrets", "MAX_RAY_DISTANCE"],
      ["Front arc", "±135° (doc ±90°)", "Front/rear tag on each ray", "THREE_QUARTER_PI"],
      ["Mount radius", "12 WU", "Slack so a turret on a wall still counts", "entities/Turret.json mountRadius"],
      ["Turret", "range 200, arc 2.356, 3 rad/s", "What a woken turret can do", "firingRange, rotationArc, rotationSpeed"],
    ],

    related: [
      { id: "stability-and-debris", how: "Decides what is hardened and therefore cover." },
      { id: "material-properties", how: "blocksLOS is simply isStatic." },
      { id: "chunk-streaming", how: "Only turrets in the LOADED region are tested." },
      { id: "fair-attack-contract", how: "The front/rear tag exists for fairness rules." },
      { id: "enemy-behaviours", how: "Visibility is the wake-up gate for turret behaviour." },
    ],

    questions: [
      "Should visibility be exact per target instead of per sector?",
      "Should range at least match the screen width, so nothing on screen sleeps?",
      "Which is right, ±90° or ±135°? Only one consumer would need to decide.",
      "Should other NPCs (Midges, spiders) use the same gate, or have their own senses?",
    ],

    sparks: [
      "Settle to hide: duck behind a fresh sand pile, which only hides you once it hardens two to four seconds later.",
      "Blast to expose: blowing the rock off a turret's face wakes it up.",
      "Light-cone stealth: invert it so NPCs cast the rays and the player has to stay in the dark.",
      "Rear-arc mercy: enemies behind the player hold fire a beat longer.",
    ],

    terms: [
      { term: "Visibility map", def: "The 64 rays' hit distances, rebuilt every frame from the player.", code: "SpatialIndexSystem.visibilityMap" },
      { term: "Ray sector", def: "The angular bin a target falls in; it is judged by that ray alone.", code: "rayIndex = floor(angle / ANGLE_STEP)" },
      { term: "blocksLOS", def: "Whether a material stops sight: only static materials do.", code: "TerrainCollisionUtil blocksLOS = Materials.isStatic" },
      { term: "Front hemisphere", def: "Rays within ±135° of the player's facing.", code: "isFrontHemisphere" },
    ],

    sources: [
      "shmuprouge:game/systems/spatial_index_system.lua",
      "shmuprouge:engine/physics/collision/terrain_collision_util.lua",
      "shmuprouge:game/systems/ai/turret_ai_system.lua",
      "shmuprouge:shared/data/entities/Turret.json",
      "shmuprouge:engine/physics/collision/spatial_hash.lua",
      "shmuprouge:docs/engine/Spatial_Awareness_System.md",
    ],

    toy: {
      title: "Rays against rock",
      hint: "drag the ship; paint rock (blocks) or loose sand (does not)",
      caption: "1 px = 2 WU: rays reach 400 WU, turrets fire within 200. Bright rays are the front arc. Red turrets are awake. Try \"exact\" to see where the 64 sectors disagree with true line of sight.",
      w: 384, h: 216,
      controls: [
        { type: "select", key: "tool", label: "paint", value: "rock", options: [["rock", "hardened rock"], ["sand", "loose sand"], ["erase", "erase"]] },
        { type: "range", key: "rays", label: "rays", min: 8, max: 128, step: 8, value: 64 },
        { type: "select", key: "arc", label: "front", value: "135", options: [["135", "±135° (code)"], ["90", "±90° (doc)"]] },
        { type: "select", key: "vis", label: "test", value: "sector", options: [["sector", "ray sector (built)"], ["exact", "exact"]] },
      ],
      init(S) {
        S.g = new Uint8Array(GW * GH); S.t = 0; S.drag = false; S.shots = [];
        const walls = [[20, 4, 2, 12], [40, 18, 10, 2], [28, 26, 2, 8], [8, 22, 8, 2], [52, 6, 2, 10]];
        for (const [x, y, w, h] of walls) for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) S.g[j * GW + i] = 1;
        for (let i = 30; i < 38; i++) S.g[10 * GW + i] = 2;
        S.p = { x: 192, y: 108, a: 0, manual: 0 };
        S.tur = [[60, 40], [300, 30], [350, 150], [200, 190], [90, 170], [140, 60], [250, 120], [30, 110], [330, 80]]
          .map(([x, y]) => ({ x, y, base: Math.atan2(108 - y, 192 - x), rot: Math.atan2(108 - y, 192 - x), on: false, cd: 0 }));
      },
      update(S, P, dt) {
        S.t += dt; const p = S.p, ox = p.x, oy = p.y;
        if (S.drag) p.manual = 1.5;
        else if ((p.manual -= dt) <= 0) { p.x = 192 + 120 * Math.cos(S.t * 0.4); p.y = 108 + 70 * Math.sin(S.t * 0.8); }
        if (Math.hypot(p.x - ox, p.y - oy) > 0.05) p.a = Math.atan2(p.y - oy, p.x - ox);
        const n = P.rays, step = TAU / n;
        S.rays = []; for (let i = 0; i < n; i++) S.rays.push(march(S, p.x, p.y, i * step));
        for (const t of S.tur) {
          const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy);
          let ang = Math.atan2(dy, dx); if (ang < 0) ang += TAU;
          t.on = d <= MAXD && (P.vis === "exact" ? march(S, p.x, p.y, ang) >= d - MOUNT : d - MOUNT < S.rays[Math.floor(ang / step) % n]);
          t.cd -= dt;
          if (!t.on) continue;
          const want = Math.atan2(-dy, -dx), off = norm(want - t.base);
          if (Math.abs(off) > 2.356) continue;
          t.rot += Math.max(-3 * dt, Math.min(3 * dt, norm(want - t.rot)));
          if (Math.abs(norm(want - t.rot)) < 0.1 && d <= RANGE && t.cd <= 0) { t.cd = 1.25; S.shots.push({ x: t.x, y: t.y, vx: Math.cos(t.rot) * 50, vy: Math.sin(t.rot) * 50, life: 2.5 }); }
        }
        for (const s of S.shots) { s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; if (cell(S, s.x, s.y) === 1) s.life = 0; }
        S.shots = S.shots.filter((s) => s.life > 0);
      },
      pointer(e, S, P) {
        if (e.type === "down") S.drag = Math.hypot(e.x - S.p.x, e.y - S.p.y) < 14;
        if (e.type === "up") { S.drag = false; return; }
        if (!e.down) return;
        if (S.drag) { S.p.x = Math.max(4, Math.min(SW - 4, e.x)); S.p.y = Math.max(4, Math.min(SH - 4, e.y)); }
        else paint(S, e.x, e.y, { rock: 1, sand: 2, erase: 0 }[P.tool]);
      },
      draw(g, S, P) {
        const C = g.C, p = S.p, n = P.rays, step = TAU / n, half = (Number(P.arc) * Math.PI) / 180;
        g.clear();
        for (let i = 0; i < S.g.length; i++) {
          const v = S.g[i], x = (i % GW) * CC, y = ((i / GW) | 0) * CC;
          if (v === 1) g.rect(x, y, CC, CC, C.ink3); else if (v === 2) g.tone(x, y, CC, CC, 0.5, C.gold);
        }
        (S.rays || []).forEach((d, i) => {
          const a = i * step, front = Math.abs(norm(a - p.a)) <= half;
          g.line(p.x, p.y, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, front ? C.sky : C.rule, front ? 0.75 : 0.5);
        });
        for (const t of S.tur) {
          g.wedge(t.x, t.y, 9, t.base - 2.356, t.base + 2.356, C.rule);
          g.circle(t.x, t.y, MOUNT, t.on ? C.enemy : C.ink3);
          g.line(t.x, t.y, t.x + Math.cos(t.rot) * 9, t.y + Math.sin(t.rot) * 9, t.on ? C.enemy : C.ink3, 2);
        }
        for (const s of S.shots) g.circle(s.x, s.y, 1.5, C.enemy);
        g.poly([[p.x + Math.cos(p.a) * 7, p.y + Math.sin(p.a) * 7], [p.x + Math.cos(p.a + 2.4) * 6, p.y + Math.sin(p.a + 2.4) * 6], [p.x + Math.cos(p.a - 2.4) * 6, p.y + Math.sin(p.a - 2.4) * 6]], C.ink);
      },
      readout(S) { return "turrets awake " + S.tur.filter((t) => t.on).length + "/" + S.tur.length + "\nloose sand never blocks sight"; },
    },
  });
})();
