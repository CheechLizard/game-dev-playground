Wiki.construct({
  id: "crowd-separation",
  name: "Crowd separation and knockback",
  origin: "playground",
  status: "built",
  statusNote: "Built. Finding from reading the code: only pairs in the same 16 px cell are separated, so overlaps across a cell edge are never resolved.",
  summary: "One relaxation pass per frame pushes overlapping enemies apart inside a 16 px spatial grid, so a converging horde rings the player instead of stacking; hits add a knockback impulse that the chase lag then absorbs.",
  tags: ["crowd", "spatial hash", "knockback", "physics"],

  intent:
    "<p>Every chaser steers at the same point: the player. Without anything else, a horde collapses into one dot, which reads as a single enemy and deals contact damage from a single point. Separation spreads the crowd into a ring, so a horde looks like a horde and its size is visible at a glance.</p>" +
    "<p>Knockback is the player's one physical lever on that crowd: a hit pushes the enemy back along the shot, buying space, and how far depends on the weapon and on how heavy the enemy is.</p>",

  how:
    "<h3>Separation</h3>" +
    "<p><code>run:separateEnemies</code> runs after <code>updateEnemies</code> each frame. It hashes every enemy into a 16 px cell (<code>floor(x/16)&middot;73856093 + floor(y/16)&middot;19349663</code>), then for every pair <b>in the same bucket</b> with <code>d &lt; ra + rb</code> moves each by half the overlap along the line between them. One pass, positions only; velocity is untouched. It is skipped when enemies are stationary (the bench's dummies).</p>" +
    "<h3>Finding: the cell edge is a wall it cannot see</h3>" +
    "<p>Neighbouring cells are never checked. Two enemies either side of a cell line can sit on top of each other indefinitely. Grunts have radius 4 and the cell is 16 px, so a large share of touching pairs straddle a line; elites (radius &times;1.7, up to 11.9 px for a brute) span cells almost always. The stacking is visible in run captures. The usual fix is to test the 3 &times; 3 block of cells around each one, which the toy can switch on. Not measured in the game; read from the code.</p>" +
    "<h3>Knockback</h3>" +
    "<p>A hit adds <code>dir &times; weaponKnockback &times; enemy.knockback</code> to the enemy's velocity (<code>run.lua</code>, on damage). Weapon values include Scattergun 90, Orbit Blades 70, Rail Lance 60, Static Field 0. Knockback taken: swarmer 1.8, spitter 1.2, grunt 1.0, orbiter 0.9, lancer 0.8, brute 0.25. There is no separate decay: the behaviour's velocity lag (<code>min(1, 8&middot;dt)</code> for a chaser) pulls velocity back toward its steering target in about 0.125 s. A charging brute or lancer overwrites its velocity every tick, so it cannot be knocked out of a dash.</p>",

  knobs: [
    ["Cell size", "16 px", "Spatial hash cell (hard-coded in run:separateEnemies)", "cell (local)"],
    ["Enemy radius", "3-7 px (elite x1.7)", "Sets the separation distance", "enemy.<id>.radius"],
    ["Knockback taken", "0.25-1.8", "How far an enemy is pushed per unit of weapon knockback", "enemy.<id>.knockback"],
    ["Weapon knockback", "0-90", "Impulse per hit", "weapon.<id>.knockback"],
  ],

  related: [
    { id: "enemy-behaviours", how: "Chasers converge on one point; their velocity lag is what absorbs knockback." },
    { id: "packs", how: "Separation is what turns a 26 px pack clump into a blob." },
    { id: "hit-feedback", how: "Knockback is part of how a hit reads." },
    { id: "debug-layers", how: "The grid overlay shows the 16 px cells." },
  ],

  questions: [
    "Fix the same-cell gap by checking neighbour cells, or is the stacking acceptable at horde scale?",
    "Should separation strength depend on mass, so a brute shoves grunts aside but not the other way?",
    "Should the crowd push the player, so being surrounded is also being pinned?",
  ],

  sparks: [
    "Knockback into other enemies as damage: a shotgun that turns the front rank into projectiles.",
    "A crowd-pressure meter: the sum of overlaps around the player becomes a slow, a damage tick, or a shove.",
    "Heavy enemies that part the crowd as they walk, leaving a corridor the player can use.",
    "Knockback as crowd control currency: a passive that trades damage for push, for builds that survive by space rather than kills.",
  ],

  terms: [
    { term: "Separation", def: "One relaxation pass pushing overlapping enemies apart by half their overlap each.", code: "run:separateEnemies" },
    { term: "Spatial hash grid", def: "16 px cells used to find candidate pairs; shown by the grid overlay.", code: "overlay.grid" },
    { term: "Knockback taken", def: "Per-enemy multiplier on weapon knockback.", code: "enemy.<id>.knockback" },
  ],

  sources: [
    "playground:games/horde-survivor/run.lua:877",
    "playground:games/horde-survivor/run.lua:638",
    "playground:games/horde-survivor/run.lua:774",
    "playground:games/horde-survivor/content.lua:62",
  ],

  shots: [
    { src: "img/horde-wave10.png", caption: "Wave 10, standing still: the crowd overlaps into a single mass instead of a clean ring.", cmd: "luajit tools/screenshot.lua horde-wave10.png --at 140 --seed 7 --set run.wavesPerShop=10 --set debug.godMode=true" },
  ],

  toy: {
    title: "The cell-edge gap",
    hint: "move the pointer to lead the horde; click to knock back; switch on neighbour cells",
    caption: "Grunts (radius 4, 3% elites at x1.7) chase the pointer with the game's lag; separation runs once per frame. Highlighted bodies overlap a neighbour by more than 1 px. A click hits everything within 40 px with Scattergun knockback (90) times the slider.",
    w: 384, h: 216,
    controls: [
      { type: "select", key: "mode", label: "separation", value: "same", options: [["same", "same cell only (game)"], ["near", "neighbour cells"], ["off", "off"]] },
      { type: "range", key: "n", label: "enemies", min: 10, max: 200, value: 90, reset: true },
      { type: "range", key: "kb", label: "knockback taken", min: 0, max: 4, step: 0.05, value: 1 },
      { type: "toggle", key: "grid", label: "grid", value: true },
    ],
    init(S, P, kit) {
      const r = kit.rand;
      S.aim = { x: 192, y: 120 }; S.e = []; S.boom = null;
      for (let i = 0; i < P.n; i++) {
        const a = r() * Math.PI * 2, el = r() < 0.03;
        S.e.push({ x: 192 + Math.cos(a) * (120 + r() * 80), y: 120 + Math.sin(a) * (70 + r() * 60), vx: 0, vy: 0, r: el ? 6.8 : 4, sp: el ? 34.5 : 30 });
      }
    },
    update(S, P, dt) {
      const E = S.e;
      for (const e of E) {
        const dx = S.aim.x - e.x, dy = S.aim.y - e.y, d = Math.hypot(dx, dy) || 1, l = Math.min(1, dt * 8);
        e.vx += (dx / d * e.sp - e.vx) * l; e.vy += (dy / d * e.sp - e.vy) * l;
        e.x += e.vx * dt; e.y += e.vy * dt;
      }
      if (P.mode !== "off") {
        const cell = 16, B = new Map();
        E.forEach((e, i) => { const k = Math.floor(e.x / cell) + "," + Math.floor(e.y / cell); if (!B.has(k)) B.set(k, []); B.get(k).push(i); e.cx = Math.floor(e.x / cell); e.cy = Math.floor(e.y / cell); });
        const push = (a, b) => {
          const dx = b.x - a.x, dy = b.y - a.y, m = a.r + b.r, d2 = dx * dx + dy * dy;
          if (d2 > 1e-6 && d2 < m * m) { const d = Math.sqrt(d2), p = (m - d) * 0.5; a.x -= dx / d * p; a.y -= dy / d * p; b.x += dx / d * p; b.y += dy / d * p; }
        };
        if (P.mode === "same") {
          for (const list of B.values()) for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) push(E[list[a]], E[list[b]]);
        } else {
          E.forEach((e, i) => {
            for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
              const list = B.get((e.cx + ox) + "," + (e.cy + oy));
              if (list) for (const j of list) if (j > i) push(e, E[j]);
            }
          });
        }
      }
      let ov = 0;
      for (const e of E) e.ov = false;
      for (let a = 0; a < E.length; a++) for (let b = a + 1; b < E.length; b++) {
        const A = E[a], Bb = E[b];
        if (Math.hypot(A.x - Bb.x, A.y - Bb.y) < A.r + Bb.r - 1) { ov++; A.ov = Bb.ov = true; }
      }
      S.ov = ov;
      if (S.boom) { S.boom.t -= dt; if (S.boom.t <= 0) S.boom = null; }
    },
    pointer(e, S, P) {
      S.aim = { x: e.x, y: e.y };
      if (e.type === "down") {
        for (const en of S.e) {
          const dx = en.x - e.x, dy = en.y - e.y, d = Math.hypot(dx, dy);
          if (d < 40 && d > 1e-3) { en.vx += dx / d * 90 * P.kb; en.vy += dy / d * 90 * P.kb; }
        }
        S.boom = { x: e.x, y: e.y, t: 0.25 };
      }
    },
    draw(g, S, P) {
      const C = g.C;
      g.clear();
      if (P.grid) {
        for (let x = 0; x <= 384; x += 16) g.line(x, 0, x, 216, C.ink3, 0.3);
        for (let y = 0; y <= 216; y += 16) g.line(0, y, 384, y, C.ink3, 0.3);
      }
      for (const e of S.e) g.circle(e.x, e.y, e.r, e.ov ? C.gold : C.enemy);
      if (S.boom) g.circle(S.boom.x, S.boom.y, 40 * (1 - S.boom.t / 0.25) + 4, C.ink, 1);
      g.circle(S.aim.x, S.aim.y, 3, C.ink, 1);
    },
    readout(S) { return "overlapping pairs " + (S.ov || 0) + " of " + S.e.length + " enemies"; },
  },
});
