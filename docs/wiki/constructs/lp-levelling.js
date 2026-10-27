Wiki.construct({
  id: "lp-levelling",
  name: "LP levelling with an automatic stat bump",
  origin: "playground",
  status: "built",
  summary: "Every kill drops LP that never expires; a geometric-plus-flat curve turns it into levels, and each level adds a fixed bundle of stats with no choice attached.",
  tags: ["xp", "levels", "progression", "no draft"],

  intent:
    "<p>The genre's vacuum-up-the-gems loop, kept for its rhythm: kill, collect, ding. What the horde survivor removes is the pick-one-of-three card at each level. HANDOFF records it as a settled decision: \"the player's choices all live in the shop\", Brotato-like rather than Vampire-Survivors-like. A level is a small, certain, automatic gain, so the [[shop-economy|shop]] carries every build decision and a level-up never interrupts the fight.</p>" +
    "<p>The second half of the design is that LP is always worth collecting. Enemies scale on the wave index, never on player level (<code>scale.playerLevelWeight</code> defaults to 0); if they scaled on level, ignoring LP would become the optimal play and fight the core loop.</p>",

  how:
    "<h3>Earning LP</h3>" +
    "<p>Every kill drops one LP pickup worth <code>enemy.lp &times; waveScale.lp &times; (elite ? 5 : 1)</code>, where <code>waveScale.lp = 1.015^(wave&minus;1)</code>: a Grunt's 1 LP is worth 2.41 by wave 60. LP pickups have infinite life; gold and health expire (see [[pickup-magnet]]).</p>" +
    "<h3>The level curve</h3>" +
    "<p><code>run:addLp</code> adds to <code>player.lp</code> and loops while <code>lp &ge; lpNext</code> (guard of 50 level-ups per call), carrying the remainder. The first requirement is <code>level.baseRequirement</code> = 5; after each level <code>lpNext &larr; lpNext &times; 1.28 + 2</code>. The code comment gives the reason: \"early levels are quick without late levels becoming unreachable\".</p>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>Level</th><th>2</th><th>3</th><th>5</th><th>8</th><th>10</th><th>15</th><th>20</th></tr></thead><tbody>" +
    "<tr><td>LP for this level</td><td>5</td><td>8.4</td><td>18.3</td><td>46.3</td><td>80.4</td><td>293</td><td>1026</td></tr>" +
    "<tr><td>Cumulative LP</td><td>5</td><td>13</td><td>44</td><td>151</td><td>292</td><td>1231</td><td>4543</td></tr>" +
    "</tbody></table></div>" +
    "<p>The growth term dominates after level 8 or so: the requirement compounds at 28% per level while LP per kill compounds at 1.5% per wave. A stationary god-mode player in the seed-7 capture reaches level 8 at 2:20 (wave 10).</p>" +
    "<h3>The automatic bump</h3>" +
    "<p><code>run:levelUp</code> adds a fixed bundle to <code>player.bonus</code> and heals 3 (capped at max HP). Bonuses accumulate in the bonus table and are added to the schema base values by <code>run:playerStat</code>, \"so the editor keeps showing the base values you typed\".</p>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>Stat</th><th>Per level</th><th>At level 20</th></tr></thead><tbody>" +
    "<tr><td>Max HP</td><td>+4</td><td>+76</td></tr>" +
    "<tr><td>Damage</td><td>+0.05&times;</td><td>+95%</td></tr>" +
    "<tr><td>Attack speed</td><td>+0.025&times;</td><td>+47.5%</td></tr>" +
    "<tr><td>Move speed</td><td>+0.8 px/s</td><td>+15.2 px/s</td></tr>" +
    "<tr><td>Pickup range</td><td>+0.6 px</td><td>+11.4 px</td></tr>" +
    "<tr><td>Area</td><td>+0.012&times;</td><td>+22.8%</td></tr>" +
    "</tbody></table></div>" +
    "<p>The bump shares <code>player.bonus</code> with [[passive-stacking|passives]], so it is additive with them: level 20's +0.95 damage and four Power Cells' +0.40 make 2.35&times;, not a product.</p>",

  knobs: [
    ["LP for level 2", "5", "First requirement", "level.baseRequirement"],
    ["Requirement growth", "1.28×", "Multiplier per level", "level.growth"],
    ["Flat growth", "2", "Added per level on top of the multiplier", "level.flatGrowth"],
    ["LP value per wave", "0.015", "Compounding LP per kill by wave", "scale.lpPerWave"],
    ["Level-up bonus", "+4 HP, +0.05 dmg, +0.025 atk, +0.8 spd, +0.6 pickup, +0.012 area, heal 3", "The fixed bundle", "level.bonus*"],
    ["Player-level scaling", "0", "How much enemy scaling follows player level", "scale.playerLevelWeight"],
  ],

  related: [
    { id: "shop-economy", how: "Where every choice the level-up does not offer lives." },
    { id: "pickup-magnet", how: "How LP reaches the player; LP is the one pickup that never expires." },
    { id: "passive-stacking", how: "Passives and level bonuses add into the same bonus table." },
    { id: "escalation-curve", how: "LP per kill compounds on the same wave index as enemy HP." },
  ],

  questions: [
    "LP buys nothing but the bump. Is the curve tuned against kill counts at all, or only by feel?",
    "With the level-up carrying no decision, does it need any presentation beyond the HUD bar?",
  ],

  sparks: [
    "Let LP be banked instead of auto-spent: hold it and convert at the shop, so levelling becomes a second currency with an opportunity cost.",
    "LP that decays if left on the field, so the vacuum loop turns into a risk of walking into the horde for it.",
    "A bump that rotates through stats on a visible wheel, so the player times kills to land on the stat they want.",
    "A bump sized by what you did not buy, a quiet counterweight to whatever the shop build neglects.",
  ],

  terms: [
    { term: "LP", def: "The levelling currency dropped by every kill. Never expires.", code: "player.lp, player.lpNext" },
    { term: "Level curve", def: "Requirement per level: geometric growth plus a flat term.", code: "level.baseRequirement, level.growth, level.flatGrowth" },
    { term: "Level-up bonus", def: "The fixed stat bundle every level adds, with no choice.", code: "level.bonus*, run:levelUp" },
    { term: "Bonus table", def: "Per-run stat additions from levels and passives, added to schema base values on read.", code: "player.bonus, run:playerStat" },
  ],

  sources: [
    "playground:games/horde-survivor/run.lua:574",
    "playground:games/horde-survivor/run.lua:586",
    "playground:games/horde-survivor/run.lua:257",
    "playground:games/horde-survivor/run.lua:56",
    "playground:games/horde-survivor/settings.lua:134",
    "playground:HANDOFF.md:85",
  ],

  toy: {
    title: "Kills fill the bar, the curve sets the pace",
    hint: "raise the kill rate or the growth",
    caption: "Exact level curve and bump bundle. Simplified: kills arrive at a steady rate and LP is collected instantly; the wave (and so LP per kill) is fixed by the slider instead of advancing.",
    w: 384, h: 216,
    controls: [
      { type: "range", key: "kps", label: "kills/s", min: 0.5, max: 30, step: 0.5, value: 3 },
      { type: "range", key: "wave", label: "wave", min: 1, max: 60, value: 10 },
      { type: "range", key: "growth", label: "growth", min: 1, max: 1.6, step: 0.01, value: 1.28, reset: true },
      { type: "range", key: "flat", label: "flat", min: 0, max: 20, value: 2, reset: true },
    ],
    init(S) { S.lp = 0; S.next = 5; S.level = 1; S.t = 0; S.acc = 0; S.ding = 0; S.dots = []; S.hist = []; },
    update(S, P, dt, kit) {
      S.t += dt; S.acc += P.kps * dt;
      const per = Math.pow(1.015, P.wave - 1);
      while (S.acc >= 1) {
        S.acc -= 1;
        S.dots.push({ x: 120 + kit.rand() * 250, y: 150 + kit.rand() * 20, a: 0 });
        S.lp += per;
        let guard = 0;
        while (S.lp >= S.next && guard++ < 50) { S.lp -= S.next; S.level++; S.next = S.next * P.growth + P.flat; S.ding = 0.6; S.hist.push(S.t); }
      }
      for (const d of S.dots) d.a += dt;
      S.dots = S.dots.filter((d) => d.a < 0.35);
      S.ding = Math.max(0, S.ding - dt);
    },
    draw(g, S, P) {
      const C = g.C; g.clear();
      // requirement per level, L2..L30, log scale
      const x0 = 14, y0 = 50, w = 220, h = 84, N = 29;
      let req = 5; const reqs = [];
      for (let L = 2; L <= 30; L++) { reqs.push(req); req = req * P.growth + P.flat; }
      const lmax = Math.log10(Math.max(10, reqs[N - 1]));
      g.label("LP NEEDED PER LEVEL (LOG)", x0, y0 - 4, C.ink3);
      for (let i = 0; i < N; i++) {
        const L = i + 2, bh = Math.max(1, Math.log10(Math.max(1, reqs[i])) / lmax * h), bx = x0 + i * (w / N);
        const done = L <= S.level, cur = L === S.level + 1;
        if (done) g.rect(bx, y0 + h - bh, w / N - 1, bh, C.accent);
        else g.tone(bx, y0 + h - bh, w / N - 1, bh, cur ? 0.6 : 0.25, cur ? C.accent : C.ink3);
        if (cur) g.rect(bx, y0 + h - bh * (S.lp / S.next), w / N - 1, bh * (S.lp / S.next), C.accent);
        if (L % 5 === 0) g.label(String(L), bx, y0 + h + 9, C.ink3);
      }
      // LP bar
      g.meter(14, 168, 220, 6, S.lp / S.next, S.ding > 0 ? C.gold : C.accent);
      g.label("LV " + S.level + "  " + S.lp.toFixed(1) + " / " + S.next.toFixed(1) + " LP", 14, 186, S.ding > 0 ? C.gold : C.ink);
      for (const d of S.dots) g.rect(d.x * 0.55 + 10, 190 - d.a * 60, 2, 2, C.accent);
      // stat bump stack
      const n = S.level - 1, sx = 252;
      g.label("AUTO BUMP x" + n, sx, 40, C.ink3);
      const rows = [["MAX HP", "+" + (4 * n)], ["DAMAGE", "+" + (5 * n) + "%"], ["ATK SPD", "+" + (2.5 * n).toFixed(1) + "%"],
        ["MOVE", "+" + (0.8 * n).toFixed(1)], ["PICKUP", "+" + (0.6 * n).toFixed(1)], ["AREA", "+" + (1.2 * n).toFixed(1) + "%"]];
      rows.forEach((r, i) => {
        g.label(r[0], sx, 56 + i * 16, C.ink2);
        g.label(r[1], 376, 56 + i * 16, S.ding > 0 ? C.gold : C.ink, "right");
        g.meter(sx, 59 + i * 16, 124, 2, Math.min(1, n / 40), C.accent, 0.1);
      });
      // level timeline
      g.line(252, 168, 376, 168, C.rule);
      const span = Math.max(30, S.t);
      for (const t of S.hist) g.line(252 + t / span * 124, 164, 252 + t / span * 124, 172, C.gold);
      g.label("DINGS OVER " + span.toFixed(0) + " S", 252, 186, C.ink3);
    },
    readout(S, P) {
      const per = Math.pow(1.015, P.wave - 1);
      return "lp/kill " + per.toFixed(2) + "   t " + S.t.toFixed(0) + " s\nlevel " + S.level + " in " + (S.hist.length ? (S.t / S.hist.length).toFixed(1) : "-") + " s avg";
    },
  },
});
