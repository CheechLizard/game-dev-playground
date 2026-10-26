Wiki.construct({
  id: "crits",
  name: "Critical hits",
  family: "body",
  origin: "playground",
  status: "built",
  summary: "Each damage event rolls the weapon's (or payload's) crit chance plus the player's bonus; a crit multiplies that hit by 2, so expected damage is 1 + p(m − 1) times base.",
  tags: ["damage", "variance", "rng", "stats"],

  intent:
    "<p>Crits add variance to an otherwise deterministic damage curve: an occasional bigger hit that the player can buy more of. The Rail Lance, a slow and heavy weapon, gets the highest base chance (15%) so its rare shots feel rarer still; area weapons barely crit at all. The Targeting Chip passive is the build lever.</p>",

  how:
    "<h3>The roll</h3>" +
    "<p>In <code>run:damageEnemy(enemy, amount, weaponId, kx, ky, critOverride)</code>, for any damage with a weapon id:</p>" +
    "<p><code>chance = (critOverride or weaponValue(weapon, \"critChance\", level) or 0) + playerStat(\"critChance\")</code></p>" +
    "<p>and if the run RNG rolls under it, <code>amount &times;= player.critMult</code> (2). <code>playerStat(\"critChance\")</code> is the schema base (0) plus <code>player.bonus.crit</code>, which only the Targeting Chip raises (+0.04 per stack, 8 stacks). Flat-stat weapons carry one chance per weapon; an MWS weapon passes the chance off the Payload that dealt the hit as <code>critOverride</code>, so one graph can mix chances. The player bonus is added in both cases.</p>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>Weapon</th><th>Base crit</th><th>Expected &times; at 0 chips</th><th>at 8 chips</th></tr></thead><tbody>" +
    "<tr><td>Blaster (payload)</td><td>0.05</td><td>1.05</td><td>1.37</td></tr>" +
    "<tr><td>Scattergun</td><td>0.05</td><td>1.05</td><td>1.37</td></tr>" +
    "<tr><td>Rail Lance</td><td>0.15</td><td>1.15</td><td>1.47</td></tr>" +
    "<tr><td>Orbit Blades</td><td>0.05</td><td>1.05</td><td>1.37</td></tr>" +
    "<tr><td>Static Field</td><td>0.02</td><td>1.02</td><td>1.34</td></tr>" +
    "</tbody></table></div>" +
    "<h3>What shows</h3>" +
    "<p>A crit is counted per weapon (<code>stats.byWeapon[id].crits</code>) and, for weapons that emit [[hit-feedback]], makes the white core of the hit mark 3 px instead of 2. That is the only visual difference. Static Field and Orbit Blades emit no hit feedback, so their crits are invisible. A <code>render.damageNumbers</code> toggle exists in the schema but nothing reads it.</p>" +
    "<h3>Which RNG</h3>" +
    "<p>Crits roll on the gameplay stream (<code>run.rng</code>), not the cosmetic one. Every hit therefore advances the generator that also rolls drops and shop offers, so a change in hit count shifts what drops later in the same seed. That is consistent with crits being gameplay, and is why a weapon retune changes downstream drops in a seeded comparison.</p>",

  knobs: [
    ["Bonus crit chance", "0", "Added to every weapon's own chance", "player.critChance"],
    ["Crit multiplier", "2×", "Damage multiplier on a crit", "player.critMult"],
    ["Weapon crit chance", "0.02-0.15", "Per flat-stat weapon", "weapon.<id>.critChance"],
    ["Payload crit chance", "0.05 (Blaster)", "Per MWS Payload", "payload critChance"],
    ["Targeting Chip", "+0.04 per stack, max 8", "Shop passive", "passive.scope.*"],
  ],

  related: [
    { id: "passive-stacking", how: "Targeting Chip is the only bonus source." },
    { id: "payloads", how: "An MWS Payload carries its own crit chance." },
    { id: "hit-feedback", how: "The only visual sign of a crit is a larger hit-mark core." },
  ],

  questions: [
    "Crits are nearly invisible. Should they get their own mark, sound or the unused damage numbers?",
    "Should a crit multiplier passive exist, so crit builds can choose between frequency and size?",
  ],

  sparks: [
    "Guaranteed crits on every Nth hit instead of a roll: the same expected value, a rhythm instead of luck.",
    "Crits that trigger effects rather than damage (a crit spawns a secondary strike), so crit chance becomes a proc rate.",
    "Crit chance that grows with consecutive non-crit hits and resets on a crit, smoothing the streaks.",
  ],

  terms: [
    { term: "Crit", def: "A hit multiplied by the crit multiplier after a successful roll.", code: "player.critChance, player.critMult" },
    { term: "Crit override", def: "An MWS Payload's own crit chance, replacing the weapon's.", code: "critOverride in run:damageEnemy" },
  ],

  sources: [
    "playground:games/horde-survivor/run.lua:611",
    "playground:games/horde-survivor/run.lua:257",
    "playground:games/horde-survivor/settings.lua:105",
    "playground:games/horde-survivor/content.lua:185",
    "playground:games/horde-survivor/weapongraphs.lua:74",
    "playground:games/horde-survivor/feedbackdraw.lua:127",
  ],

  toy: {
    title: "Where the crits land",
    hint: "stack chips, raise the multiplier",
    caption: "Exact roll and multiplier at each weapon's level-1 damage and cooldown against one target, no other bonuses; the Blaster fires at its repeater rate, ignoring energy. Top: each hit as a tick, crits tall. Bottom: damage per 3-second window; the line is the expected value 1 + p(m − 1).",
    w: 384, h: 216,
    controls: [
      { type: "select", key: "w", label: "weapon", value: "lance", reset: true, options: [["blaster", "Blaster 7 / 0.55 s"], ["scatter", "Scattergun 4 ×5 / 0.95 s"], ["lance", "Rail Lance 22 / 1.5 s"], ["orbiter", "Orbit Blades 9 / 0.35 s"], ["aura", "Static Field 4 / 0.5 s"]] },
      { type: "range", key: "chips", label: "chips", min: 0, max: 8, value: 0, reset: true },
      { type: "range", key: "mult", label: "crit mult", min: 1, max: 10, step: 0.5, value: 2, reset: true },
    ],
    init(S, P) {
      const W = { blaster: [7, 0.55, 1, 0.05], scatter: [4, 0.95, 5, 0.05], lance: [22, 1.5, 1, 0.15], orbiter: [9, 0.35, 1, 0.05], aura: [4, 0.5, 1, 0.02] };
      const w = W[P.w];
      Object.assign(S, { dmg: w[0], period: w[1], pellets: w[2], p: Math.min(1, w[3] + 0.04 * P.chips), cd: 0, t: 0, win: 0, winT: 0, wins: [], ticks: [], hits: 0, crits: 0, total: 0 });
    },
    update(S, P, dt, kit) {
      S.t += dt; S.cd -= dt; S.winT += dt;
      while (S.cd <= 0) {
        S.cd += S.period;
        for (let i = 0; i < S.pellets; i++) {
          const crit = kit.rand() < S.p, d = crit ? S.dmg * P.mult : S.dmg;
          S.hits++; if (crit) S.crits++; S.total += d; S.win += d;
          S.ticks.push([S.t, crit, i]);
        }
      }
      if (S.winT >= 3) { S.wins.push(S.win); S.win = 0; S.winT -= 3; if (S.wins.length > 400) S.wins.shift(); }
      while (S.ticks.length && S.ticks[0][0] < S.t - 6) S.ticks.shift();
    },
    draw(g, S, P) {
      const C = g.C; g.clear();
      // hit stream, last 6 s
      const x0 = 8, y0 = 82, w = 368;
      g.line(x0, y0, x0 + w, y0, C.rule);
      for (const [t, crit, i] of S.ticks) { const x = x0 + (t - (S.t - 6)) / 6 * w + i * 1.5; g.line(x, y0, x, y0 - (crit ? 36 : 10), crit ? C.gold : C.ink2, crit ? 2 : 1); }
      g.label("HITS, LAST 6 S", x0, y0 + 10, C.ink3);
      // histogram of 3 s windows
      const perWin = 3 / S.period * S.pellets, lo = perWin * S.dmg * 0.5, hi = perWin * S.dmg * Math.max(1.5, 1 + Math.min(1, S.p * 3) * (P.mult - 1));
      const B = 24, bins = new Array(B).fill(0);
      for (const v of S.wins) bins[Math.max(0, Math.min(B - 1, Math.floor((v - lo) / (hi - lo) * B)))]++;
      const bmax = Math.max(1, ...bins), hx = 8, hy = 108, hw = 368, hh = 84;
      bins.forEach((b, i) => { const bh = b / bmax * hh; g.rect(hx + i * hw / B, hy + hh - bh, hw / B - 2, bh, C.accent); });
      g.tone(hx, hy, hw, hh, 0.05, C.ink3);
      const exp = perWin * S.dmg * (1 + S.p * (P.mult - 1)), ex = hx + (exp - lo) / (hi - lo) * hw;
      g.line(ex, hy - 4, ex, hy + hh, C.gold, 1, [3, 2]);
      g.label("EXPECTED " + exp.toFixed(0), Math.min(ex + 3, 300), hy + 6, C.gold);
      g.label(lo.toFixed(0), hx, hy + hh + 12, C.ink3); g.label(hi.toFixed(0), hx + hw, hy + hh + 12, C.ink3, "right");
      g.label("DAMAGE PER 3 S WINDOW (" + S.wins.length + ")", 192, hy + hh + 12, C.ink3, "center");
    },
    readout(S, P) {
      const base = S.dmg * S.pellets / S.period;
      return "crit " + (S.p * 100).toFixed(0) + "%   expected x" + (1 + S.p * (P.mult - 1)).toFixed(2) + "   dps " + (base * (1 + S.p * (P.mult - 1))).toFixed(1) +
        "\nobserved x" + (S.hits ? S.total / (S.hits * S.dmg) : 1).toFixed(2) + " over " + S.hits + " hits";
    },
    thumbSteps: 900,
  },
});
