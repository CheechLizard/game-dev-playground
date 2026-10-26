(function () {
  // 1 logical px = 2 WU, so a 16 px field cell is the game's 32 WU cell.
  const SW = 384, SH = 216, FC = 16, FW = SW / FC, FH = Math.ceil(SH / FC);
  const wrapD = (d, L) => (d > L / 2 ? d - L : d < -L / 2 ? d + L : d); // toroidal shortest delta

  function attractor(a, px, py, orbit) { // gravity_computation.lua: radial/tangent blend, linear falloff
    const dx = wrapD(a.x - px, SW), dy = wrapD(a.y - py, SH), d = Math.hypot(dx, dy);
    if (d <= 1 || d >= a.maxD) return null;
    const o = orbit, rx = dx / d, ry = dy / d, tx = -dy / d, ty = dx / d;
    let bx = rx * (1 - Math.abs(o)) + tx * o, by = ry * (1 - Math.abs(o)) + ty * o;
    const bl = Math.hypot(bx, by) || 1;
    const st = d <= a.fullR ? a.strength : a.strength * Math.max(0, 1 - (d - a.fullR) / (a.maxD - a.fullR));
    return [bx / bl * st, by / bl * st, a.eh && d <= a.eh];
  }
  function build(S, P) { // GravityFlowField.rebuildCell: sum modifiers, cap 0.89 unless a modifier is extreme
    S.F = new Array(FW * FH);
    for (let fy = 0; fy < FH; fy++) for (let fx = 0; fx < FW; fx++) {
      const px = (fx + 0.5) * FC, py = (fy + 0.5) * FC;
      let sx = 0, sy = 0, ext = false;
      for (const a of S.att) {
        const m = attractor(a, px, py, P.orbital ? (a.bh ? 0.1 : P.orbit / 100) : 0);
        if (m) { sx += m[0]; sy += m[1]; ext = ext || m[2]; }
      }
      for (const w of S.waves) { // repulsor ring: linear falloff either side of the front
        const dx = wrapD(px - w.x, SW), dy = wrapD(py - w.y, SH), d = Math.hypot(dx, dy), off = Math.abs(d - w.r);
        if (d > 1 && off <= 64) { const f = w.s * (1 - off / 64); sx += dx / d * f; sy += dy / d * f; }
      }
      const len = Math.hypot(sx, sy);
      S.F[fy * FW + fx] = len <= 0.001 ? [0, 0, 0] : [sx / len, sy / len, ext ? 1 : Math.min(len, 0.89)];
    }
  }
  function sample(S, P, x, y) {
    const f = S.F[Math.min(FH - 1, Math.max(0, (y / FC) | 0)) * FW + Math.min(FW - 1, Math.max(0, (x / FC) | 0))];
    if (f[2] < 0.05) return P.def === "s" ? [0, 1, 0] : [0, 0, 0];
    return f;
  }
  function spawn(S, kit) { return { x: kit.rand() * SW, y: kit.rand() * SH, vx: 0, vy: 0 }; }

  Wiki.construct({
    id: "flow-field-gravity",
    name: "Gravity as a field: attractors, orbits and a perspective dial",
    family: "world",
    origin: "shmuprouge",
    status: "built",
    statusNote: "Built as one CPU-summed grid of 32-WU cells. The two-layer v2 design (GPU gravity tiles plus a fine atmospheric layer) is spec only, the shockwave repulsor is built but nothing spawns it, and ships and projectiles do not feel the field.",
    summary: "\"Down\" is a coarse grid of vectors summed from placeable sources, planets, black holes, ship wakes, so the same falling-sand rules make floating dust in space, heaps on a planet and spirals round a singularity.",
    tags: ["gravity", "field", "orbits", "perspective"],

    intent:
      "<p>Gravity in ShmupRouge is a level object, not a constant. A planet is a radial \"down\" well, a black hole is a spiral well with a kill core, and overlapping sources add up, so a designer builds a gravity landscape by placing things. Sand heaps on whichever side of a body faces its centre: side-scroller terrain wrapped round a sphere with no new physics.</p>" +
      "<p>The field is also a camera dial. With the shipped default of zero gravity, open space reads as a top-down shooter where matter floats; inside a planet's pull the same scene reads as a side-scroller. You fly from one to the other without a load or a mode switch.</p>",

    how:
      "<h3>One grid of modifiers</h3>" +
      "<p><code>GravityFlowField</code> covers the level with 32-WU cells (<code>FLOW_FIELD_CHUNK_SIZE</code>). Each source writes per-cell vectors under its own <code>modifierId</code> (an entity id, <code>planet_&lt;zone&gt;</code>, <code>wake_turbulence</code>) with <code>setModifier</code> / <code>clearModifier</code>, and only dirty cells are re-summed. A cell's result: sum the vectors; if any modifier is flagged <code>extreme</code>, amplitude is exactly 1.0, otherwise <code>min(|sum|, 0.89)</code>; sums under 0.001 delete the cell. The 0.89 cap means only flagged event-horizon cells can reach the 0.9 consume threshold. The grid is uploaded as a linearly filtered texture (R,G = direction, B = amplitude) that the sand shader samples per block.</p>" +
      "<h3>The attractor</h3>" +
      "<p>At each cell centre, with the toroidal shortest delta: <code>radial = (attractor − p)/d</code>, <code>tangent = (−dy, dx)/d</code>, direction = normalise(<code>radial·(1 − |orbit|) + tangent·orbit</code>). Strength is full inside <code>fullStrengthRadius</code> and falls linearly to 0 at <code>maxDistance</code>; nothing beyond it or within 1 WU. The modifier is <code>direction · strength</code>. Orbit 0.05 reads as a planet; 0.5 as a whirlpool; 1.0 is a ring that never lands.</p>" +
      "<div class=\"tbl-wrap\"><table><thead><tr><th>Source</th><th>maxDistance</th><th>strength</th><th>orbit</th></tr></thead><tbody>" +
      "<tr><td>Rocky / water planet (zone params)</td><td>2000</td><td>0.8</td><td>0.05</td></tr>" +
      "<tr><td>Gravity-gun [[black-holes|black hole]]</td><td>500</td><td>1.0</td><td>0.1, event horizon 50</td></tr>" +
      "<tr><td>Tutorial artifact</td><td>1000</td><td>1</td><td>1.0 (pure swirl)</td></tr>" +
      "</tbody></table></div>" +
      "<p>Planet attractors are written at zone spawn, before features, so authoring tools see the right \"down\": crater lakes fill toward local gravity. A <code>snapToCardinal</code> helper that would snap directions to 45° exists in <code>gravity_computation.lua</code> but nothing calls it; quantisation happens per block in the [[falling-sand]] shader instead.</p>" +
      "<h3>Strength is a gate</h3>" +
      "<p>The shader uses the field only where amplitude ≥ 0.05, and deletes everything where it is ≥ 0.9. Between those, amplitude does nothing: a weak planet and a strong one make sand fall at the same speed. Outside every source the default gravity from <code>world/Terrain.json</code> applies, shipped as none. Debris particles also read the field, weakly (<code>v += dir·amp·10·dt</code> against their own 450 WU/s² gravity); the player, NPCs and projectiles do not.</p>" +
      "<h3>The perspective dial</h3>" +
      "<p><code>Flow_Field_Gravity.md</code> describes strength 0–1 as the probability a grain follows gravity each tick, so 0.3 would drift gently in a planet's upper atmosphere, and describes collision layers switching between top-down and side-on. Neither is built: only the binary half of the dial (zero-g space, full-direction planet) exists.</p>" +
      "<h3>Other writers</h3>" +
      "<p>[[wake-turbulence|Ship wakes]] write vortex velocities into the same grid every frame. The <b>shockwave repulsor</b> is an expanding ring, radius <code>speed · elapsed</code>, pushing outward with <code>strength · (1 − |d − radius| / falloffWidth)</code>, rewritten only when the radius moves 8 WU or the faded strength 0.15 (<code>Shockwave.json</code>: speed 150, duration 4, strength 3, falloffWidth 128, fade 3). The system is complete but no code creates a repulsor, and <code>gravity_shockwave.lua</code> is dead code calling a function that no longer exists. Strength 3 is capped to 0.89 anyway, so the ring only overrides direction.</p>" +
      "<h3>The two-layer design (spec only)</h3>" +
      "<p><code>Flow_Field_Gravity.md</code> v2 and <code>Flow_Field_Two_Layer_Refactor.md</code> split the field into GPU-stamped gravity tiles at 64 WU per cell, stamped only when sources are added or removed, plus a viewport-local CPU atmospheric layer at 8 WU for wakes and shockwaves, summed in the shader. None of it exists; the files it would delete are still the live path. The docs also disagree on resolution (64, 16 and 32 WU); 32 is what runs.</p>",

    knobs: [
      ["Field cell", "32 WU", "Resolution of \"down\"; planets look faceted near the core", "FLOW_FIELD_CHUNK_SIZE"],
      ["Amplitude cap", "0.89", "Ceiling for non-extreme cells", "gravity_flow_field.lua"],
      ["Use-field gate", "amp ≥ 0.05", "Below this the default gravity applies", "getGravityAt"],
      ["Consume threshold", "0.9", "Event-horizon deletion", "EVENT_HORIZON_THRESHOLD"],
      ["Planet attractor", "2000 / 0.8 / 0.05", "maxDistance, strength, orbit", "zones/rocky_planet.json attractor*"],
      ["Default gravity", "\"0\" (none)", "Gravity outside every source", "world/Terrain.json gravityDirection"],
      ["Shockwave", "150 WU/s, 4 s, 3.0, 128", "speed, duration, strength, falloffWidth (unspawned)", "combat/Shockwave.json"],
    ],

    related: [
      { id: "falling-sand", how: "Reads the field per Margolus block to choose \"down\"." },
      { id: "black-holes", how: "An attractor whose core cells are flagged extreme and delete matter." },
      { id: "wake-turbulence", how: "Writes vortex velocities into the same grid." },
      { id: "solar-system-arena", how: "Planets as attractors are what make the arena a solar system." },
      { id: "chunk-streaming", how: "Distances wrap on the toroidal world." },
    ],

    questions: [
      "Should amplitude set move probability, giving the atmosphere band the doc promises?",
      "Should the player and NPCs feel the same field as the sand? It is listed as a TODO.",
      "Sources are rewritten only on register and fade; a moving planet would need per-frame rewrites, the v2 design's motivation.",
      "Should something spawn the shockwave, or should the system be removed?",
    ],

    sparks: [
      "Two-planet saddle: between two bodies the vectors cancel into a floating, top-down no-man's-land.",
      "Orbit strength as tone: one slider moves a level from planet (0.05) to hurricane (0.5) to an orbit ring that never lands (1.0).",
      "Gravity sculpting: a weapon that places short-lived attractors to heap enemy sand armour, then detonates it.",
      "Perspective-gated weapons: gravity bombs that only matter where the field is non-zero.",
    ],

    terms: [
      { term: "Flow field", def: "The grid of summed gravity vectors the sand reads as \"down\".", code: "GravityFlowField" },
      { term: "Modifier", def: "One source's per-cell contribution, keyed by its id.", code: "setModifier, clearModifier" },
      { term: "Attractor", def: "A source pulling toward a point with a radial/orbital blend.", code: "GravityAffector affectorType = \"attractor\"" },
      { term: "Orbit strength", def: "Blend from pure radial pull (0) to pure tangential swirl (±1).", code: "orbitStrength" },
      { term: "Extreme cell", def: "A cell inside an event horizon, forced to amplitude 1.", code: "setModifier(..., extreme)" },
      { term: "Repulsor", def: "An expanding outward-pushing ring; built, never spawned.", code: "affectorType = \"repulsor\"" },
    ],

    sources: [
      "shmuprouge:engine/physics/flow_field/gravity_flow_field.lua",
      "shmuprouge:engine/physics/flow_field/gravity_computation.lua",
      "shmuprouge:game/systems/gravity_affector_system.lua",
      "shmuprouge:engine/physics/sand/gravity_texture_sync.lua",
      "shmuprouge:engine/physics/sand/constants.lua",
      "shmuprouge:game/world/terrain/biomes.lua",
      "shmuprouge:shared/data/world/zones/rocky_planet.json",
      "shmuprouge:shared/data/combat/Shockwave.json",
      "shmuprouge:docs/engine/physics/Flow_Field_Gravity.md",
      "shmuprouge:docs/plans/Flow_Field_Two_Layer_Refactor.md",
      "shmuprouge:docs/levels/solar_system/",
    ],

    toy: {
      title: "Drag the wells",
      hint: "drag a well; click empty space to add one, or fire a shockwave",
      caption: "Arrows are the 32-WU cells (nearest sample; the game filters bilinearly). Dust is advected by v += dir·k·dt with v ×= 0.99, and deleted in the black hole's red event-horizon cells. The world wraps at both edges.",
      w: 384, h: 216,
      controls: [
        { type: "toggle", key: "orbital", label: "orbital", value: true },
        { type: "range", key: "orbit", label: "planet orbit", min: -100, max: 100, value: 5, fmt: (v) => (v / 100).toFixed(2) },
        { type: "select", key: "click", label: "click", value: "add", options: [["add", "adds a well"], ["wave", "fires a shockwave"]] },
        { type: "select", key: "def", label: "default", value: "off", options: [["off", "no gravity"], ["s", "south"]] },
      ],
      init(S, P, kit) {
        S.att = [
          { x: 262, y: 116, strength: 0.8, maxD: 150, fullR: 0 },
          { x: 92, y: 74, strength: 1.0, maxD: 110, fullR: 0, eh: 18, bh: 1 },
        ];
        S.waves = []; S.eaten = 0; S.drag = null;
        S.p = []; for (let i = 0; i < 500; i++) S.p.push(spawn(S, kit));
        build(S, P);
      },
      change(k, S, P) { build(S, P); },
      update(S, P, dt, kit) {
        for (const w of S.waves) { w.t += dt; w.r = 75 * w.t; w.s = 3 * Math.min(1, (4 - w.t) / 3); }
        S.waves = S.waves.filter((w) => w.t < 4);
        build(S, P);
        for (const q of S.p) {
          const f = sample(S, P, q.x, q.y);
          if (f[2] >= 0.9) { Object.assign(q, spawn(S, kit)); S.eaten++; continue; }
          q.vx = (q.vx + f[0] * 90 * dt) * 0.99; q.vy = (q.vy + f[1] * 90 * dt) * 0.99;
          q.x = (q.x + q.vx * dt + SW) % SW; q.y = (q.y + q.vy * dt + SH) % SH;
        }
      },
      pointer(e, S, P) {
        if (e.type === "up") { S.drag = null; return; }
        if (e.type === "down") {
          S.drag = S.att.find((a) => Math.hypot(a.x - e.x, a.y - e.y) < 14) || null;
          if (!S.drag && P.click === "wave") S.waves.push({ x: e.x, y: e.y, t: 0, r: 0, s: 3 });
          else if (!S.drag) { S.att.push({ x: e.x, y: e.y, strength: 0.8, maxD: 120, fullR: 0 }); if (S.att.length > 4) S.att.splice(2, 1); S.drag = S.att[S.att.length - 1]; }
        }
        if (S.drag && e.down) { S.drag.x = Math.max(0, Math.min(SW, e.x)); S.drag.y = Math.max(0, Math.min(SH, e.y)); }
      },
      draw(g, S, P) {
        const C = g.C;
        g.clear();
        for (let fy = 0; fy < FH; fy++) for (let fx = 0; fx < FW; fx++) {
          const f = S.F[fy * FW + fx], cx = (fx + 0.5) * FC, cy = (fy + 0.5) * FC;
          if (f[2] >= 0.9) { g.tone(fx * FC, fy * FC, FC, FC, 0.4, C.enemy); continue; }
          if (f[2] < 0.05) { g.rect(cx, cy, 1, 1, C.rule); continue; }
          const L = 3 + f[2] * 6;
          g.arrow(cx - f[0] * L, cy - f[1] * L, cx + f[0] * L, cy + f[1] * L, f[2] > 0.5 ? C.ink3 : C.rule, 1, 4);
        }
        for (const w of S.waves) g.circle(w.x, w.y, w.r, C.orange, 1);
        for (const q of S.p) g.rect(q.x - 0.75, q.y - 0.75, 1.5, 1.5, C.gold);
        for (const a of S.att) {
          g.circle(a.x, a.y, a.maxD, a.bh ? C.enemy : C.violet, 0.5);
          g.circle(a.x, a.y, a.bh ? 5 : 8, a.bh ? C.enemy : C.violet);
        }
      },
      readout(S) { return "wells " + S.att.length + "   shockwaves " + S.waves.length + "\neaten by the event horizon " + S.eaten; },
    },
  });
})();
