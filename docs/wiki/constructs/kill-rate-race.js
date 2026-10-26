Wiki.construct({
  id: "kill-rate-race",
  name: "Kill-rate race",
  family: "pressure",
  origin: "playground",
  status: "partial",
  statusNote: "Model documented, not instrumented. The README and editor help describe the race, but nothing in the game or the balance harness reports arrival rate against clear rate per wave.",
  summary: "Difficulty is a race between how fast HP arrives and how fast the player can remove it; if enemy HP outgrows player damage, the run becomes unwinnable rather than hard.",
  tags: ["difficulty model", "balance", "dps", "backlog"],

  intent:
    "<p>A horde game does not get harder because any one enemy is dangerous. It gets harder when bodies arrive faster than the player can clear them, and the surplus piles up around them. That gives the designer one mental model for every Waves and Economy setting: arrival rate on one side, kill rate (player damage divided by enemy HP) on the other. Push either and the other must follow.</p>" +
    "<p>The failure is lopsided. If the player falls behind, the backlog grows every second and nothing they do in the moment can fix it. That is a lost run, not a hard one, which is why the editor's help text warns about it twice.</p>",

  how:
    "<h3>The two rates</h3>" +
    "<p><b>Arrival</b>, in bodies per second, is the [[spawn-pulse|pulse]] size over the pulse interval: <code>perPulse(w) / interval(w)</code>, from 0.8 at wave 1 to 6.67 at wave 60 (8.3&times;). Multiply by the mean HP of a body (the unlocked mix, weighted by spawn weight &times; pack size: 12 at wave 1, 11.0 with all six types) and by the [[escalation-curve|HP scale]] <code>1.017<sup>w&minus;1</sup></code> (2.70&times; by wave 60) to get HP arriving per second: about 9.6 at wave 1 and 199 at wave 60, a 20.7&times; rise.</p>" +
    "<p><b>Clear</b> is the player's damage per second, which grows from several sources at once: level bumps (+5% damage and +2.5% attack speed per level, additive), passives (Power Cell +10% per stack, Coolant +8%), weapon levels, extra weapons and crits. None of this is summed anywhere in the game.</p>" +
    "<h3>The lesson in HANDOFF</h3>" +
    "<p>One of three structural problems found with the balance harness: enemy HP outgrew player damage, so kill rate fell every wave while spawn rate climbed, and by the last wave the horde arrived 27&times; faster than it could be cleared. The rule that came out of it is in the help for <code>scale.hpPerWave</code>: keep it below the rate player damage grows, and re-check the Waves and Economy pages after touching either.</p>" +
    "<p>HANDOFF's &ldquo;spawn rate climbed 16&times;&rdquo; was measured under older defaults. With today's numbers the rise is 8.3&times; in bodies and 2.70&times; in HP per body. The current state is the opposite problem: the pilot reaches wave 54-60 and survives the full run 58-92% of the time, so the curve is too flat.</p>" +
    "<h3>The ceiling</h3>" +
    "<p>The [[spawn-pulse|alive cap]] (320) bounds the backlog. Once it is full, spawning stalls and pressure stops rising, so a player who has lost the race is held at a fixed, very high threat rather than buried further.</p>",

  knobs: [
    ["Enemy HP per wave", "0.017", "Grows the HP side of arrival", "scale.hpPerWave"],
    ["Enemies per pulse (final)", "6", "Grows the body side of arrival", "wave.countEnd"],
    ["Spawn tick (final)", "0.9 s", "Shorter tick means more pulses", "wave.tickEnd"],
    ["Level damage bonus", "+5% per level", "One source of player damage growth", "level.bonusDamage"],
    ["Max alive", "320", "Ceiling on the backlog", "wave.maxAlive"],
  ],

  related: [
    { id: "spawn-pulse", how: "Arrival rate in bodies per second." },
    { id: "escalation-curve", how: "HP per body; the half of arrival the HANDOFF lesson is about." },
    { id: "shop-economy", how: "Where most of the player's damage growth is bought." },
    { id: "packs", how: "Bursts that beat clear rate locally even when the average holds." },
    { id: "balance-harness", how: "Measures survival and damage, but not this ratio per wave." },
  ],

  questions: [
    "Should the harness write a per-wave table of arrivals, kills and alive count, so the race is measured instead of inferred?",
    "Should the editor show the two curves live, next to the sliders that move them?",
    "Would a director that targets a ratio (Left 4 Dead style) be better than two fixed curves?",
  ],

  sparks: [
    "Show the race to the player as the core HUD element: a tug-of-war bar between arrivals and kills.",
    "Let the player speed up the clock for a reward, so they choose how close to the edge of the race to run.",
    "A late-run enemy whose death adds to clear rate (a bomb carrier), so the comeback lever lives in the horde itself.",
  ],

  terms: [
    { term: "Arrival rate", def: "Bodies (or HP) spawned per second at a given wave.", code: "wave.tick*, wave.count* (no single identifier)" },
    { term: "Kill rate", def: "Player DPS divided by enemy HP; how fast bodies can be removed.", code: "README &ldquo;difficulty model&rdquo; (not computed in code)" },
    { term: "Backlog", def: "Enemies alive because arrival has outpaced clearing; capped by max alive.", code: "#run.enemies, wave.maxAlive" },
  ],

  sources: [
    "playground:HANDOFF.md",
    "playground:README.md",
    "playground:games/horde-survivor/settings.lua:217",
    "playground:games/horde-survivor/settings.lua:241",
    "playground:games/horde-survivor/run.lua:394",
    "playground:games/horde-survivor/content.lua:62",
  ],

  toy: {
    title: "Arrivals against clears",
    hint: "raise the HP rate until the red appears; then raise damage growth to win it back",
    caption: "Arrival HP/s uses the game's pulse ramps, unlock table, weights, packs and HP rate. Player DPS is not instrumented, so its start and growth are guesses (sliders). The backlog line counts surplus bodies, integrated over 15 s waves and capped at 320.",
    w: 384, h: 216,
    controls: [
      { type: "range", key: "hp", label: "HP/wave", min: 0, max: 0.06, step: 0.001, value: 0.017 },
      { type: "range", key: "g", label: "damage growth", min: 0, max: 0.1, step: 0.001, value: 0.045 },
      { type: "range", key: "d0", label: "DPS at wave 1", min: 5, max: 60, value: 20 },
      { type: "range", key: "cEnd", label: "per pulse (final)", min: 1, max: 20, value: 6 },
      { type: "range", key: "tEnd", label: "tick (final)", min: 0.1, max: 2.5, step: 0.05, value: 0.9, fmt: "{} s" },
    ],
    init(S) { S.t = 0; },
    update(S, P, dt) { S.t = (S.t + dt * 4) % 64; },
    draw(g, S, P) {
      const C = g.C, X0 = 16, Y0 = 36, W = 290, H = 150;
      const T = [[1, 10, 1, 12], [5, 8, 6, 5], [13, 4, 1, 18], [21, 3, 1, 52], [29, 4, 1, 26], [41, 3, 1, 34]];
      const A = [], K = [], B = [];
      let back = 0, first = 0;
      for (let w = 1; w <= 60; w++) {
        const t = (w - 1) / 59, iv = Math.max(0.05, 2.5 + (P.tEnd - 2.5) * t), per = 2 + (P.cEnd - 2) * t;
        const un = T.filter((r) => w >= r[0]);
        const mean = un.reduce((a, r) => a + r[1] * r[2] * r[3], 0) / un.reduce((a, r) => a + r[1] * r[2], 0);
        const hpb = mean * Math.pow(1 + P.hp, w - 1);
        const a = per / iv * hpb, k = P.d0 * Math.pow(1 + P.g, w - 1);
        A.push(a); K.push(k);
        back = Math.max(0, Math.min(320 * hpb, back + (a - k) * 15));
        B.push(back / hpb);
        if (!first && a > k) first = w;
      }
      const top = Math.max(50, ...A, ...K) * 1.05;
      const sx = (i) => X0 + i / 59 * W, sy = (v) => Y0 + H - v / top * H;
      g.clear();
      g.line(X0, Y0 + H, X0 + W, Y0 + H, C.ink3, 1);
      for (const w of [1, 20, 40, 60]) g.label(String(w), sx(w - 1), Y0 + H + 10, C.ink3, "center");
      g.label("WAVE", X0 + W, Y0 + H + 20, C.ink3, "right");
      for (let i = 0; i < 59; i++) {
        if (A[i] > K[i] || A[i + 1] > K[i + 1]) {
          const lo = Math.min(sy(A[i]), sy(A[i + 1])), hi = Math.max(sy(K[i]), sy(K[i + 1]));
          g.tone(sx(i), lo, sx(i + 1) - sx(i) + 0.5, Math.max(0, hi - lo), 0.45, C.enemy);
        }
      }
      g.poly(A.map((v, i) => [sx(i), sy(v)]), C.enemy, 2, false);
      g.poly(K.map((v, i) => [sx(i), sy(v)]), C.accent, 2, false);
      g.poly(B.map((v, i) => [sx(i), Y0 + H - v / 320 * H]), C.ink2, 1, false);
      g.label("ARRIVAL HP/S", sx(59) + 4, sy(A[59]) + 3, C.enemy);
      g.label("DPS", sx(59) + 4, sy(K[59]) + 3, C.accent);
      g.label("BACKLOG", sx(59) + 4, Y0 + H - B[59] / 320 * H + 3, C.ink2);
      g.label(Math.round(top) + " HP/S", X0, Y0 - 2, C.ink3);
      const wi = Math.min(59, Math.floor(S.t));
      g.line(sx(wi), Y0, sx(wi), Y0 + H, C.ink3, 1, [2, 2]);
      g.label("W" + (wi + 1) + "  " + Math.round(B[wi]) + " BEHIND", sx(wi) + 3, Y0 + 8, C.ink2);
      S.first = first; S.ratio = A[59] / A[0]; S.end = B[59];
    },
    readout(S) {
      return (S.first ? "falls behind at wave " + S.first : "never falls behind") +
        "\narrival HP x" + (S.ratio || 0).toFixed(1) + " over the run";
    },
  },
});
