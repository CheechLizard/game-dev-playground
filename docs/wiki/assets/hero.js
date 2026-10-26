/* The index banner: a few constructs running together in one strip —
 * telegraphed pack spawns, a horde steering at the player, a weapon with
 * aim lead, hit flashes and LP pickups. Purely decorative; each piece has its
 * own page and toy. */
(function () {
  "use strict";
  window.AtlasHero = function (canvas) {
    const W = 384, H = 120, STEP = 1 / 60;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let g, scale;
    const r = Toy.rng(11);
    const S = { t: 0, px: W / 2, py: H / 2, enemies: [], warns: [], shots: [], pickups: [], sparks: [], cd: 0, pulse: 0.5 };

    function size() {
      scale = (canvas.clientWidth || W) / W * (window.devicePixelRatio || 1);
      canvas.width = Math.round(W * scale); canvas.height = Math.round(H * scale);
      g = Toy.graphics(canvas, W, H, scale);
    }
    function spawnPack() {
      const n = r() < 0.35 ? 5 : 1;
      const a = r() * Math.PI * 2, d = 70 + r() * 60;
      const cx = Math.max(12, Math.min(W - 12, S.px + Math.cos(a) * d)), cy = Math.max(10, Math.min(H - 10, S.py + Math.sin(a) * d * 0.5));
      for (let i = 0; i < n; i++) S.warns.push({ x: cx + (r() - 0.5) * 18 * (n > 1), y: cy + (r() - 0.5) * 12 * (n > 1), t: 0.9, fast: n > 1 });
    }
    function update() {
      S.t += STEP;
      // the player weaves a lissajous through the strip
      S.px = W / 2 + Math.sin(S.t * 0.37) * 120;
      S.py = H / 2 + Math.sin(S.t * 0.71) * 30;
      S.pulse -= STEP;
      if (S.pulse <= 0 && S.enemies.length + S.warns.length < 26) { spawnPack(); S.pulse = 0.55; }
      for (const w of S.warns) { w.t -= STEP; if (w.t <= 0) S.enemies.push({ x: w.x, y: w.y, hp: w.fast ? 1 : 3, sp: w.fast ? 34 : 18, r: w.fast ? 2 : 3.5, flash: 0 }); }
      S.warns = S.warns.filter((w) => w.t > 0);
      for (const e of S.enemies) {
        const dx = S.px - e.x, dy = S.py - e.y, d = Math.hypot(dx, dy) || 1;
        e.vx = dx / d * e.sp; e.vy = dy / d * e.sp;
        if (d < 24) { e.vx *= -0.6; e.vy *= -0.6; }
        e.x += e.vx * STEP; e.y += e.vy * STEP; e.flash = Math.max(0, e.flash - STEP);
      }
      // separation keeps the horde a crowd rather than a point
      for (let i = 0; i < S.enemies.length; i++) for (let j = i + 1; j < S.enemies.length; j++) {
        const a = S.enemies[i], b = S.enemies[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        if (d > 0 && d < 9) { const p = (9 - d) / 2 / d; a.x -= dx * p; a.y -= dy * p; b.x += dx * p; b.y += dy * p; }
      }
      S.cd -= STEP;
      if (S.cd <= 0 && S.enemies.length) {
        let best = null, bd = 1e9;
        for (const e of S.enemies) { const d = Math.hypot(e.x - S.px, e.y - S.py); if (d < bd) { bd = d; best = e; } }
        if (bd < 140) {
          const tt = bd / 220, ax = best.x + best.vx * tt, ay = best.y + best.vy * tt;
          const d = Math.hypot(ax - S.px, ay - S.py) || 1;
          S.shots.push({ x: S.px, y: S.py, vx: (ax - S.px) / d * 220, vy: (ay - S.py) / d * 220, life: 0.8 });
          S.cd = 0.16;
        }
      }
      for (const s of S.shots) {
        s.ox = s.x; s.oy = s.y; s.x += s.vx * STEP; s.y += s.vy * STEP; s.life -= STEP;
        for (const e of S.enemies) if (e.hp > 0 && Math.hypot(e.x - s.x, e.y - s.y) < e.r + 1.5) {
          e.hp--; e.flash = 0.08; s.life = 0;
          for (let k = 0; k < 4; k++) S.sparks.push({ x: s.x, y: s.y, vx: (r() - 0.5) * 80, vy: (r() - 0.5) * 80, life: 0.25 });
          if (e.hp <= 0) S.pickups.push({ x: e.x, y: e.y, life: 4 });
          break;
        }
      }
      S.shots = S.shots.filter((s) => s.life > 0);
      S.enemies = S.enemies.filter((e) => e.hp > 0);
      for (const p of S.pickups) {
        const dx = S.px - p.x, dy = S.py - p.y, d = Math.hypot(dx, dy);
        if (d < 30) { p.x += dx / d * 90 * STEP; p.y += dy / d * 90 * STEP; }
        if (d < 3) p.life = 0; p.life -= STEP;
      }
      S.pickups = S.pickups.filter((p) => p.life > 0);
      for (const s of S.sparks) { s.x += s.vx * STEP; s.y += s.vy * STEP; s.life -= STEP; }
      S.sparks = S.sparks.filter((s) => s.life > 0);
    }
    function draw() {
      const C = g.C; g.begin(); g.clear();
      g.tone(0, H - 14, W, 14, 0.12, C.ink);
      g.circle(S.px, S.py, 28, C.ink3, 0.5);
      for (const w of S.warns) g.circle(w.x, w.y, 2 + w.t * 9, C.enemy, 1);
      for (const p of S.pickups) g.rect(p.x - 1, p.y - 1, 2, 2, C.accent);
      for (const e of S.enemies) e.r > 2.5 ? g.circle(e.x, e.y, e.r, e.flash > 0 ? C.ink : C.enemy) : g.rect(e.x - 1.5, e.y - 1.5, 3, 3, e.flash > 0 ? C.ink : C.enemy);
      for (const s of S.shots) g.line(s.ox || s.x, s.oy || s.y, s.x, s.y, C.gold, 1.5);
      for (const s of S.sparks) g.rect(s.x, s.y, 1, 1, C.gold);
      g.circle(S.px, S.py, 3.5, C.ink);
    }
    size();
    for (let i = 0; i < 360; i++) update();
    draw();
    new ResizeObserver(() => { size(); draw(); }).observe(canvas);
    document.addEventListener("wiki:theme", () => { g.refresh(); draw(); });
    if (reduce) return;
    let last = 0, acc = 0, visible = true;
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; }).observe(canvas);
    (function frame(t) {
      requestAnimationFrame(frame);
      const dt = Math.min(0.1, (t - last) / 1000 || 0); last = t;
      if (!visible || document.hidden) return;
      acc += dt; while (acc >= STEP) { update(); acc -= STEP; }
      draw();
    })(0);
  };
})();
