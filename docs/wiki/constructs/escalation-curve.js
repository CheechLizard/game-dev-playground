Wiki.construct({
  id: "escalation-curve",
  name: "Escalation curve",
  origin: "playground",
  status: "built",
  summary: "Enemy HP, damage, speed and LP value compound per wave index, elites are rolled per spawn on top, and the player's own level contributes nothing by default.",
  tags: ["scaling", "difficulty", "elites", "levelling"],

  intent:
    "<p>The run has to get harder, and the player has to be the reason they keep up. Scaling on the wave index makes difficulty a function of time alone: the player knows what wave 40 will bring regardless of how they played, and every bit of power they gather is pure gain against it.</p>" +
    "<p>The principle, from HANDOFF's settled decisions: <b>enemies scale on wave index, never player level.</b> If they scaled on level, collecting LP would make enemies tougher, so ignoring LP becomes a viable (and eventually optimal) strategy, which fights the core vacuum-up-XP loop. The option is kept behind <code>scale.playerLevelWeight</code>, default 0, with the editor help &ldquo;Try it, but know why it is off.&rdquo;</p>",

  how:
    "<h3>The formula</h3>" +
    "<p><code>run.waveScale(wave, level)</code> computes <code>eff = (wave &minus; 1) + playerLevelWeight &middot; (level &minus; 1)</code> and returns <code>(1 + rate)<sup>eff</sup></code> for each of four rates. Wave 1 is exactly &times;1. HP, speed and LP are applied once at spawn (<code>run:spawnEnemy</code>); damage is applied to contact damage at spawn and to each enemy shot when it is fired.</p>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>Rate</th><th>Default</th><th>Wave 10</th><th>Wave 30</th><th>Wave 60</th></tr></thead><tbody>" +
    "<tr><td>HP</td><td><code>scale.hpPerWave</code> 0.017</td><td>&times;1.16</td><td>&times;1.63</td><td>&times;2.70</td></tr>" +
    "<tr><td>Damage</td><td><code>scale.damagePerWave</code> 0.024</td><td>&times;1.24</td><td>&times;1.99</td><td>&times;4.05</td></tr>" +
    "<tr><td>Speed</td><td><code>scale.speedPerWave</code> 0.003</td><td>&times;1.03</td><td>&times;1.09</td><td>&times;1.19</td></tr>" +
    "<tr><td>LP value</td><td><code>scale.lpPerWave</code> 0.015</td><td>&times;1.14</td><td>&times;1.54</td><td>&times;2.41</td></tr>" +
    "</tbody></table></div>" +
    "<p>Charge speed (<code>chargeSpeed</code>) is read raw, so brute and lancer dashes are neither wave-scaled nor elite-scaled. Gold per wave grows linearly (<code>economy.goldWaveGrowth</code>), not by this curve. The brutal profile sets <code>hpPerWave</code> 0.026 (&times;4.54 at wave 60).</p>" +
    "<p>The rates are per 15 s wave. When waves were shortened from 60 s, each rate was replaced by its fourth root to keep the same curve per minute.</p>" +
    "<h3>Elites, rolled per spawn</h3>" +
    "<p>Each <code>spawnEnemy</code> rolls <code>rng() &lt; scale.eliteChance</code> (3%). An elite has &times;4 HP, &times;1.7 radius (hard-coded), &times;1.15 speed and &times;5 LP and gold drop amount, stacked on the wave scale. Contact damage is not multiplied. The speed bonus exists because &ldquo;a big enemy is a slow bullet sponge you simply walk away from&rdquo;. On average elites add 9% HP and 12% LP per spawn.</p>" +
    "<h3>Why player level is weighted zero</h3>" +
    "<p>Each level gives a fixed bundle: +5% damage and +2.5% attack speed (additive), +4 max HP and more. With weight <i>w</i> &gt; 0 every level also adds <i>w</i> waves' worth of enemy scaling, so each level is a trade instead of a gift. At the default rates the trade still pays (the next level at level 24 is +3.9% kill speed against +1.7% enemy HP at weight 1), but the margin shrinks with every level, and above about <code>hpPerWave</code> 0.04 at weight 1 the next level costs more than it gives. From there a player who refuses LP is stronger than one who collects it. The toy plots it.</p>" +
    "<p>The level bundle is a small share of the player's power; most comes from the shop. Under level weighting, every level also devalues everything bought there, which the toy's level-only model leaves out and which makes the case for zero stronger.</p>",

  knobs: [
    ["Enemy HP per wave", "0.017", "Compounding HP growth; keep below player damage growth", "scale.hpPerWave"],
    ["Enemy damage per wave", "0.024", "Compounding contact and shot damage growth", "scale.damagePerWave"],
    ["Enemy speed per wave", "0.003", "Compounding move speed growth (not charge speed)", "scale.speedPerWave"],
    ["LP value per wave", "0.015", "Compounding LP drop growth", "scale.lpPerWave"],
    ["Player level weight", "0", "Waves of scaling each player level adds; 0 means levels are free", "scale.playerLevelWeight (0-1)"],
    ["Elite chance / HP / speed / reward", "0.03 / 4x / 1.15x / 5x", "Per-spawn elite roll and its multipliers", "scale.eliteChance, eliteHpMult, eliteSpeedMult, eliteRewardMult"],
  ],

  related: [
    { id: "wave-clock", how: "Supplies the wave index the curve is indexed on." },
    { id: "kill-rate-race", how: "The HP curve against player damage growth is the race." },
    { id: "lp-levelling", how: "LP value growth races the level requirement; weight 0 keeps levels pure upside." },
    { id: "shop-economy", how: "Where most player power comes from, and what level weighting would quietly tax." },
    { id: "enemy-behaviours", how: "Charge speed is outside the curve; everything else in a behaviour scales." },
  ],

  questions: [
    "HANDOFF: the curve is &ldquo;too flat for ~28 shop visits&rdquo; (pilot reaches wave 54-60, survives 58-92%). Raise the endpoint, or change the shape?",
    "Would per-type curves, or steps every 10 waves, read better than one smooth exponential?",
    "Should damage outpace HP, so late enemies are more dangerous rather than spongier?",
    "Elites differ only in numbers, and their 1.7 radius is not a schema setting. Should they get behaviour?",
  ],

  sparks: [
    "Opt-in heat: let the player choose which axis escalates in return for gold, Hades-style.",
    "Scale count instead of HP, so time-to-kill stays constant and area damage becomes the answer.",
    "Scale on time since the player was last hit: flawless play is rewarded with pressure.",
    "Turn level weighting into a deliberate mechanic: a cursed item that makes enemies scale on your level in return for a big shop discount.",
  ],

  terms: [
    { term: "Wave scale", def: "Per-wave compounding multipliers for enemy HP, damage, speed and LP.", code: "run.waveScale, scale.*PerWave" },
    { term: "Player level weight", def: "How many waves of scaling each player level adds. Default 0.", code: "scale.playerLevelWeight" },
    { term: "Elite", def: "A per-spawn rolled variant: more HP, bigger, faster, bigger reward.", code: "enemy.elite, scale.elite*" },
  ],

  sources: [
    "playground:games/horde-survivor/run.lua:54",
    "playground:games/horde-survivor/run.lua:303",
    "playground:games/horde-survivor/run.lua:934",
    "playground:games/horde-survivor/settings.lua:237",
    "playground:games/horde-survivor/settings.lua:145",
    "playground:HANDOFF.md",
  ],

  shots: [
    { src: "img/horde-wave60.png", caption: "Wave 60 at 14:46, god mode: the whole cast at x2.70 HP and x4.05 damage. Spitters (diamonds), orbiters (rings), a lancer (triangle) and a brute (block) around a clump of grunts and swarmers; the larger pale bodies are probably elites.", cmd: "luajit tools/screenshot.lua lastwave.png --at 5 --seed 7 --set debug.godMode=true --do \"Skip to last wave\" --frames 3 --every 4 (third frame)" },
  ],

  toy: {
    title: "Four curves and a level tax",
    hint: "drag across the chart to pick a wave; then raise the level weight and the HP rate",
    caption: "Log scale, x1 to x16. Solid: enemies met by a player who collects LP (levels gained per wave is an assumption, slider). Dashed: enemies met by a player who stays level 1. They are identical at weight 0. The verdict compares only the level-up bundle (+5% damage, +2.5% attack speed per level) with the extra enemy HP it buys.",
    w: 384, h: 216,
    controls: [
      { type: "range", key: "hp", label: "HP/wave", min: 0, max: 0.1, step: 0.001, value: 0.017 },
      { type: "range", key: "dmg", label: "damage/wave", min: 0, max: 0.1, step: 0.001, value: 0.024 },
      { type: "range", key: "spd", label: "speed/wave", min: 0, max: 0.05, step: 0.001, value: 0.003 },
      { type: "range", key: "lp", label: "LP/wave", min: 0, max: 0.1, step: 0.001, value: 0.015 },
      { type: "range", key: "k", label: "level weight", min: 0, max: 1, step: 0.05, value: 0 },
      { type: "range", key: "lpw", label: "levels/wave", min: 0.1, max: 1, step: 0.05, value: 0.4 },
    ],
    init(S) { S.w = 60; },
    pointer(e, S) { if (e.down && e.x >= 14 && e.x <= 236) S.w = Math.max(1, Math.min(60, Math.round(1 + (e.x - 14) / 222 * 59))); },
    draw(g, S, P) {
      const C = g.C, X0 = 14, Y0 = 38, W = 222, H = 160, LMAX = Math.log(16);
      const L = (w) => 1 + P.lpw * (w - 1);
      const m = (r, w, lv) => Math.pow(1 + r, (w - 1) + P.k * (lv - 1));
      const sx = (w) => X0 + (w - 1) / 59 * W, sy = (v) => Y0 + H - Math.min(1, Math.log(Math.max(1, v)) / LMAX) * H;
      g.clear();
      for (const v of [1, 2, 4, 8, 16]) { g.line(X0, sy(v), X0 + W, sy(v), C.ink3, 0.5, [1, 3]); g.label("X" + v, X0 + W + 3, sy(v) + 3, C.ink3); }
      for (const w of [1, 20, 40, 60]) g.label(String(w), sx(w), Y0 + H + 10, C.ink3, "center");
      const series = [["hp", C.enemy, "HP"], ["dmg", C.gold, "DMG"], ["spd", C.sky, "SPD"], ["lp", C.accent, "LP"]];
      series.forEach(([key, col, name], i) => {
        const a = [], b = [];
        for (let w = 1; w <= 60; w++) { a.push([sx(w), sy(m(P[key], w, L(w)))]); b.push([sx(w), sy(m(P[key], w, 1))]); }
        if (P.k > 0) for (let j = 0; j < b.length - 1; j += 2) g.line(b[j][0], b[j][1], b[j + 1][0], b[j + 1][1], col, 1);
        g.poly(a, col, 1.5, false);
        g.label(name + " X" + m(P[key], S.w, L(S.w)).toFixed(2), 262, 50 + i * 11, col);
      });
      g.line(sx(S.w), Y0, sx(S.w), Y0 + H, C.ink2, 1);
      // verdict at the scrubbed wave
      const lv = L(S.w), n = lv - 1;
      const gain = ((1 + 0.05 * (n + 1)) / (1 + 0.05 * n)) * ((1 + 0.025 * (n + 1)) / (1 + 0.025 * n));
      const tax = Math.pow(1 + P.hp, P.k);
      const kill = (1 + 0.05 * n) * (1 + 0.025 * n) / Math.pow(1 + P.hp, P.k * n);
      g.label("WAVE " + S.w + "  LEVEL " + lv.toFixed(1), 262, 108, C.ink);
      g.label("NEXT LEVEL", 262, 124, C.ink3);
      g.label("+" + ((gain - 1) * 100).toFixed(1) + "% KILL SPEED", 262, 135, C.accent);
      g.label("+" + ((tax - 1) * 100).toFixed(1) + "% ENEMY HP", 262, 146, C.enemy);
      g.label("COLLECTOR VS LEVEL 1", 262, 164, C.ink3);
      g.label("X" + kill.toFixed(2) + " KILL SPEED", 262, 175, kill >= 1 ? C.ink : C.enemy);
      const pays = gain >= tax;
      g.text(pays ? "LEVELS PAY" : "IGNORE LP", 262, 198, { color: pays ? C.accent : C.enemy, size: 16 });
    },
    readout(S, P) { return "wave " + S.w + "   weight " + P.k.toFixed(2); },
  },
});
