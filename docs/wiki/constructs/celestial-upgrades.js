Wiki.construct({
  id: "celestial-upgrades",
  name: "Celestial upgrades: boss fragments that transform a tool",
  family: "economy",
  origin: "shmuprouge",
  status: "spec",
  statusNote: "Spec only (docs/design/Celestial_Upgrades.md, Solar_System_Arena.md Win Condition). No fragments, bosses, tool tiers or Sol exist in code; the 8th upgrade and the boss-direction pairing are undecided.",
  summary: "Each of eight corridor bosses drops a fragment that permanently turns one base tool into its celestial version, and each celestial tool is the key to one layer of the assault on the sun.",
  tags: ["progression", "lock and key", "boss reward", "replace not add"],

  intent:
    "<p>Stat upgrades blur together; a run should have a few moments where a tool becomes something else. Celestial upgrades are Zelda-style tool evolution: beat a boss, and your drill becomes the Core Piercer, immediately and for good. There is no second slot and no option to keep the old version, so there is no inventory bloat and no decision paralysis.</p>" +
    "<p>Each transformation is also a key. The run's win condition is destroying the sun, and every layer of the sun is gated by a physical hazard that one celestial tool answers.</p>",

  how:
    "<h3>Acquisition</h3>" +
    "<p>Enter a corridor through the [[portal-stitching|portal]] in direction X &rarr; fight through &rarr; defeat boss X &rarr; the fragment drops &rarr; the tool transforms automatically &rarr; store. No manual pickup or activation. Bosses can be taken in any order.</p>" +
    "<h3>The table</h3>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>#</th><th>Base</th><th>Celestial</th><th>What changes</th></tr></thead><tbody>" +
    "<tr><td>1</td><td>Laser</td><td>Solar Lance</td><td>Cuts Sol's plasma</td></tr>" +
    "<tr><td>2</td><td>Bomb</td><td>Nova Charge</td><td>Detonates without gas ignition; cracks Sol's crust</td></tr>" +
    "<tr><td>3</td><td>Drill</td><td>Core Piercer</td><td>Penetrates metallic hydrogen and dense cores</td></tr>" +
    "<tr><td>4</td><td>Shield</td><td>Corona Ward</td><td>Survives Sol's heat zones</td></tr>" +
    "<tr><td>5</td><td>Harvester</td><td>Stellar Collector</td><td>Harvests plasma particles</td></tr>" +
    "<tr><td>6</td><td>Boost</td><td>Flare Dash</td><td>Escapes solar flares</td></tr>" +
    "<tr><td>7</td><td>Missile</td><td>Sun Seeker</td><td>Tracks through gravity distortion</td></tr>" +
    "<tr><td>8</td><td>?</td><td>?</td><td>Candidates: Scanner &rarr; Sun's Heart Sight, Tractor &rarr; Gravity Anchor, Emergency Warp &rarr; Phase Shift, Armor &rarr; Corona Shell</td></tr>" +
    "</tbody></table></div>" +
    "<h3>Sol layers</h3>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>Layer</th><th>Upgrades held</th><th>Key upgrades</th></tr></thead><tbody>" +
    "<tr><td>Approach</td><td>1&ndash;2</td><td>Corona Ward (heat)</td></tr>" +
    "<tr><td>Surface</td><td>3&ndash;4</td><td>Solar Lance (plasma), Core Piercer (crust)</td></tr>" +
    "<tr><td>Mantle</td><td>5&ndash;6</td><td>Nova Charge (cracking), Stellar Collector (plasma harvest)</td></tr>" +
    "<tr><td>Core</td><td>7&ndash;8</td><td>All, including the final boss counter</td></tr>" +
    "</tbody></table></div>" +
    "<p>Partial completion is allowed: you can attack the sun with fewer fragments and get as deep as they allow. Order matters through tool synergy, boss difficulty and [[escaped-boss]] risk.</p>",

  knobs: [
    ["Fragment count", "8", "One per boss, one per portal direction", "Celestial_Upgrades.md Parameters"],
    ["Upgrade type", "Replace", "Celestial version replaces the base tool", "Celestial_Upgrades.md Parameters"],
    ["Order", "Player choice", "Bosses in any sequence", "Celestial_Upgrades.md Parameters"],
    ["Partial Sol attempt", "Allowed", "Depth reached depends on fragments held", "Celestial_Upgrades.md Sol Assault"],
  ],

  related: [
    { id: "portal-stitching", how: "Entry direction picks the boss, and so the fragment." },
    { id: "escaped-boss", how: "Waking a hard boss early and fleeing changes the order calculus." },
    { id: "solar-system-arena", how: "The sun the upgrades exist to break." },
    { id: "material-properties", how: "Several upgrades are rule exceptions to the material sim (Nova Charge ignores gas ignition)." },
  ],

  questions: [
    "What is the 8th upgrade? Four candidates are listed; none is chosen.",
    "Which boss guards which direction? A thematic sketch (Up = light/fire, Down = depth, Left = defense, Right = speed) leaves the diagonals TBD.",
    "Is there a correct order, or should every order be viable?",
    "How deep can a partial attempt go, and does New Game+ keep the fragments?",
  ],

  sparks: [
    "Upgrades as edits to the simulation's rules: 'your drill treats hardness up to 0.9 as loose' instead of '+20% drill damage'.",
    "Fragments that only drop if you already hold another, turning eight free choices into a metroidvania lock graph.",
    "Corrupted transformations: the celestial version with a drawback, offered as a per-run choice against the clean one.",
    "Run it backwards: the sun's layers are fixed and known, so the player plans a route through the bosses like a heist.",
  ],

  terms: [
    { term: "Fragment", def: "Spec: a Sun Buster piece dropped by a corridor boss; one per direction." },
    { term: "Base tool", def: "Spec: the ordinary laser, bomb, drill and so on." },
    { term: "Celestial version", def: "Spec: the transformed tool; replaces the base permanently." },
    { term: "Sol layer", def: "Spec: Approach, Surface, Mantle, Core; each gated by fragments held." },
  ],

  sources: [
    "shmuprouge:docs/design/Celestial_Upgrades.md",
    "shmuprouge:docs/levels/solar_system/Solar_System_Arena.md",
    "shmuprouge:docs/design/Portal_Stitching.md",
  ],

  toy: {
    title: "Which fragments reach which layer",
    hint: "click the tool cards to transform them; the probe keeps diving",
    caption: "A layer passes when you hold at least the low end of its count and all its key upgrades; the core asks for all eight, the eighth undefined. The probe and hazards are illustrative.",
    w: 384, h: 216,
    controls: [
      { type: "button", label: "all", press(S) { S.have = S.have.map(() => true); } },
      { type: "button", label: "none", press(S) { S.have = S.have.map(() => false); } },
    ],
    init(S) {
      S.tools = [["LASER", "SOLAR LANCE"], ["BOMB", "NOVA CHARGE"], ["DRILL", "CORE PIERCER"], ["SHIELD", "CORONA WARD"],
        ["HARVEST", "STELLAR COLL."], ["BOOST", "FLARE DASH"], ["MISSILE", "SUN SEEKER"], ["???", "???"]];
      S.have = [false, false, false, true, false, false, false, false];
      S.layers = [["APPROACH", 1, [3]], ["SURFACE", 3, [0, 2]], ["MANTLE", 5, [1, 4]], ["CORE", 8, [0, 1, 2, 3, 4, 5, 6, 7]]];
      S.r = 0; S.bounce = 0; S.hitLayer = -1;
    },
    pointer(e, S) {
      if (e.type !== "down") return;
      for (let i = 0; i < 8; i++) {
        const x = 8 + (i % 2) * 74, y = 40 + Math.floor(i / 2) * 42;
        if (e.x > x && e.x < x + 70 && e.y > y && e.y < y + 36) S.have[i] = !S.have[i];
      }
    },
    update(S, P, dt) {
      const R = [92, 70, 48, 26];
      const held = S.have.filter(Boolean).length;
      const ok = (l) => held >= S.layers[l][1] && S.layers[l][2].every((k) => S.have[k]);
      if (S.bounce > 0) { S.bounce -= dt; if (S.bounce <= 0) S.r = 0; return; }
      S.r += 60 * dt;
      const depth = 110 - S.r;
      for (let l = 0; l < 4; l++) if (depth <= R[l] && depth > R[l] - 2 && !ok(l)) { S.bounce = 0.8; S.hitLayer = l; return; }
      if (depth < 0) { S.r = 0; S.hitLayer = 4; }
    },
    draw(g, S) {
      const C = g.C; g.clear();
      const cx = 280, cy = 116, R = [92, 70, 48, 26], cols = [C.gold, C.enemy, C.violet, C.ink];
      const held = S.have.filter(Boolean).length;
      for (let l = 0; l < 4; l++) {
        const ok = held >= S.layers[l][1] && S.layers[l][2].every((k) => S.have[k]);
        g.circle(cx, cy, R[l], C.bg);
        g.toneCircle(cx, cy, R[l], ok ? 0.45 : 0.12, cols[l]);
        g.circle(cx, cy, R[l], ok ? cols[l] : C.ink3, 1);
        g.label(S.layers[l][0], cx, cy - R[l] + 10, C.ink, "center");
      }
      // probe dives from the left
      const depth = 110 - S.r, a = Math.PI * 0.85;
      const px = cx + Math.cos(a) * Math.max(0, depth), py = cy + Math.sin(a) * Math.max(0, depth);
      if (S.bounce > 0) { g.circle(px, py, 6 + (0.8 - S.bounce) * 10, C.enemy, 1); g.text("BLOCKED: " + S.layers[S.hitLayer][0], cx, 208, { align: "center", color: C.enemy }); }
      g.poly([[px + 5, py], [px - 3, py - 4], [px - 3, py + 4]], C.accent);
      for (let i = 0; i < 8; i++) {
        const x = 8 + (i % 2) * 74, y = 40 + Math.floor(i / 2) * 42, on = S.have[i];
        if (on) g.tone(x, y, 70, 36, 0.15, C.gold);
        g.rect(x, y, 70, 36, on ? C.gold : C.ink3, 1);
        g.label(i + 1 + " " + S.tools[i][0], x + 4, y + 12, on ? C.ink3 : C.ink);
        g.label(S.tools[i][1], x + 4, y + 27, on ? C.ink : C.ink3);
      }
    },
    readout(S) {
      const held = S.have.filter(Boolean).length;
      const ok = (l) => held >= S.layers[l][1] && S.layers[l][2].every((k) => S.have[k]);
      let deep = 0; while (deep < 4 && ok(deep)) deep++;
      return "fragments " + held + "/8\nreaches " + (deep ? S.layers[deep - 1][0] : "NOTHING");
    },
  },
});
