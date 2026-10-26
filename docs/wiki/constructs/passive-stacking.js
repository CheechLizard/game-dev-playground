Wiki.construct({
  id: "passive-stacking",
  name: "Passives with stacking prices and caps",
  family: "economy",
  origin: "playground",
  status: "built",
  summary: "Eight repeatable stat boosts sold in the shop; each stack costs a linear step more than the last, each passive has a stack cap, and every purchase is one addition into the player's bonus table.",
  tags: ["shop", "stats", "price curve", "data-driven"],

  intent:
    "<p>Weapons alone cannot fill a shop. The content comment puts it plainly: \"there are only as many weapon offers as there are weapons, so a bigger shop needs a second kind of choice\". Passives are that second kind, and they give a run a build direction that is not \"which gun\": a speed build, a pickup build, a crit build.</p>" +
    "<p>The price rises with every stack so the first few are attractive and the last few are a commitment, and the cap keeps any one stat from running away.</p>",

  how:
    "<h3>Price</h3>" +
    "<p><code>run:passiveCost</code>: <code>ceil(cost &times; (1 + costGrowth &times; owned) &times; priceMult)</code>. The growth is linear in stacks owned, not compounding, and the whole price is then inflated by the shop's wave multiplier (<code>1 + 0.015&middot;(wave&minus;1)</code>, see [[shop-economy]]). A full ten-stack of Power Cell costs 772.5 gold at base prices before inflation, about 45% of a run's wave-clear income.</p>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>Passive</th><th>Stat</th><th>Per stack</th><th>Base cost</th><th>Growth</th><th>Max</th></tr></thead><tbody>" +
    "<tr><td>Power Cell</td><td><code>damage</code></td><td>+0.10&times;</td><td>30</td><td>0.35</td><td>10</td></tr>" +
    "<tr><td>Coolant</td><td><code>attackSpeed</code></td><td>+0.08&times;</td><td>32</td><td>0.35</td><td>10</td></tr>" +
    "<tr><td>Thrusters</td><td><code>moveSpeed</code></td><td>+6 px/s</td><td>26</td><td>0.30</td><td>10</td></tr>" +
    "<tr><td>Plating</td><td><code>maxHp</code></td><td>+15</td><td>28</td><td>0.30</td><td>12</td></tr>" +
    "<tr><td>Resonator</td><td><code>area</code></td><td>+0.08&times;</td><td>34</td><td>0.35</td><td>8</td></tr>" +
    "<tr><td>Magnet</td><td><code>pickupRange</code></td><td>+10 px</td><td>22</td><td>0.25</td><td>10</td></tr>" +
    "<tr><td>Targeting Chip</td><td><code>crit</code></td><td>+0.04</td><td>36</td><td>0.40</td><td>8</td></tr>" +
    "<tr><td>Ledger</td><td><code>goldFind</code></td><td>+0.15&times;</td><td>24</td><td>0.30</td><td>8</td></tr>" +
    "</tbody></table></div>" +
    "<h3>Stacking</h3>" +
    "<p><code>run:addPassive</code> refuses at <code>maxStacks</code>, otherwise adds <code>amount</code> to <code>player.bonus[def.stat]</code> and counts the stack in <code>player.passives</code>. A capped passive simply stops appearing in the offer. Plating also heals by its amount, \"so buying Plating mid-fight is not a downgrade in effective health\". The HUD tallies owned passives as <i>Name xN</i>.</p>" +
    "<h3>No plumbing, within limits</h3>" +
    "<p>A passive's <code>stat</code> names a key of <code>player.bonus</code>, and the content comment says \"adding one here needs no new plumbing in run.lua\". That holds for the eight keys <code>run:playerStat</code> already reads (the bonus table [[lp-levelling|levels]] also write into). A passive naming a new key, say <code>armor</code>, would be sold, priced, capped and tallied, and would change nothing: <code>playerStat(\"armor\")</code> returns the schema value without consulting the bonus table. The toy's ninth row shows it.</p>" +
    "<p>Because levels and passives share one table, everything is additive: Power Cell's +0.10 sits beside the level bump's +0.05 per level on the same <code>damageMult</code>.</p>",

  knobs: [
    ["Per purchase", "per passive", "Added to the bonus stat per stack", "passive.<id>.amount"],
    ["Base cost", "22-36", "Price of the first stack", "passive.<id>.cost"],
    ["Cost growth", "0.25-0.40", "Linear price step per owned stack", "passive.<id>.costGrowth"],
    ["Max stacks", "8-12", "Cap after which it leaves the shop", "passive.<id>.maxStacks"],
    ["Price growth", "0.015 per wave", "Wave inflation on top", "shop.priceWaveGrowth"],
  ],

  related: [
    { id: "shop-economy", how: "Passives fill the offer grid weapons cannot." },
    { id: "lp-levelling", how: "Level bonuses write into the same bonus table." },
    { id: "crits", how: "Targeting Chip is the only source of bonus crit chance." },
    { id: "pickup-magnet", how: "Magnet stacks the pickup radius." },
    { id: "json-tunables", how: "All four fields per passive are schema settings generated from content." },
  ],

  questions: [
    "Should a new bonus key be read automatically (a generic playerStat fallback), so the no-plumbing claim holds for any stat?",
    "Linear price growth with additive stats means each stack is worth slightly less per gold. Is that the intended pressure, or should value per gold stay flat?",
  ],

  sparks: [
    "Thresholds instead of smooth stats: the fifth stack of a passive unlocks a qualitative effect, so the price curve has a visible goal.",
    "Diminishing returns in place of rising prices: every stack costs the same and does less.",
    "Negative passives that pay gold, a cursed shelf that funds the rest of the build.",
    "One shared stack cap across all passives, so the build is a fixed budget of slots.",
  ],

  terms: [
    { term: "Passive", def: "A repeatable stat boost sold in the shop.", code: "content.passives, run:addPassive" },
    { term: "Stack", def: "One purchase of a passive; prices and caps count stacks.", code: "player.passives[id], maxStacks" },
    { term: "Bonus stat", def: "The key in the player's bonus table a passive adds to.", code: "def.stat, player.bonus" },
  ],

  sources: [
    "playground:games/horde-survivor/content.lua:223",
    "playground:games/horde-survivor/content.lua:233",
    "playground:games/horde-survivor/run.lua:156",
    "playground:games/horde-survivor/run.lua:174",
    "playground:games/horde-survivor/run.lua:257",
  ],

  toy: {
    title: "Stack it until the price says stop",
    hint: "click a row to buy a stack",
    caption: "Exact prices, caps and bonus additions. ARMOR* is not in the game: it shows what a passive with a new stat key would do (nothing). Gold is unlimited; the chart is the last-clicked passive.",
    w: 384, h: 216,
    controls: [
      { type: "range", key: "wave", label: "wave", min: 1, max: 60, value: 3 },
      { type: "button", label: "buy to cap", press(S, P) { while (S.buy(S.sel, P)); } },
      { type: "button", label: "clear", press(S) { S.own = {}; S.spent = 0; } },
    ],
    init(S) {
      S.list = [
        ["power", "POWER CELL", "damage", 0.10, 30, 0.35, 10], ["coolant", "COOLANT", "attackSpeed", 0.08, 32, 0.35, 10],
        ["boots", "THRUSTERS", "moveSpeed", 6, 26, 0.3, 10], ["plating", "PLATING", "maxHp", 15, 28, 0.3, 12],
        ["resonator", "RESONATOR", "area", 0.08, 34, 0.35, 8], ["magnet", "MAGNET", "pickupRange", 10, 22, 0.25, 10],
        ["scope", "TARGET CHIP", "crit", 0.04, 36, 0.4, 8], ["ledger", "LEDGER", "goldFind", 0.15, 24, 0.3, 8],
        ["armor", "ARMOR*", "armor", 2, 30, 0.3, 10],
      ];
      S.own = {}; S.spent = 0; S.sel = 0; S.pulse = 0;
      S.price = (i, n, P) => { const d = S.list[i]; return Math.ceil(d[4] * (1 + d[5] * n) * (1 + 0.015 * (P.wave - 1))); };
      S.buy = (i, P) => {
        const d = S.list[i], n = S.own[d[0]] || 0;
        if (n >= d[6]) return false;
        S.spent += S.price(i, n, P); S.own[d[0]] = n + 1; S.pulse = 0.3; return true;
      };
    },
    update(S, P, dt) { S.pulse = Math.max(0, S.pulse - dt); },
    pointer(e, S, P) {
      if (e.type !== "down" || e.x > 200) return;
      const i = Math.floor((e.y - 38) / 19);
      if (i >= 0 && i < S.list.length) { S.sel = i; S.buy(i, P); }
    },
    draw(g, S, P) {
      const C = g.C; g.clear();
      const READ = { damage: 1, attackSpeed: 1, moveSpeed: 1, maxHp: 1, area: 1, pickupRange: 1, crit: 1, goldFind: 1 };
      S.list.forEach((d, i) => {
        const y = 38 + i * 19, n = S.own[d[0]] || 0, capped = n >= d[6], live = READ[d[2]];
        if (i === S.sel) g.tone(4, y, 196, 18, 0.15, C.accent);
        g.label(d[1], 8, y + 11, live ? C.ink : C.violet);
        for (let k = 0; k < d[6]; k++) {
          const x = 84 + k * 7;
          if (k < n) g.rect(x, y + 5, 5, 8, capped ? C.ink3 : C.accent); else g.rect(x, y + 5, 5, 8, C.ink3, 1);
        }
        g.label(capped ? "MAX" : S.price(i, n, P) + "G", 196, y + 11, capped ? C.ink3 : C.gold, "right");
      });
      // price curve of selected
      const d = S.list[S.sel], x0 = 214, y0 = 40, w = 162, h = 86;
      const prices = []; let cum = 0; const cums = [];
      for (let k = 0; k < d[6]; k++) { const p = S.price(S.sel, k, P); prices.push(p); cum += p; cums.push(cum); }
      const pmax = prices[prices.length - 1], bw = w / d[6];
      g.label(d[1] + " PRICE / STACK", x0, y0 - 4, C.ink2);
      prices.forEach((p, k) => {
        const bh = p / pmax * h * 0.6, owned = k < (S.own[d[0]] || 0);
        if (owned) g.rect(x0 + k * bw, y0 + h - bh, bw - 2, bh, C.gold); else g.tone(x0 + k * bw, y0 + h - bh, bw - 2, bh, 0.35, C.gold);
      });
      g.plot(x0, y0, w, h, cums.map((c) => c / cum), C.ink, 1);
      g.label("TOTAL " + cum + "G", x0 + w, y0 + 8, C.ink, "right");
      // bonus table
      const n = (id) => S.own[id] || 0, by = 148;
      const rows = [["DMG", "+" + (0.1 * n("power")).toFixed(2)], ["ATK", "+" + (0.08 * n("coolant")).toFixed(2)], ["SPD", "+" + 6 * n("boots")],
        ["HP", "+" + 15 * n("plating")], ["AREA", "+" + (0.08 * n("resonator")).toFixed(2)], ["PICK", "+" + 10 * n("magnet")],
        ["CRIT", "+" + (0.04 * n("scope")).toFixed(2)], ["GOLD", "+" + (0.15 * n("ledger")).toFixed(2)]];
      g.label("PLAYER.BONUS", x0, by, C.ink3);
      rows.forEach((r, i) => g.label(r[0] + " " + r[1], x0 + (i % 2) * 82, by + 14 + Math.floor(i / 2) * 12, S.pulse > 0 ? C.accent : C.ink));
      g.label("ARMOR BONUS +" + 2 * n("armor") + ", READ AS 0", 214, 212, n("armor") ? C.violet : C.ink3);
    },
    readout(S, P) { return "spent " + S.spent + " g   price x" + (1 + 0.015 * (P.wave - 1)).toFixed(3); },
  },
});
