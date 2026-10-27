Wiki.construct({
  id: "packs",
  name: "Packs",
  origin: "playground",
  status: "built",
  summary: "One weighted pick spawns a whole pack of that type, jittered around a single point, so a group arrives together instead of trickling in from opposite edges.",
  tags: ["spawning", "groups", "swarmer", "clear rate"],

  intent:
    "<p>Some enemies only mean something together. The Swarmer is &ldquo;fast, fragile, and never alone&rdquo;: individually weaker than a grunt in every stat but speed. Spawned singly from random edges it was simply a worse grunt, picked off one at a time as each arrived. Spawned as six from one point it is a wave front that outruns the player's clear speed for a moment and has to be dealt with as a group.</p>" +
    "<p>Packs also keep the zoo honest: the wave spawner and the sandbox levels call the same function, so a pack arrives the same way wherever you meet it.</p>",

  how:
    "<h3>Spawning a pack</h3>" +
    "<p><code>run:spawnPack(id, x, y, limit)</code> reads <code>pack = max(1, floor(enemy.&lt;id&gt;.pack))</code> (missing means 1) and trims it to <code>limit</code>, the room left under the [[spawn-pulse|alive cap]]. Each member is placed at <code>x + (rng &minus; 0.5)&middot;packSpread</code>, <code>y + (rng &minus; 0.5)&middot;packSpread</code>: a uniform square of side 26 px, clamped inside the arena. Every member is queued behind its own [[spawn-telegraph|warning ring]], so a swarmer pack shows six closing rings. [[crowd-separation|Separation]] then relaxes the clump into a loose blob.</p>" +
    "<h3>Packs and the pulse budget</h3>" +
    "<p>The pulse budget counts bodies, and the pulse loop keeps picking until <code>spawned &ge; budget</code>. A swarmer pick spends six at once and may overshoot the budget; a half pack is not a pack. Only the swarmer has <code>pack = 6</code>; every other type is a loner.</p>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>With all six types unlocked</th><th>Value</th></tr></thead><tbody>" +
    "<tr><td>Swarmer share of picks</td><td>8 / 32 = 25%</td></tr>" +
    "<tr><td>Swarmer share of bodies</td><td>48 / 72 = 67%</td></tr>" +
    "<tr><td>Bodies per pick</td><td>72 / 32 = 2.25</td></tr>" +
    "<tr><td>Mean base HP per body</td><td>11.0 (12 for a grunt-only wave 1)</td></tr>" +
    "</tbody></table></div>" +
    "<p>Packs lower the average HP per body while raising the body count: they push pressure from &ldquo;sponge&rdquo; toward &ldquo;crowd&rdquo;.</p>" +
    "<h3>What it did to the balance</h3>" +
    "<p>Commit <code>af40f13</code>, measured across the pilot's bubble sweep: swarmer damage dealt went from 0 to 70 (third behind spitter and brute) and survival fell from 848-900 s to 496-795 s. Speeds here are schema values; <code>config/profiles/default.json</code> currently slows the swarmer from 96 to 63 px/s, below the player's 82.</p>",

  knobs: [
    ["Pack size", "1 (swarmer 6)", "Bodies one pick spawns", "enemy.<id>.pack (1-20)"],
    ["Pack spread", "26 px", "Side of the square members are jittered in", "wave.packSpread"],
    ["Spawn weight", "swarmer 8", "How often the pack is picked", "enemy.<id>.weight"],
    ["Swarmer speed", "96 px/s (63 in default.json)", "How fast the pack closes", "enemy.swarmer.speed"],
  ],

  related: [
    { id: "spawn-pulse", how: "Each pick in a pulse is a pack; the cap can trim it." },
    { id: "crowd-separation", how: "Turns the 26 px clump into a blob, but only for same-cell pairs." },
    { id: "spawn-telegraph", how: "Six rings closing at one spot is how a pack announces itself." },
    { id: "kill-rate-race", how: "A pack is a burst that briefly beats the clear rate even when the average does not." },
    { id: "formation-waves", how: "The opposite choice: arrivals with authored shape instead of random jitter." },
  ],

  questions: [
    "Should packs have formation (line, V, ring) instead of a random square?",
    "Mixed packs: an escort of one brute and four swarmers?",
    "Should pack size grow with the wave, as an alternative to growing HP?",
  ],

  sparks: [
    "Pack leaders: kill the leader and the rest scatter, which rewards target priority in a game that is otherwise auto-aimed.",
    "Packs that share one HP pool, so area damage and single-target damage do the same total work.",
    "Packs as words: each formation is a readable shape that tells the player which way to step.",
    "Packs that only spawn behind the player's movement direction, punishing straight-line kiting.",
  ],

  terms: [
    { term: "Pack", def: "How many of an enemy arrive together around one point. Most enemies are loners; the swarmer is not.", code: "enemy.<id>.pack, wave.packSpread, run:spawnPack" },
    { term: "Pack spread", def: "Side of the square a pack's members are jittered within.", code: "wave.packSpread" },
  ],

  sources: [
    "playground:games/horde-survivor/run.lua:379",
    "playground:games/horde-survivor/run.lua:394",
    "playground:games/horde-survivor/content.lua:72",
    "playground:games/horde-survivor/settings.lua:226",
    "playground:games/horde-survivor/sandbox.lua:212",
    "playground:docs/glossary.md",
  ],

  shots: [
    { src: "img/horde-wave10.png", caption: "Wave 10, god mode, standing still: swarmer packs and grunts pile onto the player in a single clump.", cmd: "luajit tools/screenshot.lua horde-wave10.png --at 140 --seed 7 --set run.wavesPerShop=10 --set debug.godMode=true" },
  ],

  toy: {
    title: "Same bodies, different arrival",
    hint: "watch the hit counters; drag to walk both players at once",
    caption: "Both sides get the same bodies per 2.5 s pulse. Left: each body from its own point on the spawn rectangle, so they arrive at different times. Right: one point, jittered by the pack spread, so they arrive together. The gun kills the nearest enemy within 60 px at a flat rate; contact hurts once per 0.5 s of i-frames. The rectangle is shrunk to fit; speeds are not. Over two minutes at these defaults the pack side takes roughly 60% more hits; at 1 kill/s both sides drown equally.",
    w: 384, h: 216,
    controls: [
      { type: "range", key: "pack", label: "bodies", min: 1, max: 20, value: 6, reset: true },
      { type: "range", key: "spread", label: "pack spread", min: 0, max: 200, value: 26, fmt: "{} px" },
      { type: "range", key: "kills", label: "gun", min: 0, max: 8, step: 0.5, value: 4, fmt: "{} kills/s" },
      { type: "range", key: "speed", label: "speed", min: 20, max: 140, value: 96, fmt: "{} px/s" },
    ],
    init(S) {
      S.side = [0, 1].map((i) => ({ cx: 96 + i * 192, cy: 126, en: [], pend: [], hits: 0, ifr: 0, k: 0, flash: 0 }));
      S.timer = 0.3; S.off = { x: 0, y: 0 }; S.tgt = null;
    },
    update(S, P, dt, kit) {
      const r = kit.rand, HW = 90, HH = 55;
      if (S.tgt) {
        const dx = S.tgt.x - S.off.x, dy = S.tgt.y - S.off.y, d = Math.hypot(dx, dy);
        if (d > 1) { const m = Math.min(d, 82 * dt); S.off.x += dx / d * m; S.off.y += dy / d * m; }
      }
      S.off.x = Math.max(-80, Math.min(80, S.off.x)); S.off.y = Math.max(-80, Math.min(76, S.off.y));
      const edge = (px, py, a) => {
        const c = Math.cos(a), s = Math.sin(a);
        const k = Math.min(Math.abs(c) > 1e-6 ? HW / Math.abs(c) : 1e9, Math.abs(s) > 1e-6 ? HH / Math.abs(s) : 1e9);
        return [px + c * k, py + s * k];
      };
      S.timer -= dt;
      if (S.timer <= 0) {
        S.timer += 2.5;
        const a0 = r() * Math.PI * 2;
        S.side.forEach((sd, i) => {
          const px = sd.cx + S.off.x, py = sd.cy + S.off.y;
          const base = edge(px, py, a0);
          for (let n = 0; n < P.pack; n++) {
            const a = i === 0 ? r() * Math.PI * 2 : a0;
            const pt = i === 0 ? edge(px, py, a) : [base[0] + (r() - 0.5) * P.spread, base[1] + (r() - 0.5) * P.spread];
            sd.pend.push({ x: pt[0], y: pt[1], t: 0.7, a });
          }
        });
      }
      for (const sd of S.side) {
        const px = sd.cx + S.off.x, py = sd.cy + S.off.y;
        for (const p of sd.pend) { p.t -= dt; if (p.t <= 0) { sd.en.push({ x: p.x, y: p.y, vx: 0, vy: 0 }); } }
        sd.pend = sd.pend.filter((p) => p.t > 0);
        for (const e of sd.en) {
          const dx = px - e.x, dy = py - e.y, d = Math.hypot(dx, dy) || 1;
          const l = Math.min(1, dt * 8);
          e.vx += (dx / d * P.speed - e.vx) * l; e.vy += (dy / d * P.speed - e.vy) * l;
          e.x += e.vx * dt; e.y += e.vy * dt;
        }
        for (let a = 0; a < sd.en.length; a++) for (let b = a + 1; b < sd.en.length; b++) {
          const A = sd.en[a], B = sd.en[b], dx = B.x - A.x, dy = B.y - A.y, d2 = dx * dx + dy * dy;
          if (d2 > 1e-6 && d2 < 36) { const d = Math.sqrt(d2), p = (6 - d) / 2; A.x -= dx / d * p; A.y -= dy / d * p; B.x += dx / d * p; B.y += dy / d * p; }
        }
        sd.ifr = Math.max(0, sd.ifr - dt); sd.flash = Math.max(0, sd.flash - dt);
        for (const e of sd.en) if (Math.hypot(e.x - px, e.y - py) < 7 && sd.ifr <= 0) { sd.hits++; sd.ifr = 0.5; sd.flash = 0.2; }
        sd.k = Math.min(1, sd.k + P.kills * dt);
        if (sd.k >= 1) {
          let bi = -1, bd = 3600;
          sd.en.forEach((e, i) => { const d = (e.x - px) ** 2 + (e.y - py) ** 2; if (d < bd) { bd = d; bi = i; } });
          if (bi >= 0) { sd.shot = [sd.en[bi].x, sd.en[bi].y, 0.08]; sd.en.splice(bi, 1); sd.k -= 1; }
        }
        if (sd.shot) { sd.shot[2] -= dt; if (sd.shot[2] <= 0) sd.shot = null; }
        if (sd.en.length > 80) sd.en.splice(0, sd.en.length - 80);
      }
    },
    pointer(e, S) {
      if (e.type === "up") { S.tgt = null; return; }
      if (e.down) { const cx = e.x < 192 ? 96 : 288; S.tgt = { x: e.x - cx, y: e.y - 126 }; }
    },
    draw(g, S, P) {
      const C = g.C;
      g.clear();
      g.line(192, 30, 192, 212, C.rule || C.ink3, 1);
      S.side.forEach((sd, i) => {
        const px = sd.cx + S.off.x, py = sd.cy + S.off.y;
        g.rect(px - 90, py - 55, 180, 110, C.ink3, 0.5);
        g.circle(px, py, 60, C.ink3, 0.5);
        for (const p of sd.pend) g.circle(p.x, p.y, 3 + (p.t / 0.7) * 14, C.enemy, 1);
        for (const e of sd.en) g.circle(e.x, e.y, 3, C.enemy);
        if (sd.shot) g.line(px, py, sd.shot[0], sd.shot[1], C.gold, 1);
        g.circle(px, py, 4, sd.flash > 0 ? C.enemy : C.ink);
        g.label(i === 0 ? P.pack + " LONERS" : "PACK OF " + P.pack, sd.cx, 210, C.ink2, "center");
        g.text(String(sd.hits), sd.cx + 66, 206, { color: sd.hits ? C.enemy : C.ink3, size: 16, align: "center" });
      });
    },
    readout(S) {
      return "hits taken   loners " + S.side[0].hits + "   pack " + S.side[1].hits;
    },
  },
});
