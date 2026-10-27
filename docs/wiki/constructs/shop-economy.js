Wiki.construct({
  id: "shop-economy",
  name: "Shop economy: gold, offers and rerolls",
  origin: "playground",
  status: "built",
  statusNote: "Built and balanced against a scripted pilot that never rerolls. The open problem it has surfaced, Blaster dominance, is not solved.",
  summary: "Gold from wave clears and drops funds a shop every two waves: eight shuffled offers of weapons, weapon levels, passives and one heal, priced against the wave, with a reroll that costs 5 more each time.",
  tags: ["shop", "gold", "reroll", "build choice", "brotato-like"],

  intent:
    "<p>The shop is the only place a horde-survivor run asks the player to choose. Levels give a fixed bump ([[lp-levelling]]), so the shop has to carry the build: which guns, how far to level them, which stats to stack, whether to heal. That sets its size. The settings comment says it \"has to be able to fund 25-35 purchases across a run\", and HANDOFF records the fix that made it possible: income had been about 90 gold per run.</p>" +
    "<p>Prices rise with the wave so late gold is not free power, and rerolls escalate within a visit so fishing for one item costs real money.</p>",

  how:
    "<h3>Gold in</h3>" +
    "<p>Clearing wave <i>w</i> pays <code>6.5 + 0.75&middot;(w&minus;1)</code>: 6.5 at wave 1, 50.75 at wave 60, 1717.5 over a full run. Each kill also rolls <code>goldChance &times; luck</code> for a drop worth <code>goldPerDrop</code> = 4 (&times;5 from an elite); the Grunt's chance is 0.06, the Brute's 0.35. Gold drops expire after 20 s on the ground. All gold is multiplied by <code>goldFind</code> (Ledger adds 0.15 per stack). Starting gold is 0 and gold does not carry between runs.</p>" +
    "<h3>When the shop opens</h3>" +
    "<p>15-minute runs of 15 s waves give 60 waves; the shop opens after every second wave, 30 opens per run (HANDOFF's figure is ~28 visits). The clock pauses while it is open (<code>run.shopPausesClock</code>). The wave counter has already advanced when the offer is rolled, so the first shop prices against wave 3.</p>" +
    "<h3>The offer</h3>" +
    "<p><code>run:rollShop</code> builds a candidate list, shuffles it with the run RNG (Fisher&ndash;Yates) and keeps the first <code>shop.itemCount</code> = 8, laid out 4 &times; 2. With <code>priceMult = 1 + 0.015&middot;(wave&minus;1)</code> (1.885&times; by wave 60):</p>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>Candidate</th><th>When offered</th><th>Price</th></tr></thead><tbody>" +
    "<tr><td>Weapon level</td><td>Owned and below level 5</td><td><code>ceil(upgradeCost &times; priceMult &times; (1 + 0.25&middot;(level&minus;1)))</code></td></tr>" +
    "<tr><td>New weapon</td><td>Not owned and a slot is free (6 slots)</td><td><code>ceil(cost &times; priceMult)</code></td></tr>" +
    "<tr><td>Passive</td><td>Every passive below its cap</td><td>see [[passive-stacking]]</td></tr>" +
    "<tr><td>Field Repair</td><td>Always one</td><td><code>ceil(18 &times; priceMult)</code> for +25 HP</td></tr>" +
    "</tbody></table></div>" +
    "<p>Base costs (new / upgrade): Blaster &mdash; / 22, Scattergun 35 / 26, Static Field 50 / 30, Orbit Blades 45 / 32, Rail Lance 55 / 38. A weapon level adds its <code>perLevel</code> growth to every stat, for example Rail Lance +9 damage and &minus;0.1 s cooldown per level. Weapons alone cannot fill eight cells (there are only five), which is why passives exist.</p>" +
    "<h3>Rerolls and free weapons</h3>" +
    "<p>A reroll costs <code>shop.rerollCost</code> = 10, then 5 more for each further reroll in the same visit (10, 15, 20...), and resets on the next visit. It is not wave-inflated. Separately, each kill has a <code>0.004 &times; luck</code> chance to drop a random unowned weapon if a slot is free; it expires after 20 s. In the seed-7 capture a stationary player picks up a Rail Lance this way before the first shop.</p>" +
    "<h3>What the harness found</h3>" +
    "<p>The scripted pilot buys new weapons first, then upgrades, then passives, cheapest first within a rank (buying strictly cheapest-first collapsed every run onto the starting gun). Even so, <b>the Blaster does about 85% of all damage</b> in every configuration tested: it \"starts equipped, is always in range, and has the cheapest upgrades\". Static Field contributes under 4%.</p>",

  knobs: [
    ["Gold per wave", "6.5 (+0.75 per wave)", "Wave-clear income", "economy.goldPerWave, economy.goldWaveGrowth"],
    ["Gold per drop", "4", "Value of a gold pickup", "economy.goldPerDrop, enemy.<id>.goldChance"],
    ["Waves per shop", "2", "How often the shop opens", "run.wavesPerShop"],
    ["Items offered", "8", "Cells in the offer grid", "shop.itemCount"],
    ["Price growth", "0.015 per wave", "Wave inflation of every price but rerolls", "shop.priceWaveGrowth"],
    ["Reroll", "10, +5 per use", "Per-visit escalating reroll", "shop.rerollCost, shop.rerollGrowth"],
    ["Heal", "18 g for 25 HP", "The one heal offer", "shop.healCost, shop.healAmount"],
    ["Weapon drop chance", "0.004 per kill", "Free unowned weapon", "economy.weaponDropChance"],
    ["Weapon slots / max level", "6 / 5", "Caps on weapon offers", "player.weaponSlots, weapon.<id>.maxLevel"],
  ],

  related: [
    { id: "lp-levelling", how: "Levels give no choice, so the shop holds all of it." },
    { id: "passive-stacking", how: "Passives fill the offer grid that weapons cannot." },
    { id: "wave-clock", how: "The wave index sets both income and price inflation." },
    { id: "balance-harness", how: "The pilot whose buying order found the Blaster's dominance." },
    { id: "store-gambling", how: "A different answer to what a shop is for." },
  ],

  questions: [
    "How to break the Blaster's ~85% share: make the alternatives better, or let the starting gun fall off?",
    "There is no lock, hold or sell. Should an offer survive into the next visit?",
    "The heal is a flat +25 HP while max HP grows with levels and Plating. Should it scale?",
    "The final wave opens a shop that can never be used.",
  ],

  sparks: [
    "Price each weapon's upgrades by its current share of damage, so the dominant gun gets expensive and the shop pushes diversity.",
    "A draft shop: buying an offer removes its two neighbours, so position in the grid becomes part of the choice.",
    "Reroll a single cell instead of the grid, at a price that rises per cell.",
    "Interest on unspent gold, so skipping a visit is a real build path.",
  ],

  terms: [
    { term: "Shop item", def: "One offer cell; its kind is weapon, upgrade, passive or heal.", code: "item.kind, run:rollShop" },
    { term: "Price multiplier", def: "Wave inflation applied to every offer.", code: "priceMult, shop.priceWaveGrowth" },
    { term: "Reroll", def: "Replace the whole offer; cost grows within one visit.", code: "run:shopReroll, shop.rerollCost" },
    { term: "Per-level growth", def: "What each weapon level adds to a stat.", code: "weapon.<id>.perLevel.*, run.weaponValue" },
    { term: "Weapon pickup", def: "A free unowned weapon dropped by a kill.", code: "pk.kind == \"weapon\"" },
  ],

  sources: [
    "playground:games/horde-survivor/run.lua:433",
    "playground:games/horde-survivor/run.lua:454",
    "playground:games/horde-survivor/run.lua:522",
    "playground:games/horde-survivor/run.lua:549",
    "playground:games/horde-survivor/run.lua:654",
    "playground:games/horde-survivor/settings.lua:164",
    "playground:games/horde-survivor/content.lua:168",
    "playground:tools/simsuite.lua:105",
    "playground:HANDOFF.md:136",
  ],

  shots: [
    { src: "img/shop.png", caption: "The shop grid at wave 3 with +100 debug gold: weapons, a Blaster level, passives and Field Repair.", cmd: "luajit tools/screenshot.lua shop.png --at 8 --seed 7 --do \"+100 gold\" --do \"Open shop\"" },
  ],

  toy: {
    title: "Thirty visits on one budget",
    hint: "click a cell to buy · reroll · next visit",
    caption: "Exact offer rules and prices. Simplified: drop income is kills/wave × 6% × 4 g (the Grunt's odds), weapon drops roll once per visit, and nothing fights you. Bars under the grid: gold in (light) and spent (solid) per visit.",
    w: 384, h: 216,
    controls: [
      { type: "range", key: "kills", label: "kills/wave", min: 0, max: 150, value: 40 },
      { type: "button", label: "reroll", press(S) { S.reroll(); } },
      { type: "button", label: "next visit", press(S, P, kit) { S.next(P, kit); } },
      { type: "button", label: "pilot buys", press(S) { S.pilot(); } },
    ],
    init(S, P, kit) {
      const W = { blaster: ["BLASTER", 0, 22], scatter: ["SCATTER", 35, 26], lance: ["RAIL LANCE", 55, 38], orbiter: ["ORBIT BLD", 45, 32], aura: ["STATIC FLD", 50, 30] };
      const PS = { power: ["POWER", 30, 0.35, 10], coolant: ["COOLANT", 32, 0.35, 10], boots: ["THRUSTER", 26, 0.3, 10], plating: ["PLATING", 28, 0.3, 12],
        resonator: ["RESONATR", 34, 0.35, 8], magnet: ["MAGNET", 22, 0.25, 10], scope: ["T.CHIP", 36, 0.4, 8], ledger: ["LEDGER", 24, 0.3, 8] };
      const g0 = 6.5 + 7.25 + 2 * P.kills * 0.24;
      Object.assign(S, { wave: 3, visit: 1, gold: g0, owned: { blaster: 1 }, pass: {}, hist: [], spent: 0, msg: "", flash: 0, rr: 10 });
      S.hist.push([g0, 0]);
      const roll = () => {
        const pm = 1 + 0.015 * (S.wave - 1), cand = [];
        for (const id in W) {
          const lv = S.owned[id];
          if (lv) { if (lv < 5) cand.push({ kind: "upgrade", id, name: W[id][0], sub: "LV" + (lv + 1), cost: Math.ceil(W[id][2] * pm * (1 + 0.25 * (lv - 1))) }); }
          else if (Object.keys(S.owned).length < 6) cand.push({ kind: "weapon", id, name: W[id][0], sub: "NEW", cost: Math.ceil(Math.max(1, W[id][1]) * pm) });
        }
        for (const id in PS) { const n = S.pass[id] || 0; if (n < PS[id][3]) cand.push({ kind: "passive", id, name: PS[id][0], sub: "X" + (n + 1), cost: Math.ceil(PS[id][1] * (1 + PS[id][2] * n) * pm) }); }
        cand.push({ kind: "heal", name: "REPAIR", sub: "+25 HP", cost: Math.ceil(18 * pm) });
        for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(kit.rand() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
        S.items = cand.slice(0, 8);
      };
      S.buy = (i) => {
        const it = S.items[i]; if (!it || it.bought) return;
        if (S.gold < it.cost) { S.msg = "NOT ENOUGH GOLD"; S.flash = 1; return; }
        if (it.kind === "upgrade") S.owned[it.id]++; else if (it.kind === "weapon") S.owned[it.id] = 1; else if (it.kind === "passive") S.pass[it.id] = (S.pass[it.id] || 0) + 1;
        S.gold -= it.cost; S.spend(it.cost); it.bought = true; S.msg = "BOUGHT " + it.name + " " + it.sub;
      };
      S.spend = (c) => { S.spent += c; S.hist[S.hist.length - 1][1] += c; };
      S.reroll = () => {
        if (S.visit > 30) return;
        if (S.gold < S.rr) { S.msg = "REROLL NEEDS " + S.rr; S.flash = 1; return; }
        S.gold -= S.rr; S.spend(S.rr); S.rr += 5; roll(); S.msg = "REROLLED, NEXT " + S.rr;
      };
      S.next = (P2) => {
        if (S.visit >= 30) { S.visit = 31; S.msg = "RUN OVER AT WAVE 60"; return; }
        const gf = 1 + 0.15 * (S.pass.ledger || 0);
        let inc = 0;
        for (const w of [S.wave, S.wave + 1]) inc += (6.5 + 0.75 * (w - 1) + P2.kills * 0.06 * 4) * gf;
        S.gold += inc; S.wave += 2; S.visit++; S.rr = 10; S.hist.push([inc, 0]); S.msg = "+" + inc.toFixed(0) + " GOLD";
        const pDrop = 1 - Math.pow(1 - 0.004, P2.kills * 2), free = Object.keys(W).filter((id) => !S.owned[id]);
        if (free.length && kit.rand() < pDrop) { const id = free[Math.floor(kit.rand() * free.length)]; S.owned[id] = 1; S.msg += ", FREE " + W[id][0]; }
        roll();
      };
      S.pilot = () => {
        const rank = (it) => (it.kind === "weapon" ? 1 : it.kind === "upgrade" ? 2 : it.kind === "passive" ? 3 : 9);
        for (;;) {
          let best = -1;
          S.items.forEach((it, i) => { if (!it.bought && it.cost <= S.gold && (best < 0 || rank(it) < rank(S.items[best]) || (rank(it) === rank(S.items[best]) && it.cost < S.items[best].cost))) best = i; });
          if (best < 0) break; S.buy(best);
        }
      };
      S.W = W; roll();
    },
    update(S, P, dt) { S.flash = Math.max(0, S.flash - dt); },
    pointer(e, S) {
      if (e.type !== "down") return;
      const c = Math.floor((e.x - 120) / 64), r = Math.floor((e.y - 34) / 50);
      if (c >= 0 && c < 4 && r >= 0 && r < 2 && e.x >= 120) S.buy(r * 4 + c);
    },
    draw(g, S) {
      const C = g.C; g.clear();
      const KC = { weapon: C.gold, upgrade: C.gold, passive: C.sky, heal: C.enemy };
      S.items.forEach((it, i) => {
        const x = 120 + (i % 4) * 64, y = 34 + Math.floor(i / 4) * 50;
        if (it.bought) { g.tone(x, y, 60, 46, 0.15, C.ink3); g.label("SOLD", x + 30, y + 27, C.ink3, "center"); return; }
        const ok = S.gold >= it.cost;
        g.rect(x, y, 60, 46, ok ? KC[it.kind] : C.ink3, 1);
        g.label(it.kind.toUpperCase(), x + 4, y + 11, KC[it.kind]);
        g.label(it.name, x + 4, y + 24, C.ink);
        g.label(it.sub, x + 4, y + 34, C.ink2);
        g.label(it.cost + "G", x + 56, y + 43, ok ? C.ink : C.enemy, "right");
      });
      // left panel
      g.label("GOLD " + Math.floor(S.gold), 8, 50, S.flash > 0 ? C.enemy : C.gold);
      g.label("REROLL " + S.rr + "G", 8, 64, C.ink2);
      let y = 82;
      for (const id in S.W) if (S.owned[id]) { g.label(S.W[id][0] + " L" + S.owned[id], 8, y, C.ink); y += 11; }
      g.label(S.msg, 120, 146, S.flash > 0 ? C.enemy : C.ink2);
      // per-visit history: in (tone) vs spent (solid)
      const bx = 8, by = 208, bh = 50, bw = 368 / 30;
      const max = Math.max(60, ...S.hist.map((h) => Math.max(h[0], h[1])));
      S.hist.forEach((h, i) => {
        const x = bx + i * bw, hi = h[0] / max * bh, hs = h[1] / max * bh;
        g.tone(x, by - hi, bw - 2, hi, 0.4, C.gold);
        g.rect(x + 2, by - hs, bw - 6, hs, C.gold);
      });
      g.line(bx, by + 0.5, bx + 368, by + 0.5, C.rule);
    },
    readout(S) {
      return "visit " + Math.min(30, S.visit) + "/30   wave " + S.wave + "   price x" + (1 + 0.015 * (S.wave - 1)).toFixed(3) + "\nspent " + Math.floor(S.spent);
    },
  },
});
