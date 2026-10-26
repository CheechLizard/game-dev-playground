Wiki.construct({
  id: "player-movement",
  name: "Accel/friction body",
  family: "body",
  origin: "playground",
  status: "built",
  summary: "Input accelerates the player at 1400 px/s², letting go decelerates at a constant 1200 px/s², and speed is clamped to 82 px/s: top speed in 0.06 s, stopped in 2.8 px.",
  tags: ["movement", "controls", "feel", "frame rate"],

  intent:
    "<p>In a horde game the body is the whole skill. The player never aims (weapons [[aim-lead|aim themselves]]), so moving is the only verb, and it has to feel immediate: threading a gap in a crowd is a matter of a few pixels. The defaults give a body that is near-instant to start and stop but not teleporting, so a change of direction still reads as motion on a 384&times;216 canvas.</p>",

  how:
    "<h3>The update</h3>" +
    "<p><code>run:updatePlayer(dt, moveX, moveY)</code> takes a movement vector rather than reading input, which is what lets the [[headless-sim|headless harness]] drive whole runs. Keyboard input is normalised to unit length; a gamepad stick passes its analog value.</p>" +
    "<ul>" +
    "<li><b>Input held:</b> <code>v += input &times; accel &times; dt</code>, and facing becomes the input direction. There is no friction while input is held, so turning is done by the clamp: the old velocity is not removed, it is outweighed and then cut back to top speed.</li>" +
    "<li><b>No input:</b> speed drops by <code>friction &times; dt</code> along the current direction, never below zero. This is constant deceleration, not exponential damping.</li>" +
    "<li><b>Clamp:</b> if <code>|v| &gt; moveSpeed</code> (base 82 plus level and Thrusters bonuses) it is rescaled to it.</li>" +
    "<li>Position is clamped to <code>[radius, arena &minus; radius]</code> in a bounded 1200&times;900 arena.</li>" +
    "</ul>" +
    "<p>At the defaults the body reaches 82 px/s in 82/1400 = 0.059 s and stops in 82/1200 = 0.068 s, travelling <code>v&sup2;/(2&middot;friction)</code> = 2.8 px. Facing feeds weapons with <code>targeting = \"heading\"</code>; none use it now, because the Rail Lance's heading aim pointed away from the nearest enemy 40% of the time.</p>" +
    "<h3>Frame rate</h3>" +
    "<p>The game steps with LÖVE's variable <code>dt</code>, clamped to 1/20 s. The player body is written in rates per second, so its numbers hold at any frame rate. Two nearby bodies are not: a pickup's scatter velocity is multiplied by 0.86 every tick and a charging enemy's wind-up by 0.82 every tick, with no <code>dt</code>. At 144 Hz a dropped pickup drifts less than half as far as at 60 Hz, and a Brute brakes faster. The toy's rate selector shows both side by side.</p>",

  knobs: [
    ["Move speed", "82 px/s", "Top speed (plus 0.8 per level, +6 per Thrusters)", "player.moveSpeed"],
    ["Acceleration", "1400 px/s²", "How fast input builds speed", "player.accel"],
    ["Friction", "1200 px/s²", "Constant deceleration with no input", "player.friction"],
    ["Collision radius", "4 px", "Body size for contact and pickups", "player.radius"],
    ["Pickup scatter damping", "0.86 per tick", "Hard-coded, frame-rate dependent", "run.lua updatePickups"],
  ],

  related: [
    { id: "contact-iframes", how: "Moving is how the player avoids the one-hit contact model." },
    { id: "pickup-magnet", how: "The body's position is what the magnet radius is measured from." },
    { id: "ship-control", how: "ShmupRouge's thrust-and-inertia ship, the opposite end of the same dial." },
    { id: "headless-sim", how: "The movement vector argument is what lets a script play." },
  ],

  questions: [
    "Should the per-tick 0.86 and 0.82 damping become dt-correct (factor^(dt·60)), and schema settings like everything else?",
    "Is there room for a high-inertia variant (low friction) as a deliberate difficulty or character choice?",
  ],

  sparks: [
    "A dash on a cooldown that briefly lifts the clamp, so the one verb gets a second gear.",
    "Friction as a terrain property: ice patches in the arena where the same body slides for 30 px.",
    "Speed that rises with carried LP and resets when it is spent, so collecting makes you harder to control.",
  ],

  terms: [
    { term: "Facing", def: "The last non-zero input direction.", code: "player.facingX, player.facingY" },
    { term: "Movement vector", def: "The input run.lua takes instead of reading devices.", code: "run:updatePlayer(dt, moveX, moveY)" },
  ],

  sources: [
    "playground:games/horde-survivor/run.lua:1358",
    "playground:games/horde-survivor/run.lua:747",
    "playground:games/horde-survivor/run.lua:821",
    "playground:games/horde-survivor/settings.lua:80",
    "playground:shared/framework/input.lua:71",
    "playground:main.lua:107",
  ],

  toy: {
    title: "Drive it, then let go",
    hint: "hold the pointer to steer; release to coast",
    caption: "Exact player update at the chosen simulation rate. The violet dots are dropped pickups with the game's per-tick 0.86 damping: change the rate and their drift (readout) changes while the stop distance does not. Autopilot steers when you are not.",
    w: 384, h: 216,
    controls: [
      { type: "range", key: "accel", label: "accel", min: 100, max: 6000, step: 50, value: 1400 },
      { type: "range", key: "friction", label: "friction", min: 100, max: 6000, step: 50, value: 1200 },
      { type: "range", key: "speed", label: "max", min: 10, max: 400, value: 82 },
      { type: "select", key: "hz", label: "sim rate", value: "60", options: [["30", "30 Hz"], ["60", "60 Hz"], ["144", "144 Hz"]] },
    ],
    init(S) {
      Object.assign(S, { x: 192, y: 120, vx: 0, vy: 0, hold: false, tx: 0, ty: 0, wp: 0, idle: 0, acc: 0, trail: [], vs: [], drops: [], manual: false, stopAt: null, stopDist: 0 });
      S.pts = [[80, 70], [300, 90], [260, 170], [120, 150]];
    },
    update(S, P, dt, kit) {
      const h = Number(P.hz), step = 1 / h;
      if (!S.manual) {
        const [wx, wy] = S.pts[S.wp];
        if (S.idle > 0) { S.hold = false; S.idle -= dt; if (S.idle <= 0) S.wp = (S.wp + 1) % S.pts.length; }
        else { S.hold = true; S.tx = wx; S.ty = wy; if (Math.hypot(wx - S.x, wy - S.y) < 6) S.idle = 0.7; }
      }
      S.acc += dt;
      while (S.acc >= step - 1e-9) {
        S.acc -= step;
        let ix = 0, iy = 0;
        if (S.hold) { const dx = S.tx - S.x, dy = S.ty - S.y, d = Math.hypot(dx, dy); if (d > 1) { ix = dx / d; iy = dy / d; } }
        if (ix || iy) { S.vx += ix * P.accel * step; S.vy += iy * P.accel * step; S.stopAt = null; }
        else {
          const sp = Math.hypot(S.vx, S.vy);
          if (sp > 0) { if (!S.stopAt) S.stopAt = [S.x, S.y]; const drop = Math.min(sp, P.friction * step); S.vx -= S.vx / sp * drop; S.vy -= S.vy / sp * drop; if (sp - drop <= 0 && S.stopAt) { S.stopDist = Math.hypot(S.x - S.stopAt[0], S.y - S.stopAt[1]); S.drops.push({ x: S.x, y: S.y + 10, vx: (kit.rand() - 0.5) * 30, vy: (kit.rand() - 0.5) * 30, sx: S.x, sy: S.y + 10, t: 0 }); } }
        }
        const sp = Math.hypot(S.vx, S.vy);
        if (sp > P.speed) { S.vx = S.vx / sp * P.speed; S.vy = S.vy / sp * P.speed; }
        S.x = Math.max(4, Math.min(380, S.x + S.vx * step)); S.y = Math.max(34, Math.min(170, S.y + S.vy * step));
        for (const d of S.drops) { d.x += d.vx * step; d.y += d.vy * step; d.vx *= 0.86; d.vy *= 0.86; }
      }
      for (const d of S.drops) d.t += dt;
      S.drops = S.drops.filter((d) => d.t < 4).slice(-12);
      S.trail.push([S.x, S.y, S.hold]); if (S.trail.length > 120) S.trail.shift();
      S.vs.push(Math.hypot(S.vx, S.vy) / 400); if (S.vs.length > 240) S.vs.shift();
    },
    pointer(e, S) {
      if (e.type === "down" || (e.type === "move" && e.down)) { S.manual = true; S.hold = true; S.tx = e.x; S.ty = e.y; }
      if (e.type === "up") { S.hold = false; S.manual = false; S.idle = 1.2; }
    },
    draw(g, S, P) {
      const C = g.C; g.clear();
      g.rect(2, 30, 380, 144, C.rule, 1);
      for (let i = 1; i < S.trail.length; i++) { const a = S.trail[i - 1], b = S.trail[i]; g.line(a[0], a[1], b[0], b[1], b[2] ? C.ink3 : C.enemy, 1); }
      for (const d of S.drops) { g.line(d.sx, d.sy, d.x, d.y, C.violet, 1); g.rect(d.x - 1, d.y - 1, 2, 2, C.violet); }
      if (S.hold) { g.circle(S.tx, S.ty, 3, C.accent, 1); g.line(S.x, S.y, S.tx, S.ty, C.accent, 1, [2, 3]); }
      g.circle(S.x, S.y, 4, C.ink);
      g.arrow(S.x, S.y, S.x + S.vx * 0.25, S.y + S.vy * 0.25, C.gold, 1);
      // speed trace
      const y0 = 180, hh = 32;
      g.tone(2, y0, 380, hh, 0.08, C.ink3);
      g.line(2, y0 + hh - P.speed / 400 * hh, 382, y0 + hh - P.speed / 400 * hh, C.ink3, 1, [3, 3]);
      g.plot(2, y0, 380 * S.vs.length / 240, hh, S.vs, C.gold, 1);
      g.label("SPEED", 6, y0 + 9, C.ink3);
    },
    readout(S, P) {
      const h = Number(P.hz), drift = 15 * (1 / h) / (1 - 0.86);
      return "speed " + Math.hypot(S.vx, S.vy).toFixed(0) + " px/s   stop " + (P.speed * P.speed / (2 * P.friction)).toFixed(1) + " px (" + S.stopDist.toFixed(1) + ")\nmax drop drift @" + h + " Hz: " + drift.toFixed(2) + " px";
    },
  },
});
