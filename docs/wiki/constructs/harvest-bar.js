Wiki.construct({
  id: "harvest-bar",
  name: "Harvest bar: colour-sorted stripes and purity clears",
  origin: "shmuprouge",
  status: "partial",
  statusNote: "Built: the ship-bound harvester and a bar that inserts every harvested cell's colour in hue order, so it draws as stripes. Spec only: purity detection, threshold clears, multipliers, filtration tiers and upgradeable capacity.",
  summary: "Every grain you vacuum up lands in a bar sorted by colour, so the bar reads as stripes of what you mined; the spec wants a stripe that gets wide enough to clear with a multiplier.",
  tags: ["harvesting", "feedback", "sorting", "multiplier"],

  intent:
    "<p>A pile of numbers does not tell you what you mined. A bar that sorts itself into coloured stripes does, at a glance, and it gives the most repetitive act in the game a growing picture to look at. The spec then turns that picture into a skill test: harvest one material on purpose and its stripe grows until it clears, Tetris-style, with a bonus. Indiscriminate destruction gives a jumbled bar and no bonus.</p>" +
    "<p>The end-game fantasy in <code>Game_Overview.md</code> is \"constant clears, numbers flying everywhere\": the Balatro feedback loop applied to mining.</p>",

  how:
    "<h3>The harvester (built)</h3>" +
    "<p>The tutorial's harvester is a flag on the ship, <code>Player.hasHarvester</code>, set by the <code>give_harvester</code> action. There is no drone entity. Each frame <code>Harvesting.collectSand</code> requests a harvest of a &plusmn;8-cell square centred on the ship; the GPU readback keeps cells where <code>Materials.isLoose</code> holds and clears them from the world (see [[resource-economy]]).</p>" +
    "<h3>The bar (built)</h3>" +
    "<ul>" +
    "<li><code>Harvesting.addMaterial</code> adds 1 to <code>materialBar</code> and inserts the cell's RGB colour into <code>collectedColors</code> before the first entry with a higher hue (<code>rgbToHue</code>, 0&ndash;360).</li>" +
    "<li>Each material JSON has three colour variants, so one material makes a narrow hue band; neighbouring hues interleave.</li>" +
    "<li>Greys have no hue: <code>rgbToHue</code> returns 0 when max = min. Gun powder (0.2, 0.2, 0.2) therefore sorts to the far left with the reds, not beside other dull materials.</li>" +
    "<li><code>Draw.materialBar</code> draws it at the bottom centre: half the screen wide, 16 px tall, at 0.92 of screen height, each entry <code>barWidth / materialRequired</code> wide, so the bar fills left to right as stripes spread.</li>" +
    "<li>Cells beyond <code>materialRequired</code> (2500) are discarded. <code>start_gate</code> zeroes <code>materialBar</code> but leaves <code>collectedColors</code> filled; it is not drawn again, so nothing shows.</li>" +
    "</ul>" +
    "<h3>Purity (spec)</h3>" +
    "<p>From <code>Game_Overview.md</code> &sect;Harvest Bar and <code>Drone_Systems.md</code>: when a pure stripe reaches a threshold width it flashes and clears into inventory with a multiplier. Better filtration makes purity easier:</p>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>Filtration</th><th>Keeps</th></tr></thead><tbody>" +
    "<tr><td>None</td><td>Everything, trash included; the bar clogs</td></tr>" +
    "<tr><td>Basic</td><td>Drops common rock and sand</td></tr>" +
    "<tr><td>Advanced</td><td>Selective by material type</td></tr>" +
    "<tr><td>Quantum</td><td>Filters by state (gas, liquid)</td></tr>" +
    "</tbody></table></div>" +
    "<p>In model A of the docs a pure stripe also compresses into a [[crate-haul|crate]]; in model B a full bar activates the [[portal-stitching|portal]]. Threshold, multiplier and clear frequency are all TBD (Game_Overview open question 5).</p>",

  knobs: [
    ["Bar size", "2500 cells", "Cells until full; also the width of one entry", "Objectives.json tutorial.harvest.materialRequired"],
    ["Harvest radius", "8 cells", "Half-width of the vacuum square", "HARVEST_RADIUS"],
    ["Sort key", "hue", "Order cells are inserted in", "rgbToHue (objectives_harvesting.lua)"],
    ["Bar geometry", "w/2 x 16 px at 0.92 h", "On-screen placement", "Draw.materialBar (game/objectives/draw.lua)"],
    ["Purity threshold", "TBD", "Stripe width that triggers a clear (spec)", "none"],
  ],

  related: [
    { id: "resource-economy", how: "The matter loop that fills the bar." },
    { id: "crate-haul", how: "Model A: pure stripes become towed crates." },
    { id: "portal-stitching", how: "Model B: a full bar opens the portal." },
    { id: "material-properties", how: "Material colours and isLoose come from the material JSON." },
    { id: "drones", how: "The spec makes the harvester a drone with filtration tiers." },
  ],

  questions: [
    "Hue or material id? Sorting by hue merges look-alike materials into one stripe and drops greys beside reds, so a 'pure' stripe can be two materials.",
    "If the bar is hue-sorted, purity is just a count of one material, and the order you harvest in never matters. Is that the intent, or should purity require harvesting in sequence?",
    "What happens when the bar is full outside the tutorial: stop collecting, eject, or dump the slop?",
    "Is the harvester a ship flag (code, tutorial) or a drone that can be captured and lost (Drone_Systems.md)?",
  ],

  sparks: [
    "Arrival-order bar: purity only counts unbroken runs, so a stray grain of rock in the middle of an iron seam ruins the streak.",
    "Material-flavoured clears: a pure TNT stripe becomes a bomb charge, a pure water stripe a shield.",
    "Contaminant materials that tint the stripe next to them, so the bar has hazards of its own.",
    "Use the bar as a puzzle board fed by a shooter: what you destroy is what you place.",
  ],

  terms: [
    { term: "Harvest bar", def: "The HUD strip showing every harvested cell's colour, sorted by hue.", code: "collectedColors, Draw.materialBar" },
    { term: "Material bar", def: "The count of harvested cells against the requirement.", code: "materialBar, materialRequired" },
    { term: "Stripe", def: "A run of similar-hue cells in the bar; one material makes one narrow band." },
    { term: "Purity clear", def: "Spec: a single-material stripe past a threshold flashes and banks with a multiplier." },
    { term: "Filtration", def: "Spec: harvester tier that decides which materials are kept.", code: "Drone_Systems.md" },
  ],

  sources: [
    "shmuprouge:game/objectives/objectives_harvesting.lua",
    "shmuprouge:game/objectives/draw.lua",
    "shmuprouge:engine/physics/sand/harvest_renderer.lua",
    "shmuprouge:game/objectives/actions.lua",
    "shmuprouge:shared/data/world/materials/",
    "shmuprouge:docs/Game_Overview.md",
    "shmuprouge:docs/entities/Drone_Systems.md",
  ],

  toy: {
    title: "Sorted by hue, cleared by purity",
    hint: "click a swatch to aim the harvester at that material",
    caption: "Colours are the real first variants of seven material JSONs. A 160-cell bar stands in for 2500. Hue sorting and the grey-at-zero rule are as built; the purity clear is a sketch of the spec with an invented threshold and multiplier.",
    w: 384, h: 216,
    controls: [
      { type: "select", key: "sort", label: "order", value: "hue", options: [["hue", "hue-sorted (built)"], ["arrival", "arrival order"]], reset: true },
      { type: "range", key: "focus", label: "aim", min: 0, max: 100, value: 40, fmt: "{}%" },
      { type: "toggle", key: "purity", label: "purity clears (spec)", value: true },
      { type: "range", key: "thresh", label: "threshold", min: 10, max: 60, value: 30, fmt: "{} cells" },
    ],
    init(S) {
      S.mats = [
        ["SAND", [0.99, 0.82, 0.70]], ["WATER", [0.2, 0.4, 0.8]], ["ACID", [0.4, 0.9, 0.2]],
        ["GUN POWDER", [0.2, 0.2, 0.2]], ["IRON FILINGS", [0.61, 0.42, 0.39]], ["BRICKS", [0.4, 0.4, 0.8]], ["ASH", [0.88, 0.86, 0.82]],
      ];
      const hue = (c) => { const [r, g, b] = c, mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx === mn) return 0; let h = mx === r ? (g - b) / (mx - mn) : mx === g ? 2 + (b - r) / (mx - mn) : 4 + (r - g) / (mx - mn); return ((h * 60) % 360 + 360) % 360; };
      S.hue = S.mats.map((m) => hue(m[1]));
      S.bar = []; S.cap = 160; S.target = 0; S.t = 0; S.banked = 0; S.clears = 0; S.flash = 0; S.pop = null; S.lostFull = 0;
    },
    pointer(e, S) {
      if (e.type !== "down") return;
      for (let i = 0; i < S.mats.length; i++) if (e.x > 14 + i * 52 && e.x < 60 + i * 52 && e.y > 150 && e.y < 190) S.target = i;
    },
    update(S, P, dt, kit) {
      S.t += dt; S.flash = Math.max(0, S.flash - dt);
      if (S.pop) { S.pop.t -= dt; if (S.pop.t <= 0) S.pop = null; }
      if (S.t < 0.04) return; S.t = 0;
      const m = kit.rand() * 100 < P.focus ? S.target : Math.floor(kit.rand() * S.mats.length);
      if (S.bar.length >= S.cap) { S.lostFull++; return; }
      if (P.sort === "hue") {
        let i = 0; while (i < S.bar.length && S.hue[S.bar[i]] <= S.hue[m]) i++;
        S.bar.splice(i, 0, m);
      } else S.bar.push(m);
      if (!P.purity) return;
      // find the longest run of one material
      let best = 0, bs = 0, run = 1;
      for (let i = 1; i <= S.bar.length; i++) {
        if (i < S.bar.length && S.bar[i] === S.bar[i - 1]) run++;
        else { if (run > best) { best = run; bs = i - run; } run = 1; }
      }
      if (S.bar.length && best >= P.thresh) {
        const mult = 1 + Math.floor((best - P.thresh) / 5) + 1;
        S.banked += best * mult; S.clears++; S.flash = 0.3;
        S.pop = { t: 1.2, text: "PURE " + S.mats[S.bar[bs]][0] + " +" + best + "x" + mult, x: 32 + (bs + best / 2) * (320 / S.cap) };
        S.bar.splice(bs, best);
      }
    },
    draw(g, S, P) {
      const C = g.C; g.clear();
      const x0 = 32, y0 = 70, w = 320, h = 26, cw = w / S.cap;
      g.tone(x0, y0, w, h, 0.15, C.ink3);
      const rgb = (c) => "rgb(" + c.map((v) => Math.round(v * 255)).join(",") + ")";
      for (let i = 0; i < S.bar.length; i++) g.rect(x0 + i * cw, y0, cw + 0.6, h, rgb(S.mats[S.bar[i]][1]));
      g.rect(x0, y0, w, h, S.flash > 0 ? C.gold : C.ink3, 1);
      if (P.purity) { const tx = x0 + P.thresh * cw; g.line(x0, y0 + h + 4, tx, y0 + h + 4, C.gold, 2); g.label("THRESHOLD", x0, y0 + h + 14, C.gold); }
      if (S.pop) g.text(S.pop.text, Math.min(300, Math.max(80, S.pop.x)), y0 - 10 - (1.2 - S.pop.t) * 20, { align: "center", color: C.gold });
      g.label("HUE 0", x0, y0 - 4, C.ink3); g.label("360", x0 + w, y0 - 4, C.ink3, "right");
      for (let i = 0; i < S.mats.length; i++) {
        const bx = 14 + i * 52;
        g.rect(bx + 8, 152, 30, 18, rgb(S.mats[i][1]));
        if (i === S.target) g.rect(bx + 5, 149, 36, 24, C.ink, 2);
        g.label(S.mats[i][0].split(" ")[0], bx + 23, 182, C.ink2, "center");
        g.label(Math.round(S.hue[i]) + "", bx + 23, 192, C.ink3, "center");
      }
    },
    readout(S) {
      return "bar " + S.bar.length + "/" + S.cap + "   clears " + S.clears + "\nbanked " + S.banked + "   overflow " + S.lostFull;
    },
  },
});
