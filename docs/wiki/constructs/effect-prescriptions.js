Wiki.construct({
  id: "effect-prescriptions",
  name: "Effect profiles and customer prescriptions",
  origin: "shmuprouge",
  status: "spec",
  statusNote: "Spec only (docs/world/Materials.md Parts 3, 8 and 9). The 64-material grid with effect vectors is written out in the doc, but no effectProfile exists in code or in the 22 material JSONs, and the doc's materials are not the ones the game uses.",
  summary: "Every material carries an eight-axis effect vector from -3 to +3, and side quests are customers asking for a profile, so what you mine is valued by what it does to people, not by weight.",
  tags: ["side quests", "vectors", "valuation", "materials"],

  intent:
    "<p>A material economy priced only by rarity flattens every material into a number. Effect profiles give each one a personality: Prismite is trippy and beautiful, Voltite wires you up, Cryogel numbs. Customers then ask for a feeling (\"something social and energetic\") rather than an item, so the player has to read materials and match them to a request.</p>" +
    "<p>It is the reason NPCs value matter at all: \"why NPCs value the material. The economic layer.\"</p>",

  how:
    "<h3>The eight axes</h3>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>Axis</th><th>-3</th><th>+3</th></tr></thead><tbody>" +
    "<tr><td>Energy</td><td>Comatose</td><td>Manic</td></tr><tr><td>Mood</td><td>Despair</td><td>Ecstatic</td></tr>" +
    "<tr><td>Focus</td><td>Cannot think</td><td>Tunnel vision</td></tr><tr><td>Social</td><td>Total isolation</td><td>No boundaries</td></tr>" +
    "<tr><td>Sensation</td><td>Numb</td><td>Overwhelmed</td></tr><tr><td>Perception</td><td>Hyperreal</td><td>Dissociated</td></tr>" +
    "<tr><td>Ego</td><td>No self-worth</td><td>God complex</td></tr><tr><td>Libido</td><td>Dormant</td><td>Insatiable</td></tr>" +
    "</tbody></table></div>" +
    "<h3>Reactivity sets the tendency</h3>" +
    "<p>A material's reactivity (see [[reactivity-chemistry]]) biases its profile: Flammable +Energy +Sensation; Corrosive -Mood +Perception; Explosive +Energy +Ego -Focus; Radioactive +Perception -Sensation; Conductive +Focus +Energy; Optical +Perception +Mood; Organic +Sensation +Social; Stable neutral. Each biome's material list then gives exact vectors, for example Voltite (Conductive) En +2, Fo +2, Se +1.</p>" +
    "<h3>Customer prescriptions</h3>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>Customer</th><th>Wants</th><th>Doc's example materials</th></tr></thead><tbody>" +
    "<tr><td>Party Host</td><td>+Social, +Energy</td><td>Pollenite, Charmite</td></tr>" +
    "<tr><td>Student</td><td>+Focus</td><td>Voltite, Obsidianite</td></tr>" +
    "<tr><td>Artist</td><td>+Perception, +Mood</td><td>Prismite, Sporeite</td></tr>" +
    "<tr><td>Athlete</td><td>+Energy, +Ego</td><td>Magmite, Burstite</td></tr>" +
    "<tr><td>Insomniac</td><td>-Energy, +Mood</td><td>Cryite, Glacite</td></tr>" +
    "<tr><td>Mourner</td><td>-Sensation</td><td>Cryogel, Numbsalt</td></tr>" +
    "<tr><td>CEO</td><td>+Ego, +Focus</td><td>Cellite, Mirrorite</td></tr>" +
    "<tr><td>Escapist</td><td>+Perception, -Sensation</td><td>Fractalite, Glowgut</td></tr>" +
    "</tbody></table></div>" +
    "<p>No matching or pricing rule is given. The doc's own examples are loose: Glowgut is Se +1, the opposite of the Escapist's -Sensation, and Cryite has Mood 0 for a customer who wants +Mood. Charmite and Numbsalt do not appear in the 64-material grid.</p>",

  knobs: [
    ["Axis range", "-3 to +3", "Scale of each effect axis", "Materials.md Part 3"],
    ["Axes", "8", "En, Mo, Fo, So, Se, Pe, Eg, Li", "effectProfile (spec name)"],
    ["Match rule", "TBD", "How a mix is scored against a request", "none"],
  ],

  related: [
    { id: "reactivity-chemistry", how: "Reactivity sets each material's effect tendencies." },
    { id: "material-properties", how: "The material JSONs that would carry the profile." },
    { id: "store-gambling", how: "The other way materials turn into value." },
    { id: "mission-system", how: "Prescriptions are side quests; the mission graph could host them." },
  ],

  questions: [
    "How is a delivery scored: must every named axis be positive, or is it a similarity to the request vector?",
    "Single materials or blends? If blends, do vectors add (and clip at ±3) or average?",
    "The doc lists 64 materials; the game has 22 different ones (SAND, IRON_ORE, TNT, ...). Which set is real?",
    "Does this sit beside the store's credit economy, or replace part of it?",
  ],

  sparks: [
    "Pay by dot product: price = the request vector dotted with what you deliver, so near misses still earn something.",
    "An alchemy bench where the player blends harvested materials to hit a target profile.",
    "Customers whose needs drift with the story, so a material's value rises and falls with the plot.",
    "Reuse the radar for any crafting game: ingredients as vectors, recipes as regions of the space.",
  ],

  terms: [
    { term: "Effect profile", def: "Spec: a material's eight-axis vector, -3..+3 each.", code: "effectProfile (spec; En/Mo/Fo/So/Se/Pe/Eg/Li)" },
    { term: "Customer prescription", def: "Spec: a side quest asking for a direction in effect space." },
    { term: "Effect tendency", def: "Spec: the axes a reactivity class pushes toward." },
  ],

  sources: [
    "shmuprouge:docs/world/Materials.md",
    "shmuprouge:shared/data/world/materials/",
  ],

  toy: {
    title: "Fill the prescription",
    hint: "click materials to add or remove them from the mix",
    caption: "Vectors are the doc's own. The mix averages the chosen materials; the score is cosine similarity with the request (+2 on wanted axes, -2 on unwanted), an invented rule since the doc gives none.",
    w: 384, h: 216,
    controls: [
      { type: "select", key: "cust", label: "customer", value: "party", reset: true, options: [
        ["party", "Party Host"], ["student", "Student"], ["artist", "Artist"], ["athlete", "Athlete"],
        ["insomniac", "Insomniac"], ["mourner", "Mourner"], ["ceo", "CEO"], ["escapist", "Escapist"]] },
    ],
    init(S, P) {
      // En Mo Fo So Se Pe Eg Li
      S.mats = [
        ["POLLENITE", [1, 1, -1, 2, 1, 1, 0, 1]], ["VOLTITE", [2, 0, 2, 0, 1, 0, 0, 0]], ["OBSIDIANITE", [0, 0, 2, -1, 0, -1, 1, 0]],
        ["PRISMITE", [0, 2, 0, 0, 1, 2, 0, 0]], ["SPOREITE", [0, 1, -1, 1, 1, 2, 0, 0]], ["MAGMITE", [3, 1, -1, 0, 2, 0, 1, 1]],
        ["BURSTITE", [2, 0, -1, 0, 1, 0, 2, 0]], ["CRYITE", [-2, 0, 1, -1, -1, 0, 0, -1]], ["GLACITE", [-1, 1, 1, 0, 0, -1, 0, 0]],
        ["CRYOGEL", [-2, 0, 0, 0, -2, 0, 0, -1]], ["CELLITE", [1, 0, 2, 0, 0, 0, 1, 0]], ["MIRRORITE", [0, 1, 1, 0, 0, 2, 1, 0]],
        ["FRACTALITE", [0, 1, -1, 0, 1, 3, 0, 0]], ["GLOWGUT", [0, -1, 0, 0, 1, 2, 0, 0]], ["GRITE", [0, 0, 0, 0, 0, 0, 0, 0]],
      ];
      const want = { party: { 3: 2, 0: 2 }, student: { 2: 2 }, artist: { 5: 2, 1: 2 }, athlete: { 0: 2, 6: 2 },
        insomniac: { 0: -2, 1: 2 }, mourner: { 4: -2 }, ceo: { 6: 2, 2: 2 }, escapist: { 5: 2, 4: -2 } }[P.cust];
      S.req = [0, 0, 0, 0, 0, 0, 0, 0]; for (const k in want) S.req[k] = want[k];
      S.pick = new Set(); S.t = 0;
    },
    pointer(e, S) {
      if (e.type !== "down") return;
      for (let i = 0; i < S.mats.length; i++) {
        const x = 8 + (i % 3) * 58, y = 36 + Math.floor(i / 3) * 34;
        if (e.x > x && e.x < x + 56 && e.y > y && e.y < y + 30) { if (S.pick.has(i)) S.pick.delete(i); else S.pick.add(i); }
      }
    },
    update(S, P, dt) { S.t += dt; },
    draw(g, S) {
      const C = g.C; g.clear();
      const cx = 288, cy = 116, R = 70, ax = ["EN", "MO", "FO", "SO", "SE", "PE", "EG", "LI"];
      const pt = (i, v) => { const a = -Math.PI / 2 + i * Math.PI / 4, r = (v + 3) / 6 * R; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
      for (const v of [-3, 0, 3]) g.poly(ax.map((_, i) => pt(i, v)), v === 0 ? C.ink3 : C.rule, 1, true);
      for (let i = 0; i < 8; i++) { const [x, y] = pt(i, 3.9); g.line(cx, cy, ...pt(i, 3), C.rule, 1); g.label(ax[i], x, y + 3, C.ink2, "center"); }
      g.poly(S.req.map((v, i) => pt(i, v)), C.accent, 2, true);
      const mix = this.mix(S);
      if (mix) { g.ctx.globalAlpha = 0.45; g.poly(mix.map((v, i) => pt(i, v)), C.gold); g.ctx.globalAlpha = 1; g.poly(mix.map((v, i) => pt(i, v)), C.gold, 1, true); }
      for (let i = 0; i < S.mats.length; i++) {
        const x = 8 + (i % 3) * 58, y = 36 + Math.floor(i / 3) * 34, on = S.pick.has(i);
        if (on) g.tone(x, y, 56, 30, 0.35, C.gold);
        g.rect(x, y, 56, 30, on ? C.gold : C.ink3, 1);
        g.label(S.mats[i][0], x + 3, y + 11, C.ink);
        // tiny bar glyph of the vector
        S.mats[i][1].forEach((v, k) => { g.rect(x + 4 + k * 6, y + 22 - Math.max(0, v) * 2, 4, Math.abs(v) * 2 || 0.5, v >= 0 ? C.accent : C.enemy); });
      }
      g.label("REQUEST", 376, 14, C.accent, "right"); g.label("MIX", 376, 24, C.gold, "right");
    },
    mix(S) {
      if (!S.pick.size) return null;
      const m = [0, 0, 0, 0, 0, 0, 0, 0];
      for (const i of S.pick) S.mats[i][1].forEach((v, k) => { m[k] += v / S.pick.size; });
      return m;
    },
    readout(S) {
      const m = this.mix(S);
      if (!m) return "pick materials\nscore -";
      let d = 0, a = 0, b = 0; for (let k = 0; k < 8; k++) { d += m[k] * S.req[k]; a += m[k] * m[k]; b += S.req[k] * S.req[k]; }
      const cos = a && b ? d / Math.sqrt(a * b) : 0;
      return "mix of " + S.pick.size + "\nmatch " + Math.round(cos * 100) + "%";
    },
  },
});
