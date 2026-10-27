Wiki.construct({
  id: "black-holes",
  name: "Black holes: gravity well and event horizon",
  origin: "shmuprouge",
  status: "partial",
  statusNote: "Built: the field, the spiral, fading, summing of several holes, deletion of material in the horizon, and destruction of projectiles and enemies. Not built: growth when fed, decay when starved, exotic output on collapse, pull on ships. <code>docs/entities/Black_Holes.md</code> still lists horizon collision and entity destruction as future work; the code has both.",
  summary: "A timed point attractor, fired from the gravity gun, that spirals loose material inward and deletes everything inside its event horizon: sand, bullets and enemies, but never the player.",
  tags: ["gravity", "hazard", "flow field", "falling sand", "payload"],

  intent:
    "<p>The black hole turns the destructible world into a vortex. It is a tool that harvests and denies at once: it pulls sand into a visible stream and it eats projectiles and enemies that cross its core. Lob one behind you while fleeing and pursuers' bullets die in it.</p>" +
    "<p>The spec frames it as a risk bank (feed it to grow it, starve it to kill it, collect exotic matter when it collapses). None of that economy is built yet; what exists is the physical part.</p>",

  how:
    "<h3>Delivery</h3>" +
    "<p>The gravity gun is TRIGGER (press) &rarr; BATTERY (30 e/s) &rarr; BARREL (1) &rarr; STRIKER (projectile, <code>baseSpeed</code> 180, <code>gravity</code> 80, <code>lifetimeMax</code> 1.5 s) &rarr; PAYLOAD (<code>black_hole</code>), weapon <code>cooldown</code> 2 s. The payload fires on hit or on expiry, so the shot is a lobbed grenade that becomes a hole where it lands. The handler <code>spawn_attractor</code> first calls <code>terrain:destabilizeRadius</code> over the full-strength radius, so static rock in the core turns loose and can be pulled.</p>" +
    "<h3>The field</h3>" +
    "<p>The entity carries a <code>GravityAffector</code> (attractor), a <code>Lifetime</code>, a <code>hazard</code> collider of radius <code>eventHorizonRadius</code>, and a <code>BlackHole</code> marker. Strength is hard-coded to 1.0 whatever the config says; <code>fullStrengthRadius = 2 &times; eventHorizonRadius</code>. The force is evaluated per 32-wu flow cell:</p>" +
    "<ul>" +
    "<li><code>dir = normalize(radial&middot;(1&minus;|o|) + tangent&middot;o)</code> with <code>o = orbitStrength</code>: 0 pulls straight in, 1 orbits.</li>" +
    "<li><code>amp = strength</code> inside the full-strength radius, then falls linearly to 0 at <code>maxDistance</code>. Wraps toroidally.</li>" +
    "<li>Cells within the horizon are flagged <code>extreme</code> and set to amp 1.0. Every other summed amplitude is clamped to 0.89, so overlapping wells can never reach the kill threshold by accident.</li>" +
    "</ul>" +
    "<h3>What it does to things</h3>" +
    "<p>In the sand shader, any non-empty cell sampling <code>gravityAmp &ge; 0.9</code> (<code>EVENT_HORIZON_THRESHOLD</code>) becomes empty. Elsewhere each 2&times;2 Margolus block moves toward one of the two cardinal directions bracketing the gravity angle, chosen with probability by angular proximity, so the spiral emerges statistically. The collision handler destroys any <code>projectile</code> or <code>enemy</code> touching the hazard collider. The player collides with hazards too, but the handler ignores it, and ships never read the gravity field: the player is neither harmed nor pulled.</p>" +
    "<h3>Lifetime</h3>" +
    "<p>In the last <code>fadeTime</code> seconds, strength is <code>maxStrength &times; remaining/fadeTime</code>. The pull weakens but the horizon does not: cells inside it stay flagged extreme, so the hole keeps deleting until it is destroyed. The shader quad is <code>eventHorizonRadius &times; 4</code> across, eases in over 0.5 s and out during the fade.</p>",

  knobs: [
    ["Max distance", "500 wu", "Where the pull falls to zero", "gravity_gun.json effectParams.maxDistance"],
    ["Orbit strength", "0.1", "Radial-to-tangential blend", "effectParams.orbitStrength"],
    ["Event horizon radius", "50 wu (full strength 100)", "Kill radius for sand, bullets and enemies", "effectParams.eventHorizonRadius"],
    ["Lifetime / fade", "100 s / 2 s", "How long a hole lasts and how long it fades", "effectParams.lifetime, fadeTime"],
    ["Kill threshold", "0.9", "Amplitude at which material is deleted", "EVENT_HORIZON_THRESHOLD"],
    ["Non-extreme cap", "0.89", "Ceiling on summed amplitude outside a horizon", "gravity_flow_field.lua"],
  ],

  related: [
    { id: "flow-field-gravity", how: "A black hole is one more attractor stamped into the same per-cell field." },
    { id: "falling-sand", how: "The material it moves and deletes." },
    { id: "payloads", how: "It is delivered as a PAYLOAD effect on a lobbed striker." },
    { id: "stability-and-debris", how: "Destabilising turns hardened rock loose so the hole can eat it." },
  ],

  questions: [
    "Should ships feel the pull? Today the player and NPCs ignore the field entirely.",
    "Growth rule if it is fed: linear or diminishing radius, and what does the collapse pay?",
    "The 32-wu field makes small horizons blocky; is a learned pull zone better than a visible one?",
    "The effect's own defaults (<code>black_hole.json</code>: strength 0.6, orbit 0.06, lifetime 30) are overridden by the weapon and strength is ignored. Which is the intended tuning?",
  ],

  sparks: [
    "Feed-to-grow: count consumed cells, set radius to the square root of the count, and pay out on collapse. A literal risk bank.",
    "A repulsor version as a terrain blower for excavation puzzles, and orbit strength 1 rings as conveyor belts.",
    "Give the enemy a black hole: a ticking bomb that eats the sand walls you hid behind.",
    "A defensive sink that only deletes enemy bullets, turning a hazard into a shield you place.",
  ],

  terms: [
    { term: "Event horizon", def: "The core where amplitude is 1.0 and all material, bullets and enemies are deleted.", code: "eventHorizonRadius, EVENT_HORIZON_THRESHOLD" },
    { term: "Full-strength radius", def: "Twice the horizon; the pull is constant inside it and falls off beyond.", code: "fullStrengthRadius" },
    { term: "Orbit strength", def: "Blend from pure inward pull (0) to pure orbit (1).", code: "orbitStrength" },
    { term: "Attractor", def: "A gravity affector that pulls toward a point; planets use the same component.", code: "GravityAffector.affectorType" },
    { term: "Destabilize", def: "Turn static rock loose inside a radius.", code: "terrain:destabilizeRadius" },
  ],

  sources: [
    "shmuprouge:game/entities/black_hole.lua",
    "shmuprouge:game/combat/effects/handlers/spawn_attractor.lua",
    "shmuprouge:engine/physics/flow_field/gravity_computation.lua",
    "shmuprouge:engine/physics/flow_field/gravity_flow_field.lua",
    "shmuprouge:engine/physics/sand/chunk_shader/simulation.lua",
    "shmuprouge:game/systems/entity_collision_system.lua",
    "shmuprouge:shared/data/entities/weapons/gravity_gun.json",
    "shmuprouge:docs/entities/Black_Holes.md",
  ],

  toy: {
    title: "Feed the vortex",
    hint: "click to drop a hole (up to three)",
    caption: "0.3 px per wu. Sand cells are 10 wu and flow cells 30 wu (the game's are 1 and 32). Grey rock only loosens inside a new hole's full-strength radius. Cells step one cardinal at a time with probability amp, a stand-in for the Margolus blocks. The ship on the left is never pulled.",
    w: 384, h: 216,
    controls: [
      { type: "range", key: "orbit", label: "orbit", min: -1, max: 1, step: 0.05, value: 0.1 },
      { type: "range", key: "maxd", label: "max dist", min: 100, max: 500, step: 10, value: 500, fmt: "{} wu" },
      { type: "range", key: "eh", label: "horizon", min: 10, max: 60, value: 50, fmt: "{} wu" },
      { type: "toggle", key: "arrows", label: "field", value: false },
      { type: "button", label: "fade all", press(S) { for (const h of S.holes) h.life = Math.min(h.life, 2); } },
      { type: "button", label: "reset", press(S, P, kit) { S.reset = true; } },
    ],
    init(S, P, kit) {
      const W = 128, H = 72;
      S.W = W; S.H = H; S.cells = new Uint8Array(W * H); S.moved = new Uint8Array(W * H);
      for (let i = 0; i < 8; i++) {
        const cx = 20 + kit.rand() * 100, cy = 6 + kit.rand() * 60, r = 4 + kit.rand() * 6;
        for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) {
          const X = Math.round(cx + x), Y = Math.round(cy + y);
          if (X >= 0 && X < W && Y >= 0 && Y < H) S.cells[Y * W + X] = 2;
        }
      }
      for (let i = 0; i < 1600; i++) { const j = (kit.rand() * W * H) | 0; if (!S.cells[j]) S.cells[j] = 1; }
      S.holes = []; S.eaten = 0; S.kills = 0; S.bullets = []; S.bulletsEaten = 0; S.fireT = 0; S.reset = false;
      S.enemies = [0, 1, 2, 3].map((i) => ({ x: 120 + i * 60, y: 20 + i * 50, vx: -14 - i * 3, vy: 6, dead: 0 }));
      this.drop(S, P, 220, 100);
    },
    drop(S, P, x, y) {
      if (S.holes.length >= 3) S.holes.shift();
      const eh = P.eh * 0.3, fsr = eh * 2;
      S.holes.push({ x, y, life: 100 });
      for (let Y = 0; Y < S.H; Y++) for (let X = 0; X < S.W; X++) {
        if (S.cells[Y * S.W + X] === 2 && Math.hypot(X * 3 + 1.5 - x, Y * 3 + 1.5 - y) < fsr) S.cells[Y * S.W + X] = 1;
      }
    },
    pointer(e, S, P) { if (e.type === "down" && e.x > 70) this.drop(S, P, e.x, e.y); },
    field(S, P, px, py) {
      const eh = P.eh * 0.3, fsr = eh * 2, md = P.maxd * 0.3, o = P.orbit;
      let fx = 0, fy = 0, extreme = false;
      for (const h of S.holes) {
        const dx = h.x - px, dy = h.y - py, d = Math.hypot(dx, dy);
        if (d >= md || d < 0.3) continue;
        const rx = dx / d, ry = dy / d, tx = -dy / d, ty = dx / d;
        let bx = rx * (1 - Math.abs(o)) + tx * o, by = ry * (1 - Math.abs(o)) + ty * o;
        const bl = Math.hypot(bx, by) || 1;
        const str = Math.min(1, h.life / 2);
        const amp = d <= fsr ? str : str * Math.max(0, 1 - (d - fsr) / (md - fsr));
        fx += bx / bl * amp; fy += by / bl * amp;
        if (d <= eh) extreme = true;
      }
      let amp = Math.hypot(fx, fy);
      const ang = Math.atan2(fy, fx);
      if (extreme) amp = 1; else amp = Math.min(amp, 0.89);
      return { amp, ang };
    },
    update(S, P, dt, kit) {
      if (S.reset) { this.init(S, P, kit); return; }
      for (const h of S.holes) h.life -= dt;
      S.holes = S.holes.filter((h) => h.life > 0);
      const W = S.W, H = S.H, FC = 3, FW = Math.ceil(W / FC), FH = Math.ceil(H / FC);
      const flow = [];
      for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) flow.push(this.field(S, P, (i * FC + 1.5) * 3, (j * FC + 1.5) * 3));
      S.flow = flow; S.FW = FW;
      S.moved.fill(0);
      const cells = S.cells;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const k = y * W + x;
        if (cells[k] !== 1 || S.moved[k]) continue;
        const f = flow[((y / FC) | 0) * FW + ((x / FC) | 0)];
        if (f.amp >= 0.9) { cells[k] = 0; S.eaten++; continue; }
        if (kit.rand() > f.amp) continue;
        // the two cardinals bracketing the angle, chosen by proximity
        const q = ((f.ang / (Math.PI / 2)) % 4 + 4) % 4, lo = Math.floor(q), frac = q - lo;
        const dir = kit.rand() < frac ? (lo + 1) % 4 : lo;
        const nx = x + [1, 0, -1, 0][dir], ny = y + [0, 1, 0, -1][dir];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (!cells[n]) { cells[n] = 1; cells[k] = 0; S.moved[n] = 1; }
      }
      const inHorizon = (x, y) => S.holes.some((h) => Math.hypot(h.x - x, h.y - y) < P.eh * 0.3);
      for (const e of S.enemies) {
        if (e.dead > 0) { e.dead -= dt; if (e.dead <= 0) { e.x = 384; e.y = 20 + kit.rand() * 176; } continue; }
        e.x += e.vx * dt; e.y += e.vy * dt;
        if (e.y > 216) e.y -= 216;
        if (e.x < 60) e.x = 384;
        if (inHorizon(e.x, e.y)) { e.dead = 2; S.kills++; }
      }
      S.fireT -= dt;
      if (S.fireT <= 0) { S.fireT = 0.35; S.bullets.push({ x: 40, y: 108, vx: 120, vy: (kit.rand() - 0.5) * 40 }); }
      for (const b of S.bullets) { b.x += b.vx * dt; b.y += b.vy * dt; if (inHorizon(b.x, b.y)) { b.x = 999; S.bulletsEaten++; } }
      S.bullets = S.bullets.filter((b) => b.x < 384);
    },
    draw(g, S, P) {
      const C = g.C;
      g.clear();
      const W = S.W;
      for (let y = 0; y < S.H; y++) for (let x = 0; x < W; x++) {
        const c = S.cells[y * W + x];
        if (c) g.rect(x * 3, y * 3, 3, 3, c === 2 ? C.ink3 : C.gold);
      }
      if (P.arrows && S.flow) S.flow.forEach((f, i) => {
        if (f.amp < 0.05 || i % 2) return;
        const x = ((i % S.FW) * 3 + 1.5) * 3, y = (Math.floor(i / S.FW) * 3 + 1.5) * 3, L = 3 + f.amp * 8;
        g.line(x, y, x + Math.cos(f.ang) * L, y + Math.sin(f.ang) * L, f.amp >= 0.9 ? C.enemy : C.sky, 1);
      });
      for (const h of S.holes) {
        const s = Math.min(1, h.life / 2), eh = P.eh * 0.3;
        g.circle(h.x, h.y, P.maxd * 0.3, C.rule, 1);
        g.circle(h.x, h.y, eh * 2, C.violet, 1);
        g.circle(h.x, h.y, eh, C.bg);
        g.toneCircle(h.x, h.y, eh * s, 0.5, C.violet);
        g.circle(h.x, h.y, eh, C.violet, 1.5);
      }
      for (const e of S.enemies) if (e.dead <= 0) g.rect(e.x - 3, e.y - 3, 6, 6, C.enemy);
      for (const b of S.bullets) g.circle(b.x, b.y, 1.5, C.accent);
      g.poly([[46, 108], [34, 102], [34, 114]], C.accent);
      g.label("PLAYER: NOT PULLED", 8, 128, C.ink2);
    },
    readout(S) {
      return "holes " + S.holes.length + "   sand eaten " + S.eaten + "\nenemies " + S.kills + "   bullets " + S.bulletsEaten;
    },
  },
});
