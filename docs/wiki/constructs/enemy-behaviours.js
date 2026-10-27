Wiki.construct({
  id: "enemy-behaviours",
  name: "Enemy behaviours",
  origin: "playground",
  status: "built",
  statusNote: "Four behaviours across six enemies, all built. A behaviour is fixed per enemy at load; the editor cannot switch it at runtime.",
  summary: "Four small steering rules (chase, standoff, wind-up charge, orbit) plus one shared shot, each chosen for what it forces the player's movement to do.",
  tags: ["ai", "steering", "telegraph", "movement pressure"],

  intent:
    "<p>In a game where the player only moves (weapons fire on their own), an enemy's behaviour is a question about movement. Chasers ask you to keep moving. A standoff shooter asks you to stop standing still and to cross a no-go ring to kill it. A charger asks you to read a wind-up and step sideways. An orbiter builds a moving cage you cannot outrun radially. The cast is six enemies, but only four questions.</p>" +
    "<p>The player moves at 82 px/s. Every schema chaser except the swarmer is slower, so a competent kiter simply walks away from them: commit <code>8096d78</code> found the brute only landed hits at 68 px/s. That is why the slow, heavy enemies charge and the dangerous ranged ones shoot.</p>",

  how:
    "<p><code>content.lua</code> gives each enemy a <code>behaviour</code> string; behaviour-specific fields are registered only for enemies that use them. After the behaviour sets velocity, <code>run:updateEnemies</code> integrates <code>x += vx&middot;dt</code> and tests contact (one hit, then 0.5 s of player i-frames). Numbers below are schema values; <code>config/profiles/default.json</code> overrides some of them (marked) and is what the game actually loads.</p>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>Enemy</th><th>Behaviour</th><th>HP</th><th>Speed</th><th>Damage</th><th>Asks the player to</th></tr></thead><tbody>" +
    "<tr><td>Grunt</td><td>chase</td><td>12</td><td>30 (default.json 65.7)</td><td>8</td><td>keep moving</td></tr>" +
    "<tr><td>Swarmer</td><td>chase, pack 6</td><td>5</td><td>96 (default.json 63.0)</td><td>4</td><td>clear a wave front</td></tr>" +
    "<tr><td>Spitter</td><td>shoot</td><td>18</td><td>26</td><td>6</td><td>stop standing still; close in</td></tr>" +
    "<tr><td>Brute</td><td>charge</td><td>52</td><td>24</td><td>22</td><td>read the wind-up, sidestep</td></tr>" +
    "<tr><td>Lancer</td><td>charge</td><td>26</td><td>34</td><td>16</td><td>sidestep often</td></tr>" +
    "<tr><td>Orbiter</td><td>orbit</td><td>34</td><td>40</td><td>12</td><td>break the cage; cross its fire</td></tr>" +
    "</tbody></table></div>" +
    "<h3>Chase (Grunt, Swarmer)</h3>" +
    "<p><code>seekPlayer</code>: desired velocity is the unit vector to the player times speed, and <code>v += (desired &minus; v)&middot;min(1, 8&middot;dt)</code>. That first-order lag (about 0.125 s) is also how [[crowd-separation|knockback]] decays. Standing still is death: the <code>death.png</code> capture is a stationary player killed by grunts at 0:33 on default.json's 65.7 px/s grunts.</p>" +
    "<h3>Standoff shooter (Spitter)</h3>" +
    "<p>Preferred distance is <code>shootRange</code> (100). The spitter closes when farther than 1.1&times; (110 px), backs off when nearer than 0.75&times; (75 px), and holds in between, with a softer lag (6/s). It fires when its timer is up and the player is within 1.6&times; (160 px). Cooldowns are staggered at spawn (<code>shootCooldown &times; rng()</code>) so a group does not volley in unison. Shots fly straight at where you are, with no lead, so lateral movement beats them.</p>" +
    "<h3>Wind-up charge (Brute, Lancer)</h3>" +
    "<p>Three phases in <code>e.phase</code>. <b>approach</b> chases until within <code>chargeRange</code> with the cooldown expired. <b>windup</b> damps velocity by 0.82 per tick and blinks at 14 Hz for <code>chargeWindup</code>. At its end the direction to the player <em>at that moment</em> is locked, and <b>charging</b> moves along it at <code>chargeSpeed</code> for <code>chargeDuration</code>, ignoring knockback, then cooldown. A perpendicular step during the wind-up dodges it. Charge speed is not wave- or elite-scaled.</p>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th></th><th>Range</th><th>Wind-up</th><th>Speed</th><th>Duration</th><th>Dash</th><th>Cooldown</th></tr></thead><tbody>" +
    "<tr><td>Brute</td><td>150 (129.6)</td><td>0.8 s</td><td>300 (232.7)</td><td>0.55 s</td><td>165 px (128)</td><td>3.2 s</td></tr>" +
    "<tr><td>Lancer</td><td>120</td><td>0.55 s</td><td>260 (234)</td><td>0.45 s</td><td>117 px (105)</td><td>2.6 s</td></tr>" +
    "</tbody></table></div>" +
    "<h3>Orbit shooter (Orbiter)</h3>" +
    "<p>Radial correction <code>(dist &minus; orbitRadius)&middot;2</code>, clamped to &plusmn;speed, plus a tangent at <code>orbitSpeed</code> (120 px/s) in a direction rolled at spawn; lag 5/s. Holding a 64 px radius means it never makes contact, so it shoots across the ring, and it has no range gate. 120 px/s tangential is faster than the player, so it laps you. Without [[aim-lead]] the player's guns killed 2 of 48 orbiters in 20 s; with it, 21 of 48. Once it could fire it became the largest single damage source in the harness.</p>" +
    "<h3>The shared shot</h3>" +
    "<p>&ldquo;Shooting is not a behaviour, it is something a behaviour can do.&rdquo; <code>run:fireEnemyShot</code> resets the timer and sends a straight shot at the player's current position with damage <code>shotDamage &times; waveScale.damage</code> and lifetime <code>shotLife</code>. A shot that touches the player is consumed even during i-frames. Shots once had a hard-coded 5 s life, and spitters sniped from four times their engagement range; <code>shotLife</code> is now a setting, with the rule that <code>shotSpeed &times; shotLife</code> stays close to <code>shootRange</code>. The spitter obeys it (88 &times; 1.5 = 132 px). <b>The orbiter does not:</b> 95 &times; 3 = 285 px, more than four times its orbit radius and wider than half the 384 px view, with no range gate on firing.</p>",

  knobs: [
    ["Speed", "per enemy", "Chase speed; compare with the player's 82 px/s", "enemy.<id>.speed"],
    ["Preferred range", "100", "Spitter's standoff distance; band 0.75x-1.1x, fires within 1.6x", "enemy.spitter.shootRange"],
    ["Shot cooldown", "2.4 s (spitter 4.9 in default.json)", "Seconds between shots", "enemy.<id>.shootCooldown"],
    ["Shot speed x life", "88 x 1.5 / 95 x 3", "Shot reach; should match the range it fires from", "enemy.<id>.shotSpeed, .shotLife"],
    ["Charge range / wind-up / speed / duration / cooldown", "see table", "The charge FSM", "enemy.<id>.charge*"],
    ["Orbit radius / speed", "64 / 120", "Ring the orbiter holds and how fast it circles", "enemy.orbiter.orbitRadius, .orbitSpeed"],
  ],

  related: [
    { id: "crowd-separation", how: "Chasers all converge on one point and rely on separation to spread." },
    { id: "aim-lead", how: "The player's answer to the orbiter's tangential speed." },
    { id: "contact-iframes", how: "What a touch costs: one hit, then 0.5 s of immunity." },
    { id: "fair-attack-contract", how: "The wind-up is a telegraph; the orbiter's 285 px shot strains the contract." },
    { id: "kamikaze-dive", how: "ShmupRouge's committed attack, a relative of the charge." },
  ],

  questions: [
    "Should the orbiter's shot reach be cut to fit the shotSpeed x shotLife rule, or should orbiters get a range gate like the spitter?",
    "Chargers lock direction at the end of the wind-up with no lead. Would a leading charge (where the dodge is to stop) be a better second charger than the lancer?",
    "Chasers have no flanking: they all converge on one point. Is separation enough?",
    "default.json has the grunt faster than the swarmer (65.7 vs 63.0). Was that a playtest decision or an autosave accident?",
  ],

  sparks: [
    "A behaviour dial for 'how smart': shooters that lead the player by a fraction from 0 to 1, tuned per enemy.",
    "Chargers that wreck other enemies along their dash, so baiting a charge through the crowd is a player tool.",
    "An orbiter whose ring tightens over time: a closing noose that tells the player how long they have.",
    "Standoff shooters that coordinate to stand on opposite sides, so the safe band becomes a crossfire.",
  ],

  terms: [
    { term: "Behaviour", def: "The steering rule an enemy runs: chase, shoot, charge or orbit. Fixed at load.", code: "def.behaviour, content.behaviourFields" },
    { term: "Preferred range", def: "The spitter's standoff distance.", code: "enemy.spitter.shootRange" },
    { term: "Charge phase", def: "approach, windup or charging.", code: "e.phase, chargeWindup, chargeDuration" },
    { term: "Orbit direction", def: "Clockwise or anticlockwise, rolled at spawn.", code: "e.orbitDir" },
    { term: "Enemy shot", def: "The one firing routine every shooting behaviour shares.", code: "run:fireEnemyShot, run.enemyShots, shotLife" },
  ],

  sources: [
    "playground:games/horde-survivor/run.lua:774",
    "playground:games/horde-survivor/run.lua:936",
    "playground:games/horde-survivor/content.lua:62",
    "playground:games/horde-survivor/render.lua:322",
    "playground:config/profiles/default.json",
    "playground:HANDOFF.md",
  ],

  shots: [
    { src: "img/horde-wave60.png", caption: "Wave 60, god mode: all four behaviours on screen. Orbiters (rings) hold their radius well outside the clump; spitters (diamonds) hang back at range.", cmd: "luajit tools/screenshot.lua lastwave.png --at 5 --seed 7 --set debug.godMode=true --do \"Skip to last wave\" --frames 3 --every 4 (third frame)" },
    { src: "img/death.png", caption: "Standing still with default.json's 65.7 px/s grunts: dead at 0:33 on wave 3, killed by grunts, never more than 4 enemies alive.", cmd: "luajit tools/screenshot.lua death.png --seed 7 --at 145 --set run.wavesPerShop=10" },
  ],

  toy: {
    title: "Four questions about movement",
    hint: "move the pointer to steer; pick one behaviour to see its geometry",
    caption: "The stage is the game's 384 x 216 view at 1:1, wave 1, no weapons. Rings are drawn for a single selected behaviour: spitter band (75/110) and fire gate (160); orbit ring (64) and the orbiter's 285 px shot reach; charge range with the locked heading. The player moves at a flat 82 px/s (no acceleration).",
    w: 384, h: 216,
    controls: [
      { type: "select", key: "b", label: "behaviour", value: "all", reset: true, options: [["all", "all"], ["chase", "chase"], ["shoot", "standoff"], ["charge", "wind-up charge"], ["orbit", "orbit"]] },
      { type: "toggle", key: "dj", label: "default.json values", value: true },
    ],
    init(S, P, kit) {
      const r = kit.rand;
      S.p = { x: 192, y: 124 }; S.aim = { x: 192, y: 124 }; S.shots = []; S.hits = 0; S.ifr = 0; S.last = ""; S.e = [];
      const list = { all: ["grunt", "swarmer", "spitter", "brute", "lancer", "orbiter"], chase: ["grunt", "grunt", "swarmer"], shoot: ["spitter", "spitter"], charge: ["brute", "lancer"], orbit: ["orbiter", "orbiter"] }[P.b];
      for (const id of list) {
        const a = r() * Math.PI * 2, n = id === "swarmer" ? 6 : 1;
        for (let i = 0; i < n; i++) {
          const x = 192 + Math.cos(a) * 170 + (r() - 0.5) * 26, y = 124 + Math.sin(a) * 95 + (r() - 0.5) * 26;
          S.e.push({ id, x, y, vx: 0, vy: 0, phase: "approach", st: id === "brute" ? 3.2 * r() : id === "lancer" ? 2.6 * r() : 0, sh: 2.4 * r(), dir: r() < 0.5 ? -1 : 1, mode: "" });
        }
      }
    },
    update(S, P, dt) {
      const p = S.p, dj = P.dj;
      const D = {
        grunt: { sp: dj ? 65.7 : 30, dmg: 8, r: 4 }, swarmer: { sp: dj ? 63 : 96, dmg: 4, r: 3 },
        spitter: { sp: 26, dmg: 6, r: 4, range: 100, cd: dj ? 4.9 : 2.4, ss: 88, life: 1.5, sd: 6 },
        brute: { sp: 24, dmg: 22, r: 7, cr: dj ? 129.6 : 150, cs: dj ? 232.7 : 300, wu: 0.8, du: 0.55, cool: 3.2 },
        lancer: { sp: 34, dmg: 16, r: 5, cr: 120, cs: dj ? 234 : 260, wu: 0.55, du: 0.45, cool: 2.6 },
        orbiter: { sp: 40, dmg: 12, r: 5, orad: 64, osp: 120, cd: 2.4, ss: 95, life: 3, sd: 7 },
      };
      S.D = D;
      const dx0 = S.aim.x - p.x, dy0 = S.aim.y - p.y, d0 = Math.hypot(dx0, dy0);
      if (d0 > 1) { const m = Math.min(d0, 82 * dt); p.x += dx0 / d0 * m; p.y += dy0 / d0 * m; }
      p.x = Math.max(4, Math.min(380, p.x)); p.y = Math.max(4, Math.min(212, p.y));
      const fire = (e, d, dx, dy, dist) => { e.sh = d.cd; S.shots.push({ x: e.x, y: e.y, vx: dx / dist * d.ss, vy: dy / dist * d.ss, life: d.life, dmg: d.sd, src: e.id }); };
      for (const e of S.e) {
        const d = D[e.id], dx = p.x - e.x, dy = p.y - e.y, dist = Math.hypot(dx, dy) || 1, nx = dx / dist, ny = dy / dist;
        const lag = (k, tx, ty) => { const l = Math.min(1, dt * k); e.vx += (tx - e.vx) * l; e.vy += (ty - e.vy) * l; };
        if (e.id === "grunt" || e.id === "swarmer") { lag(8, nx * d.sp, ny * d.sp); e.mode = "CHASE"; }
        else if (e.id === "spitter") {
          const s = dist > d.range * 1.1 ? 1 : dist < d.range * 0.75 ? -1 : 0;
          lag(6, nx * d.sp * s, ny * d.sp * s); e.mode = s > 0 ? "CLOSE" : s < 0 ? "BACK OFF" : "HOLD";
          e.sh -= dt; if (e.sh <= 0 && dist < d.range * 1.6) fire(e, d, dx, dy, dist);
        } else if (e.id === "brute" || e.id === "lancer") {
          e.st -= dt;
          if (e.phase === "approach") { lag(8, nx * d.sp, ny * d.sp); if (dist < d.cr && e.st <= 0) { e.phase = "windup"; e.st = d.wu; } }
          else if (e.phase === "windup") { e.vx *= 0.82; e.vy *= 0.82; if (e.st <= 0) { e.cx = nx; e.cy = ny; e.phase = "charging"; e.st = d.du; } }
          else { e.vx = e.cx * d.cs; e.vy = e.cy * d.cs; if (e.st <= 0) { e.phase = "approach"; e.st = d.cool; } }
          e.mode = e.phase.toUpperCase();
        } else if (e.id === "orbiter") {
          const rad = Math.max(-d.sp, Math.min(d.sp, (dist - d.orad) * 2));
          lag(5, nx * rad - ny * e.dir * d.osp, ny * rad + nx * e.dir * d.osp); e.mode = "ORBIT";
          e.sh -= dt; if (e.sh <= 0) fire(e, d, dx, dy, dist);
        }
        e.x = Math.max(-30, Math.min(414, e.x + e.vx * dt)); e.y = Math.max(-30, Math.min(246, e.y + e.vy * dt));
        if (Math.hypot(p.x - e.x, p.y - e.y) < d.r + 4 && S.ifr <= 0) { S.hits++; S.ifr = 0.5; S.last = e.id; }
      }
      for (let a = 0; a < S.e.length; a++) for (let b = a + 1; b < S.e.length; b++) {
        const A = S.e[a], B = S.e[b], dx = B.x - A.x, dy = B.y - A.y, m = D[A.id].r + D[B.id].r, d2 = dx * dx + dy * dy;
        if (d2 > 1e-6 && d2 < m * m) { const d = Math.sqrt(d2), q = (m - d) / 2; A.x -= dx / d * q; A.y -= dy / d * q; B.x += dx / d * q; B.y += dy / d * q; }
      }
      for (const s of S.shots) {
        s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
        if (s.life > 0 && Math.hypot(s.x - p.x, s.y - p.y) < 6) { s.life = 0; if (S.ifr <= 0) { S.hits++; S.ifr = 0.5; S.last = s.src + " shot"; } }
      }
      S.shots = S.shots.filter((s) => s.life > 0);
      S.ifr = Math.max(0, S.ifr - dt); S.t = (S.t || 0) + dt;
    },
    pointer(e, S) { S.aim = { x: e.x, y: e.y }; },
    draw(g, S, P) {
      const C = g.C, p = S.p, D = S.D;
      g.clear();
      if (!D) return;
      if (P.b === "shoot") { g.circle(p.x, p.y, 75, C.ink3, 1); g.circle(p.x, p.y, 110, C.ink3, 1); g.circle(p.x, p.y, 160, C.ink3, 0.5); }
      if (P.b === "orbit") g.circle(p.x, p.y, 64, C.ink3, 1);
      for (const e of S.e) {
        const d = D[e.id];
        if (P.b === "shoot") g.circle(e.x, e.y, 132, C.accent, 0.5);
        if (P.b === "orbit") g.circle(e.x, e.y, 285, C.enemy, 0.5);
        if (P.b === "charge" && e.phase === "approach") g.circle(e.x, e.y, d.cr, C.ink3, 0.5);
        if (e.phase === "charging") g.line(e.x, e.y, e.x + e.cx * d.cs * Math.max(0, e.st), e.y + e.cy * d.cs * Math.max(0, e.st), C.enemy, 1, [3, 3]);
        const blink = e.phase === "windup" && Math.floor((S.t || 0) * 14) % 2 === 0;
        const col = blink ? C.ink : (e.id === "spitter" || e.id === "lancer" || e.id === "orbiter") ? C.accent : C.enemy, r = d.r;
        if (e.id === "brute") g.rect(e.x - r, e.y - r, r * 2, r * 2, col);
        else if (e.id === "spitter") g.poly([[e.x, e.y - r - 1], [e.x + r + 1, e.y], [e.x, e.y + r + 1], [e.x - r - 1, e.y]], col);
        else if (e.id === "lancer") { const a = Math.atan2(p.y - e.y, p.x - e.x); g.poly([[e.x + Math.cos(a) * 7, e.y + Math.sin(a) * 7], [e.x + Math.cos(a + 2.4) * 5, e.y + Math.sin(a + 2.4) * 5], [e.x + Math.cos(a - 2.4) * 5, e.y + Math.sin(a - 2.4) * 5]], col); }
        else if (e.id === "orbiter") { g.circle(e.x, e.y, r, col, 1.5); g.circle(e.x, e.y, 2, col, 1); }
        else g.circle(e.x, e.y, r, col);
        if (e.id !== "swarmer" && e.id !== "grunt" || P.b === "chase" && e.id === "grunt") g.label(e.mode, e.x, e.y - r - 4, C.ink2, "center");
      }
      for (const s of S.shots) g.circle(s.x, s.y, 2, C.gold);
      g.circle(p.x, p.y, 4, S.ifr > 0 ? C.enemy : C.ink);
    },
    readout(S) { return "hits " + S.hits + (S.last ? "   last: " + S.last : ""); },
  },
});
