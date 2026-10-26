(function () {
  const W = 96, H = 54, CS = 4;
  // Spec-only per-material FX weights (Material_Visual_FX_Specification_v0_1.md): [glow, liquidReflection, distortion]
  const FX = [null, [0, 0, 0], [0.8, 0, 0]];
  function rgb(hex, k) {
    const h = (hex || "#888888").replace("#", ""), n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16) || 0;
    return "rgb(" + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * k)).join(",") + ")";
  }
  // simulation_edge.lua: edge = filled with an empty 4-neighbour; else min(neighbour) + 1, capped at 127.
  function relax(S) {
    const c = S.c, d = S.d, n = S.d2;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!c[i]) { n[i] = 0; continue; }
      const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
      let edge = false, m = 127;
      for (const j of nb) { if (j < 0 || !c[j]) { edge = true; break; } m = Math.min(m, d[j]); }
      n[i] = edge ? 1 : Math.min(127, m + 1);
    }
    S.d = n; S.d2 = d;
  }
  function paint(S, cx, cy, r, v) {
    for (let y = Math.max(0, cy - r); y <= Math.min(H - 1, cy + r); y++)
      for (let x = Math.max(0, cx - r); x <= Math.min(W - 1, cx + r); x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) S.c[y * W + x] = v;
  }

  Wiki.construct({
    id: "material-fx",
    name: "Material FX: depth darkening and per-material shimmer",
    family: "feel",
    origin: "shmuprouge",
    status: "partial",
    statusNote: "Distance-to-empty interior darkening is built. The per-material FX weight texture (glow, liquid reflection, distortion) is spec only, and the hierarchical stability texturing it grew out of is superseded.",
    summary: "Every sand step also computes each cell's distance to the nearest empty cell, and the display darkens hardened interiors by that depth, so a mass reads as volume and its playable surface stays bright.",
    tags: ["rendering", "readability", "shader", "SDF"],

    intent:
      "<p>A world drawn one grain per pixel turns into flat noise unless the eye can tell surface from interior. Darkening rock by its depth makes the outer few cells, the ones you can shoot, mine and collide with, pop, while deep rock recedes. Because the depth comes from the sim itself it never lags behind destruction: blow a hole and the new walls brighten within a few frames.</p>" +
      "<p>The planned FX layer extends the same idea to hazard reading: a material that glows tells you it is hot or radioactive without a tooltip, and new materials get their shimmer from data rather than shader edits.</p>",

    how:
      "<h3>Built: distance-to-empty</h3>" +
      "<p>After the [[falling-sand]] rules, the shader writes a G channel per cell (<code>simulation_edge.lua</code>). Empty cells get 0. A filled cell with any empty 4-neighbour in the pre-step texture is an <b>edge</b>, distance 1; any other filled cell takes the minimum of its neighbours' distances plus one, capped at 127. It is stored as <code>(edgeBit + 2·dist)/255</code>. Because each step only looks at neighbours, the field converges about one cell per frame: a 20-deep interior settles in about 20 frames, and it never pulses with the 2 s stability clear.</p>" +
      "<p>The display shader computes <code>darken = clamp(dist / maxDepth, 0, 1) · intensity</code>, only for cells inside a hardened quad ([[destructible-terrain]]), and multiplies the colour by <code>1 − darken</code>. Liquids use the same distance for a surface sheen; autotiled zones skip darkening. Per biome, <code>darkening.{maxDepth, intensity}</code>: rocky and water planets 20 / 0.3, asteroid field 15 / 0.25, open space 20 / 0. The falloff is linear; the spec's <code>darkeningCurve</code> is not built. The distance is GPU-only: no CPU system can ask how deep a point is without a readback.</p>" +
      "<h3>Spec: material FX weights</h3>" +
      "<p><code>Material_Visual_FX_Specification_v0_1.md</code> has the sand pass also write a material-ID buffer, and a 256×1 texture hold three weights per material: R glow, G liquid reflection (caustics), B distortion. A post-process applies every effect to every pixel, scaled by weight, with no branching: <code>result += glow·fx.r; result += caustics·fx.g; result = mix(result, distorted, fx.b)</code>, with global <code>glowSpread</code>, <code>causticSpeed</code>, <code>causticTint</code> and <code>distortionScale</code>. WATER's example is {0, 0.8, 0.3}. It would replace the hard-coded <code>isWater()</code> caustics. None of it exists yet; every phase checkbox in the spec is open.</p>" +
      "<h3>Superseded: hierarchical stability texturing</h3>" +
      "<p><code>Hierarchical_Stability_Texturing.md</code> v0.3 made visual detail grow with how long terrain had been still: level 0 (2×2) flat at once, 4×4 at 1 s, up to 64×64 at 16 s, with edge light, bump-mapped interiors and five palette stops, so players would notice old ground when returning to places they had wrecked. It also proposed <em>stress</em>: destroyed blocks loading their siblings until they crumbled in a chain. The change-detection map and power-of-two merging survived into the quad system; the timed levels, bump lighting, <code>hardening_rate</code> and stress were dropped for a repeating 128-px material texture plus this darkening (v0.5). Stress propagation is still the best unbuilt idea for readable collapse.</p>",

    knobs: [
      ["maxDepth", "20 cells", "Depth at which darkening reaches full strength", "biomes/<biome>.json darkening.maxDepth"],
      ["intensity", "0.3", "How dark the deepest rock gets", "darkening.intensity"],
      ["Distance cap", "127", "Largest stored depth", "simulation_edge.lua"],
      ["FX weights (spec)", "per material", "Glow, liquid reflection, distortion", "visualFx.{glow, liquidReflection, distortion} (planned)"],
    ],

    related: [
      { id: "falling-sand", how: "The distance is written by the same shader pass." },
      { id: "destructible-terrain", how: "Darkening applies only inside hardened quads." },
      { id: "autotiling", how: "Tile art wins over material texture and darkening." },
      { id: "hit-feedback", how: "The other half of making events legible on screen." },
    ],

    questions: [
      "Expose the depth to the CPU so gameplay can use it: ore that spawns only deep, burrowers that keep to the crust?",
      "Is a curve worth adding, or does linear read well enough at 20 cells?",
      "Should FX weights animate, so a heating material visibly brightens before it ignites?",
    ],

    sparks: [
      "Depth-gated ore: a rare material that only spawns more than 30 cells in, so you have to dig.",
      "Glow as a gameplay telegraph: anything with glow above zero hurts, readable at a glance.",
      "A scanner upgrade that raises hidden materials' glow weight to reveal them.",
      "Sound muffled by depth, using the same distance field.",
    ],

    terms: [
      { term: "Distance-to-empty", def: "Each cell's step distance to the nearest empty cell, in the G channel.", code: "simulation_edge.lua" },
      { term: "Edge flag", def: "A filled cell with an empty 4-neighbour; distance 1.", code: "computeEdgeG" },
      { term: "Interior darkening", def: "Colour × (1 − clamp(dist/maxDepth)·intensity) inside quads.", code: "darkeningMaxDepth, darkeningIntensity" },
      { term: "FX weight texture", def: "Planned 256×1 texture of glow, reflection and distortion per material.", code: "MaterialVisualFxTexture (planned)" },
      { term: "Stress", def: "Superseded idea: destroyed blocks load their siblings until they crumble in a chain.", code: "Hierarchical_Stability_Texturing.md" },
    ],

    sources: [
      "shmuprouge:engine/physics/sand/chunk_shader/simulation_edge.lua",
      "shmuprouge:engine/physics/sand/chunk_shader/display.lua",
      "shmuprouge:engine/physics/sand/sand_renderer.lua",
      "shmuprouge:game/render_pipeline.lua",
      "shmuprouge:shared/data/world/biomes/rocky_planet.json",
      "shmuprouge:docs/design/Material_Visual_FX_Specification_v0_1.md",
      "shmuprouge:docs/engine/rendering/Hierarchical_Stability_Texturing.md",
      "shmuprouge:docs/engine/rendering/Terrain_Quad_System_Specification_v0_5.md",
    ],

    toy: {
      title: "Depth you can see",
      hint: "drag to dig; switch the tool to add rock or a glowing ore",
      caption: "One relaxation step per frame of the real edge/min+1 rule, so new walls brighten over a few frames. Colour × (1 − clamp(d/maxDepth)·intensity), quantised to 16 steps. The glow view is the unbuilt FX spec, applied branchlessly by weight.",
      w: 384, h: 216,
      controls: [
        { type: "range", key: "maxDepth", label: "maxDepth", min: 2, max: 40, value: 20 },
        { type: "range", key: "intensity", label: "intensity", min: 0, max: 100, value: 30, fmt: (v) => (v / 100).toFixed(2) },
        { type: "select", key: "view", label: "view", value: "dark", options: [["dark", "darkening (built)"], ["heat", "raw distance"], ["fx", "+ glow weight (spec)"]] },
        { type: "select", key: "tool", label: "tool", value: "dig", options: [["dig", "dig"], ["rock", "rock"], ["ore", "glowing ore"]] },
      ],
      init(S) {
        S.c = new Uint8Array(W * H); S.d = new Uint8Array(W * H); S.d2 = new Uint8Array(W * H); S.t = 0;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const r = Math.hypot((x - 48) / 1.6, y - 27);
          if (r < 23 + 2 * Math.sin(x * 0.4) + 2 * Math.cos(y * 0.5)) S.c[y * W + x] = Math.abs(y - 18 - 0.25 * x + Math.sin(x * 0.3) * 2) < 1.2 ? 2 : 1;
        }
        paint(S, 38, 30, 5, 0); paint(S, 44, 32, 4, 0);
      },
      update(S) { relax(S); S.t++; },
      pointer(e, S, P) {
        if (!e.down) return;
        paint(S, Math.floor(e.x / CS), Math.floor(e.y / CS), 3, { dig: 0, rock: 1, ore: 2 }[P.tool]);
      },
      draw(g, S, P) {
        const C = g.C, base = [null, C.orange, C.gold], md = P.maxDepth, it = P.intensity / 100;
        g.clear();
        for (let y = 0; y < H; y++) {
          let x = 0;
          while (x < W) {
            const i = y * W + x, v = S.c[i];
            const lvl = P.view === "heat" ? Math.min(15, S.d[i]) : Math.round(Math.min(1, S.d[i] / md) * it * 15);
            let e = x + 1;
            while (e < W && S.c[y * W + e] === v && (P.view === "heat" ? Math.min(15, S.d[y * W + e]) : Math.round(Math.min(1, S.d[y * W + e] / md) * it * 15)) === lvl) e++;
            if (v) {
              if (P.view === "heat") g.rect(x * CS, y * CS, (e - x) * CS + 0.3, CS + 0.3, rgb(C.sky, 0.15 + 0.85 * (1 - lvl / 15)));
              else g.rect(x * CS, y * CS, (e - x) * CS + 0.3, CS + 0.3, rgb(base[v], 1 - lvl / 15));
            }
            x = e;
          }
        }
        if (P.view === "fx") { // every cell gets glow · weight; weight 0 cells add nothing
          const pulse = 0.18 + 0.06 * Math.sin(S.t * 0.08);
          for (let i = 0; i < S.c.length; i++) {
            const w = S.c[i] ? FX[S.c[i]][0] : 0;
            if (w > 0) g.tone((i % W) * CS - 4, ((i / W) | 0) * CS - 4, CS + 8, CS + 8, pulse * w, C.gold);
          }
        }
      },
      readout(S) {
        let deep = 0; for (let i = 0; i < S.d.length; i++) deep = Math.max(deep, S.d[i]);
        return "deepest cell " + deep + "\nedge cells are distance 1";
      },
    },
  });
})();
