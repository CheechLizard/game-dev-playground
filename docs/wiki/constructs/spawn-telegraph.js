Wiki.construct({
  id: "spawn-telegraph",
  name: "Spawn warning ring",
  family: "pressure",
  origin: "playground",
  status: "built",
  statusNote: "Built (commit af40f13). In a normal run spawns are off-screen, so the ring is mostly seen near arena walls and in the zoo.",
  summary: "A ring closes on a spot for 0.7 s before an enemy exists there, so a spawn can be walked away from instead of only reacted to.",
  tags: ["telegraph", "fairness", "spawning", "readability"],

  intent:
    "<p>An enemy that appears on top of you is damage you could not have avoided. Anywhere spawns can land in view (the zoo, which spawns inside the room you stand in, or a run where the player is backed against a wall) the game owes the player a warning. The ring turns a spawn from something you react to into something you can plan around: you see where it will be, and you step away before it exists.</p>",

  how:
    "<h3>Queue, then spawn</h3>" +
    "<p><code>run:queueSpawn(id, x, y)</code> pushes <code>{id, x, y, t = warning, total = warning}</code> onto <code>run.pendingSpawns</code>, where <code>warning = wave.spawnTelegraph</code> (0.7 s). <code>run:updatePendingSpawns</code> counts each one down and calls <code>spawnEnemy</code> when <code>t &le; 0</code>. A warning of 0 spawns immediately, which is also what the headless tests use. Every spawn path goes through it: the [[spawn-pulse|pulse]], [[packs]] and the sandbox levels.</p>" +
    "<p>A pending spawn has no body: it cannot be hit, deals no contact damage and is not separated. It does count against the alive cap, because it has already been paid for.</p>" +
    "<h3>The ring</h3>" +
    "<p>With <code>k = t / total</code> running from 1 to 0, <code>render.lua</code> draws a circle of radius <code>enemy.radius + 14&middot;k</code> in the enemy's palette colour, at alpha <code>0.2 + 0.6&middot;(1 &minus; k)</code>: wide and faint at first, tight and solid at the end. In the last quarter (<code>k &lt; 0.25</code>) a second ring at 45% of the radius appears, the &ldquo;about to land&rdquo; beat. A swarmer pack shows six rings at once.</p>" +
    "<h3>How much time 0.7 s buys</h3>" +
    "<p>At the player's 82 px/s, 0.7 s is 57 px of movement: enough to clear a ring of 18 px even from its centre. A grunt in <code>config/profiles/default.json</code> moves 65.7 px/s (schema 30), so the head start is real but short.</p>",

  knobs: [
    ["Spawn warning", "0.7 s", "Time a ring closes before the enemy exists; 0 disables", "wave.spawnTelegraph (0-3)"],
    ["Ring size", "radius + 14 px", "Starting ring radius over the enemy's own (hard-coded in render.lua)", "render.lua spawn warnings"],
    ["Player move speed", "82 px/s", "Sets how far the warning lets you get", "player.moveSpeed"],
  ],

  related: [
    { id: "spawn-pulse", how: "Each pulse queues its bodies here; pending spawns count against the cap." },
    { id: "packs", how: "A pack telegraphs as a cluster of rings." },
    { id: "enemy-behaviours", how: "Brute and Lancer wind-ups are the same idea for an attack instead of a spawn." },
    { id: "fair-attack-contract", how: "A general rule that every hit should be announced first; this is its spawn clause." },
    { id: "contact-iframes", how: "What an unwarned spawn on top of you costs." },
  ],

  questions: [
    "The ring carries only colour and size. Should it show the enemy's shape, so a brute ring reads differently from a grunt ring?",
    "Should elites telegraph differently, or longer?",
    "In a normal run the ring is rarely seen. Is that the intent, or a sign the off-screen rectangle should be camera-relative?",
  ],

  sparks: [
    "Rings as a resource: shooting a ring cancels or weakens the spawn, so area weapons gain a pre-emptive use.",
    "Shorten the warning as a late-run difficulty dial instead of adding HP.",
    "Bluff rings that never spawn, from an enemy whose whole job is to herd you.",
    "Spawn on the player's predicted position (the aim-lead maths turned around), so standing still and running straight are both read and punished.",
  ],

  terms: [
    { term: "Spawn warning", def: "A ring that closes on a spot before an enemy appears there. Pending spawns count against the alive cap.", code: "wave.spawnTelegraph, run:queueSpawn, run.pendingSpawns" },
    { term: "Pending spawn", def: "A queued enemy with no body yet: not hittable, not harmful, already counted.", code: "run.pendingSpawns[i].t, .total" },
  ],

  sources: [
    "playground:games/horde-survivor/run.lua:277",
    "playground:games/horde-survivor/run.lua:289",
    "playground:games/horde-survivor/render.lua:302",
    "playground:games/horde-survivor/settings.lua:222",
    "playground:docs/glossary.md",
  ],

  shots: [
    { src: "img/zoo.png", caption: "The zoo spawns enemies inside the room you stand in, which is where the warning ring matters most.", cmd: "luajit tools/screenshot.lua zoo.png --mode zoo --seed 7 --at 1" },
  ],

  toy: {
    title: "Walk away from a spawn",
    hint: "move the pointer to steer; then set the warning to none",
    caption: "Spawns land 0-70 px from you, as in the zoo or against a wall, at an ever-faster pace. The ring follows render.lua: radius r + 14k, alpha 0.2 + 0.6(1-k), inner ring when k < 0.25. Delay without ring keeps the time and removes the information. Enemies fade after 6 s and separate as in the game.",
    w: 384, h: 216,
    controls: [
      { type: "select", key: "mode", label: "warning", value: "ring", options: [["ring", "ring"], ["blind", "delay, no ring"], ["none", "none (0 s)"]], reset: true },
      { type: "range", key: "warn", label: "warning", min: 0.1, max: 3, step: 0.05, value: 0.7, fmt: "{} s" },
      { type: "select", key: "spd", label: "grunt speed", value: "65.7", options: [["65.7", "65.7 (default.json)"], ["30", "30 (schema)"]] },
    ],
    init(S) { S.p = { x: 192, y: 120 }; S.aim = { x: 192, y: 120 }; S.pend = []; S.en = []; S.cd = 0.6; S.hits = 0; S.ifr = 0; S.t = 0; S.flash = 0; S.onTop = 0; },
    update(S, P, dt, kit) {
      const r = kit.rand, p = S.p;
      S.t += dt;
      const dx = S.aim.x - p.x, dy = S.aim.y - p.y, d = Math.hypot(dx, dy);
      if (d > 1) { const m = Math.min(d, 82 * dt); p.x += dx / d * m; p.y += dy / d * m; }
      p.x = Math.max(6, Math.min(378, p.x)); p.y = Math.max(34, Math.min(210, p.y));
      S.cd -= dt;
      if (S.cd <= 0) {
        S.cd = Math.max(0.35, 1.1 - S.t * 0.004);
        const a = r() * Math.PI * 2, rr = r() * 70;
        const x = Math.max(8, Math.min(376, p.x + Math.cos(a) * rr)), y = Math.max(36, Math.min(208, p.y + Math.sin(a) * rr));
        const w = P.mode === "none" ? 0 : P.warn;
        S.pend.push({ x, y, t: w, total: w });
      }
      for (const s of S.pend) {
        s.t -= dt;
        if (s.t <= 0) { S.en.push({ x: s.x, y: s.y, vx: 0, vy: 0, life: 6 }); if (Math.hypot(s.x - p.x, s.y - p.y) < 8) S.onTop++; }
      }
      S.pend = S.pend.filter((s) => s.t > 0);
      const sp = +P.spd;
      for (const e of S.en) {
        const ex = p.x - e.x, ey = p.y - e.y, ed = Math.hypot(ex, ey) || 1, l = Math.min(1, dt * 8);
        e.vx += (ex / ed * sp - e.vx) * l; e.vy += (ey / ed * sp - e.vy) * l;
        e.x += e.vx * dt; e.y += e.vy * dt; e.life -= dt;
      }
      for (let a = 0; a < S.en.length; a++) for (let b = a + 1; b < S.en.length; b++) {
        const A = S.en[a], B = S.en[b], dx = B.x - A.x, dy = B.y - A.y, m = 4 + 4, d2 = dx * dx + dy * dy;
        if (d2 > 1e-6 && d2 < m * m) { const d = Math.sqrt(d2), q = (m - d) / 2; A.x -= dx / d * q; A.y -= dy / d * q; B.x += dx / d * q; B.y += dy / d * q; }
      }
      S.en = S.en.filter((e) => e.life > 0);
      S.ifr = Math.max(0, S.ifr - dt); S.flash = Math.max(0, S.flash - dt);
      for (const e of S.en) if (Math.hypot(e.x - p.x, e.y - p.y) < 8 && S.ifr <= 0) { S.hits++; S.ifr = 0.5; S.flash = 0.25; }
    },
    pointer(e, S) { S.aim = { x: e.x, y: e.y }; },
    draw(g, S, P) {
      const C = g.C;
      g.clear();
      if (P.mode === "ring") for (const s of S.pend) {
        const k = s.total > 0 ? Math.max(0, s.t / s.total) : 0, rad = 4 + k * 14;
        g.ctx.globalAlpha = 0.2 + (1 - k) * 0.6;
        g.circle(s.x, s.y, rad, C.enemy, 1);
        if (k < 0.25) g.circle(s.x, s.y, rad * 0.45, C.enemy, 1);
        g.ctx.globalAlpha = 1;
      }
      for (const e of S.en) { g.ctx.globalAlpha = Math.min(1, e.life); g.circle(e.x, e.y, 4, C.enemy); g.ctx.globalAlpha = 1; }
      g.circle(S.p.x, S.p.y, 4, S.flash > 0 ? C.enemy : C.ink);
      if (S.ifr > 0) g.circle(S.p.x, S.p.y, 7, C.ink3, 1);
      g.line(S.p.x, S.p.y, S.aim.x, S.aim.y, C.ink3, 1, [2, 3]);
    },
    readout(S) {
      const min = Math.max(1 / 6, S.t / 60);
      return "hits/min " + (S.hits / min).toFixed(1) + "   hits " + S.hits + "\nspawned on top of you " + S.onTop;
    },
  },
});
