Wiki.construct({
  id: "wave-clock",
  name: "Wave clock",
  origin: "playground",
  status: "built",
  statusNote: "Built in horde-survivor. One inferred edge case: the 60th wave ends on the same frame the run is won, which looks like it opens a 30th shop that can never be used (read from code order, not seen in play).",
  summary: "A wave is a fixed 15 s block of time, numbered from 1; the clock advances it, not kills, and that one integer is both the player's progress and the difficulty curve's position.",
  tags: ["timing", "waves", "unlocks", "weighted pick"],

  intent:
    "<p>The player cannot stall a wave by refusing to kill, and cannot rush one by killing fast. Time passes, the wave number goes up, and every escalating system reads that number. This keeps the run's length predictable (15 minutes, 60 waves) and gives the designer one dial, the wave index, that scaling, unlocks, gold and shop cadence all key off.</p>" +
    "<p>Numbering starts at 1 and has no offset: wave 1 is both the start of the run and the bottom of the curve. An earlier <code>startWave</code> offset was removed so the two could never drift apart.</p>",

  how:
    "<h3>The clock</h3>" +
    "<p>While the run is <code>playing</code>, <code>run.time</code> and <code>run.waveTime</code> both accumulate <code>dt</code>. When <code>waveTime &ge; run.waveSeconds</code> (15 s) <code>advanceWave()</code> runs: it pays <code>goldPerWave + goldWaveGrowth &times; (wave &minus; 1)</code>, marks a pending shop when <code>wave % wavesPerShop == 0</code>, increments <code>wave</code>, resets <code>waveTime</code> and opens the shop if one is pending. The run is won when <code>time &ge; durationMinutes &times; 60</code> while still playing.</p>" +
    "<p>Wave count is <code>floor(duration / waveSeconds + 0.5)</code> = 60. With a shop every 2 waves that is 30 shop openings (HANDOFF rounds it to &ldquo;~28&rdquo;). The shop pauses the clock by default (<code>run.shopPausesClock</code>), so 15:00 is 15 minutes of play, not of wall time. The HUD shows remaining <code>M:SS</code>, <code>WAVE n / 60</code> and a thin progress bar for the current wave.</p>" +
    "<h3>The wave table</h3>" +
    "<p>Enemy types unlock at a fixed wave and stay in the pool for the rest of the run, so later waves stay varied instead of only showing the newest type. <code>content.unlockedAt(wave)</code> returns every row whose wave has been reached; each spawn pick then rolls <code>rng() &times; &Sigma;weight</code> over that list.</p>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>Enemy</th><th>Unlock wave</th><th>Clock</th><th>Weight</th><th>Pack</th><th>Picks (all unlocked)</th><th>Bodies (all unlocked)</th></tr></thead><tbody>" +
    "<tr><td>Grunt</td><td>1</td><td>0:00</td><td>10</td><td>1</td><td>31%</td><td>14%</td></tr>" +
    "<tr><td>Swarmer</td><td>5</td><td>1:00</td><td>8</td><td>6</td><td>25%</td><td>67%</td></tr>" +
    "<tr><td>Spitter</td><td>13</td><td>3:00</td><td>4</td><td>1</td><td>12.5%</td><td>6%</td></tr>" +
    "<tr><td>Brute</td><td>21</td><td>5:00</td><td>3</td><td>1</td><td>9.4%</td><td>4%</td></tr>" +
    "<tr><td>Lancer</td><td>29</td><td>7:00</td><td>4</td><td>1</td><td>12.5%</td><td>6%</td></tr>" +
    "<tr><td>Orbiter</td><td>41</td><td>10:00</td><td>3</td><td>1</td><td>9.4%</td><td>4%</td></tr>" +
    "</tbody></table></div>" +
    "<p>A pick spawns a whole [[packs|pack]], so the share of picks and the share of bodies differ: swarmers are a quarter of picks and two thirds of everything that walks at you. Weights never change with the wave, so grunts are 31% of picks forever.</p>" +
    "<h3>Changing the wave length re-bases everything</h3>" +
    "<p>The table is indexed by wave, not by minute. When waves went from 60 s to 15 s the unlock waves were re-indexed to keep the same clock times, and every per-wave growth rate was replaced by its fourth root (commit <code>5211bd0</code>). Lengthen the wave without doing that and the late unlocks fall off the end of the run: at 60 s waves, wave 41 would start at 40:00.</p>" +
    "<h3>The last shop</h3>" +
    "<p>At 15:00 the 60th <code>advanceWave</code> runs before the win check in the same update. Since 60 % 2 == 0 it opens a shop, the state becomes <code>shop</code>, the win check (which requires <code>playing</code>) is skipped, and the run is only won after that shop is closed. Read from code order; not confirmed in play.</p>",

  knobs: [
    ["Run length", "15 min", "Total run time; wave count is length / wave length", "run.durationMinutes (live = false)"],
    ["Wave length", "15 s", "Seconds per wave; the unit every per-wave rate is measured in", "run.waveSeconds"],
    ["Waves per shop", "2", "Shop opens after every Nth wave", "run.wavesPerShop"],
    ["Shop pauses clock", "on", "Whether time runs while shopping", "run.shopPausesClock"],
    ["Spawn weight", "10 / 8 / 4 / 3 / 4 / 3", "Relative pick chance per unlocked type", "enemy.<id>.weight"],
    ["Unlock waves", "1, 5, 13, 21, 29, 41", "When each type joins the pool (content, not a schema setting)", "content.waveTable"],
  ],

  related: [
    { id: "spawn-pulse", how: "Interpolates pulse interval and size on the same wave index." },
    { id: "escalation-curve", how: "Compounds enemy stats per wave index; newcomers arrive already scaled." },
    { id: "packs", how: "Why a weighted pick and a body count are different shares." },
    { id: "shop-economy", how: "Opens on the clock's cadence and prices against the current wave." },
    { id: "level-loop", how: "The wave block and shop visit together form the run's repeating unit." },
  ],

  questions: [
    "Should the final wave skip its shop, or should 15:00 end on a climax (the deferred boss)?",
    "Should a wave have internal shape, such as a lull before each shop, instead of a flat 15 s?",
    "Unlock waves live in content and cannot be tuned from the editor. Should they be schema settings so the curve and the cast can be tuned together?",
    "Weights never change with the wave. Should early types retire, or should weights drift?",
  ],

  sparks: [
    "Treat waves as musical bars: pulses on the beat, the shop on the downbeat of every second bar, the soundtrack as the clock's display.",
    "A clock that runs faster while the player is winning: rubber-banding on time instead of on enemy stats.",
    "Let the player buy time: spend gold to stretch the current wave, at the price of a smaller shop.",
    "Show next wave's newcomers in the HUD, so the clock becomes something to plan against.",
  ],

  terms: [
    { term: "Wave", def: "A fixed block of play time, numbered from 1; progress and difficulty position at once.", code: "run.wave, run.waveSeconds, run:waveCount()" },
    { term: "Wave table", def: "The waves at which each enemy type joins the spawn pool; types never leave.", code: "content.waveTable, content.unlockedAt" },
    { term: "Spawn weight", def: "Relative chance an unlocked type is picked for a pack.", code: "enemy.<id>.weight" },
    { term: "Run state", def: "playing, shop, dead or won; only playing advances the clock (unless the shop is set not to pause it).", code: "run.STATE" },
  ],

  sources: [
    "playground:games/horde-survivor/run.lua:1395",
    "playground:games/horde-survivor/run.lua:433",
    "playground:games/horde-survivor/run.lua:185",
    "playground:games/horde-survivor/content.lua:263",
    "playground:games/horde-survivor/run.lua:357",
    "playground:games/horde-survivor/settings.lua:38",
    "playground:HANDOFF.md",
  ],

  toy: {
    title: "Scrub a run",
    hint: "drag across the stage to scrub time; then stretch the wave length",
    caption: "Ticks are waves, gold squares are shop openings, a red square is a shop that opens at the moment the run is won. Unlocks are pinned to wave numbers, so a longer wave pushes them later in minutes. Shop time is not shown (the clock pauses there).",
    w: 384, h: 216,
    controls: [
      { type: "range", key: "ws", label: "wave length", min: 5, max: 60, value: 15, fmt: "{} s" },
      { type: "range", key: "wps", label: "waves/shop", min: 1, max: 10, value: 2 },
      { type: "toggle", key: "play", label: "play (60x)", value: true },
    ],
    init(S) { S.t = 0; S.drag = false; },
    update(S, P, dt) {
      if (P.play && !S.drag) S.t = (S.t + dt * 60) % 900;
    },
    pointer(e, S) {
      if (e.type === "up") { S.drag = false; return; }
      if (e.down) { S.drag = true; S.t = Math.max(0, Math.min(899.9, (e.x - 20) / 344 * 900)); }
    },
    draw(g, S, P) {
      const C = g.C, X0 = 20, W = 344, Y = 58;
      const TYPES = [["GRUNT", 1, 10, 1], ["SWARMER", 5, 8, 6], ["SPITTER", 13, 4, 1], ["BRUTE", 21, 3, 1], ["LANCER", 29, 4, 1], ["ORBITER", 41, 3, 1]];
      const wc = Math.max(1, Math.floor(900 / P.ws + 0.5));
      const wave = Math.min(wc, Math.floor(S.t / P.ws) + 1);
      const tx = (t) => X0 + Math.min(1, t / 900) * W;
      g.clear();
      g.tone(X0, Y, W, 10, 0.18, C.ink3);
      g.rect(X0, Y, tx(S.t) - X0, 10, C.ink3);
      for (let w = 1; w <= wc; w++) {
        const x = tx((w - 1) * P.ws);
        g.line(x, Y + 10, x, Y + (w % 10 === 1 ? 16 : 13), C.ink3, 1);
        if (w % P.wps === 0) {
          const end = tx(w * P.ws), last = w === wc;
          g.rect(end - 2, Y - 7, 4, 4, last ? C.enemy : C.gold);
        }
      }
      for (const m of [0, 300, 600, 900]) g.label((m / 60) + ":00", tx(m), Y + 26, C.ink3, "center");
      // unlock markers, pinned to wave numbers
      TYPES.forEach(([n, uw], i) => {
        const t = (uw - 1) * P.ws, never = t >= 900;
        const x = never ? X0 + W + 4 : tx(t);
        const y = Y + 36 + (i % 2) * 9;
        g.line(x, Y + 10, x, y - 6, never ? C.enemy : C.ink2, 1, [1, 2]);
        g.label(n.slice(0, 4), x, y, never ? C.enemy : (wave >= uw ? C.ink : C.ink3), i === 5 && never ? "right" : "center");
      });
      // playhead
      const px = tx(S.t);
      g.line(px, Y - 12, px, Y + 18, C.accent, 2);
      // weights of unlocked types
      const un = TYPES.filter((r) => wave >= r[1]);
      const sw = un.reduce((a, r) => a + r[2], 0), sb = un.reduce((a, r) => a + r[2] * r[3], 0);
      const by = 128;
      g.label("PICKS", 92, by - 6, C.ink3); g.label("BODIES", 236, by - 6, C.ink3);
      TYPES.forEach(([n, uw, w, pk], i) => {
        const y = by + i * 13, on = wave >= uw;
        g.label(n, 20, y + 6, on ? C.ink : C.ink3);
        if (!on) { g.label("WAVE " + uw, 92, y + 6, C.ink3); return; }
        g.meter(92, y, 120, 7, w / sw, C.accent, 0.12);
        g.label(Math.round(100 * w / sw) + "%", 216, y + 6, C.ink2);
        g.meter(236, y, 110, 7, w * pk / sb, C.enemy, 0.12);
        g.label(Math.round(100 * w * pk / sb) + "%", 350, y + 6, C.ink2);
      });
    },
    readout(S, P) {
      const wc = Math.max(1, Math.floor(900 / P.ws + 0.5));
      const wave = Math.min(wc, Math.floor(S.t / P.ws) + 1);
      const m = Math.floor(S.t / 60), s = Math.floor(S.t % 60);
      return "t " + m + ":" + (s < 10 ? "0" : "") + s + "   wave " + wave + " / " + wc +
        "\nshops " + Math.floor(wc / P.wps) + (wc % P.wps === 0 ? " (last one unusable)" : "");
    },
  },
});
