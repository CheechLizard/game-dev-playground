(function () {
  const { DIRMAP, blockRng, drawCells, margolus } = Sand;
  // Six shipped materials (materials/*.json): name, colour key, sim props.
  const MATS = [
    ["SAND", "gold", { loose: 1, d: 2 }],
    ["SANDSTONE", "orange", { stat: 1, d: 3 }],
    ["WATER", "sky", { loose: 1, liq: 1, d: 1, solvent: 1 }],
    ["ACID", "accent", { loose: 1, liq: 1, d: 0.8, acidic: 1, soluble: 1 }],
    ["GUN_POWDER", "enemy", { loose: 1, d: 1.5, flag: 1 }],
    ["URANIUM", "teal", { stat: 1, d: 5, flag: 1 }],
  ];
  const M = [{}].concat(MATS.map((m) => m[2]));
  const N = MATS.length, W = 52, H = 54, CS = 4, OX = 176, MX = 44, MY = 58, MS = 20;
  // What happens when the row material lands on the column material, under the built rules.
  function verdict(a, b) {
    const A = MATS[a][2], B = MATS[b][2];
    if (A.stat) return ["static: stays put", A.flag ? 3 : 0];
    if (A.acidic && B.acidic) return ["mix", 0];
    if (A.acidic && B.solvent) return ["floats, dissolves", 2];
    if (A.solvent && B.soluble) return ["sinks, dissolves", 2];
    if (A.acidic && B.stat) return ["erodes 10%", 2];
    if (A.acidic && B.loose && !B.liq) return ["erodes 5%", 2];
    if (B.acidic && A.loose && !A.liq) return ["eroded 5%", 2];
    if (A.liq && B.liq) return [A.d > B.d ? "sinks" : "floats", 1];
    if (!A.liq && B.liq) return [A.d > B.d ? "sinks" : "floats", 1];
    if (A.liq && !B.liq) return ["pools", 1];
    if (A.flag || B.flag) return ["flag only", 3];
    return ["piles", 0];
  }
  function scene(S) {
    const c = S.sim.c, a = S.a + 1, b = S.b + 1; c.fill(0);
    if (M[b].stat) { for (let y = 38; y < H; y++) for (let x = 0; x < W; x++) c[y * W + x] = b; }
    else for (let y = 44; y < H; y++) for (let x = 0; x < W; x++) c[y * W + x] = b;
    if (M[a].stat) for (let y = 10; y < 20; y++) for (let x = 16; x < 36; x++) c[y * W + x] = a;
    S.pour = M[a].stat ? 0 : 520; S.ero = 0; S.dis = 0;
  }
  const count = (c, v) => { let n = 0; for (let i = 0; i < c.length; i++) if (c[i] === v) n++; return n; };

  Wiki.construct({
    id: "reactivity-chemistry",
    name: "Reactivities: chemistry as level design",
    family: "world",
    origin: "shmuprouge",
    status: "partial",
    statusNote: "Only acid erosion and dissolution are built, as hard-coded shader rules. The eight reactivities, the heat field, the effect profile and the biome primary/secondary scheme of <code>docs/world/Materials.md</code> v0.3 are spec only.",
    summary: "Every material gets one of eight reactivities and biomes are defined by a primary reactivity you learn first and a secondary one revealed later; today only acid eating rock and dissolving in water exists.",
    tags: ["chemistry", "materials", "biomes", "systemic"],

    intent:
      "<p>A falling-sand world earns its keep when materials do things to each other. The v0.3 materials design gives each material a <em>reactivity</em> so a biome can teach one rule (the swamp is acid) and later reveal a second (and it is alive). Each biome is a lesson in how its matter behaves, which turns chemistry into level design rather than decoration.</p>" +
      "<p>What exists is the first, smallest instance: acid that eats sand and rock, decays on its own, and turns to water when it touches water. Even that already makes water a shield and acid both a hazard and a tool.</p>",

    how:
      "<h3>Built: acid and dissolution (rule R7)</h3>" +
      "<p>Inside the [[falling-sand]] shader, after movement, each cell of a 2×2 block checks its two in-block orthogonal neighbours, using the block's one random number <code>r</code>:</p>" +
      "<ul><li><b>Dissolution:</b> a <code>soluble</code> cell beside a <code>solvent</code> cell becomes a copy of that solvent when <code>r &lt; 0.001</code>. ACID is soluble and WATER is a solvent, so acid turns into water.</li>" +
      "<li><b>Erosion:</b> an <code>acidic</code> cell deletes a loose solid neighbour when <code>r &lt; 0.05</code>, otherwise a static neighbour when <code>r &lt; 0.10</code>, otherwise deletes itself when <code>r &lt; 0.002</code>.</li></ul>" +
      "<p>The thresholds share one random number, so they are correlated: a block that erodes sand this step cannot also decay. The numbers are GLSL constants. <code>acid.json</code> carries <code>erosion {fallingChance 0.05, staticChance 0.10, decay 0.002}</code>, which match, and <code>dissolution.chance 0.20</code>, which does not: the shader uses 0.001 and reads neither. Physical layering comes from the movement rules, not chemistry: sand sinks through lighter liquid, and a denser liquid above a lighter one swaps (water 1.0 sinks below acid 0.8). Acid holes are synced back to the CPU overlay, so eroded rock stops blocking sight and collision.</p>" +
      "<p>The <code>explosive</code> and <code>radioactive</code> flags are packed into the material texture and never read; TNT's <code>explosionRadius</code> and the explosion chain keys (<code>chainDecay</code>, <code>maxChainDepth</code>) have no consumer. There is no temperature.</p>" +
      "<h3>Spec: eight reactivities (Materials.md v0.3)</h3>" +
      "<div class=\"tbl-wrap\"><table><thead><tr><th>Reactivity</th><th>Rule</th></tr></thead><tbody>" +
      "<tr><td>Stable</td><td>Does nothing; the baseline.</td></tr>" +
      "<tr><td>Flammable</td><td>Burns at <code>igniteTemp</code> and spreads heat.</td></tr>" +
      "<tr><td>Explosive</td><td>Instant AOE at <code>detonateImpact</code> or <code>detonateTemp</code>; chains.</td></tr>" +
      "<tr><td>Corrosive</td><td>Erodes neighbours: <code>erodeStrength</code> against <code>erosionResistance</code>.</td></tr>" +
      "<tr><td>Radioactive</td><td>An always-on damage field.</td></tr>" +
      "<tr><td>Conductive</td><td>Carries energy along connected paths; overloads.</td></tr>" +
      "<tr><td>Optical</td><td>Redirects beams.</td></tr>" +
      "<tr><td>Organic</td><td>Regrows, rots, and spawns NPCs at pile sizes 50 / 100 / 250.</td></tr>" +
      "</tbody></table></div>" +
      "<p>Heat would be an 8-bit field beside gravity, with heat capacity by state (gas 0.2, particle 0.4, liquid 0.6, solid 1.0, so ΔT = input / capacity), spread <code>ΔT·k·k_neighbour</code>, and convection rising against local gravity. Eight biomes of eight materials each (one slop, about three primary, two secondary, two flex) pair a primary and secondary reactivity: Asteroid Belt is Stable/Explosive (\"reach the mining charges\"), Volcanic Core Flammable/Explosive, Sunken Sprawl Conductive/Corrosive, Spore Forest Organic/Flammable (\"first forest fire\"). A system × reactivity matrix (heat, flow, rigid, pressure, energy, light, damage, spawn) lists which engine system handles each pairing. The spec's material names (states Solid/Particle/Liquid/Gas) do not match the 22 shipped materials or the code's <code>Phase</code> enum.</p>",

    knobs: [
      ["Dissolution chance", "0.001", "Chance per block-step that acid beside water becomes water", "DISSOLUTION_CHANCE (simulation_physics.lua)"],
      ["Erosion: loose", "0.05", "Acid deletes a loose solid neighbour", "GLSL constant; mirrored in acid.json erosion.fallingChance"],
      ["Erosion: static", "0.10", "Acid deletes a static neighbour", "GLSL constant; acid.json erosion.staticChance"],
      ["Acid decay", "0.002", "Acid deletes itself", "GLSL constant; acid.json erosion.decay"],
      ["acid.json dissolution", "0.20", "Not read by anything", "acid.json dissolution.chance"],
    ],

    related: [
      { id: "material-properties", how: "Owns the acidic, soluble and solvent flags." },
      { id: "falling-sand", how: "Chemistry is rule R7 of the same block pass." },
      { id: "zone-layers", how: "Biomes are where the primary and secondary reactivity would be assigned." },
      { id: "json-tunables", how: "The erosion numbers sit in JSON the shader never reads." },
    ],

    questions: [
      "Promote the GLSL constants to uniforms fed from <code>acid.json</code>, or delete the JSON keys so the data stops lying?",
      "Does the heat field live on the GPU beside the gravity texture, or as a coarse CPU grid like the flow field?",
      "What does radioactive do: contaminate, decay, or damage only entities?",
      "What is the Glitch Zone's secondary reactivity?",
    ],

    sparks: [
      "Primary/secondary reveal as a rule for any systemic game: the swamp is acid, and later you learn it is alive.",
      "Water as a shield: an acid spray dissolves on contact, so a moat stops a corrosive enemy.",
      "Organic piles that hatch enemies if you blast more than you collect.",
      "Heat capacity by state: gas pockets flash over while rock smoulders for seconds.",
    ],

    terms: [
      { term: "Reactivity", def: "One of eight behaviours a material has in the v0.3 spec (Stable, Flammable, Explosive, Corrosive, Radioactive, Conductive, Optical, Organic).", code: "docs/world/Materials.md (spec)" },
      { term: "Erosion", def: "An acidic cell deleting a loose (5%) or static (10%) neighbour.", code: "processChemicalReactions" },
      { term: "Dissolution", def: "A soluble cell beside a solvent becoming that solvent.", code: "DISSOLUTION_CHANCE" },
      { term: "Primary / secondary reactivity", def: "The rule a biome teaches first, and the one it reveals later.", code: "spec only" },
    ],

    sources: [
      "shmuprouge:engine/physics/sand/chunk_shader/simulation_physics.lua",
      "shmuprouge:shared/data/world/materials/acid.json",
      "shmuprouge:shared/data/world/materials/water.json",
      "shmuprouge:engine/physics/sand/readback_sync.lua",
      "shmuprouge:docs/world/Materials.md",
    ],

    toy: {
      title: "Drop one material on another",
      hint: "click a matrix cell: the row lands on the column",
      caption: "The box runs the shipped rules (movement plus R7) under south gravity. Matrix colours: green = a chemical reaction exists, dithered = layering only, red = only an unread flag. Switch the dissolution chance to the JSON's 0.2 to see what the data says should happen.",
      w: 384, h: 216,
      controls: [
        { type: "select", key: "dis", label: "dissolution", value: "0.001", options: [["0.001", "0.001 (shader)"], ["0.2", "0.2 (acid.json, unread)"]] },
        { type: "button", label: "drop again", press(S) { scene(S); } },
      ],
      init(S, P) {
        S.sim = { c: new Uint8Array(W * H), W, H, M, frame: 0, shade: 0.35, dissolve: 0.001 };
        S.a = 3; S.b = 1; scene(S);
      },
      update(S, P) {
        const c = S.sim.c, a = S.a + 1;
        S.sim.dissolve = Number(P.dis);
        if (S.pour > 0) for (let k = 0; k < 4; k++) { const x = 16 + ((k * 5 + S.sim.frame * 7) % 20); if (!c[x]) { c[x] = a; S.pour--; } }
        const acid0 = count(c, 4), water0 = count(c, 3), tot0 = c.reduce((s, v) => s + (v ? 1 : 0), 0);
        margolus(S.sim, () => [0, 1, 0]);
        const acid1 = count(c, 4), water1 = count(c, 3), tot1 = c.reduce((s, v) => s + (v ? 1 : 0), 0);
        if (water1 > water0) S.dis += water1 - water0;
        if (tot1 < tot0) S.ero += tot0 - tot1;
        S.acid = acid1;
      },
      pointer(e, S) {
        if (e.type !== "down") return;
        const r = Math.floor((e.y - MY) / MS), q = Math.floor((e.x - MX) / MS);
        if (e.x < OX && r >= 0 && q >= 0 && r < N && q < N) { S.a = r; S.b = q; scene(S); }
      },
      draw(g, S) {
        const C = g.C;
        g.clear();
        g.rect(OX - 1, 0, 1, 216, C.rule);
        g.label("lands on >", MX, MY - 14, C.ink3);
        for (let i = 0; i < N; i++) {
          g.rect(MX + i * MS + 6, MY - 8, 8, 4, C[MATS[i][1]]);
          g.rect(MX - 12, MY + i * MS + 8, 8, 4, C[MATS[i][1]]);
          for (let j = 0; j < N; j++) {
            const x = MX + j * MS, y = MY + i * MS, v = verdict(i, j)[1];
            if (v === 2) g.rect(x + 1, y + 1, MS - 2, MS - 2, C.accent);
            else if (v === 1) g.tone(x + 1, y + 1, MS - 2, MS - 2, 0.35, C.ink2);
            else if (v === 3) g.tone(x + 1, y + 1, MS - 2, MS - 2, 0.3, C.enemy);
            else g.rect(x + 1, y + 1, MS - 2, MS - 2, C.rule, 0.5);
          }
        }
        g.rect(MX + S.b * MS, MY + S.a * MS, MS, MS, C.ink, 1.5);
        const [txt] = verdict(S.a, S.b);
        g.label(MATS[S.a][0] + " on " + MATS[S.b][0], 8, 190, C.ink);
        g.label(txt, 8, 202, C.accent);
        drawCells(g, S.sim, CS, (v) => C[MATS[v - 1][1]], OX, 0);
      },
      readout(S) { return "cells eaten " + S.ero + "\nacid to water " + S.dis; },
    },
  });
})();
