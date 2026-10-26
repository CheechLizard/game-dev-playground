Wiki.construct({
  id: "aim-lead",
  name: "Aim prediction",
  family: "body",
  origin: "playground",
  status: "built",
  summary: "Auto-aimed weapons fire at where a moving target will be when the shot arrives, solved in three iterations and scaled by a 0..1 lead factor; at zero they fire at where it is, which misses anything crossing.",
  tags: ["auto-aim", "targeting", "prediction"],

  intent:
    "<p>The player never aims, so the weapons must, and they must be good enough that a miss reads as the enemy's doing rather than the gun's. Firing at an enemy's current position \"only works while it is coming towards you\", in the words of the code comment: anything crossing the line of fire has moved on by the time a shot arrives. That is why Orbiters, which circle the player at 120 px/s, were unhittable. Adding lead took Orbiter kills in one 20-second test from 2 of 48 to 21 of 48.</p>",

  how:
    "<h3>The solve</h3>" +
    "<p><code>run:aimPoint(target, fromX, fromY, projectileSpeed)</code>:</p>" +
    "<ol>" +
    "<li>Start with the aim point at the target's position.</li>" +
    "<li>Three times: <code>flight = |aim &minus; from| / projectileSpeed</code>, then <code>aim = target.pos + target.v &times; flight &times; aimLead</code>.</li>" +
    "</ol>" +
    "<p>It is iterated \"because the flight time depends on the point it solves for\". Three passes converge well for targets slower than the shot; for a target near shot speed the fixed-point iteration converges slowly and the lead falls short. <code>aimLead = 0</code>, or a zero projectile speed, returns the current position.</p>" +
    "<h3>Who uses it</h3>" +
    "<p>Legacy projectile weapons (Scattergun 150 px/s, Rail Lance 300 px/s) pick the nearest enemy within 260 px and lead it with their own speed &times; <code>projectileSpeedMult</code>. If nothing is in range they retry in 0.1 s rather than waiting a whole cooldown. MWS barrels set to <code>nearest</code> call the same function through the arsenal host, \"so an MWS gun is not quietly better at aiming\", but pass an assumed speed of <code>200 &times; projectileSpeedMult</code> rather than the strike's actual speed, so a graph whose shots are faster or slower than 200 px/s leads by the wrong amount. The built-in Blaster's striker flies at 190 px/s, so it over-leads by about 5%. Orbit Blades and Static Field do not aim.</p>",

  knobs: [
    ["Aim prediction", "1 (0..1)", "Fraction of the predicted lead applied", "player.aimLead"],
    ["Projectile speed", "1×", "Multiplier on every shot's speed, and on the MWS assumed 200 px/s", "player.projectileSpeedMult"],
    ["Target range", "260 px", "Nearest-enemy search radius (hard-coded)", "run.lua fireWeapon"],
    ["Iterations", "3", "Passes of the flight-time solve (hard-coded)", "run:aimPoint"],
  ],

  related: [
    { id: "targeting-turn", how: "How MWS barrels choose and turn toward a target." },
    { id: "barrels", how: "The barrel's nearest aim mode is where MWS weapons call aimPoint." },
    { id: "enemy-behaviours", how: "Orbiters and Lancers are the crossing targets lead exists for." },
    { id: "player-movement", how: "The player moves; the guns aim." },
  ],

  questions: [
    "Should the MWS host pass the strike's real speed instead of an assumed 200 px/s?",
    "Is perfect lead too good? A lead below 1 is a cheap difficulty and character dial nobody has tried.",
  ],

  sparks: [
    "Sell lead as a shop stat: start at 0.4 and let a Targeting Computer passive climb it, so crossing enemies get easier to kill over a run.",
    "Enemies that juke when a shot is fired at them, punishing perfect lead and rewarding spread weapons.",
    "Give enemy shooters the same function, with a lower lead, so the player learns to change direction to dodge.",
  ],

  terms: [
    { term: "Aim prediction", def: "Leading a target by its velocity times the shot's flight time.", code: "player.aimLead, run:aimPoint" },
    { term: "Nearest targeting", def: "Weapons pick the closest enemy within 260 px.", code: "run:nearestEnemy, targeting = \"nearest\"" },
  ],

  sources: [
    "playground:games/horde-survivor/run.lua:950",
    "playground:games/horde-survivor/run.lua:981",
    "playground:games/horde-survivor/arsenal.lua:202",
    "playground:games/horde-survivor/settings.lua:83",
    "playground:games/horde-survivor/content.lua:185",
    "playground:games/horde-survivor/weapongraphs.lua:71",
  ],

  toy: {
    title: "Lead the crossing target",
    hint: "drag lead to 0 and watch the misses",
    caption: "Exact aimPoint solve. Targets cross at a steady velocity and wrap; the turret fires every 0.5 s at the nearest one in 260 px. The iterations slider is toy-only (the game always uses 3). Ring: predicted aim point. At the defaults (Scattergun shot speed, Orbiter speed) three passes land about 40% of shots and a fully converged solve about 60%; at Rail Lance speed (300) nearly every shot lands, and with lead 0 almost none.",
    w: 384, h: 216,
    controls: [
      { type: "range", key: "lead", label: "aimLead", min: 0, max: 1, step: 0.05, value: 1 },
      { type: "range", key: "tspeed", label: "target px/s", min: 0, max: 200, step: 5, value: 120 },
      { type: "range", key: "pspeed", label: "shot px/s", min: 50, max: 400, step: 10, value: 150 },
      { type: "range", key: "iters", label: "iterations", min: 0, max: 5, value: 3 },
    ],
    init(S) {
      S.ts = [{ x: 40, y: 60, d: 1 }, { x: 300, y: 95, d: -1 }, { x: 160, y: 130, d: 1 }];
      Object.assign(S, { shots: [], cd: 0.2, fired: 0, hits: 0, aim: null, t: 0, recent: [] });
    },
    update(S, P, dt) {
      const ox = 192, oy = 204;
      S.t += dt;
      for (const t of S.ts) { t.vx = t.d * P.tspeed; t.vy = 0; t.x += t.vx * dt; if (t.x > 400) t.x = -16; if (t.x < -16) t.x = 400; t.flash = Math.max(0, (t.flash || 0) - dt); }
      S.cd -= dt;
      if (S.cd <= 0) {
        let best = null, bd = 260;
        for (const t of S.ts) { const d = Math.hypot(t.x - ox, t.y - oy); if (d < bd && t.x > 0 && t.x < 384) { bd = d; best = t; } }
        if (best) {
          let ax = best.x, ay = best.y;
          if (P.lead > 0) for (let i = 0; i < P.iters; i++) { const fl = Math.hypot(ax - ox, ay - oy) / P.pspeed; ax = best.x + best.vx * fl * P.lead; ay = best.y + best.vy * fl * P.lead; }
          const d = Math.hypot(ax - ox, ay - oy) || 1;
          S.shots.push({ x: ox, y: oy, vx: (ax - ox) / d * P.pspeed, vy: (ay - oy) / d * P.pspeed, life: 1.6 * 260 / P.pspeed, hit: false });
          S.aim = [ax, ay]; S.fired++; S.cd = 0.5;
        } else S.cd = 0.1;
      }
      for (const s of S.shots) {
        s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
        for (const t of S.ts) if (!s.hit && Math.hypot(t.x - s.x, t.y - s.y) < 7) { s.hit = true; s.life = 0; S.hits++; t.flash = 0.15; S.recent.push(1); }
        if (s.life <= 0 && !s.hit) { s.hit = true; S.recent.push(0); }
      }
      S.shots = S.shots.filter((s) => s.life > 0);
      if (S.recent.length > 20) S.recent.splice(0, S.recent.length - 20);
    },
    draw(g, S) {
      const C = g.C; g.clear();
      for (const t of S.ts) { g.line(0, t.y, 384, t.y, C.rule, 1, [2, 4]); g.circle(t.x, t.y, 5, t.flash > 0 ? C.ink : C.enemy, 1.5); g.arrow(t.x, t.y, t.x + t.vx * 0.12, t.y, C.enemy, 1); }
      if (S.aim) { g.circle(S.aim[0], S.aim[1], 4, C.accent, 1); g.line(192, 204, S.aim[0], S.aim[1], C.accent, 1, [1, 4]); }
      for (const s of S.shots) g.circle(s.x, s.y, 2, C.gold);
      g.arc(192, 204, 260, Math.PI, Math.PI * 2, C.ink3, 1);
      g.rect(186, 200, 12, 8, C.ink);
      // last 20 shots
      S.recent.forEach((r, i) => g.rect(290 + i * 4.5, 200, 3, 8, r ? C.accent : C.enemy));
      g.label("LAST 20", 288, 196, C.ink3);
    },
    readout(S) {
      const rr = S.recent.length ? S.recent.reduce((a, b) => a + b, 0) / S.recent.length : 0;
      return "hit rate " + (rr * 100).toFixed(0) + "% (last " + S.recent.length + ")\nfired " + S.fired + "  hits " + S.hits;
    },
  },
});
