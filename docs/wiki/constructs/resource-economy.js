Wiki.construct({
  id: "resource-economy",
  name: "The matter loop: destruction feeds construction",
  origin: "shmuprouge",
  status: "partial",
  statusNote: "The tutorial's single loop is built: shoot rock into loose particles, vacuum them with the ship-bound harvester into a 2500-cell bar, deliver it to the artifact to start the gate. Alien harvesters, the race, factory structures and multiple resource types are spec only. Which economy wraps this loop (crates and a store, or a portal-activating bar plus fuel) is undecided in the docs.",
  summary: "Solid matter cannot be collected; you have to break it into loose particles first, scoop them before they settle back into rock, and feed them to the artifact to build your way out.",
  tags: ["harvesting", "falling sand", "race", "destruction"],

  intent:
    "<p>ShmupRouge wants combat and economy to be the same verb. The world is a falling-sand simulation, and the only thing a harvester can take is <em>loose</em> material: sand, filings, liquids. Rock, ore and brick have to be shot, bombed or crumbled first. So a weapon is also a mining tool, and every fight in a planet's crust is also a harvest.</p>" +
    "<p>The spec adds a race on top: aliens harvest the same field by the same method to build their own gate, so time pressure comes from a rival rather than a countdown.</p>",

  how:
    "<h3>The loop as specified</h3>" +
    "<p><code>docs/design/Resource_Economy.md</code>: solid matter &rarr; destroy &rarr; particles under sand physics &rarr; harvester ram scoop &rarr; the artifact (a hijacked alien matter transformer) builds a structure over time, shown as a progress bar. The first structure is the warp gate. It starts with one generic resource, <em>matter</em>, and only adds specialised materials if play needs it.</p>" +
    "<h3>What the code does</h3>" +
    "<p>Only the tutorial runs the loop (<code>game/objectives/</code>):</p>" +
    "<ul>" +
    "<li>After the harvester is picked up, <code>Player.hasHarvester</code> is true and each frame <code>Harvesting.collectSand</code> asks the GPU sim for a harvest of a square of &plusmn;<code>HARVEST_RADIUS</code> = 8 cells around the ship.</li>" +
    "<li>The readback keeps only cells where <code>Materials.isLoose(baseId)</code> is true (loose solids <em>and</em> liquids), clears them from the sim, and returns their colours.</li>" +
    "<li>Each cell adds 1 to <code>materialBar</code>, capped at <code>materialRequired</code> = 2500 (<code>Objectives.json tutorial.harvest</code>). The colours feed the [[harvest-bar]].</li>" +
    "<li>Returning within 150 wu of the artifact runs <code>start_gate</code>, which zeroes the bar and starts the 30 s hold-out of [[build-and-defend]].</li>" +
    "</ul>" +
    "<p>Uncollected matter does not wait. Loose sand that comes to rest re-hardens into its static partner over time ([[stability-and-debris]]), so destruction opens a harvest window rather than a stockpile.</p>" +
    "<h3>Two economies in the docs</h3>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th></th><th>Game_Overview (A)</th><th>Solar System docs (B)</th></tr></thead><tbody>" +
    "<tr><td>Bar full means</td><td>Arena is spent; move on</td><td>Portal activates</td></tr>" +
    "<tr><td>Bar output</td><td>Pure stripes compress into towed [[crate-haul|crates]]</td><td>Nothing physical</td></tr>" +
    "<tr><td>Survival clock</td><td>None</td><td>[[fuel]] from kills</td></tr>" +
    "<tr><td>Spending</td><td>Store cashes in crates; market prices shift</td><td>[[store-gambling|Store]] converts materials to credits</td></tr>" +
    "<tr><td>Exit</td><td>Portal built at a construction site for a resource cost</td><td>[[portal-stitching|Portal bubble]] with material-locked directions</td></tr>" +
    "</tbody></table></div>" +
    "<p>Only the shared core, break &rarr; scoop &rarr; deliver, exists in code.</p>",

  knobs: [
    ["Harvest radius", "8 cells (square)", "Half-width of the box vacuumed around the ship each frame", "HARVEST_RADIUS (objectives_harvesting.lua)"],
    ["Material required", "2500 cells", "Bar size; full bar is the tutorial's delivery condition", "Objectives.json tutorial.harvest.materialRequired"],
    ["Harvestable", "loose solids and liquids", "Static solids are never taken; gases are not loose", "Materials.isLoose"],
    ["Delivery radius", "150 wu", "How close to the artifact the full bar must come", "Objectives.json return near_artifact"],
  ],

  related: [
    { id: "harvest-bar", how: "Where the collected cells go and how they are shown." },
    { id: "stability-and-debris", how: "Rock must crumble before it is harvestable, and loose sand re-hardens if left." },
    { id: "material-properties", how: "isLoose decides what counts as matter." },
    { id: "build-and-defend", how: "The tutorial's payoff: a full bar becomes a gate you defend." },
    { id: "fuel", how: "The competing doc model adds a kill-to-live clock beside the harvest." },
  ],

  questions: [
    "Which economy is the game: Game_Overview's crates, purity and market, or the Solar System docs' bar-opens-portal plus fuel? They share only the core loop.",
    "One generic matter or many materials? Resource_Economy says start with one; portal locks and effect profiles assume many named materials.",
    "Does the race against alien harvesters survive past Level 1, and can either side destroy the other's harvester?",
    "Is there a storage cap? In code the bar caps at the objective requirement and extra cells are discarded but still removed from the world.",
  ],

  sparks: [
    "A harvest window as the core timer: anything you blast re-solidifies in a few seconds, so the skill is breaking only what you can scoop in time.",
    "Rival scoopers on the same particle field, so stealing their sand is as good as mining your own.",
    "Drain a lake: liquids count as loose, so emptying an ocean can be both a resource run and a way to expose what is under it.",
    "Matter as ammunition: firing spends harvested matter, so a heavy weapon digs its own supply out of the target.",
  ],

  terms: [
    { term: "Matter", def: "The generic harvested resource; one cell of loose material is one unit.", code: "materialBar" },
    { term: "Loose", def: "A material that can fall and be harvested: loose solids and all liquids.", code: "Materials.isLoose" },
    { term: "Harvester", def: "The ship-bound collector picked up in the tutorial; vacuums a square around the ship.", code: "Player.hasHarvester" },
    { term: "Artifact", def: "The alien matter transformer that accepts the bar and builds the gate.", code: "near_artifact, start_gate" },
    { term: "Race mechanic", def: "Spec: aliens harvest and build their own gate; first to finish wins." },
  ],

  sources: [
    "shmuprouge:docs/design/Resource_Economy.md",
    "shmuprouge:docs/Game_Overview.md",
    "shmuprouge:docs/levels/solar_system/Solar_System_Arena.md",
    "shmuprouge:game/objectives/objectives_harvesting.lua",
    "shmuprouge:engine/physics/sand/harvest_renderer.lua",
    "shmuprouge:game/objectives/actions.lua",
    "shmuprouge:shared/data/progression/Objectives.json",
  ],

  toy: {
    title: "Break it, scoop it, before it sets",
    hint: "click rock to blast it; the scoop ship flies after your pointer",
    caption: "Simplified: column-gravity sand on a 4-unit grid, a 300-cell bar instead of 2500, and a fixed re-harden chance for resting grains. The scoop takes only loose cells, as Materials.isLoose does.",
    w: 384, h: 216,
    controls: [
      { type: "range", key: "blast", label: "blast", min: 2, max: 10, value: 5, fmt: "{} cells" },
      { type: "range", key: "scoop", label: "scoop", min: 2, max: 10, value: 4, fmt: "±{}" },
      { type: "range", key: "harden", label: "re-harden", min: 0, max: 20, value: 6, fmt: "{} s" },
      { type: "toggle", key: "rival", label: "rival scoop", value: false, reset: true },
    ],
    init(S, P, kit) {
      S.W = 96; S.H = 54; S.cell = new Uint8Array(S.W * S.H); S.rest = new Float32Array(S.W * S.H);
      // 0 empty, 1 rock, 2 loose
      for (let y = 0; y < S.H; y++) for (let x = 0; x < S.W; x++) {
        const top = 18 + Math.round(4 * Math.sin(x * 0.17) + 2 * Math.sin(x * 0.53));
        if (y > top) S.cell[y * S.W + x] = 1;
      }
      S.px = 192; S.py = 60; S.tx = 192; S.ty = 60; S.bar = 0; S.rbar = 0; S.need = 300; S.lost = 0;
      S.rx = 60; S.ry = 70; S.rt = 0; S.done = "";
    },
    pointer(e, S, P) {
      S.tx = e.x; S.ty = e.y;
      if (e.type === "down") {
        const cx = Math.floor(e.x / 4), cy = Math.floor(e.y / 4), r = P.blast;
        for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
          if (x < 0 || y < 0 || x >= S.W || y >= S.H) continue;
          if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r && S.cell[y * S.W + x] === 1) S.cell[y * S.W + x] = 2;
        }
      }
    },
    update(S, P, dt, kit) {
      const W = S.W, H = S.H, c = S.cell;
      // gravity: bottom-up so a grain moves once per step
      for (let y = H - 2; y >= 0; y--) for (let x = 0; x < W; x++) {
        const i = y * W + x; if (c[i] !== 2) continue;
        const b = i + W;
        if (c[b] === 0) { c[b] = 2; c[i] = 0; S.rest[b] = 0; continue; }
        const d = kit.rand() < 0.5 ? -1 : 1;
        if (x + d >= 0 && x + d < W && c[b + d] === 0) { c[b + d] = 2; c[i] = 0; S.rest[b + d] = 0; continue; }
        S.rest[i] += dt;
        if (P.harden > 0 && S.rest[i] > P.harden && kit.rand() < 0.02) { c[i] = 1; S.lost++; }
      }
      const eat = (sx, sy, r) => {
        const cx = Math.floor(sx / 4), cy = Math.floor(sy / 4); let n = 0;
        for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          if (c[y * W + x] === 2) { c[y * W + x] = 0; n++; }
        }
        return n;
      };
      // the scoop is a ship: it flies toward the pointer at a fixed speed, so blasted sand waits for it
      const mx = S.tx - S.px, my = S.ty - S.py, md = Math.hypot(mx, my);
      if (md > 1) { S.px += mx / md * Math.min(md, 80 * dt); S.py += my / md * Math.min(md, 80 * dt); }
      if (!S.done) S.bar = Math.min(S.need, S.bar + eat(S.px, S.py, P.scoop));
      if (P.rival && !S.done) {
        // rival: drift toward the nearest loose grain it can find on a coarse scan
        S.rt -= dt;
        if (S.rt <= 0) {
          S.rt = 0.5; let best = 1e9;
          for (let i = 0; i < W * H; i += 7) if (c[i] === 2) {
            const x = (i % W) * 4, y = Math.floor(i / W) * 4, d = Math.hypot(x - S.rx, y - S.ry);
            if (d < best) { best = d; S.tx = x; S.ty = y; }
          }
        }
        if (S.tx != null) { const a = Math.atan2(S.ty - S.ry, S.tx - S.rx); S.rx += Math.cos(a) * 70 * dt; S.ry += Math.sin(a) * 70 * dt; }
        S.rbar = Math.min(S.need, S.rbar + eat(S.rx, S.ry, 3));
      }
      if (!S.done && S.bar >= S.need) S.done = "GATE BUILDS";
      if (!S.done && S.rbar >= S.need) S.done = "RIVAL GATE FIRST";
    },
    draw(g, S, P) {
      const C = g.C; g.clear();
      const W = S.W, c = S.cell;
      for (let i = 0; i < c.length; i++) {
        if (!c[i]) continue;
        const x = (i % W) * 4, y = Math.floor(i / W) * 4;
        if (c[i] === 1) g.tone(x, y, 4, 4, 0.5, C.ink3); else g.rect(x, y, 4, 4, C.gold);
      }
      const s = P.scoop * 4 + 2;
      g.rect(S.px - s, S.py - s, s * 2, s * 2, C.accent, 1);
      g.circle(S.px, S.py, 3, C.accent);
      g.line(S.px, S.py, S.tx, S.ty, C.ink3, 1, [2, 3]);
      if (P.rival) { g.rect(S.rx - 14, S.ry - 14, 28, 28, C.enemy, 1); g.circle(S.rx, S.ry, 3, C.enemy); }
      g.meter(250, 8, 120, 6, S.bar / S.need, C.accent); g.label("YOU", 230, 14, C.ink2);
      if (P.rival) { g.meter(250, 18, 120, 6, S.rbar / S.need, C.enemy); g.label("RIVAL", 222, 24, C.ink2); }
      if (S.done) g.text(S.done, 192, 112, { size: 16, align: "center", color: S.done[0] === "G" ? C.accent : C.enemy });
    },
    readout(S) {
      let loose = 0; for (let i = 0; i < S.cell.length; i++) if (S.cell[i] === 2) loose++;
      return "bar " + S.bar + "/" + S.need + "   loose " + loose + "\nre-hardened " + S.lost;
    },
  },
});
