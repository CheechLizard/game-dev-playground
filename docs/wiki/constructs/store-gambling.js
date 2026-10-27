Wiki.construct({
  id: "store-gambling",
  name: "Store with gambling and a pity timer",
  origin: "shmuprouge",
  status: "spec",
  statusNote: "Spec only. Solar_System_Arena.md defines the store, gambling and anti-frustration rules without numbers; Levels_Overview.md gives a fixed-UI milestone store. No store, credits or gambling code exists (the alpha arena's zone data names a merchant NPC that nothing reads).",
  summary: "No crafting: after each corridor a curated random shop sells tools and weapons for credits, with slot spins, rerolls and risky cheap upgrades, kept fair by a pity timer, visible odds and a promise that you always get something.",
  tags: ["shop", "randomness", "anti-frustration", "risk/reward"],

  intent:
    "<p>\"Crafting adds busywork. Store + gambling is more interesting.\" The store is where the run's materials become a build, and gambling turns that conversion into a small set of tense bets in the Balatro mould: spend now on a sure thing, or spin for something better.</p>" +
    "<p>The anti-frustration rules are the other half. A bad streak of rolls is the fastest way to make randomness feel like cheating, so the spec caps how long it can last and shows the odds.</p>",

  how:
    "<h3>The store (Solar_System_Arena.md &sect;Economy)</h3>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>Element</th><th>Rule</th></tr></thead><tbody>" +
    "<tr><td>Location</td><td>Space stations, as interplanetary points of interest</td></tr>" +
    "<tr><td>Access</td><td>After each successful corridor run</td></tr>" +
    "<tr><td>Inventory</td><td>Curated random selection per visit</td></tr>" +
    "<tr><td>Currency</td><td>Harvested materials converted to credits</td></tr>" +
    "<tr><td>Sells</td><td>Tool tiers, weapon unlocks, shield capacity</td></tr>" +
    "</tbody></table></div>" +
    "<h3>Gambling</h3>" +
    "<ul><li><b>Weapon-slot spin</b>: pay credits for a random weapon, tier-weighted.</li>" +
    "<li><b>Shop reroll</b>: pay to refresh the selection.</li>" +
    "<li><b>Upgrade gamble</b>: a cheap upgrade with a fail chance, or an expensive guaranteed one. With price <i>c</i> and success chance <i>p</i>, retrying until success costs <i>c/p</i> on average, so the gamble is a good deal exactly when <i>c/p</i> is below the guaranteed price.</li></ul>" +
    "<h3>Anti-frustration</h3>" +
    "<ul><li><b>Pity timer</b>: a guaranteed good roll after N bad ones. This bounds the worst dry streak at N.</li>" +
    "<li><b>Visible odds</b>: the player knows the math.</li>" +
    "<li><b>No total loss</b>: every gamble returns something, of varying quality.</li></ul>" +
    "<h3>Other versions of the store</h3>" +
    "<p><code>Game_Overview.md</code> cashes in [[crate-haul|crates]] and has market prices that shift with supply, contracts and filtration settings. <code>Levels_Overview.md</code> makes the store a stage of the [[level-loop]] with <code>inventory_pool</code> and <code>pricing_tier</code>, and plans a progression graph that offers more of the path you started down plus tempting rares that do not fit your build.</p>",

  knobs: [
    ["Rarity weights", "TBD", "Tier weighting of weapon-slot spins", "none"],
    ["Pity threshold", "TBD (N)", "Bad rolls before a guaranteed good one", "none"],
    ["Reroll cost", "TBD", "Price to refresh the selection", "none"],
    ["Gamble fail chance", "TBD", "Chance the cheap upgrade fails", "none"],
    ["Pricing tier", "per level", "Cost scaling (Levels_Overview)", "pricing_tier"],
  ],

  related: [
    { id: "shop-economy", how: "The playground's built shop: the same stage of the loop with fixed offers." },
    { id: "resource-economy", how: "Where the credits come from." },
    { id: "crate-haul", how: "Model A pays the store in crates." },
    { id: "celestial-upgrades", how: "The other source of power between corridors; it arrives just before the store." },
  ],

  questions: [
    "What is 'good' for the pity timer: a rarity tier, or an item that fits the current build?",
    "Do prices move with supply (Game_Overview) or stay fixed per pricing tier (Levels_Overview)?",
    "Does the pity counter persist across store visits, or reset each time?",
    "How are materials converted to credits: flat per unit, by rarity, or by purity?",
  ],

  sparks: [
    "Show the pity meter as a filling bar, so a bad streak reads as progress toward a payout.",
    "Supply-driven prices: selling a lot of one material crashes its price and pushes the player to diversify what they mine.",
    "Gambles that spill into the world: a bad roll spawns an elite outside the station.",
    "Bad-luck protection for anything random, such as loot drops or crit chains, borrowed from this store.",
  ],

  terms: [
    { term: "Credits", def: "Spec: store currency converted from harvested materials." },
    { term: "Reroll", def: "Spec: pay to refresh the shop's selection." },
    { term: "Weapon-slot spin", def: "Spec: pay for a tier-weighted random weapon." },
    { term: "Upgrade gamble", def: "Spec: cheap upgrade with a fail chance versus an expensive guaranteed one." },
    { term: "Pity timer", def: "Spec: guarantees a good roll after N bad ones." },
  ],

  sources: [
    "shmuprouge:docs/levels/solar_system/Solar_System_Arena.md",
    "shmuprouge:docs/levels/Levels_Overview.md",
    "shmuprouge:docs/Game_Overview.md",
    "shmuprouge:shared/data/world/levels/alpha_arena.json",
  ],

  toy: {
    title: "What a pity timer buys",
    hint: "two players spin the same odds; only the right one has pity",
    caption: "Invented odds: each spin is epic with the chance shown. Both columns use the same random stream. Bars are how often each dry streak (spins between epics) happened.",
    w: 384, h: 216,
    controls: [
      { type: "range", key: "p", label: "epic chance", min: 2, max: 40, value: 10, fmt: "{}%", reset: true },
      { type: "range", key: "N", label: "pity after", min: 2, max: 30, value: 12, fmt: "{} bad", reset: true },
      { type: "range", key: "rate", label: "spins/s", min: 1, max: 60, value: 12 },
    ],
    init(S) {
      S.acc = 0; S.spins = 0;
      S.A = { dry: 0, hist: new Array(41).fill(0), worst: 0, epics: 0, last: [] };
      S.B = { dry: 0, hist: new Array(41).fill(0), worst: 0, epics: 0, last: [], forced: 0 };
    },
    update(S, P, dt, kit) {
      S.acc += dt * P.rate;
      while (S.acc >= 1) {
        S.acc -= 1; S.spins++;
        const r = kit.rand() < P.p / 100;
        for (const who of [S.A, S.B]) {
          let epic = r;
          if (who === S.B && !epic && who.dry + 1 >= P.N) { epic = true; who.forced++; }
          who.last.push(epic); if (who.last.length > 24) who.last.shift();
          if (epic) { who.hist[Math.min(40, who.dry)]++; who.worst = Math.max(who.worst, who.dry); who.dry = 0; who.epics++; }
          else who.dry++;
        }
      }
    },
    draw(g, S, P) {
      const C = g.C; g.clear();
      const panel = (who, x, title) => {
        g.label(title, x, 44, C.ink);
        for (let i = 0; i < who.last.length; i++) g.rect(x + i * 6, 50, 5, 8, who.last[i] ? C.gold : C.ink3);
        // dry-streak meter
        const lim = who === S.B ? P.N : 40;
        g.meter(x, 64, 144, 5, who.dry / lim, who === S.B ? C.accent : C.enemy);
        g.label(who === S.B ? "PITY " + who.dry + "/" + P.N : "DRY " + who.dry, x, 80, C.ink2);
        const max = Math.max(1, ...who.hist);
        const bw = 144 / 41;
        for (let i = 0; i <= 40; i++) {
          const h = who.hist[i] / max * 100;
          g.rect(x + i * bw, 196 - h, Math.max(1, bw - 0.5), h, i >= P.N && who === S.A ? C.enemy : C.gold);
        }
        g.line(x, 196, x + 144, 196, C.ink3);
        g.label("0", x, 206, C.ink3); g.label("40+", x + 144, 206, C.ink3, "right");
        g.label("WORST " + who.worst, x + 144, 80, who === S.A && who.worst > P.N ? C.enemy : C.ink2, "right");
      };
      panel(S.A, 24, "NO PITY");
      panel(S.B, 214, "PITY TIMER");
      const nx = 214 + (P.N / 41) * 144;
      g.line(nx, 92, nx, 196, C.accent, 1, [2, 2]);
      g.line(24 + (P.N / 41) * 144, 92, 24 + (P.N / 41) * 144, 196, C.ink3, 1, [2, 2]);
    },
    readout(S) {
      return "spins " + S.spins + "   epics " + S.A.epics + " vs " + S.B.epics + "\nforced by pity " + S.B.forced;
    },
  },
});
