Wiki.construct({
  id: "pickup-magnet",
  name: "Pickup radius and homing",
  family: "body",
  origin: "playground",
  status: "built",
  summary: "Drops scatter, settle, and once inside the player's pickup radius latch on and fly in, speeding up as they close; gold, health and weapons expire after 20 s, LP never does.",
  tags: ["pickups", "magnet", "collection", "risk"],

  intent:
    "<p>Collection should be a pull, not a chore. Drops land where enemies died, which is inside the horde, so the radius decides how close the player has to go. A small default radius (26 px on a 384 px wide view) keeps that a real choice, and the [[passive-stacking|Magnet passive]] sells relief from it.</p>" +
    "<p>Expiry splits the drops into two kinds of decision. LP waits forever, so it is a question of when; gold and health vanish after 20 s, so they are a question of whether, right now.</p>",

  how:
    "<h3>Kinds</h3>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>Kind</th><th>Dropped by</th><th>Value</th><th>Life</th></tr></thead><tbody>" +
    "<tr><td><code>lp</code></td><td>every kill</td><td><code>enemy.lp</code> &times; wave scale (&times;5 elite)</td><td>never expires</td></tr>" +
    "<tr><td><code>gold</code></td><td><code>goldChance &times; luck</code> (Grunt 0.06)</td><td>4 (&times;5 elite) &times; gold find on pickup</td><td>20 s</td></tr>" +
    "<tr><td><code>hp</code></td><td><code>hpChance &times; luck</code> (Grunt 0.01)</td><td>heals 12, capped at max HP</td><td>20 s</td></tr>" +
    "<tr><td><code>weapon</code></td><td><code>0.004 &times; luck</code>, if a slot is free</td><td>a random unowned weapon</td><td>20 s</td></tr>" +
    "</tbody></table></div>" +
    "<h3>Motion</h3>" +
    "<p><code>run:addPickup</code> gives each drop a random velocity of up to &plusmn;15 px/s per axis. Until it homes, <code>run:updatePickups</code> moves it and multiplies its velocity by 0.86 every tick, so it skids a pixel or two and stops (that factor is per tick, not per second: see [[player-movement]]).</p>" +
    "<p>When the drop is within <code>pickupRange</code> of the player it sets <code>homing = true</code>, and never clears it: a latched drop follows the player anywhere. It moves straight at the player at</p>" +
    "<p><code>pickupSpeed &times; (1 + (1 &minus; min(1, d / range)))</code></p>" +
    "<p>so 220 px/s at the edge of the radius and up to 440 px/s at contact, \"so collection feels snappy rather than floaty\". A drop is collected inside <code>player.radius + 3</code> = 7 px. Expired drops are removed silently.</p>" +
    "<h3>Range growth</h3>" +
    "<p>Pickup range is 26 px plus 0.6 px per level and 10 px per Magnet stack (up to 10): a level-20, ten-Magnet player collects from 137 px. The F4 overlay draws the radius (<code>overlay.pickupRange</code>).</p>",

  knobs: [
    ["Pickup range", "26 px", "Radius at which drops latch on", "player.pickupRange"],
    ["Pickup travel speed", "220 px/s", "Homing speed at the edge; doubles at contact", "player.pickupSpeed"],
    ["Drop lifetime", "20 s", "Life of gold, health and weapon drops", "economy.dropLifetime"],
    ["Health pickup heals", "12", "Value of an hp drop", "economy.healthDropAmount"],
    ["Luck", "1×", "Multiplies every drop chance", "player.luck"],
    ["Magnet", "+10 px per stack, max 10", "Shop passive", "passive.magnet.*"],
  ],

  related: [
    { id: "lp-levelling", how: "LP is the drop that never expires." },
    { id: "shop-economy", how: "Gold drops are half of the shop's income." },
    { id: "passive-stacking", how: "Magnet stacks the radius." },
    { id: "player-movement", how: "The per-tick 0.86 scatter damping is frame-rate dependent." },
  ],

  questions: [
    "Should drops warn before they expire? There is no blink or fade today.",
    "Should homing unlatch if the player outruns a drop, making a big radius less absolute?",
  ],

  sparks: [
    "A magnet pulse on a cooldown instead of a radius: everything on screen comes in at once, every 20 seconds.",
    "Pickups that flee the player until a kill nearby stuns them, turning collection into a small hunt.",
    "LP that slowly drifts toward the nearest enemy and is eaten if it arrives, so leaving it costs something.",
  ],

  terms: [
    { term: "Pickup", def: "A dropped item; its kind is lp, gold, hp or weapon.", code: "pk.kind, run:addPickup" },
    { term: "Pickup range", def: "Radius at which a drop latches on and homes.", code: "player.pickupRange" },
    { term: "Homing", def: "Latched state of a drop that has entered the pickup range.", code: "pk.homing" },
  ],

  sources: [
    "playground:games/horde-survivor/run.lua:654",
    "playground:games/horde-survivor/run.lua:715",
    "playground:games/horde-survivor/run.lua:724",
    "playground:games/horde-survivor/settings.lua:113",
    "playground:games/horde-survivor/settings.lua:179",
  ],

  shots: [
    { src: "img/horde-wave10.png", caption: "Wave 10 with a stationary god-mode player: uncollected LP (small accent squares) lies where the horde died.", cmd: "luajit tools/screenshot.lua wave10.png --at 140 --seed 7 --set run.wavesPerShop=10 --set debug.godMode=true" },
  ],

  toy: {
    title: "Sweep the field",
    hint: "move the pointer to steer",
    caption: "Exact scatter, latch and homing rules. Simplified: kills happen at random spots every 0.4 s, and drop odds are raised (gold 30%, health 8%) so every kind shows up. Gold and health fade over their 20 s life; the game shows no fade.",
    w: 384, h: 216,
    controls: [
      { type: "range", key: "range", label: "pickup range", min: 4, max: 140, value: 26, fmt: "{} px" },
      { type: "range", key: "speed", label: "travel speed", min: 20, max: 900, step: 10, value: 220, fmt: "{} px/s" },
      { type: "range", key: "life", label: "drop life", min: 1, max: 60, value: 20, fmt: "{} s" },
    ],
    init(S) {
      Object.assign(S, { x: 192, y: 120, tx: 192, ty: 120, manual: 0, wp: 0, pk: [], kt: 0, got: { lp: 0, gold: 0, hp: 0 }, lost: { gold: 0, hp: 0 } });
      S.pts = [[60, 60], [320, 70], [300, 180], [80, 170], [192, 120]];
    },
    update(S, P, dt, kit) {
      S.kt -= dt;
      if (S.kt <= 0) {
        S.kt = 0.4;
        const x = 10 + kit.rand() * 364, y = 36 + kit.rand() * 172;
        const add = (kind) => S.pk.push({ kind, x, y, vx: (kit.rand() - 0.5) * 30, vy: (kit.rand() - 0.5) * 30, life: kind === "lp" ? Infinity : P.life, max: P.life, homing: false });
        add("lp"); if (kit.rand() < 0.3) add("gold"); if (kit.rand() < 0.08) add("hp");
      }
      S.manual -= dt;
      if (S.manual <= 0) { const p = S.pts[S.wp]; S.tx = p[0]; S.ty = p[1]; if (Math.hypot(S.tx - S.x, S.ty - S.y) < 4) S.wp = (S.wp + 1) % S.pts.length; }
      const dx = S.tx - S.x, dy = S.ty - S.y, d = Math.hypot(dx, dy);
      if (d > 1) { const m = Math.min(d, 82 * dt); S.x += dx / d * m; S.y += dy / d * m; }
      const alive = [];
      for (const p of S.pk) {
        p.life -= dt;
        const ex = S.x - p.x, ey = S.y - p.y, dist = Math.hypot(ex, ey);
        if (dist < P.range) p.homing = true;
        if (p.homing) { const pull = P.speed * (1 + (1 - Math.min(1, dist / Math.max(1, P.range)))); if (dist > 0) { p.x += ex / dist * pull * dt; p.y += ey / dist * pull * dt; } }
        else { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.86; p.vy *= 0.86; }
        if (dist < 7) S.got[p.kind] += 1;
        else if (p.life > 0) alive.push(p);
        else S.lost[p.kind] += 1;
      }
      S.pk = alive.length > 400 ? alive.slice(-400) : alive;
    },
    pointer(e, S) { S.tx = Math.max(4, Math.min(380, e.x)); S.ty = Math.max(34, Math.min(212, e.y)); S.manual = 2.5; },
    draw(g, S, P) {
      const C = g.C; g.clear();
      g.toneCircle(S.x, S.y, P.range, 0.08, C.accent);
      g.circle(S.x, S.y, P.range, C.accent, 1);
      for (const p of S.pk) {
        const f = p.kind === "lp" ? 1 : Math.max(0, p.life / p.max);
        g.ctx.globalAlpha = 0.25 + 0.75 * f;
        if (p.kind === "lp") g.rect(p.x - 1, p.y - 1, 2, 2, C.accent);
        else if (p.kind === "gold") g.rect(p.x - 1.5, p.y - 1.5, 3, 3, C.gold);
        else { g.rect(p.x - 2.5, p.y - 0.75, 5, 1.5, C.enemy); g.rect(p.x - 0.75, p.y - 2.5, 1.5, 5, C.enemy); }
        g.ctx.globalAlpha = 1;
        if (p.homing) g.line(p.x, p.y, S.x, S.y, C.ink3, 0.5);
      }
      g.circle(S.x, S.y, 4, C.ink);
      g.circle(S.x, S.y, 7, C.ink3, 0.5);
    },
    readout(S) {
      return "lp " + S.got.lp + " (lost 0)   gold " + S.got.gold + " (lost " + S.lost.gold + ")\nhp " + S.got.hp + " (lost " + S.lost.hp + ")   on field " + S.pk.length;
    },
  },
});
