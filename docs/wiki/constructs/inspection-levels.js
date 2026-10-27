(function () {
  const K = 0.44, OX = 9, OY = 14;                 // world -> stage
  const CW = 200, CH = 140, GAP = 58;
  const SPECIES = [
    { id: "grunt", name: "Grunt", beh: "chase", tune: { speed: 30, hp: 12, radius: 4 },
      fields: [["speed", 0, 300], ["hp", 1, 200], ["radius", 1, 40]] },
    { id: "brute", name: "Brute", beh: "charge", tune: { speed: 24, hp: 52, radius: 7, chargeRange: 150, chargeSpeed: 300 },
      fields: [["speed", 0, 300], ["chargeRange", 0, 400], ["chargeSpeed", 0, 600]] },
    { id: "spitter", name: "Spitter", beh: "shoot", tune: { speed: 26, hp: 18, radius: 4, shootRange: 100, shootCooldown: 2.4 },
      fields: [["speed", 0, 300], ["shootRange", 0, 300], ["shootCooldown", 0.2, 10]] },
  ];
  const PANEL = { x: 4, y: 150, w: 376, h: 62 };
  const sx = (x) => OX + x * K, sy = (y) => OY + y * K;

  function rooms() { return SPECIES.map((sp, i) => ({ sp, x: GAP + i * (CW + GAP), y: GAP, w: CW, h: CH })); }
  function inside(r, x, y) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }
  function wallDist(r, x, y) { const dx = Math.max(r.x - x, 0, x - r.x - r.w), dy = Math.max(r.y - y, 0, y - r.y - r.h); return Math.hypot(dx, dy); }

  Wiki.construct({
    id: "inspection-levels",
    name: "Inspection levels: zoo, range and bench",
    origin: "playground",
    status: "built",
    summary: "Purpose-built levels that run the real simulation one subject at a time: a cage per enemy, a room per weapon, a bench for weapon graphs, each tuned from an editable placard in the corridor and tested by walking in.",
    tags: ["sandbox", "zoo", "test level", "in-world tuning"],

    intent:
      "<p>A full run answers \"is the game fun\" but is a bad place to ask \"is the Brute's charge too long\": by the time you see one, forty other things are on screen. The inspection levels isolate one archetype against one weapon, with the numbers for that subject standing next to its door.</p>" +
      "<p>They run the ordinary simulation with spawning switched off, so there is \"no second copy of how a Brute chases\". What the zoo shows is what a run does.</p>",

    how:
      "<h3>Zoo (F5) and range (F6)</h3>" +
      "<p>Both are a grid of rooms 200&times;140 px, 58 px apart, three columns, built from <code>content.enemies</code> (zoo) or <code>content.weapons</code> (range), so a new content row gets a room with no extra code. The run is created with <code>run.sandbox = true</code>, which disables wave spawning, the wave clock and the win timer. The player is invulnerable by a standing flag (<code>sandbox.invulnerable</code>), not a pumped i-frame, which used to make the player blink forever.</p>" +
      "<ul><li><b>Inside a room</b> the level tops it up to <code>sandbox.population</code> (6) every <code>sandbox.spawnInterval</code> (0.6 s), through <code>run:spawnPack</code>, so packs and spawn telegraphs are the real ones. Occupants are clamped to the cage walls; without that \"a Lancer charges straight through a wall\".</li>" +
      "<li><b>Leaving a room</b> clears enemies, shots, projectiles, effects and pickups, so visited cages do not follow you.</li>" +
      "<li><b>Zoo:</b> you hold exactly one weapon; <code>,</code> and <code>.</code> cycle it. <b>Range:</b> entering a room replaces your weapons with that room's; <code>,</code> and <code>.</code> pick which enemy spawns as the target and retire current occupants.</li></ul>" +
      "<p>The sandbox seed is drawn from LÖVE's generator, which a capture's <code>--seed</code> pins, so zoo and range screenshots reproduce. Difficulty scaling stays at wave 1.</p>" +
      "<h3>Placards</h3>" +
      "<p>Standing within <code>sandbox.previewRange</code> (40 px) of a cage, measured to the wall rather than the centre, shows that room's stats as the editor's own widgets: <code>editor.drawSetting</code> over the fields listed in <code>content.enemyFields</code> plus the behaviour's fields. Step inside and the placard hides, because \"once the room is live the thing itself is the information\". Values come from <code>config</code>, so a drag on the placard is the same edit as one in F1, autosaved the same way. The zoo capture shows the Grunt placard with a reset <b>x</b> on its speed: the drifted [[diff-profiles|default.json]] override.</p>" +
      "<h3>Bench (F8)</h3>" +
      "<p>The weapon-graph editor is built as a level of the same kind: an arena on top (<code>bench.arenaFraction</code> 0.42), the graph below, <code>bench.population</code> 5 dummies of <code>bench.dummy</code> (grunt). With <code>bench.dummyStill</code> on, <code>run.stationaryEnemies</code> pauses AI, motion, separation and knockback but keeps damage, hit feedback and sound, so a weapon change is read against targets that hold still. Graph internals are in [[mws-graph]].</p>",

    knobs: [
      ["Occupants per room", "6", "Population each live room is topped up to", "sandbox.population"],
      ["Respawn interval", "0.6 s", "Time between top-up spawns", "sandbox.spawnInterval"],
      ["Placard range", "40 px", "Distance from a cage wall at which its placard appears", "sandbox.previewRange"],
      ["Invulnerable", "on", "Standing invulnerability in zoo and range", "sandbox.invulnerable"],
      ["Dummies hold still", "on", "Bench targets keep taking damage but stop moving", "bench.dummyStill"],
    ],

    related: [
      { id: "schema-editor", how: "Placards are the editor's widgets over content-derived settings." },
      { id: "enemy-behaviours", how: "The zoo is where each behaviour is inspected alone." },
      { id: "mws-graph", how: "The bench is the inspection level for weapon graphs." },
      { id: "packs", how: "Rooms spawn through the real pack spawner, so pack enemies arrive in packs." },
      { id: "headless-sim", how: "The same run model, with a different decision about who spawns." },
    ],

    questions: [
      "Should the zoo take a wave slider, so a cage can show the wave-40 version of an enemy?",
      "Should the range report time-to-kill per enemy, to make the Blaster's damage dominance visible without the harness?",
    ],

    sparks: [
      "Ship the zoo as the player's bestiary: walk past the cages to read an enemy, step in to practise against it.",
      "A matrix room that records time-to-kill for every weapon-enemy pair into a table on the wall.",
      "In a level editor, put a placard on every placed entity, so tuning happens where the thing stands.",
    ],

    terms: [
      { term: "Zoo", def: "Inspection level with one cage per enemy.", code: "sandbox.new(\"zoo\")" },
      { term: "Range", def: "Inspection level with one room per weapon.", code: "sandbox.new(\"range\")" },
      { term: "Placard", def: "A room's stats as live editor widgets, shown from the corridor.", code: "sandbox.preview, editor.drawSetting" },
      { term: "Bench", def: "The weapon-graph editor built as an inspection level.", code: "bench.lua" },
      { term: "Stationary targets", def: "Bench dummies that keep damage and feedback but stop moving.", code: "bench.dummyStill, run.stationaryEnemies" },
    ],

    sources: [
      "playground:games/horde-survivor/sandbox.lua:1",
      "playground:games/horde-survivor/sandbox.lua:154",
      "playground:games/horde-survivor/sandbox.lua:301",
      "playground:games/horde-survivor/arsenal.lua:305",
      "playground:games/horde-survivor/bench.lua:195",
      "playground:games/horde-survivor/run.lua:789",
    ],

    shots: [
      { src: "img/zoo.png", caption: "The zoo from the corridor, with the Grunt placard drawn in the editor's own widgets.", cmd: "luajit tools/screenshot.lua zoo.png --mode zoo --seed 7 --at 1" },
      { src: "img/range.png", caption: "The range: one room per weapon.", cmd: "luajit tools/screenshot.lua range.png --mode range --seed 7 --at 1" },
    ],

    toy: {
      title: "Tune it from the corridor, test it by walking in",
      hint: "click to walk; drag the placard; walk into a cage",
      caption: "Three cages from the zoo at real sizes, drawn at 0.44 scale. The placard reads the same values the cage uses each tick. Simplified: player speed 120, one auto-firing weapon, spitters do not keep a standoff band.",
      w: 384, h: 216,
      controls: [
        { type: "range", key: "pop", label: "population", min: 1, max: 12, value: 6 },
        { type: "toggle", key: "still", label: "stationary (bench)", value: false },
      ],
      init(S) {
        S.rooms = rooms(); S.cfg = {};
        for (const sp of SPECIES) S.cfg[sp.id] = Object.assign({}, sp.tune);
        S.p = { x: GAP + CW / 2, y: GAP + CH + 30 }; S.goal = null; S.active = null; S.preview = S.rooms[0];
        S.e = []; S.shots = []; S.bullets = []; S.timer = 0; S.cd = 0; S.hitsTaken = 0; S.kills = 0; S.drag = null; S.t = 0;
      },
      update(S, P, dt, kit) {
        S.t += dt;
        const p = S.p;
        if (S.goal) { const dx = S.goal.x - p.x, dy = S.goal.y - p.y, d = Math.hypot(dx, dy); if (d > 2) { const st = Math.min(d, 120 * dt); p.x += dx / d * st; p.y += dy / d * st; } }
        const was = S.active;
        S.active = S.rooms.find((r) => inside(r, p.x, p.y)) || null;
        S.preview = null;
        if (!S.active) { let best = 40; for (const r of S.rooms) { const d = wallDist(r, p.x, p.y); if (d <= best) { best = d; S.preview = r; } } }
        if (was && was !== S.active) { S.e = []; S.shots = []; S.bullets = []; }
        const room = S.active;
        if (room) {
          S.timer -= dt;
          if (S.timer <= 0 && S.e.length < P.pop) { S.timer = 0.6; S.e.push({ x: room.x + 18 + kit.rand() * (CW - 36), y: room.y + 18 + kit.rand() * (CH - 36), vx: 0, vy: 0, hp: S.cfg[room.sp.id].hp, phase: "approach", t: kit.rand.range(0, 2) }); }
        }
        for (const e of S.e) {
          const c = S.cfg[room.sp.id], dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
          e.t -= dt;
          if (P.still) { e.vx = e.vy = 0; }
          else if (room.sp.beh === "charge" && e.phase === "windup") { e.vx *= 0.82; e.vy *= 0.82; if (e.t <= 0) { e.phase = "charging"; e.t = 0.55; e.vx = dx / d * c.chargeSpeed; e.vy = dy / d * c.chargeSpeed; } }
          else if (e.phase === "charging") { if (e.t <= 0) { e.phase = "approach"; e.t = 3.2; } }
          else if (room.sp.beh === "charge" && d < c.chargeRange && e.t <= 0) { e.phase = "windup"; e.t = 0.8; }
          else if (room.sp.beh === "shoot" && d < c.shootRange) { e.vx = e.vy = 0; if (e.t <= 0) { e.t = c.shootCooldown; S.shots.push({ x: e.x, y: e.y, vx: dx / d * 88, vy: dy / d * 88, life: 1.5 }); } }
          else { e.vx = dx / d * c.speed; e.vy = dy / d * c.speed; }
          e.x += e.vx * dt; e.y += e.vy * dt;
          const r = c.radius || 4;
          e.x = kit.clamp(e.x, room.x + r, room.x + CW - r); e.y = kit.clamp(e.y, room.y + r, room.y + CH - r);
        }
        for (const s of S.shots) { s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; if (Math.hypot(s.x - p.x, s.y - p.y) < 6) { s.life = 0; S.hitsTaken++; } }
        S.shots = S.shots.filter((s) => s.life > 0);
        S.cd -= dt;
        if (S.cd <= 0 && S.e.length) {
          let tgt = null, best = 260;
          for (const e of S.e) { const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < best) { best = d; tgt = e; } }
          if (tgt) { S.cd = 0.4; const d = best || 1; S.bullets.push({ x: p.x, y: p.y, vx: (tgt.x - p.x) / d * 220, vy: (tgt.y - p.y) / d * 220, life: 1.3 }); }
        }
        for (const b of S.bullets) {
          b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
          for (const e of S.e) if (b.life > 0 && Math.hypot(e.x - b.x, e.y - b.y) < (S.cfg[room.sp.id].radius || 4) + 2) { b.life = 0; e.hp -= 6; }
        }
        S.bullets = S.bullets.filter((b) => b.life > 0);
        const n = S.e.length; S.e = S.e.filter((e) => e.hp > 0); S.kills += n - S.e.length;
      },
      pointer(e, S) {
        if (e.type === "up") { S.drag = null; return; }
        const room = S.preview;
        if (e.type === "down" && room && e.y > PANEL.y) {
          const i = Math.floor((e.x - PANEL.x - 90) / 95);
          if (i >= 0 && i < 3) S.drag = { room, i };
          if (!S.drag) return;
        }
        if (S.drag && e.down) {
          const [k, lo, hi] = S.drag.room.sp.fields[S.drag.i];
          const x0 = PANEL.x + 90 + S.drag.i * 95;
          if (e.type === "down" && e.x - x0 > 82) { S.cfg[S.drag.room.sp.id][k] = S.drag.room.sp.tune[k]; S.drag = null; return; }
          const f = Math.max(0, Math.min(1, (e.x - x0) / 80));
          S.cfg[S.drag.room.sp.id][k] = Math.round((lo + f * (hi - lo)) * 10) / 10;
          return;
        }
        if (e.type === "down" && e.y < PANEL.y) S.goal = { x: (e.x - OX) / K, y: Math.max(10, Math.min(300, (e.y - OY) / K)) };
      },
      draw(g, S, P) {
        const C = g.C, p = S.p;
        g.clear();
        for (const r of S.rooms) {
          const live = r === S.active, c = S.cfg[r.sp.id];
          g.rect(sx(r.x), sy(r.y), r.w * K, r.h * K, live ? C.ink : r === S.preview ? C.accent : C.ink3, 1);
          g.label(r.sp.name.toUpperCase(), sx(r.x + r.w / 2), sy(r.y) + 9, live ? C.ink : C.ink3, "center");
          if (!live) g.toneCircle(sx(r.x + r.w / 2), sy(r.y + r.h / 2), c.radius * 2.2 * K * 1.6, 0.5, C.enemy);
          if (r === S.preview) g.line(sx(r.x), sy(r.y + r.h) + 2, sx(r.x + r.w), sy(r.y + r.h) + 2, C.accent, 1);
        }
        for (const e of S.e) {
          const r = (S.cfg[S.active.sp.id].radius || 4) * K * 1.6;
          const blink = e.phase === "windup" && Math.floor(S.t * 14) % 2;
          g.circle(sx(e.x), sy(e.y), Math.max(1.5, r), blink ? C.ink : C.enemy);
        }
        for (const s of S.shots) g.circle(sx(s.x), sy(s.y), 1.2, C.enemy);
        for (const b of S.bullets) g.circle(sx(b.x), sy(b.y), 1, C.gold);
        g.circle(sx(p.x), sy(p.y), 2.5, C.ink);
        if (S.goal) g.circle(sx(S.goal.x), sy(S.goal.y), 2, C.ink3, 0.6);
        const room = S.preview;
        if (room) {
          g.rect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, C.bg); g.rect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, C.ink, 1);
          g.text(room.sp.name, PANEL.x + 6, PANEL.y + 20, { size: 16, color: C.ink });
          g.label("BEHAVIOUR: " + room.sp.beh, PANEL.x + 6, PANEL.y + 34, C.ink3);
          room.sp.fields.forEach(([k, lo, hi], i) => {
            const x = PANEL.x + 90 + i * 95, v = S.cfg[room.sp.id][k], mod = v !== room.sp.tune[k];
            g.label(k, x, PANEL.y + 18, C.ink2); g.label(String(v), x + 80, PANEL.y + 18, mod ? C.gold : C.accent, "right");
            g.tone(x, PANEL.y + 26, 80, 8, 0.25, C.ink); g.rect(x, PANEL.y + 26, 80 * (v - lo) / (hi - lo), 8, mod ? C.gold : C.accent);
            if (mod) g.label("X", x + 84, PANEL.y + 34, C.ink3);
          });
        } else if (S.active) g.label("IN THE " + S.active.sp.name.toUpperCase() + " CAGE: PLACARD HIDDEN", 8, 172, C.ink3);
        else g.label("WALK WITHIN 40 PX OF A CAGE", 8, 172, C.ink3);
      },
      readout(S, P) {
        return (S.active ? "live: " + S.active.sp.name + "  " + S.e.length + "/" + P.pop : "corridor") + "\nkills " + S.kills + "  hits taken " + S.hitsTaken;
      },
    },
  });
})();
