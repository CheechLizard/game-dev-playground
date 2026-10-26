Wiki.construct({
  id: "hit-feedback",
  name: "Bounded combat feedback",
  family: "feel",
  origin: "playground",
  status: "built",
  statusNote: "Built for projectiles and MWS strikes. Static Field and Orbit Blades never call it. Damage numbers are a schema toggle with no implementation behind it. Four of the seven payload identities are reserved palette entries only.",
  summary: "Muzzle flashes, fading trails, per-family hit marks, impact sparks and kill bursts, all held in capped lists, rate-limited per target, drawn on a cosmetic random stream, and never able to change the simulation.",
  tags: ["juice", "particles", "readability", "payload identity", "budget"],

  intent:
    "<p>A horde game fires hundreds of shots a minute. Feedback has to make each weapon readable (what hit, how hard, with which damage family) without letting a beam that ticks every frame bury the screen. The answer here is a budget: every effect lives in a list with a hard cap, a target can only show one cue per damage family every 0.09 s, and the oldest effect is dropped first when a list is full.</p>" +
    "<p>Just as important is what feedback cannot do. The module's first line reads \"Never draws, plays audio, or consumes gameplay RNG\": it is data the renderer and the [[synth-sound|sound adapter]] read, so retuning a spark never reshuffles a spawn and a [[headless-sim|headless run]] needs none of it.</p>",

  how:
    "<h3>Events</h3>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>Call</th><th>Adds</th><th>Numbers</th></tr></thead><tbody>" +
    "<tr><td><code>feedback.launch</code></td><td>muzzle flash, and a shot or sweep sound request</td><td>life 0.075 s</td></tr>" +
    "<tr><td><code>feedback.hit</code></td><td>hit or kill flash, sparks, a hit or kill sound request</td><td>flash 0.14 s (kill 0.24 s), radius <code>min(14, enemy.radius)</code>; 5 sparks (kill 10) within 2.5 rad of the shot direction (kill: full circle), speed 18+38u (kill 28+38u) px/s, life 0.12-0.32 s, drag <code>1 &minus; 5&middot;dt</code> per tick</td></tr>" +
    "<tr><td><code>feedback.update</code></td><td>a trail segment per moving strike or projectile per tick</td><td>width <code>max(1, size &times; 0.7)</code>, life <code>feedback.trailLife</code> 0.12 s; stab and sweep beams excluded</td></tr>" +
    "</tbody></table></div>" +
    "<p><b>Caps:</b> 80 flashes, 320 sparks, 600 trail segments, 32 queued sounds; the oldest is removed first. <b>Rate limit:</b> each enemy keeps a time per payload family; a non-lethal hit inside 0.09 s of the last cue is suppressed (and logged as <code>target_cooldown</code>), but \"a lethal tick always gets its own cue\". Random angles, speeds and lives come from <code>run.feedbackRng</code>, seeded separately from the gameplay stream.</p>" +
    "<p>Separately from all this, the hit enemy flashes for <code>render.hitFlash</code> (0.08 s), and the screen shakes on player damage ([[contact-iframes]]). <code>feedback.enabled = false</code> clears every list but keeps payload colours on the strikes themselves.</p>" +
    "<h3>Payload identity</h3>" +
    "<p>Each damage family has one colour, one mark and one pitch, shared by the bench's graph tile, the projectile, its trail, its hit mark, its sparks and its sound (<code>payloads.lua</code>):</p>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>Family</th><th>Colour</th><th>Mark</th><th>Pitch</th><th></th></tr></thead><tbody>" +
    "<tr><td>Sharp</td><td>cyan</td><td>slash (line across the shot)</td><td>760 Hz</td><td>built</td></tr>" +
    "<tr><td>Impact</td><td>gold</td><td>burst (6 spokes)</td><td>150 Hz</td><td>built</td></tr>" +
    "<tr><td>Plasma</td><td>violet</td><td>ring</td><td>330 Hz</td><td>built</td></tr>" +
    "<tr><td>Acid, Fire, Ice, Void</td><td>lime, orange, blue, pink</td><td>bubble, ember, shard, ring</td><td>240, 120, 1100, 80 Hz</td><td>reserved</td></tr>" +
    "<tr><td>None</td><td>grey</td><td>ring</td><td>420 Hz</td><td>payload-free</td></tr>" +
    "</tbody></table></div>" +
    "<p>The mark repeats what the colour says so recognition does not depend on colour alone. A strike with several payloads draws extra bands, rings or trail segments in each family's colour: \"never average into an unknown colour\". Reserved families are \"presentation vocabulary, not implemented damage rules\"; the drawing code has no ember or bubble mark yet and falls back to a ring. Legacy projectile weapons are tagged Sharp.</p>" +
    "<h3>What gets no feedback</h3>" +
    "<p>Static Field and Orbit Blades deal damage through <code>run:damageEnemy</code> directly and never call <code>feedback.launch</code> or <code>feedback.hit</code>. They get the enemy's 0.08 s flash and nothing else: no mark, no spark, no sound. Static Field also measures under 4% of damage; part of its weakness may be that it is the only weapon you cannot hear or see land.</p>" +
    "<p><code>render.damageNumbers</code> is registered on the Render page (default off), but no code reads it. HANDOFF's \"built, off by default\" overstates it.</p>",

  knobs: [
    ["Combat effects", "on", "All flashes, trails and sparks", "feedback.enabled"],
    ["Trail duration", "0.12 s", "Life of a trail segment", "feedback.trailLife"],
    ["Hit flash", "0.08 s", "Enemy flash on any damage", "render.hitFlash"],
    ["Screen shake", "1×", "Shake scale on player damage", "render.screenShake"],
    ["Payload colours", "per family", "Colour of each damage identity", "payloadColour.<id>"],
    ["Per-target cue cooldown", "0.09 s", "Hard-coded rate limit per enemy per family", "feedback.lua F.hit"],
  ],

  related: [
    { id: "synth-sound", how: "Plays the sound requests feedback queues." },
    { id: "payloads", how: "The damage families the identities belong to." },
    { id: "material-fx", how: "ShmupRouge's per-material effects, the world-side version." },
    { id: "headless-sim", how: "Feedback is data only, so simulation runs without it." },
    { id: "crits", how: "A crit's only visual is a larger white core." },
  ],

  questions: [
    "Should Static Field and Orbit Blades emit feedback, and does their measured weakness change when they do?",
    "Damage numbers: build them, or remove the dead toggle?",
    "Should the 0.09 s cooldown and the caps become schema settings like the trail life?",
  ],

  sparks: [
    "Scale feedback by damage share: the weapon doing 85% of the work gets quieter, so the others are noticed.",
    "Make the budget visible: as the caps fill, the screen's noise floor rises and the player reads how overwhelmed the fight is.",
    "Hit-stop frames on kills only, leaving ordinary hits light.",
    "Use the same identity grammar for enemy attacks, so a violet ring always means plasma, whoever fired it.",
  ],

  terms: [
    { term: "Combat feedback", def: "Bounded cosmetic flashes, sparks and trails, recorded as data.", code: "feedback.lua, run.feedback" },
    { term: "Payload identity", def: "A damage family's shared colour, mark and pitch.", code: "payloads.types" },
    { term: "Mixed payload", def: "A strike with several families, drawn in separate bands.", code: "s.payloadIds" },
    { term: "Feedback random stream", def: "The cosmetic generator, separate from gameplay RNG.", code: "run.feedbackRng" },
  ],

  sources: [
    "playground:games/horde-survivor/feedback.lua:31",
    "playground:games/horde-survivor/feedback.lua:44",
    "playground:games/horde-survivor/feedbackdraw.lua:98",
    "playground:games/horde-survivor/payloads.lua:5",
    "playground:games/horde-survivor/run.lua:1028",
    "playground:games/horde-survivor/run.lua:1047",
    "playground:games/horde-survivor/settings.lua:290",
    "playground:games/horde-survivor/settings.lua:311",
  ],

  toy: {
    title: "Fire at the dummies",
    hint: "switch elements off; push the fire rate",
    caption: "Exact lifetimes, counts, caps and per-target cooldown. Simplified: straight shots at fixed dummies that respawn; colours stand in for the payload palette. The bars along the bottom are the three caps.",
    w: 384, h: 216,
    controls: [
      { type: "select", key: "weapon", label: "weapon", value: "shot", options: [["shot", "projectile"], ["field", "Static Field"]] },
      { type: "select", key: "fam", label: "payload", value: "sharp", options: [["sharp", "Sharp"], ["impact", "Impact"], ["plasma", "Plasma"]] },
      { type: "range", key: "rate", label: "shots/s", min: 1, max: 60, value: 4 },
      { type: "range", key: "pellets", label: "pellets", min: 1, max: 8, value: 1 },
      { type: "toggle", key: "muzzle", label: "muzzle", value: true },
      { type: "toggle", key: "trails", label: "trails", value: true },
      { type: "toggle", key: "sparks", label: "sparks", value: true },
      { type: "toggle", key: "marks", label: "marks", value: true },
    ],
    init(S) {
      Object.assign(S, { t: 0, cd: 0, fd: 0, shots: [], fl: [], pt: [], tr: [], cues: 0, supp: 0, sounds: 0 });
      S.ds = []; for (let i = 0; i < 5; i++) S.ds.push({ x: 300, y: 56 + i * 30, hp: 30, flash: 0, ft: -1, dead: 0 });
    },
    update(S, P, dt, kit) {
      const push = (l, v, cap) => { if (l.length >= cap) l.shift(); l.push(v); };
      S.t += dt;
      const hit = (d, dx, dy, dmg) => {
        d.hp -= dmg; d.flash = 0.08;
        const kill = d.hp <= 0;
        if (P.weapon === "field") return;
        if (!kill && d.ft > S.t) { S.supp++; return; }
        d.ft = S.t + 0.09; S.cues++; S.sounds++;
        push(S.fl, { k: kill ? "kill" : "hit", x: d.x, y: d.y, dx, dy, age: 0, life: kill ? 0.24 : 0.14 }, 80);
        const a = Math.atan2(dy, dx), n = kill ? 10 : 5;
        for (let i = 0; i < n; i++) { const an = a + (kit.rand() - 0.5) * (kill ? kit.TAU : 2.5), sp = (kill ? 28 : 18) + kit.rand() * 38; push(S.pt, { x: d.x, y: d.y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, age: 0, life: 0.12 + kit.rand() * 0.2 }, 320); }
      };
      if (P.weapon === "shot") {
        S.cd -= dt;
        while (S.cd <= 0) {
          S.cd += 1 / P.rate;
          const d = S.ds[Math.floor(kit.rand() * 5)];
          for (let i = 0; i < P.pellets; i++) {
            const ty = d.y + (i - (P.pellets - 1) / 2) * 4, dx = d.x - 40, dy = ty - 120, l = Math.hypot(dx, dy);
            S.shots.push({ x: 40, y: 120, px: 40, py: 120, vx: dx / l * 260, vy: dy / l * 260, life: 1.2 });
            push(S.fl, { k: "muzzle", x: 40, y: 120, dx: dx / l, dy: dy / l, age: 0, life: 0.075 }, 80); S.sounds++;
          }
        }
      } else {
        S.fd -= dt;
        if (S.fd <= 0) { S.fd = 0.5; for (const d of S.ds) if (!d.dead && Math.abs(d.y - 116) < 50) hit(d, 0, -1, 4); }
      }
      for (const s of S.shots) {
        s.px = s.x; s.py = s.y; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
        push(S.tr, { x: s.px, y: s.py, ex: s.x, ey: s.y, age: 0, life: 0.12 }, 600);
        for (const d of S.ds) if (!d.dead && s.life > 0 && Math.hypot(d.x - s.x, d.y - s.y) < 7) { s.life = 0; hit(d, s.vx / 260, s.vy / 260, 6); }
      }
      S.shots = S.shots.filter((s) => s.life > 0);
      for (const d of S.ds) { d.flash = Math.max(0, d.flash - dt); if (d.hp <= 0 && !d.dead) d.dead = 0.3; if (d.dead) { d.dead -= dt; if (d.dead <= 0) { d.dead = 0; d.hp = 30; } } }
      const age = (l, mv) => l.filter((v) => { v.age += dt; if (mv) { v.x += v.vx * dt; v.y += v.vy * dt; const dr = Math.max(0, 1 - 5 * dt); v.vx *= dr; v.vy *= dr; } return v.age < v.life; });
      S.fl = age(S.fl); S.pt = age(S.pt, true); S.tr = age(S.tr);
    },
    draw(g, S, P) {
      const C = g.C; g.clear();
      const col = { sharp: C.sky, impact: C.gold, plasma: C.violet }[P.fam];
      if (P.weapon === "field") { g.toneCircle(300, 116, 50, 0.1, C.violet); g.circle(300, 116, 50, C.violet, 1); }
      if (P.trails) for (const v of S.tr) { const f = 1 - v.age / v.life; g.ctx.globalAlpha = f * 0.65; g.line(v.x, v.y, v.ex, v.ey, col, 1.4 * (1 - v.age / v.life * 0.5)); }
      g.ctx.globalAlpha = 1;
      for (const s of S.shots) g.circle(s.x, s.y, 2, col);
      for (const d of S.ds) if (!d.dead) g.circle(d.x, d.y, 5, d.flash > 0 ? C.ink : C.enemy);
      g.rect(30, 116, 10, 8, C.ink);
      for (const v of S.fl) {
        const t = v.age / v.life, fade = 1 - t;
        g.ctx.globalAlpha = fade;
        if (v.k === "muzzle") { if (P.muzzle) { const n = 3 + fade * 4; g.poly([[v.x + v.dx * n, v.y + v.dy * n], [v.x - v.dy * 2, v.y + v.dx * 2], [v.x - v.dx * 2, v.y - v.dy * 2], [v.x + v.dy * 2, v.y - v.dx * 2]], col); } }
        else if (P.marks) {
          const r = (v.k === "kill" ? 5 + 7 : 5) * (0.3 + t);
          if (P.fam === "sharp") g.line(v.x - v.dy * r - v.dx * r * 0.3, v.y + v.dx * r - v.dy * r * 0.3, v.x + v.dy * r + v.dx * r * 0.3, v.y - v.dx * r + v.dy * r * 0.3, col, fade * 2 + 0.5);
          else if (P.fam === "impact") for (let i = 1; i <= 6; i++) { const a = i * Math.PI / 3; g.line(v.x + Math.cos(a) * r * 0.5, v.y + Math.sin(a) * r * 0.5, v.x + Math.cos(a) * r, v.y + Math.sin(a) * r, col, 1); }
          else g.circle(v.x, v.y, r, col, 1);
          if (t < 0.3) g.circle(v.x, v.y, 2 * fade, C.ink);
        }
      }
      g.ctx.globalAlpha = 1;
      if (P.sparks) for (const v of S.pt) { g.ctx.globalAlpha = 1 - v.age / v.life; if (P.fam === "sharp") g.line(v.x, v.y, v.x - v.vx * 0.045, v.y - v.vy * 0.045, col, 1); else if (P.fam === "plasma") g.circle(v.x, v.y, 0.7 + (1 - v.age / v.life), col, 0.7); else g.rect(v.x - 0.7, v.y - 0.7, 1.4, 1.4, col); }
      g.ctx.globalAlpha = 1;
      const bars = [["FLASH", S.fl.length, 80], ["SPARK", S.pt.length, 320], ["TRAIL", S.tr.length, 600]];
      bars.forEach((b, i) => { const x = 8 + i * 126; g.meter(x, 204, 100, 4, b[1] / b[2], b[1] >= b[2] ? C.enemy : C.accent); g.label(b[0] + " " + b[1] + "/" + b[2], x, 200, C.ink3); });
      if (P.weapon === "field") g.label("NO MARK, NO SPARK, NO SOUND", 192, 26 + 160, C.violet, "center");
    },
    readout(S) { return "cues " + S.cues + "  suppressed " + S.supp + "\nsound requests " + S.sounds; },
  },
});
