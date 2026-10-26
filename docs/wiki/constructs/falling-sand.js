(function () {
  const { DIRMAP, blockRng, drawCells, margolus } = Sand;
  const W = 96, H = 54, CS = 4, FC = 6, FW = W / FC, FH = H / FC;
  // Cut-down copies of shared/data/world/materials/{sand,sandstone,water}.json
  const M = [{}, { loose: 1, d: 2 }, { stat: 1, d: 3 }, { loose: 1, liq: 1, d: 1, solvent: 1 }];
  const PLANET = { strength: 0.8, orbit: 0.05, maxD: 36, fullR: 0 }; // rocky_planet.json, distances scaled to the toy

  function buildField(S) {
    S.F = [];
    for (let fy = 0; fy < FH; fy++) for (let fx = 0; fx < FW; fx++) {
      const px = (fx + 0.5) * FC, py = (fy + 0.5) * FC;
      let sx = 0, sy = 0;
      for (const a of S.att) {
        const dx = a.x - px, dy = a.y - py, d = Math.hypot(dx, dy);
        if (d <= 1 || d >= PLANET.maxD) continue;
        const o = S.orbit, rx = dx / d, ry = dy / d, tx = -dy / d, ty = dx / d;
        let bx = rx * (1 - Math.abs(o)) + tx * o, by = ry * (1 - Math.abs(o)) + ty * o;
        const bl = Math.hypot(bx, by) || 1; bx /= bl; by /= bl;
        const st = d <= PLANET.fullR ? PLANET.strength : PLANET.strength * Math.max(0, 1 - (d - PLANET.fullR) / (PLANET.maxD - PLANET.fullR));
        sx += bx * st; sy += by * st;
      }
      const len = Math.hypot(sx, sy), amp = Math.min(len, 0.89);
      S.F.push(len > 0.001 ? [sx / len, sy / len, amp] : [0, 0, 0]);
    }
  }
  function blob(S, cx, cy, r, v) {
    for (let y = Math.max(0, cy - r); y <= Math.min(H - 1, cy + r); y++)
      for (let x = Math.max(0, cx - r); x <= Math.min(W - 1, cx + r); x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r + 0.5 && (v === 0 || !S.sim.c[y * W + x] || v === 2)) S.sim.c[y * W + x] = v;
  }

  Wiki.construct({
    id: "falling-sand",
    name: "Falling sand that floats: Margolus blocks with field gravity",
    family: "world",
    origin: "shmuprouge",
    status: "built",
    summary: "A cellular automaton that moves sand in 2×2 blocks, turning each block toward the local gravity vector, so one rule set gives floating dust in space, heaps on a planet and spirals round a black hole.",
    tags: ["cellular automaton", "gravity", "sand", "GPU"],

    intent:
      "<p>ShmupRouge's world is made of grains, one per pixel, and every grain should behave the same whether it is drifting in an asteroid field or piled on a planet. Writing separate physics for top-down space and side-on planets would split the game in two. Instead the sand rules are written once, in a block-local frame where \"down\" is whatever the [[flow-field-gravity|gravity field]] says it is at that spot.</p>" +
      "<p>The default gravity is zero, so in open space nothing falls and the screen reads as a top-down shooter. Fly into a planet's pull and the same grains start to heap toward its centre: the view becomes a side-scroller without a mode switch.</p>",

    how:
      "<h3>The block grid</h3>" +
      "<p>The sim is a fragment shader over 260×260 canvases, one per 256-WU chunk (1 cell = 1 WU = 1 texel). Each step, cells are grouped into 2×2 <b>Margolus blocks</b>; the grid offset alternates between (0,0) and (1,1) every step, so a grain can cross block boundaries over two steps. Every texel reads its whole block, runs the same deterministic rules with the same random number, and writes back only its own slot. The random number is one per block per step, sampled from a 128×128 blue-noise texture at <code>(blockIdx + frame·(17,31)) mod 128</code>. One step runs per rendered frame, so a free grain falls about 60 cells a second.</p>" +
      "<h3>Gravity picks the block orientation</h3>" +
      "<p><code>getBlockMapping</code> takes the angle of the local gravity vector, splits it into a quarter-turn sector, and picks the lower or upper cardinal with probability <code>1 − t</code> / <code>t</code>, where <code>t</code> is the fraction across the sector. A pull 30° off vertical mostly chooses \"down\" and sometimes \"right\", which builds a slanted pile. The chosen direction remaps the four slots, so the rules below always see a block with gravity pointing at its bottom row.</p>" +
      "<div class=\"tbl-wrap\"><table><thead><tr><th>Direction</th><th>topL</th><th>topR</th><th>botL</th><th>botR</th></tr></thead><tbody>" +
      "<tr><td>right</td><td>0</td><td>2</td><td>1</td><td>3</td></tr><tr><td>down</td><td>0</td><td>1</td><td>2</td><td>3</td></tr>" +
      "<tr><td>left</td><td>1</td><td>3</td><td>0</td><td>2</td></tr><tr><td>up</td><td>2</td><td>3</td><td>0</td><td>1</td></tr></tbody></table></div>" +
      "<p>Before the rules, each block takes one of three branches: field amplitude ≥ 0.9 deletes every material (the event horizon of a [[black-holes|black hole]]); a gravity vector shorter than 0.01 leaves the block untouched (zero-g); anything else runs the rules.</p>" +
      "<h3>Strength sets direction, not probability</h3>" +
      "<p>Field amplitude is only a gate. Below 0.05 the shader falls back to the default gravity from <code>world/Terrain.json</code> (shipped as <code>gravityDirection: \"0\"</code>, which is no gravity at all); above it the field's direction is used and every loose grain moves on every eligible step. A weak planet and a strong one make sand fall at the same rate. <code>Flow_Field_Gravity.md</code> describes strength as \"the probability each particle follows gravity per tick\", giving a soft-drift band near planets; that is not built.</p>" +
      "<h3>The rules, in order</h3>" +
      "<p>\"Loose\" means a loose solid or any liquid. <b>R1/R2</b> a loose top cell drops into an empty cell below it. <b>R2b/R2c</b> a loose cell over a lighter liquid swaps with it (sand sinks through water). <b>R3/R4</b> a loose top cell whose cell below is full slides diagonally into the other bottom cell (R3 runs first, a slight bias the alternating grid hides). <b>R5</b> a top-row liquid over a full bottom row slides sideways; <b>R6</b> a bottom-row liquid that was already there at block start slides into an empty neighbour (left/right are swapped when the block's random number is ≥ 0.5, to avoid V-shaped pools). <b>R7</b> chemistry: see [[reactivity-chemistry]]. <b>R8</b> a denser liquid above a lighter one swaps. Static rock and gas never move: there is no gas rule at all.</p>" +
      "<h3>What falls out of it</h3>" +
      "<p>The shader also writes a distance-to-empty value into the cell's G channel every step, which [[material-fx|interior darkening]] reads. Blocks that stay unchanged feed the [[stability-and-debris|settle and harden]] lifecycle, and loose cells are what the ship's harvester vacuums up: every loose cell (liquids included) in a 17×17 box round the ship each frame goes into the [[harvest-bar]].</p>",

    knobs: [
      ["Default gravity", "\"0\" (none)", "Gravity outside any field source; off means sand floats", "world/Terrain.json gravityDirection"],
      ["Field gate", "amp < 0.05", "Below this the default gravity is used", "simulation_constants.lua getGravityAt"],
      ["Event horizon", "amp ≥ 0.9", "Every cell in the block is deleted", "EVENT_HORIZON_THRESHOLD"],
      ["Material phase, density, loose", "per material", "Which rules a cell takes part in", "shared/data/world/materials/*.json"],
      ["Colour variants", "3 per material", "Variant ID = baseId·3 + colour index, so at most 85 materials", "COLORS_PER_MATERIAL"],
    ],

    related: [
      { id: "flow-field-gravity", how: "Supplies the per-block direction and the amplitude gates." },
      { id: "stability-and-debris", how: "Blocks that stop changing harden into rock." },
      { id: "material-properties", how: "The table that says which cells are loose, liquid or static." },
      { id: "harvest-bar", how: "Only loose cells can be vacuumed into the bar." },
      { id: "chunk-streaming", how: "The sim runs per 256-WU chunk with a 2-cell halo." },
    ],

    questions: [
      "Should amplitude scale move probability, as the doc promises? A one-line gate (<code>rng &lt; amp</code>) would give planets a soft-drift atmosphere band.",
      "One step per frame ties fall speed to frame rate. Is a fixed sim rate worth the extra pass?",
      "Liquids move one cell sideways per step, so wide pools level slowly; <code>Water.json maxFlowDist</code> exists but the shader does not read it.",
      "Gas is the biggest missing verb: PLUME is phase GAS but not loose, so it never moves.",
    ],

    sparks: [
      "A rotate-the-world puzzle: one level-wide gravity dial, and every pile re-settles under the same rules.",
      "Two planets whose pulls cancel leave a floating, top-down no-man's-land between two side-scroller surfaces.",
      "Point gravity at 45° and sand alternates down and right: slides and ramps from nothing but the field.",
      "Cargo that floats on your hull in space starts falling off as you cross into a planet's field.",
    ],

    terms: [
      { term: "Margolus block", def: "The 2×2 group of cells the sand rules act on, on a grid whose offset alternates each step.", code: "simulation.lua blockIdx, Sand.frame" },
      { term: "Block mapping", def: "The remapping of a block's slots so its bottom row faces local gravity.", code: "getBlockMapping, getMappingForDir" },
      { term: "Loose", def: "A cell the automaton may move: loose solids and all liquids.", code: "Materials.isLoose" },
      { term: "Zero-g branch", def: "Blocks whose gravity vector is shorter than 0.01 are left untouched.", code: "simulation.lua length(grav) < 0.01" },
      { term: "Default gravity", def: "Gravity used where the field amplitude is below 0.05; zero in the shipped data.", code: "Terrain.json gravityDirection" },
    ],

    sources: [
      "shmuprouge:engine/physics/sand/chunk_shader/simulation.lua",
      "shmuprouge:engine/physics/sand/chunk_shader/simulation_physics.lua",
      "shmuprouge:engine/physics/sand/chunk_shader/simulation_constants.lua",
      "shmuprouge:engine/physics/sand/blue_noise.lua",
      "shmuprouge:shared/data/world/Terrain.json",
      "shmuprouge:engine/physics/sand/harvest_renderer.lua",
      "shmuprouge:docs/engine/physics/Sand_Physics_Streaming.md",
      "shmuprouge:docs/engine/physics/Flow_Field_Gravity.md",
    ],

    toy: {
      title: "Sand in space, sand on a planet",
      hint: "paint with the pointer; pick attractor to place a planet's pull",
      caption: "96×54 cells, one Margolus step per frame with the R1-R8 rules. The planet's pull is the real attractor formula on 6-cell field cells (the game uses 32-WU cells, bilinear). A hash replaces the blue-noise texture. Hover to see this step's 2×2 block grid.",
      w: 384, h: 216,
      controls: [
        { type: "select", key: "tool", label: "paint", value: "sand", options: [["sand", "sand"], ["water", "water"], ["rock", "rock (static)"], ["att", "attractor"], ["erase", "erase"]] },
        { type: "select", key: "def", label: "default gravity", value: "off", options: [["off", "off (shipped)"], ["s", "south"]] },
        { type: "range", key: "orbit", label: "orbit", min: -100, max: 100, value: 5, fmt: (v) => (v / 100).toFixed(2) },
        { type: "toggle", key: "field", label: "field", value: true },
        { type: "button", label: "clear attractors", press(S) { S.att = []; buildField(S); } },
      ],
      init(S, P) {
        S.sim = { c: new Uint8Array(W * H), W, H, M, frame: 0 };
        S.att = [{ x: 66, y: 28 }]; S.orbit = P.orbit / 100; buildField(S);
        blob(S, 66, 28, 8, 2);
        const seeds = [[14, 40, 4], [22, 14, 3], [36, 30, 3], [80, 8, 3], [88, 44, 3], [52, 46, 3], [8, 22, 3]];
        for (const [x, y, r] of seeds) blob(S, x, y, r, 1);
        blob(S, 46, 12, 2, 3);
        S.moved = 0; S.hx = -1;
      },
      change(key, S, P) { if (key === "orbit") { S.orbit = P.orbit / 100; buildField(S); } },
      update(S, P) {
        const def = P.def === "s" ? [0, 1, 0] : [0, 0, 0];
        const before = S.sim.c.slice();
        margolus(S.sim, (x, y) => {
          const f = S.F[Math.min(FH - 1, (y / FC) | 0) * FW + Math.min(FW - 1, (x / FC) | 0)];
          return f[2] < 0.05 ? def : f;
        });
        let n = 0; for (let i = 0; i < before.length; i++) if (before[i] !== S.sim.c[i]) n++;
        S.moved = n;
      },
      pointer(e, S, P) {
        const x = Math.floor(e.x / CS), y = Math.floor(e.y / CS);
        S.hx = x; S.hy = y;
        if (e.type === "up") { S.drag = null; return; }
        if (!e.down) return;
        if (P.tool === "att") {
          if (e.type === "down") {
            S.drag = S.att.find((a) => Math.hypot(a.x - x, a.y - y) < 5);
            if (!S.drag) { S.att.push({ x, y }); if (S.att.length > 3) S.att.shift(); S.drag = S.att[S.att.length - 1]; }
          }
          if (S.drag) { S.drag.x = Math.max(0, Math.min(W - 1, x)); S.drag.y = Math.max(0, Math.min(H - 1, y)); buildField(S); }
          return;
        }
        blob(S, x, y, 2, { sand: 1, rock: 2, water: 3, erase: 0 }[P.tool]);
      },
      draw(g, S, P) {
        const C = g.C;
        g.clear();
        if (P.field) for (let fy = 0; fy < FH; fy++) for (let fx = 0; fx < FW; fx++) {
          const f = S.F[fy * FW + fx], cx = (fx + 0.5) * FC * CS, cy = (fy + 0.5) * FC * CS;
          if (f[2] >= 0.05) g.arrow(cx - f[0] * 6, cy - f[1] * 6, cx + f[0] * 6, cy + f[1] * 6, C.rule, 1, 4);
          else g.rect(cx - 0.5, cy - 0.5, 1, 1, C.rule);
        }
        drawCells(g, S.sim, CS, (v) => [null, C.gold, C.ink3, C.sky][v]);
        for (const a of S.att) {
          g.circle(a.x * CS, a.y * CS, PLANET.maxD * CS, C.violet, 0.5);
          g.circle(a.x * CS, a.y * CS, 3, C.violet);
        }
        if (S.hx >= 0) {
          const ph = S.sim.frame & 1, x0 = S.hx - 5, y0 = S.hy - 5;
          for (let y = y0; y < y0 + 10; y++) for (let x = x0; x < x0 + 10; x++)
            if (((x - ph) & 1) === 0 && ((y - ph) & 1) === 0) g.rect(x * CS, y * CS, 2 * CS, 2 * CS, C.ink2, 0.5);
        }
      },
      readout(S) { return "cells changed/step " + S.moved + "\nblock phase " + (S.sim.frame & 1) + "   attractors " + S.att.length; },
    },
  });
})();
