Wiki.construct({
  id: "spawn-pulse",
  name: "Spawn pulses",
  origin: "playground",
  status: "built",
  statusNote: "Built. Finding from reading the code (not measured): spawns land on screen near arena walls, and the balance pilot is steered away from walls, so harness runs under-represent it.",
  summary: "Every ~2.5 s a pulse spawns a budget of bodies just outside the view; the interval shrinks and the budget grows linearly with the wave, and a hard cap on alive-plus-pending stops it.",
  tags: ["spawning", "rhythm", "off-screen", "cap"],

  intent:
    "<p>A wave is a block of spawning, not a single spawn. Pulses give the horde a rhythm: a cluster arrives, there is a breath, another arrives. Two linear ramps (interval and pulse size) make the arrival rate easy to tune from the editor, and spawning at the edge of the view means enemies walk in from the edge of perception instead of popping into existence.</p>" +
    "<p>The alive cap exists for frame rate (&ldquo;spawning stalls rather than tanking the frame rate&rdquo;), but it is also a silent mercy rule: once the cap is hit, pressure stops rising.</p>",

  how:
    "<h3>The pulse</h3>" +
    "<p><code>run:updateSpawning</code> computes <code>t = (wave &minus; 1) / (waveCount &minus; 1)</code>, clamped to 0..1, then <code>interval = tickStart + (tickEnd &minus; tickStart)&middot;t</code> and <code>perPulse = countStart + (countEnd &minus; countStart)&middot;t</code>. A timer counts down; on expiry it adds <code>max(0.05, interval)</code> and, if <code>#enemies &lt; maxAlive</code>, sets <code>budget = floor(perPulse + rng())</code>. That is stochastic rounding: 2.6 gives 3 with 60% odds and 2 with 40%.</p>" +
    "<p>It then loops: pick a type by [[wave-clock|spawn weight]], take one off-screen point, and spawn a whole [[packs|pack]] there, until <code>spawned &ge; budget</code>. The budget counts bodies and the last pack may overshoot it (&ldquo;a half pack is not a pack&rdquo;). Every body goes through the [[spawn-telegraph|warning ring]] first.</p>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>Wave</th><th>1</th><th>10</th><th>20</th><th>30</th><th>40</th><th>50</th><th>60</th></tr></thead><tbody>" +
    "<tr><td>Interval (s)</td><td>2.50</td><td>2.26</td><td>1.98</td><td>1.71</td><td>1.44</td><td>1.17</td><td>0.90</td></tr>" +
    "<tr><td>Per pulse</td><td>2.0</td><td>2.6</td><td>3.3</td><td>4.0</td><td>4.6</td><td>5.3</td><td>6.0</td></tr>" +
    "<tr><td>Bodies/s</td><td>0.80</td><td>1.16</td><td>1.66</td><td>2.31</td><td>3.22</td><td>4.54</td><td>6.67</td></tr>" +
    "</tbody></table></div>" +
    "<p>Both ramps are linear, so their ratio, the arrival rate, is convex: 8.3&times; over the run, most of it in the last third. (HANDOFF's &ldquo;16&times;&rdquo; predates the current defaults.)</p>" +
    "<h3>The alive cap</h3>" +
    "<p>A pulse is skipped outright if <code>#enemies &ge; maxAlive</code> (320). Inside the pack loop, <code>atCap()</code> counts <code>#enemies + #pendingSpawns</code>: an enemy whose warning ring is still closing has been paid for and is on its way. The remaining room also trims the pack, so a swarmer pack near the cap arrives short. <code>stats.peakAlive</code> records the high-water mark per run.</p>" +
    "<h3>The off-screen rectangle</h3>" +
    "<p><code>run:offscreenPoint</code> rolls an angle &theta; and projects it onto a rectangle around the player with half-size <code>render.width/2 + spawnMargin</code> by <code>render.height/2 + spawnMargin</code> (216 &times; 132 px). Projecting onto the rectangle rather than a circle keeps spawns off the corners. It is uniform in angle, not in perimeter length, so the short sides get slightly denser spawns per pixel. The point is then clamped to <code>[4, arena &minus; 4]</code> in the 1200 &times; 900 arena.</p>" +
    "<h3>Finding: spawns land on screen near walls</h3>" +
    "<p>Two things combine. The clamp pulls a spawn that would be outside the arena back onto the wall, inside the view. And the camera clamps to the arena while the spawn rectangle stays centred on the player: within about 168 px of a side wall (84 px of the top or bottom) the <em>far</em> edge of the rectangle falls inside the view too. Near a wall, enemies appear in plain sight on both sides. This is also the only place in a normal run where the warning ring is seen. The balance pilot is pushed away from the outer 80 px of the arena (<code>tools/simsuite.lua</code>), so harness runs see less of this than a human who backs into a corner.</p>",

  knobs: [
    ["Spawn tick (wave 1)", "2.5 s", "Seconds between pulses at the start", "wave.tickStart"],
    ["Spawn tick (final)", "0.9 s", "Seconds between pulses on the last wave", "wave.tickEnd"],
    ["Enemies per pulse (wave 1)", "2", "Body budget per pulse at the start", "wave.countStart"],
    ["Enemies per pulse (final)", "6", "Body budget on the last wave (the brutal profile uses 10, tick 0.7)", "wave.countEnd"],
    ["Max alive", "320", "Hard cap on alive + pending; spawning stalls at it", "wave.maxAlive"],
    ["Off-screen margin", "24 px", "How far outside the view the spawn rectangle sits", "wave.spawnMargin"],
  ],

  related: [
    { id: "wave-clock", how: "Supplies the wave index both ramps interpolate on." },
    { id: "packs", how: "What one pick in the pulse loop spawns; packs spend the body budget." },
    { id: "spawn-telegraph", how: "Each spawned body waits behind a ring and counts against the cap while it does." },
    { id: "kill-rate-race", how: "Arrival rate is one side of the race; the cap is its ceiling." },
    { id: "balance-harness", how: "Its wall-avoiding pilot rarely sees the on-screen spawns." },
  ],

  questions: [
    "Pulses are uniform within a wave. Would an intra-wave crescendo (or a lull before a shop) read better?",
    "Linear on both axes gives a convex rate curve. HANDOFF calls the overall curve too flat for ~28 shop visits; is the shape or the endpoint wrong?",
    "When the cap is hit, difficulty silently stops rising. Should overflow convert into another pressure (elite chance, speed)?",
    "Should the spawn rectangle be centred on the camera instead of the player, so walls stop producing visible spawns? Or is that a feature worth keeping?",
  ],

  sparks: [
    "A breathing pulse: alternate heavy and light pulses so recovery windows are part of the rhythm.",
    "Bias each pulse to one side of the rectangle, so pulses become flanks the player turns to face.",
    "Show the pulse as a HUD heartbeat; a player who can read it can pre-position.",
    "Make the alive cap a visible horde meter the player is trying to keep low, with a reward for staying under half.",
  ],

  terms: [
    { term: "Spawn pulse", def: "One tick of the spawn timer, which spends a body budget on packs.", code: "run:updateSpawning, wave.tick*, wave.count*" },
    { term: "Budget", def: "Bodies to spawn this pulse: floor(perPulse + rng()).", code: "budget (local in run:updateSpawning)" },
    { term: "Max alive", def: "Cap on alive plus pending enemies; spawning stalls at it.", code: "wave.maxAlive" },
    { term: "Peak alive", def: "Most enemies alive at once during a run.", code: "stats.peakAlive" },
    { term: "Spawn boundary", def: "Rectangle around the player, just outside the view, that spawn points are projected onto.", code: "run:offscreenPoint, wave.spawnMargin" },
  ],

  sources: [
    "playground:games/horde-survivor/run.lua:394",
    "playground:games/horde-survivor/run.lua:339",
    "playground:games/horde-survivor/render.lua:36",
    "playground:games/horde-survivor/settings.lua:209",
    "playground:tools/simsuite.lua:80",
    "playground:HANDOFF.md",
  ],

  shots: [
    { src: "img/horde-wave10.png", caption: "Wave 10 at 12:39 with a stationary god-mode player: 55 alive. Every enemy walked in from outside the 384 x 216 view.", cmd: "luajit tools/screenshot.lua horde-wave10.png --at 140 --seed 7 --set run.wavesPerShop=10 --set debug.godMode=true" },
  ],

  toy: {
    title: "Pulses around the camera",
    hint: "drag in the arena to move the player; take it into the middle, then into a corner",
    caption: "The whole 1200 x 900 arena at 1:5. Shaded box: what the camera sees (clamped to the arena). Dashed box: the spawn rectangle, centred on the player. Spawns that land inside the view flash. Every enemy simply chases at grunt speed; kills are a flat rate on the nearest one. Time runs 4x.",
    w: 384, h: 216,
    controls: [
      { type: "range", key: "wave", label: "wave", min: 1, max: 60, value: 40 },
      { type: "range", key: "cap", label: "max alive", min: 10, max: 320, value: 320 },
      { type: "range", key: "kills", label: "kills", min: 0, max: 8, step: 0.5, value: 1, fmt: "{}/s" },
      { type: "range", key: "margin", label: "margin", min: 0, max: 200, value: 24, fmt: "{} px" },
    ],
    init(S) {
      S.p = { x: 120, y: 450 }; S.tgt = null; S.en = []; S.pend = []; S.timer = 0; S.on = 0; S.tot = 0; S.k = 0; S.fl = [];
      S.pulseAt = -9; S.time = 0;
    },
    update(S, P, dt, kit) {
      const AW = 1200, AH = 900, VW = 384, VH = 216, r = kit.rand;
      const T = [[1, 10, 1], [5, 8, 6], [13, 4, 1], [21, 3, 1], [29, 4, 1], [41, 3, 1]];
      for (let n = 0; n < 4; n++) {
        S.time += dt;
        const p = S.p;
        if (S.tgt) {
          const dx = S.tgt.x - p.x, dy = S.tgt.y - p.y, d = Math.hypot(dx, dy);
          if (d > 1) { const m = Math.min(d, 82 * dt); p.x += dx / d * m; p.y += dy / d * m; }
        }
        p.x = Math.max(4, Math.min(AW - 4, p.x)); p.y = Math.max(4, Math.min(AH - 4, p.y));
        const cx = Math.max(0, Math.min(AW - VW, p.x - VW / 2)), cy = Math.max(0, Math.min(AH - VH, p.y - VH / 2));
        S.cam = [cx, cy];
        const t = (P.wave - 1) / 59, interval = 2.5 - 1.6 * t, per = 2 + 4 * t;
        S.timer -= dt;
        if (S.timer <= 0) {
          S.timer += Math.max(0.05, interval); S.pulseAt = S.time;
          if (S.en.length < P.cap) {
            const ids = T.filter((e) => P.wave >= e[0]);
            const sw = ids.reduce((a, e) => a + e[1], 0);
            const budget = Math.floor(per + r());
            let spawned = 0;
            while (spawned < budget && S.en.length + S.pend.length < P.cap) {
              let roll = r() * sw, pick = ids[ids.length - 1];
              for (const e of ids) { roll -= e[1]; if (roll <= 0) { pick = e; break; } }
              const a = r() * Math.PI * 2, hw = VW / 2 + P.margin, hh = VH / 2 + P.margin;
              const c = Math.cos(a), s = Math.sin(a);
              const k = Math.min(Math.abs(c) > 1e-6 ? hw / Math.abs(c) : 1e9, Math.abs(s) > 1e-6 ? hh / Math.abs(s) : 1e9);
              const x0 = Math.max(4, Math.min(AW - 4, p.x + c * k)), y0 = Math.max(4, Math.min(AH - 4, p.y + s * k));
              const room = P.cap - S.en.length - S.pend.length, pack = Math.min(pick[2], room);
              for (let i = 0; i < pack; i++) {
                const x = Math.max(4, Math.min(AW - 4, x0 + (r() - 0.5) * 26)), y = Math.max(4, Math.min(AH - 4, y0 + (r() - 0.5) * 26));
                const vis = x > cx && x < cx + VW && y > cy && y < cy + VH;
                S.pend.push({ x, y, t: 0.7 }); S.tot++;
                if (vis) { S.on++; S.fl.push({ x, y, t: 0.8 }); }
              }
              spawned += pack;
            }
          }
        }
        for (const s of S.pend) { s.t -= dt; if (s.t <= 0) S.en.push({ x: s.x, y: s.y }); }
        S.pend = S.pend.filter((s) => s.t > 0);
        const sp = 30 * Math.pow(1.003, P.wave - 1);
        for (const e of S.en) {
          const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
          if (d > 6) { e.x += dx / d * sp * dt; e.y += dy / d * sp * dt; }
        }
        S.k += P.kills * dt;
        while (S.k >= 1) {
          S.k -= 1;
          if (!S.en.length) continue;
          let bi = 0, bd = 1e12;
          S.en.forEach((e, i) => { const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2; if (d < bd) { bd = d; bi = i; } });
          S.en.splice(bi, 1);
        }
        for (const f of S.fl) f.t -= dt;
        S.fl = S.fl.filter((f) => f.t > 0);
      }
    },
    pointer(e, S) {
      const s = 0.2, ox = 6, oy = 34;
      if (e.type === "up") { return; }
      if (e.down && e.x < ox + 240) S.tgt = { x: (e.x - ox) / s, y: (e.y - oy) / s };
    },
    draw(g, S, P) {
      const C = g.C, s = 0.2, ox = 6, oy = 34;
      const X = (x) => ox + x * s, Y = (y) => oy + y * s;
      g.clear();
      g.rect(ox, oy, 240, 180, C.ink3, 1);
      const cam = S.cam || [0, 0];
      g.tone(X(cam[0]), Y(cam[1]), 384 * s, 216 * s, 0.25, C.ink3);
      g.rect(X(cam[0]), Y(cam[1]), 384 * s, 216 * s, C.ink2, 1);
      const hw = 192 + P.margin, hh = 108 + P.margin;
      g.poly([[X(S.p.x - hw), Y(S.p.y - hh)], [X(S.p.x + hw), Y(S.p.y - hh)], [X(S.p.x + hw), Y(S.p.y + hh)], [X(S.p.x - hw), Y(S.p.y + hh)]], C.ink3, 1, true);
      for (const e of S.en) g.rect(X(e.x) - 0.7, Y(e.y) - 0.7, 1.6, 1.6, C.enemy);
      for (const p of S.pend) g.circle(X(p.x), Y(p.y), 1 + p.t * 3, C.enemy, 1);
      for (const f of S.fl) g.circle(X(f.x), Y(f.y), 3 + (0.8 - f.t) * 6, C.accent, 1);
      g.circle(X(S.p.x), Y(S.p.y), 2.5, C.ink);
      // right panel
      const rx = 258;
      const t = (P.wave - 1) / 59, interval = 2.5 - 1.6 * t, per = 2 + 4 * t;
      g.label("INTERVAL " + interval.toFixed(2) + " S", rx, 46, C.ink2);
      g.label("PER PULSE " + per.toFixed(1), rx, 58, C.ink2);
      g.label("RATE " + (per / interval).toFixed(2) + " /S", rx, 70, C.ink);
      const since = S.time - S.pulseAt;
      g.label("PULSE", rx, 88, C.ink3);
      g.meter(rx, 92, 116, 5, since < 0.15 ? 1 : 1 - S.timer / Math.max(0.05, interval), since < 0.15 ? C.accent : C.ink2, 0.15);
      g.label("ALIVE + PENDING", rx, 112, C.ink3);
      const a = S.en.length / P.cap, pe = S.pend.length / P.cap;
      g.tone(rx, 116, 116, 10, 0.15, C.enemy);
      g.rect(rx, 116, 116 * a, 10, C.enemy);
      g.tone(rx + 116 * a, 116, 116 * Math.min(pe, 1 - a), 10, 0.6, C.enemy);
      g.label(S.en.length + " + " + S.pend.length + " / " + P.cap, rx, 138, S.en.length + S.pend.length >= P.cap ? C.enemy : C.ink2);
      if (S.en.length + S.pend.length >= P.cap) g.label("CAPPED: PRESSURE FLAT", rx, 150, C.enemy);
      g.label("SPAWNED IN VIEW", rx, 172, C.ink3);
      g.text(S.tot ? Math.round(100 * S.on / S.tot) + "%" : "-", rx, 194, { color: S.on ? C.accent : C.ink2, size: 16 });
    },
    readout(S, P) {
      return "wave " + P.wave + "   " + (S.on) + " of " + S.tot + " spawns in view";
    },
  },
});
