(function () {
  // 1 logical px = 1 WU. Defaults are shared/data/combat/Turbulence.json.
  const SW = 384, SH = 216, CELL = 32, CAP = 64;
  const wrap = (d, L) => (d > L / 2 ? d - L : d < -L / 2 ? d + L : d);
  function vel(S, px, py) { // Vorton.computeVelocityAt: Rankine core, hard cutoff at 2r
    let vx = 0, vy = 0;
    for (const v of S.v) {
      if (!v.on) continue;
      const dx = wrap(px - v.x, SW), dy = wrap(py - v.y, SH), d2 = dx * dx + dy * dy, r = v.r;
      if (d2 > 4 * r * r || d2 < 1) continue;
      const d = Math.sqrt(d2);
      const f = d < r ? v.s * v.sign * d / (r * r) : v.s * v.sign / r * (1 - (d - r) / r);
      vx += -dy * f; vy += dx * f;
    }
    return [vx, vy];
  }
  function spawn(S, P, x, y, vx, vy) { // Vorton.spawn
    const sp = Math.hypot(vx, vy), nx = vx / sp, ny = vy / sp, px = -ny, py = nx, sign = S.sign;
    S.sign = -S.sign;
    const v = S.v[S.slot]; S.slot = (S.slot + 1) % CAP;
    Object.assign(v, {
      on: true, sign, r: P.radius, s: 0.1 + sp * 0.0005,
      x: (x + px * P.lateral * sign + SW) % SW, y: (y + py * P.lateral * sign + SH) % SH, vx: px * sign * 32, vy: py * sign * 32,
    });
  }

  Wiki.construct({
    id: "wake-turbulence",
    name: "Wake turbulence: a vortex street behind every ship",
    family: "feel",
    origin: "shmuprouge",
    status: "built",
    statusNote: "Built, writing into the 32-WU gravity grid. The finer 8-WU atmospheric layer it was designed for is spec only, and <code>Turbulence.json</code> is read once, so live edits need a restart.",
    summary: "Fast ships shed alternating clockwise and anticlockwise vortex particles whose swirl is written into the gravity field, so flying low over loose sand stirs it into curls.",
    tags: ["fluid", "feedback", "vortex", "field"],

    intent:
      "<p>Movement should leave a mark on the world. In ShmupRouge a ship travelling fast sheds a trail of small vortices, a von Kármán street, and because they are written into the same field that tells sand which way is down, a low pass over a floating dust cloud or a sand sea visibly churns it. Speed reads without a speedometer, and the wake is a tell an enemy could follow.</p>",

    how:
      "<h3>Shedding</h3>" +
      "<p><code>WakeTurbulenceSystem</code> owns a 64-slot ring buffer. For the player and each live Midge moving at <code>minSpeed</code> (150 WU/s) or faster, it spawns one vorton every <code>spawnInterval</code> (0.1 s):</p>" +
      "<ul><li><code>sign</code> alternates +1/−1, so spins alternate;</li>" +
      "<li>position = <code>pos − dir·spawnBehindDistance + perp·lateralOffset·sign</code> (behind 0, lateral 24 WU), so they sit alternately left and right of the path;</li>" +
      "<li>strength = 0.1 + speed × 0.0005, so a 300 WU/s ship sheds 0.25;</li>" +
      "<li>it drifts outward from the path at 32 WU/s.</li></ul>" +
      "<p>Each frame a vorton moves by its drift and its strength is multiplied by 0.98; below 0.01 it dies, about 115 frames (2 s) from base strength.</p>" +
      "<h3>The velocity field</h3>" +
      "<p>Each vorton is a Rankine vortex with radius r = 16 WU and a hard cutoff at 2r. Inside the core <code>factor = s·sign·d/r²</code>; between r and 2r <code>factor = s·sign/r·(1 − (d − r)/r)</code>; velocity = <code>(−dy, dx)·factor</code>, purely rotational. Peak speed, at the core edge, equals the strength.</p>" +
      "<h3>Into the sand</h3>" +
      "<p>Every frame the system clears modifier <code>\"wake_turbulence\"</code> in the [[flow-field-gravity|gravity field]] and rewrites every 32-WU cell near a live vorton with the summed velocity at the cell centre. Because the cell is twice the vortex radius, each vorton touches only a few cells and the effect is blocky. The [[falling-sand]] shader then treats any cell above amplitude 0.05 as a direction: under the default zero gravity, floating sand that had no \"down\" now moves one cell per step along the swirl. Magnitude does not change how fast it moves, only whether it moves and which way.</p>" +
      "<p>The v2 field design moves wakes to a viewport-local atmospheric layer at 8 WU per cell, fine enough to show the street's real shape; it is not built. The config is read on the system's first update, so editing <code>Turbulence.json</code> through the [[json-tunables|live editor]] does nothing until restart. The file's <code>spawnBehindDistance</code> is 0 though its own schema says <code>min 8</code>.</p>",

    knobs: [
      ["minSpeed", "150 WU/s", "Slowest speed that sheds vortons", "Turbulence.json minSpeed"],
      ["spawnInterval", "0.1 s", "Time between vortons", "spawnInterval"],
      ["lateralOffset", "24 WU", "Sideways distance of each vorton from the path", "lateralOffset"],
      ["radius", "16 WU", "Rankine core radius; influence ends at 2r", "radius"],
      ["strength / strengthFromSpeed", "0.1 / 0.0005", "Swirl at the core edge, growing with speed", "strength, strengthFromSpeed"],
      ["decayRate", "0.98 per frame", "Fade; dies under minStrength 0.01", "decayRate, minStrength"],
      ["driftSpeed", "32 WU/s", "Outward drift away from the path", "driftSpeed"],
      ["Capacity", "64", "Ring buffer size; oldest is recycled", "DEFAULT_VORTON_CAPACITY"],
    ],

    related: [
      { id: "flow-field-gravity", how: "Wakes are one more modifier in the gravity grid." },
      { id: "falling-sand", how: "Stirred sand moves by the ordinary block rules." },
      { id: "json-tunables", how: "The standing example of a tunable that is not live." },
      { id: "ship-control", how: "Ship speed decides whether and how hard it sheds." },
    ],

    questions: [
      "Is 32-WU resolution enough, or does the street only read on the 8-WU atmospheric layer?",
      "Should projectiles and explosions shed vortons too?",
      "Strength grows linearly with speed. Is there a threshold where the wake should change character?",
    ],

    sparks: [
      "Dust-trail stealth: enemies that hunt by the turbulence you leave in a sand sea.",
      "Wake surfing: followers in a leader's vortex street get a speed boost, so formations matter.",
      "Sand herding: fly patterns to sweep floating grains into a goal zone.",
      "Acid stirring: a low pass swirls an acid pool into the enemies standing in it.",
    ],

    terms: [
      { term: "Vorton", def: "A decaying point vortex shed behind a moving ship.", code: "Vorton (engine/physics/flow_field/vorton.lua)" },
      { term: "Rankine vortex", def: "Solid-body spin inside radius r, fading outside it (here to zero at 2r).", code: "computeVortonVelocity" },
      { term: "Wake turbulence", def: "The system that sheds vortons and writes their velocity into the field.", code: "WakeTurbulenceSystem" },
      { term: "Vortex street", def: "The alternating left/right, clockwise/anticlockwise trail behind a moving body." },
    ],

    sources: [
      "shmuprouge:engine/physics/flow_field/vorton.lua",
      "shmuprouge:game/systems/wake_turbulence_system.lua",
      "shmuprouge:shared/data/combat/Turbulence.json",
      "shmuprouge:docs/engine/physics/Flow_Field_Gravity.md",
      "shmuprouge:docs/plans/Flow_Field_Two_Layer_Refactor.md",
    ],

    toy: {
      title: "Fly through the dust",
      hint: "move the pointer to fly; fast moves shed vortons",
      caption: "Exact spawn, decay and Rankine formulas. \"True field\" advects dust by velocity × gain. \"As the sand sees it\" samples only 32-WU cell centres and moves dust at a fixed 60 WU/s wherever the amplitude passes 0.05, which is what the built game does. Sliders apply live here; the game needs a restart.",
      w: 384, h: 216,
      controls: [
        { type: "select", key: "mode", label: "dust", value: "true", options: [["true", "true field"], ["game", "as the sand sees it"]] },
        { type: "range", key: "radius", label: "radius", min: 16, max: 64, step: 8, value: 16, fmt: "{} WU" },
        { type: "range", key: "lateral", label: "lateral", min: 4, max: 64, step: 4, value: 24, fmt: "{} WU" },
        { type: "range", key: "decay", label: "decay", min: 950, max: 995, value: 980, fmt: (v) => (v / 1000).toFixed(3) },
        { type: "range", key: "gain", label: "gain", min: 50, max: 800, step: 50, value: 300 },
      ],
      init(S, P, kit) {
        S.v = []; for (let i = 0; i < CAP; i++) S.v.push({ on: false });
        S.slot = 0; S.sign = 1; S.timer = 0; S.t = 0; S.shed = 0;
        S.ship = { x: 60, y: 108, vx: 0, vy: 0 }; S.aim = null; S.idle = 0;
        S.d = []; for (let i = 0; i < 1400; i++) S.d.push([kit.rand() * SW, kit.rand() * SH]);
      },
      update(S, P, dt) {
        S.t += dt; S.idle += dt;
        const sh = S.ship, ox = sh.x, oy = sh.y;
        if (S.aim && S.idle < 2) { sh.x += (S.aim[0] - sh.x) * 0.25; sh.y += (S.aim[1] - sh.y) * 0.25; }
        else { sh.x = 192 + 160 * Math.sin(S.t * 1.1); sh.y = 108 + 70 * Math.sin(S.t * 2.2); }
        sh.vx = (sh.x - ox) / dt; sh.vy = (sh.y - oy) / dt;
        const sp = Math.hypot(sh.vx, sh.vy);
        if (sp >= 150) { S.timer += dt; if (S.timer >= 0.1) { S.timer -= 0.1; spawn(S, P, sh.x, sh.y, sh.vx, sh.vy); S.shed++; } }
        else S.timer = 0;
        for (const v of S.v) if (v.on) {
          v.x = (v.x + v.vx * dt + SW) % SW; v.y = (v.y + v.vy * dt + SH) % SH;
          v.s *= P.decay / 1000; if (v.s < 0.01) v.on = false;
        }
        for (const p of S.d) {
          let vx, vy;
          if (P.mode === "true") { [vx, vy] = vel(S, p[0], p[1]); vx *= P.gain; vy *= P.gain; }
          else {
            const cx = (Math.floor(p[0] / CELL) + 0.5) * CELL, cy = (Math.floor(p[1] / CELL) + 0.5) * CELL, f = vel(S, cx, cy), a = Math.hypot(f[0], f[1]);
            if (a < 0.05) continue;
            vx = f[0] / a * 60; vy = f[1] / a * 60;
          }
          p[0] = (p[0] + vx * dt + SW) % SW; p[1] = (p[1] + vy * dt + SH) % SH;
        }
      },
      pointer(e, S) { if (e.type !== "up") { S.aim = [e.x, e.y]; S.idle = 0; } },
      draw(g, S, P) {
        const C = g.C;
        g.clear();
        if (P.mode === "game") {
          for (let y = 0; y < SH; y += CELL) for (let x = 0; x < SW; x += CELL) {
            const f = vel(S, x + CELL / 2, y + CELL / 2), a = Math.hypot(f[0], f[1]);
            if (a >= 0.05) { g.tone(x, y, CELL, CELL, 0.12, C.sky); g.arrow(x + 16 - f[0] / a * 8, y + 16 - f[1] / a * 8, x + 16 + f[0] / a * 8, y + 16 + f[1] / a * 8, C.sky, 1, 4); }
            else g.rect(x, y, 1, 1, C.rule);
          }
        }
        for (const p of S.d) g.rect(p[0] - 0.6, p[1] - 0.6, 1.2, 1.2, C.ink3);
        for (const v of S.v) if (v.on) {
          const col = v.sign > 0 ? C.sky : C.rose;
          g.circle(v.x, v.y, v.r, col, 0.5);
          g.arc(v.x, v.y, v.r * 0.6, 0, v.sign > 0 ? 4 : -4, col, 1);
          g.circle(v.x, v.y, 1.5 + v.s * 6, col);
        }
        const sh = S.ship, a = Math.atan2(sh.vy, sh.vx);
        g.poly([[sh.x + Math.cos(a) * 7, sh.y + Math.sin(a) * 7], [sh.x + Math.cos(a + 2.5) * 6, sh.y + Math.sin(a + 2.5) * 6], [sh.x + Math.cos(a - 2.5) * 6, sh.y + Math.sin(a - 2.5) * 6]], C.ink);
      },
      readout(S) {
        const live = S.v.filter((v) => v.on).length;
        return "speed " + Math.round(Math.hypot(S.ship.vx, S.ship.vy)) + " WU/s  (sheds at 150)\nvortons alive " + live + "/64";
      },
    },
  });
})();
