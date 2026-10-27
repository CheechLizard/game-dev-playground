(function () {
  const { DIRMAP, blockRng, drawCells, margolus } = Sand;
  // shared/data/world/materials/*.json, ids 0-21. col = palette key used by the toy.
  const T = [
    ["EMPTY", "VOID", 0, {}, "bg"],
    ["SANDSTONE", "SOLID", 3, { cr: 2, hard: 0.3 }, "orange"],
    ["SAND", "SOLID", 2, { loose: 1, hd: 1, p: 0.5 }, "gold"],
    ["WATER", "LIQUID", 1, { solvent: 1 }, "sky"],
    ["TNT", "SOLID", 2, { cr: 15, hard: 0.1, explosive: 1 }, "enemy"],
    ["ACID", "LIQUID", 0.8, { acidic: 1, soluble: 1 }, "accent"],
    ["PLUME", "GAS", 0.1, {}, "ink3"],
    ["RADIATION", "SOLID", 1.5, { hd: 14, p: 0.2, radioactive: 1 }, "teal"],
    ["GRANITE", "SOLID", 3, { cr: 11, hard: 0.7 }, "ink3"],
    ["BASALT", "SOLID", 3, { cr: 12, hard: 0.6 }, "violet"],
    ["IRON_ORE", "SOLID", 4, { cr: 13, hard: 0.8 }, "rose"],
    ["REGOLITH", "SOLID", 2, { loose: 1, hd: 8, p: 0.3 }, "ink2"],
    ["ASH", "SOLID", 1.5, { loose: 1, hd: 9, p: 0.3 }, "ink"],
    ["IRON_FILINGS", "SOLID", 3, { loose: 1, hd: 10, p: 0.4 }, "rose"],
    ["URANIUM", "SOLID", 5, { cr: 7, hard: 0.7, radioactive: 1 }, "teal"],
    ["GUN_POWDER", "SOLID", 1.5, { loose: 1, hd: 4, p: 0.4, explosive: 1 }, "enemy"],
    ["ENEMY_HULL", "SOLID", 2, { loose: 1 }, "enemy"],
    ["TURRET_METAL", "SOLID", 3, { loose: 1 }, "ink2"],
    ["PLAYER_HULL", "SOLID", 2, { loose: 1 }, "accent"],
    ["CHALK", "SOLID", 2, { cr: 12, hard: 0.4 }, "ink"],
    ["SKULLS", "SOLID", 2, { cr: 12, hard: 0.4 }, "ink2"],
    ["BRICKS", "SOLID", 2, { cr: 12, hard: 0.4 }, "orange"],
  ];
  // Derived exactly as materials.lua does: liquids are loose; static = solid with crumbles_to.
  const M = T.map(([, ph, d, o]) => ({
    d, liq: ph === "LIQUID" ? 1 : 0, loose: o.loose || ph === "LIQUID" ? 1 : 0, stat: ph === "SOLID" && o.cr ? 1 : 0,
    solid: ph === "SOLID", acidic: o.acidic, soluble: o.soluble, solvent: o.solvent, hd: o.hd, p: o.p, cr: o.cr,
  }));
  const W = 52, H = 54, CS = 4, OX = 176, BW = W / 2;
  const debris = (id) => (T[id][3].cr ? T[id][3].cr : M[id].loose ? id : 0);

  function scene(S, id) {
    const c = S.sim.c; c.fill(0); S.pour = 0; S.chg.fill(0); S.cool.fill(0); S.t = 0;
    const put = (x, y, v) => { if (x >= 0 && y >= 0 && x < W && y < H) c[y * W + x] = v; };
    if (M[id].stat) for (let y = 34; y < H; y++) for (let x = 0; x < W; x++) put(x, y, id);
    else if (M[id].loose) { for (let y = 46; y < H; y++) for (let x = 0; x < W; x++) put(x, y, 1); S.pour = 700; }
    else for (let y = 20; y < 34; y++) for (let x = 14; x < 38; x++) if ((x - 26) ** 2 / 144 + (y - 27) ** 2 / 49 < 1) put(x, y, id);
  }
  // The stability scan: 4x4 lithons, unchanged for the whole window, one solid material, then rand <= p.
  function scan(S) {
    const c = S.sim.c;
    for (let ly = 0; ly + 4 <= H; ly += 4) for (let lx = 0; lx + 4 <= W; lx += 4) {
      const b = (ly >> 1) * BW + (lx >> 1);
      if (S.chg[b] || S.chg[b + 1] || S.chg[b + BW] || S.chg[b + BW + 1]) continue;
      const v = c[ly * W + lx];
      if (!v || !M[v].solid || c[ly * W + lx + 2] !== v || c[(ly + 2) * W + lx] !== v || c[(ly + 2) * W + lx + 2] !== v) continue;
      if (S.cool[(ly >> 2) * 13 + (lx >> 2)] > S.t || !M[v].hd || S.rand() > M[v].p) continue;
      for (let y = ly; y < ly + 4; y++) for (let x = lx; x < lx + 4; x++) if (c[y * W + x] === v) { c[y * W + x] = M[v].hd; S.hard++; }
    }
    S.chg.fill(0);
  }

  Wiki.construct({
    id: "material-properties",
    name: "Material table: matter as data",
    origin: "shmuprouge",
    status: "built",
    statusNote: "Built and driving the sand sim. The <code>hardness</code>, <code>explosive</code> and <code>radioactive</code> fields are loaded but nothing reads them, and the GAS phase has no movement rule.",
    summary: "One JSON file per material sets its phase, density, flags and its two transitions, hardens_to and crumbles_to; code branches on those properties and never on a material's name.",
    tags: ["data-driven", "materials", "lifecycle"],

    intent:
      "<p>A designer should be able to add a rock, or change what a blasted wall leaves behind, without touching code. In ShmupRouge every system asks a material what it is (loose? static? acidic?) and never which one it is, so a new material gets correct falling, cover, harvesting and chemistry from its data alone.</p>" +
      "<p>The transitions turn the table into level design. What a weapon leaves behind, and what grows back if you leave it, is two fields per material.</p>",

    how:
      "<h3>The fields</h3>" +
      "<p><code>engine/physics/sand/materials.lua</code> loads <code>shared/data/world/materials/*.json</code>, each value wrapped in the editor schema (<code>{value, label, min, max}</code>, see [[json-tunables]]). Each material has an explicit <code>phase</code> (VOID, SOLID, LIQUID, GAS), a <code>density</code>, three colour variants, and optional flags. Two pairs are enforced by assertion: <code>hardens_to</code> needs <code>hardening_probability</code>, and <code>crumbles_to</code> needs <code>hardness</code>.</p>" +
      "<h3>Derived properties</h3>" +
      "<div class=\"tbl-wrap\"><table><thead><tr><th>Predicate</th><th>Rule</th><th>What reads it</th></tr></thead><tbody>" +
      "<tr><td><code>isLoose</code></td><td>loose flag, or any liquid</td><td>[[falling-sand]] movement, the harvester (liquids count)</td></tr>" +
      "<tr><td><code>isStatic</code></td><td>SOLID with a <code>crumbles_to</code></td><td>line of sight ([[spatial-awareness]]), black-hole destabilise, acid's 10% erosion</td></tr>" +
      "<tr><td>debris type</td><td><code>crumbles_to</code>, else itself if loose, else none</td><td>what a blast throws ([[stability-and-debris]])</td></tr>" +
      "</tbody></table></div>" +
      "<p>For the GPU the table is packed into a 256×1 texture indexed by variant ID: R holds phase, loose, rising and static bits; G the acidic, explosive, radioactive, soluble and solvent flags; B density × 10.</p>" +
      "<h3>The shipped loops</h3>" +
      "<p>Solids come in loose/static pairs: SAND ⇄ SANDSTONE (p 0.5), REGOLITH ⇄ GRANITE (0.3), ASH ⇄ BASALT (0.3), IRON_FILINGS ⇄ IRON_ORE (0.4), GUN_POWDER ⇄ TNT (0.4) and RADIATION ⇄ URANIUM (0.2). CHALK, SKULLS and BRICKS crumble to ASH, and ASH hardens to BASALT, so a brick wall that is blasted and left alone grows back as basalt. ENEMY_HULL, TURRET_METAL and PLAYER_HULL are loose solids with no transitions: the death debris of ships.</p>" +
      "<h3>Fields that do nothing yet</h3>" +
      "<p><code>hardness</code> is loaded but blasts ignore it: TNT and iron ore vanish identically. <code>explosive</code> and <code>radioactive</code> are packed into the texture and never read, and TNT's <code>explosionRadius</code>/<code>explosionPower</code> have no consumer. PLUME is GAS, but no shader rule moves gas. RADIATION is SOLID with no <code>loose</code> flag and no <code>crumbles_to</code>, so it is neither loose nor static: it hangs where it is spawned, cannot be harvested, does not block sight, and still hardens into URANIUM because the hardening scan only asks for a still solid. The design spec (<code>Material_Properties_Specification_v0_1.md</code>) wants one <code>Material.json</code> with a derived phase; the code uses one file per material with an explicit phase.</p>",

    knobs: [
      ["phase", "per material", "Which rules a cell takes part in", "materials/<name>.json phase"],
      ["loose", "per material", "Solid that falls and can be harvested", "loose"],
      ["hardens_to / hardening_probability", "SAND → SANDSTONE, 0.5", "What a still lithon becomes, and the chance per 2 s scan", "hardens_to, hardening_probability"],
      ["crumbles_to / hardness", "SANDSTONE → SAND, 0.3", "What a blasted static cell becomes; hardness is unused", "crumbles_to, hardness"],
      ["density", "SAND 2, WATER 1, ACID 0.8", "Sinking and liquid layering", "density"],
      ["Colour variants", "3", "Variant ID = id·3 + colour; caps the table at 85 materials", "COLORS_PER_MATERIAL"],
    ],

    related: [
      { id: "falling-sand", how: "Reads phase, loose and density every step." },
      { id: "stability-and-debris", how: "Runs the hardens_to and crumbles_to transitions." },
      { id: "reactivity-chemistry", how: "The acidic, soluble and solvent flags, and the bigger reactivity design." },
      { id: "harvest-bar", how: "Only isLoose cells can be collected; colours come from the table." },
    ],

    questions: [
      "Should <code>hardness</code> raise the crumble threshold per material, so weak weapons cannot scratch granite?",
      "What should radioactive mean? Uranium crumbles to radiation that hangs in the air and hardens back, so contamination grows; nothing hurts yet.",
      "Should hardened sand become a different, stronger rock to reward letting it settle?",
    ],

    sparks: [
      "Scars of past battles: walls of bricks regrow as basalt, so the map records every fight.",
      "Ore farming: blast iron ore into filings and collect them before each 2 s scan re-hardens them at p 0.4.",
      "A loose/static pair as a general rule for any destructible world: rubble that re-cements if no one disturbs it.",
      "Player-chosen solvents: a weapon upgrade that changes what is soluble in what.",
    ],

    terms: [
      { term: "Phase", def: "VOID, SOLID, LIQUID or GAS; set explicitly per material.", code: "Phase, materials/*.json phase" },
      { term: "Static", def: "A solid with a crumbles_to: never moves, blocks sight, collides.", code: "Materials.isStatic" },
      { term: "hardens_to", def: "The material a still lithon of this one turns into, with a chance per scan.", code: "hardens_to, hardening_probability" },
      { term: "crumbles_to", def: "The loose material a static cell becomes when blasted or destabilised.", code: "crumbles_to" },
      { term: "Variant ID", def: "baseId × 3 + colour index, stored in a cell's red channel.", code: "Materials.toVariantId" },
      { term: "Debris type", def: "What a blasted cell is thrown as: crumbles_to, itself if loose, else nothing.", code: "Materials.getDebrisType" },
    ],

    sources: [
      "shmuprouge:shared/data/world/materials/",
      "shmuprouge:engine/physics/sand/materials.lua",
      "shmuprouge:engine/physics/sand/material_properties_texture.lua",
      "shmuprouge:docs/design/Material_Properties_Specification_v0_1.md",
      "shmuprouge:docs/completed_plans/material_references.md",
    ],

    toy: {
      title: "Pick a material, watch its pair",
      hint: "pick a material; click or drag in the sand box to crumble static cells",
      caption: "The card is the real JSON. The box runs the Margolus rules under south gravity (the game's default is none), a 2 s hardening scan on 4×4 lithons, and crumbling under the pointer with a 2 s cooldown. Dithered cells are static.",
      w: 384, h: 216,
      controls: [
        { type: "select", key: "mat", label: "material", value: "2", reset: true, options: T.slice(1).map((t, i) => [String(i + 1), t[0]]) },
        { type: "button", label: "crumble all", press(S) { const c = S.sim.c; for (let i = 0; i < c.length; i++) if (M[c[i]].stat) { c[i] = M[c[i]].cr; S.crum++; } S.cool.fill(S.t + 120); } },
      ],
      init(S, P, kit) {
        S.sim = { c: new Uint8Array(W * H), W, H, M, frame: 0, shade: 0.35 };
        S.chg = new Uint8Array(BW * (H / 2)); S.cool = new Float64Array(13 * 14);
        S.rand = kit.rand; S.hard = 0; S.crum = 0;
        scene(S, Number(P.mat));
      },
      update(S, P) {
        const id = Number(P.mat), c = S.sim.c;
        if (S.pour > 0) for (let k = 0; k < 3; k++) { const x = 18 + Math.floor(S.rand() * 16); if (!c[x]) { c[x] = id; S.pour--; } }
        const before = c.slice();
        margolus(S.sim, () => [0, 1, 0]);
        for (let i = 0; i < c.length; i++) if (before[i] !== c[i]) S.chg[((i / W / 2) | 0) * BW + ((i % W) >> 1)] = 1;
        S.t++;
        if (S.t % 120 === 0) scan(S);
      },
      pointer(e, S) {
        if (!e.down || e.x < OX) return;
        const cx = Math.floor((e.x - OX) / CS), cy = Math.floor(e.y / CS), c = S.sim.c;
        for (let y = cy - 4; y <= cy + 4; y++) for (let x = cx - 4; x <= cx + 4; x++) {
          if (x < 0 || y < 0 || x >= W || y >= H || (x - cx) ** 2 + (y - cy) ** 2 > 16) continue;
          const v = c[y * W + x];
          if (M[v].stat) { c[y * W + x] = M[v].cr; S.crum++; }
          S.chg[(y >> 1) * BW + (x >> 1)] = 1;
          const li = (y >> 2) * 13 + (x >> 2); if (li < S.cool.length) S.cool[li] = S.t + 120;
        }
      },
      draw(g, S, P) {
        const C = g.C, id = Number(P.mat), [name, phase, d, o] = T[id], m = M[id];
        g.clear();
        g.rect(OX - 1, 0, 1, 216, C.rule);
        drawCells(g, S.sim, CS, (v) => C[T[v][4]], OX, 0);
        let y = 46;
        const line = (k, v, col) => { g.label(k, 8, y, C.ink3); g.label(v, 84, y, col || C.ink); y += 11; };
        g.text(name, 8, 40, { size: 16, color: C[T[id][4]] === C.bg ? C.ink : C[T[id][4]] }); y = 56;
        line("id", String(id)); line("phase", phase); line("density", String(d));
        line("loose", m.loose ? "yes" + (m.liq ? " (liquid)" : "") : "no", m.loose ? C.accent : C.ink3);
        line("static", m.stat ? "yes" : "no", m.stat ? C.accent : C.ink3);
        line("hardens to", o.hd ? T[o.hd][0] + " p" + o.p : "-");
        line("crumbles to", o.cr ? T[o.cr][0] : "-");
        line("hardness", o.hard != null ? o.hard + " unused" : "-", o.hard != null ? C.ink3 : C.ink);
        const fl = ["acidic", "soluble", "solvent"].filter((k) => o[k]).concat(["explosive", "radioactive"].filter((k) => o[k]).map((k) => k + "*"));
        line("flags", fl.length ? fl.join(" ") : "-", fl.some((f) => f.endsWith("*")) ? C.enemy : C.ink);
        line("blocks sight", m.stat ? "yes" : "no", m.stat ? C.ink : C.ink3);
        line("harvestable", m.loose ? "yes" : "no", m.loose ? C.gold : C.ink3);
        line("debris", debris(id) ? T[debris(id)][0] : "none");
        if (fl.some((f) => f.endsWith("*"))) g.label("* packed, never read", 8, 210, C.enemy);
      },
      readout(S) { return "hardened " + S.hard + "  crumbled " + S.crum + "\nnext scan " + ((120 - (S.t % 120)) / 60).toFixed(1) + " s"; },
    },
  });
})();
