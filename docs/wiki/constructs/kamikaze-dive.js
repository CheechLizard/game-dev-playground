Wiki.construct({
  id: "kamikaze-dive",
  name: "Kamikaze: pace slots and the dive",
  family: "agents",
  origin: "shmuprouge",
  status: "built",
  summary: "Kamikazes fly in to fixed slots on an arc ahead of the scrolling player, keep pace forward only, lock a targeting laser, then dive one after another with lead.",
  tags: ["enemy", "state machine", "formation", "telegraph", "scrolling"],

  intent:
    "<p>The Kamikaze's tactical goal is to disrupt flight: hit a cruising player hard enough to knock them out of the scroll. It has to do that fairly. It is always visible before it attacks, it holds still relative to the screen so it can be shot, it shows exactly when it will go, and a group goes one at a time so it reads as a sequence the player can learn to dodge.</p>" +
    "<p>The slot arc doubles as a threat queue. Members take slots centre-first and dive in the order they spawned, so the formation on screen tells you what is coming next.</p>",

  how:
    "<h3>Slots</h3>" +
    "<p>Spawned in groups of 4 by the [[encounter-spawner]] only while the player is scrolling. <code>maxSlot = floor(maxAngle / minAngle)</code> = floor(30/10) = 3, so ring 0 has seven slots, filled 0, +1, &minus;1, +2, &minus;2, +3, &minus;3; overflow goes to ring 1. A slot held by a live, non-diving kamikaze is occupied.</p>" +
    "<h3>Pace target</h3>" +
    "<p><code>worldAngle = heading + slot &times; minAngle</code>. The camera is estimated as <code>player + heading &times; arcadeMaxOffset &times; min(speed / speedForMaxOffset, 1)</code> (92 &times; 200/400 = 46 wu ahead). <code>maxVisibleDistance</code> ray-casts from the player's estimated screen position to the viewport edge shrunk by <code>PACE_MARGIN</code> 20 wu, and the target sits at that distance &times; <code>(paceDepth + ring &times; ringStep)</code> = 0.9. The kamikaze spawns <code>arrivalDistance</code> 200 wu further out along the heading, off screen. Member <i>i</i> gets <code>diveDelay = paceTime + (i&minus;1) &times; diveStagger</code>: 1.0, 1.6, 2.2, 2.8 s.</p>" +
    "<h3>The state machine</h3>" +
    "<p>In arriving and pacing, the pace target advances every frame by the <em>forward component only</em> of the scroll velocity: <code>target += h &times; (scrollV &middot; h) &times; dt</code>.</p>" +
    "<ul>" +
    "<li><b>arriving</b>: <code>v = (target &minus; pos) &times; arrivalApproach</code> (2 /s, an exponential approach). Inside the formation radius around the player, velocity toward the player is removed and an outward push of <code>(R &minus; dist) &times; arrivalApproach</code> added, so it never cuts through you. Within <code>arrivalThreshold</code> 10 wu it switches to pacing.</li>" +
    "<li><b>pacing</b>: velocity is forward scroll only. If it is off screen (margin 0, against the 20 used for placement: 20 wu of hysteresis) it takes a fresh target and goes back to arriving. When <code>diveDelay &minus; phaseTimer &le; telegraphTime</code> (0.5 s) it shows a laser and locks <code>telegraphAngle</code> once. At <code>diveDelay</code> it dives.</li>" +
    "<li><b>diving</b>: velocity locks to <code>chargeSpeed</code> 500 toward <code>playerDelta + scrollV &times; (dist / chargeSpeed)</code>. One correction is allowed at <code>diveCorrectTime</code>, which is 99 (off). Contact uses a swept capsule of <code>contactRadius</code> 3; bullets test <code>hurtRadius</code> 8. A missed diver is destroyed when it leaves the LOADED region.</li>" +
    "</ul>" +
    "<p>The dive re-aims at dive time, so the locked laser shows where the player was 0.5 s earlier, not where the dive will go.</p>",

  knobs: [
    ["Charge speed", "500 wu/s", "Dive speed, also used for the lead time", "Kamikaze.json stats.chargeSpeed"],
    ["Pace time / dive stagger", "1.0 / 0.6 s", "First dive delay and the gap between members", "stats.paceTime, stats.diveStagger"],
    ["Telegraph time", "0.5 s", "Laser shown before the dive", "stats.telegraphTime"],
    ["Min / max angle", "10° / 30°", "Slot spacing and the arc's half-width", "spawn.minAngle, spawn.maxAngle"],
    ["Pace depth / ring step", "0.9 / 0.1", "Fraction of the visible distance for ring 0, and per extra ring", "spawn.paceDepth, spawn.ringStep"],
    ["Arrival", "200 wu, 2.0 /s, 10 wu", "Spawn distance beyond the slot, approach rate, arrival threshold", "spawn.arrivalDistance, arrivalApproach, arrivalThreshold"],
    ["Radii", "contact 3, hurt 8", "Small to hit you, large to be hit", "stats.contactRadius, stats.hurtRadius"],
  ],

  related: [
    { id: "fair-attack-contract", how: "The rules this enemy was built to demonstrate." },
    { id: "encounter-spawner", how: "Spawns it, only while scrolling." },
    { id: "ship-control", how: "The arcade scroll state supplies the heading and scroll velocity." },
    { id: "npc-roster", how: "The Kamikaze is goal 2, Disrupt Flight." },
    { id: "spawn-telegraph", how: "Another way to announce an attack before it lands." },
  ],

  questions: [
    "The camera estimate uses 46 wu of look-ahead, but arcade mode's camera sits the full 92 wu ahead when there is no input. The on-screen test may be off by about 46 wu.",
    "Should the dive follow the locked laser rather than re-aim with lead? Today the laser can lie by 0.5 s of player movement.",
    "Mid-dive correction is reserved for elite variants. What else should an elite change?",
  ],

  sparks: [
    "Use slot arcs as a general threat queue: a boss's attacks wait in visible slots and fire in slot order.",
    "A variant that parks in its slot as a mine instead of diving, so the arc becomes a wall you must break.",
    "Apply forward-only matching to friendly wingmen: they keep formation without mirroring every dodge.",
  ],

  terms: [
    { term: "Pace target", def: "A stored world position on the slot arc that advances forward with the scroll but never sideways.", code: "paceTargetX, paceTargetY" },
    { term: "Slot / ring", def: "Angular position on the arc, and which arc (further out per ring).", code: "paceSlot, paceRing" },
    { term: "Phase", def: "arriving, pacing or diving.", code: "kamikaze.phase" },
    { term: "Telegraph lock", def: "The laser angle fixed once at telegraph start.", code: "telegraphAngle" },
    { term: "Dive stagger", def: "Extra delay per group member.", code: "diveStagger" },
  ],

  sources: [
    "shmuprouge:game/entities/kamikaze_ai.lua",
    "shmuprouge:game/entities/kamikaze_encounters.lua",
    "shmuprouge:game/entities/npc_scroll_helpers.lua",
    "shmuprouge:game/entities/kamikaze_factory.lua",
    "shmuprouge:shared/data/entities/Kamikaze.json",
    "shmuprouge:docs/entities/npcs/NPC_OpenSpace_Specification_v0_3.md",
  ],

  toy: {
    title: "Slot arc",
    hint: "hold to steer the ship; turn the heading",
    caption: "The stage is the 640×360 viewport at 0.6 scale. Scrolling at 200 wu/s; the camera stays 92 wu ahead along the heading and does not follow you sideways (the game's does, by half). Slot ghosts show the arc; the red line is the locked laser.",
    w: 384, h: 216,
    controls: [
      { type: "range", key: "heading", label: "heading", min: 0, max: 345, step: 15, value: 0, fmt: "{}°" },
      { type: "range", key: "minA", label: "min angle", min: 5, max: 30, value: 10, fmt: "{}°" },
      { type: "range", key: "maxA", label: "max angle", min: 10, max: 80, step: 5, value: 30, fmt: "{}°" },
      { type: "range", key: "stagger", label: "stagger", min: 0.2, max: 2, step: 0.2, value: 0.6, fmt: "{} s" },
      { type: "range", key: "group", label: "group", min: 1, max: 8, value: 4 },
      { type: "button", label: "spawn group", press(S) { S.spawnNow = true; } },
    ],
    init(S) {
      S.px = 0; S.py = 0; S.cx = 92; S.cy = 0; S.ks = []; S.cd = 1.5; S.hits = 0; S.dodged = 0; S.spawnNow = false; S.tx = null; S.ty = null; S.flash = 0;
    },
    pointer(e, S) { S.tx = e.down ? e.x : null; S.ty = e.down ? e.y : null; },
    rayEdge(sx, sy, a, m) {
      const c = Math.cos(a), s = Math.sin(a), ew = 320 - m, eh = 180 - m;
      let r = 1e9;
      if (Math.abs(c) > 1e-3) { const t = c > 0 ? (ew - sx) / c : (-ew - sx) / c; if (t > 0) r = Math.min(r, t); }
      if (Math.abs(s) > 1e-3) { const t = s > 0 ? (eh - sy) / s : (-eh - sy) / s; if (t > 0) r = Math.min(r, t); }
      return r;
    },
    paceTarget(S, P, slot, ring) {
      const h = P.heading * Math.PI / 180, a = h + slot * P.minA * Math.PI / 180;
      const R = this.rayEdge(-Math.cos(h) * 46, -Math.sin(h) * 46, a, 20) * (0.9 + ring * 0.1);
      return [S.px + R * Math.cos(a), S.py + R * Math.sin(a)];
    },
    update(S, P, dt) {
      const h = P.heading * Math.PI / 180, hx = Math.cos(h), hy = Math.sin(h), V = 200;
      // player: scroll plus steering toward the held pointer (lateral 200, forward +100, back -300)
      let vx = hx * V, vy = hy * V;
      const scrX = S.px - S.cx, scrY = S.py - S.cy;
      if (S.tx != null) {
        const wx = (S.tx - 192) / 0.6 - scrX, wy = (S.ty - 108) / 0.6 - scrY, wl = Math.hypot(wx, wy);
        if (wl > 4) {
          const f = (wx * hx + wy * hy) / wl, l = (wx * -hy + wy * hx) / wl;
          vx += hx * (f > 0 ? f * 100 : f * 300) - hy * l * 200; vy += hy * (f > 0 ? f * 100 : f * 300) + hx * l * 200;
        }
      }
      S.px += vx * dt; S.py += vy * dt;
      // camera: forward with the scroll, 92 ahead of the player along the heading, no lateral follow
      const along = S.px * hx + S.py * hy;
      const lat0 = S.cx * -hy + S.cy * hx;
      S.cx = hx * (along + 92) - hy * lat0; S.cy = hy * (along + 92) + hx * lat0;
      if (Math.abs((S.px - S.cx) * -hy + (S.py - S.cy) * hx) > 150) { S.cx = S.px + hx * 92; S.cy = S.py + hy * 92; }
      S.cd -= dt;
      if (S.cd <= 0 || S.spawnNow) {
        S.cd = 5; S.spawnNow = false;
        const occ = {};
        for (const k of S.ks) if (k.phase !== "diving") occ[k.ring + "," + k.slot] = 1;
        const maxSlot = Math.floor(P.maxA / P.minA), slots = [];
        for (let ring = 0; slots.length < P.group && ring < 4; ring++) for (let i = 0; i <= maxSlot && slots.length < P.group; i++) {
          for (const s of i === 0 ? [0] : [i, -i]) if (slots.length < P.group && !occ[ring + "," + s]) { slots.push([ring, s]); occ[ring + "," + s] = 1; }
        }
        slots.forEach(([ring, slot], i) => {
          const [tx, ty] = this.paceTarget(S, P, slot, ring);
          S.ks.push({ x: tx + hx * 200, y: ty + hy * 200, tx, ty, ring, slot, phase: "arriving", t: 0, delay: 1 + i * P.stagger, laser: null, dvx: 0, dvy: 0 });
        });
      }
      const fwd = V;
      for (const k of S.ks) {
        k.t += dt;
        if (k.phase !== "diving") { k.tx += hx * fwd * dt; k.ty += hy * fwd * dt; }
        if (k.phase === "arriving") {
          let kvx = (k.tx - k.x) * 2, kvy = (k.ty - k.y) * 2;
          const dpx = S.px - k.x, dpy = S.py - k.y, pd = Math.hypot(dpx, dpy);
          const R = Math.hypot(k.tx - S.px, k.ty - S.py);
          if (pd > 1 && pd < R) {
            const nx = dpx / pd, ny = dpy / pd, dot = kvx * nx + kvy * ny;
            if (dot > 0) { kvx -= dot * nx; kvy -= dot * ny; }
            kvx -= nx * (R - pd) * 2; kvy -= ny * (R - pd) * 2;
          }
          k.x += kvx * dt; k.y += kvy * dt;
          if (Math.hypot(k.tx - k.x, k.ty - k.y) < 10) { k.phase = "pacing"; k.t = 0; }
        } else if (k.phase === "pacing") {
          if (Math.abs(k.x - S.cx) > 320 || Math.abs(k.y - S.cy) > 180) {
            [k.tx, k.ty] = this.paceTarget(S, P, k.slot, k.ring); k.phase = "arriving"; k.t = 0; k.laser = null; continue;
          }
          k.x += hx * fwd * dt; k.y += hy * fwd * dt;
          if (k.delay - k.t <= 0.5 && k.laser == null) k.laser = Math.atan2(S.py - k.y, S.px - k.x);
          if (k.t >= k.delay) {
            const dx = S.px - k.x, dy = S.py - k.y, d = Math.hypot(dx, dy) || 1, lt = d / 500;
            const lx = dx + hx * V * lt, ly = dy + hy * V * lt, ll = Math.hypot(lx, ly) || 1;
            k.dvx = lx / ll * 500; k.dvy = ly / ll * 500; k.phase = "diving"; k.t = 0; k.laser = null;
          }
        } else {
          for (let i = 0; i < 4 && !k.dead; i++) {
            k.x += k.dvx * dt / 4; k.y += k.dvy * dt / 4;
            if (Math.hypot(k.x - S.px, k.y - S.py) < 6) { k.dead = true; S.hits++; S.flash = 0.3; }
          }
          if (k.dead) continue;
          else if (Math.hypot(k.x - S.cx, k.y - S.cy) > 600) { k.dead = true; S.dodged++; }
        }
      }
      S.ks = S.ks.filter((k) => !k.dead);
      S.flash = Math.max(0, S.flash - dt);
    },
    draw(g, S, P) {
      const C = g.C, k = 0.6, X = (x) => 192 + (x - S.cx) * k, Y = (y) => 108 + (y - S.cy) * k;
      g.clear();
      const gs = 64, ox = ((-S.cx % gs) + gs) % gs, oy = ((-S.cy % gs) + gs) % gs;
      for (let x = ox; x < 640; x += gs) g.line(x * k, 0, x * k, 216, C.rule, 1);
      for (let y = oy; y < 360; y += gs) g.line(0, y * k, 384, y * k, C.rule, 1);
      const maxSlot = Math.floor(P.maxA / P.minA);
      for (let s = -maxSlot; s <= maxSlot; s++) { const [tx, ty] = this.paceTarget(S, P, s, 0); g.circle(X(tx), Y(ty), 3, C.ink3, 1); }
      for (const q of S.ks) {
        if (q.laser != null) g.line(X(q.x), Y(q.y), X(q.x) + Math.cos(q.laser) * 400, Y(q.y) + Math.sin(q.laser) * 400, C.enemy, 1);
        const a = q.phase === "diving" ? Math.atan2(q.dvy, q.dvx) : Math.atan2(S.py - q.y, S.px - q.x);
        const x = X(q.x), y = Y(q.y);
        g.poly([[x + Math.cos(a) * 6, y + Math.sin(a) * 6], [x + Math.cos(a + 2.6) * 4, y + Math.sin(a + 2.6) * 4], [x + Math.cos(a - 2.6) * 4, y + Math.sin(a - 2.6) * 4]], q.phase === "pacing" ? C.gold : q.phase === "diving" ? C.enemy : C.ink2);
        if (q.phase === "pacing") g.label((q.delay - q.t).toFixed(1), x + 6, y - 4, C.ink3);
      }
      const h = P.heading * Math.PI / 180, x = X(S.px), y = Y(S.py);
      g.poly([[x + Math.cos(h) * 6, y + Math.sin(h) * 6], [x + Math.cos(h + 2.5) * 5, y + Math.sin(h + 2.5) * 5], [x + Math.cos(h - 2.5) * 5, y + Math.sin(h - 2.5) * 5]], S.flash > 0 ? C.enemy : C.accent);
    },
    readout(S) {
      const n = (p) => S.ks.filter((k) => k.phase === p).length;
      return "arriving " + n("arriving") + "  pacing " + n("pacing") + "  diving " + n("diving") + "\nhits " + S.hits + "   missed " + S.dodged + "   next " + S.cd.toFixed(1) + " s";
    },
  },
});
