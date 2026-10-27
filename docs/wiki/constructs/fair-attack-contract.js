Wiki.construct({
  id: "fair-attack-contract",
  name: "The fair attack contract",
  origin: "shmuprouge",
  status: "built",
  statusNote: "Built in the Kamikaze, and written down as rules for every scrolling NPC in <code>NPC_OpenSpace_Specification_v0_3.md</code> &sect;4.3&ndash;4.7. No other scrolling NPC exists yet to test them on.",
  summary: "Seven rules that make a scrolling enemy feel fair: arrive visibly, never attack from off screen, lock the telegraph, ignore the player's sideways motion, hit small and be hit big, tune features off by data, and despawn by place, not time.",
  tags: ["fairness", "telegraph", "hitbox", "checklist", "scrolling"],

  intent:
    "<p>In an auto-scroller the player's attention is pointed forward and their hands are busy. An attack they could not see, a laser that follows them, or an enemy that slides sideways with their dodge all read as cheating, even when the numbers are generous. These rules came out of building the [[kamikaze-dive|Kamikaze]] and were then written up as a contract for every scrolling NPC.</p>" +
    "<p>Each rule is cheap, and each one removes a specific feeling of unfairness. Together they let an enemy be fast and lethal and still feel like the player's fault when it lands.</p>",

  how:
    "<h3>The rules, and how the Kamikaze keeps them</h3>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>Rule</th><th>Mechanism</th></tr></thead><tbody>" +
    "<tr><td>Arrive visibly</td><td>Spawn off screen <em>ahead</em> along the scroll heading and fly in to an on-screen slot.</td></tr>" +
    "<tr><td>Never attack from off screen</td><td>Only <code>pacing</code> can start a dive, and pacing checks on-screen every frame; off screen it goes back to <code>arriving</code>.</td></tr>" +
    "<tr><td>Lock the telegraph</td><td><code>telegraphAngle</code> is set once at telegraph start. A laser that tracks you &ldquo;feels like cheating&rdquo;.</td></tr>" +
    "<tr><td>Forward-only scroll matching</td><td>While pacing, velocity is the forward component of the scroll only, so the enemy does not slide with your dodge and stays hittable.</td></tr>" +
    "<tr><td>Dual radii</td><td>Swept contact with <code>contactRadius</code> 3 wu against you; bullets test a generous <code>hurtRadius</code> 8 wu.</td></tr>" +
    "<tr><td>Disable by data</td><td>Mid-dive correction stays in the code but <code>diveCorrectTime</code> 99 turns it off for the base enemy.</td></tr>" +
    "<tr><td>Spatial lifecycle</td><td>A missed diver is destroyed when it leaves the LOADED region, not after a timer.</td></tr>" +
    "</tbody></table></div>" +
    "<h3>Why the radii matter</h3>" +
    "<p>The player's own collision radius is 3 wu. With contact 3 + 3, a dive must pass within 6 wu of the ship's centre to hit. A player bullet only needs to come within 8 wu of the kamikaze. The asymmetry is the point: near misses happen to you, near hits count for you.</p>" +
    "<h3>The one gap</h3>" +
    "<p>The telegraph is locked, but the dive re-aims with lead at dive time. The laser shows where you were half a second before the dive, so it is honest about timing and only approximately honest about direction.</p>",

  knobs: [
    ["Contact radius", "3 wu", "NPC-to-player swept contact", "Kamikaze.json stats.contactRadius"],
    ["Hurt radius", "8 wu", "Player-bullet-to-NPC test", "stats.hurtRadius"],
    ["Telegraph time", "0.5 s", "Locked laser before the dive", "stats.telegraphTime"],
    ["Dive correct time", "99 (off)", "One mid-dive re-aim, reserved for elites", "stats.diveCorrectTime"],
    ["Screen margins", "20 / 0 wu", "Placement margin vs off-screen test, giving hysteresis", "PACE_MARGIN, SCREEN_EDGE_MARGIN"],
  ],

  related: [
    { id: "kamikaze-dive", how: "The enemy these rules were extracted from." },
    { id: "spawn-telegraph", how: "The playground's version of rule three: warn before arriving." },
    { id: "contact-iframes", how: "What happens after a fair hit lands." },
    { id: "formation-waves", how: "Applies the same thinking to whole formations: the warning scales with how blind the entry is." },
  ],

  questions: [
    "Should the dive follow the locked laser exactly, closing the gap above?",
    "Do the rules hold for enemies that shoot rather than ram? The contract was written from a single rammer.",
    "Is despawning by region still fair on a toroidal map, where a missed diver might wrap back?",
  ],

  sparks: [
    "Port the table as a review checklist for any bullet-hell or action-game enemy.",
    "A fairness budget as the difficulty knob: each harder setting relaxes one rule, so the player learns exactly what got meaner.",
    "Boss phases that break one rule on purpose and announce it (&ldquo;the laser tracks now&rdquo;), so cheating becomes a mechanic.",
  ],

  terms: [
    { term: "Off-screen safety", def: "No attack may start while the attacker is off screen.", code: "KamikazeAI.updatePacing, isOnScreen" },
    { term: "Telegraph lock", def: "The warning's direction is fixed when it appears.", code: "telegraphAngle" },
    { term: "Forward-only scroll matching", def: "Match the scroll's forward speed, never the player's lateral motion.", code: "advancePaceTarget" },
    { term: "Dual radii", def: "Small contact radius for hitting the player, large hurt radius for being hit.", code: "contactRadius, hurtRadius" },
    { term: "Spatial lifecycle", def: "Despawn on leaving a region rather than on a timer.", code: "Region.LOADED" },
  ],

  sources: [
    "shmuprouge:docs/entities/npcs/NPC_OpenSpace_Specification_v0_3.md",
    "shmuprouge:game/entities/kamikaze_ai.lua",
    "shmuprouge:game/entities/kamikaze_factory.lua",
    "shmuprouge:game/systems/ai/kamikaze_ai_system.lua",
    "shmuprouge:shared/data/entities/Kamikaze.json",
  ],

  toy: {
    title: "Break one rule at a time",
    hint: "hold to dodge; untick a rule and feel the difference",
    caption: "Camera frame, scrolling right; the guns fire forward automatically. A simplified Kamikaze: groups of 4 every 4 s, dive at 500 wu/s with lead. Unticking a rule replaces it with the unfair version: off-screen dives, a tracking laser, lateral matching, swapped radii.",
    w: 384, h: 216,
    controls: [
      { type: "toggle", key: "onscreen", label: "off-screen safety", value: true },
      { type: "toggle", key: "lock", label: "telegraph lock", value: true },
      { type: "toggle", key: "fwd", label: "forward-only", value: true },
      { type: "toggle", key: "radii", label: "dual radii", value: true },
      { type: "button", label: "reset score", press(S) { S.hits = 0; S.kills = 0; S.blind = 0; } },
    ],
    init(S) { S.px = 110; S.py = 180; S.vx = 0; S.vy = 0; S.ks = []; S.bul = []; S.cd = 0.5; S.fire = 0; S.hits = 0; S.kills = 0; S.blind = 0; S.tx = null; S.ty = null; S.flash = 0; },
    pointer(e, S) { S.tx = e.down ? e.x / 0.6 : null; S.ty = e.down ? e.y / 0.6 : null; },
    update(S, P, dt, kit) {
      // camera-frame units: wu, viewport 640x360, scroll is to the right
      S.time = (S.time || 0) + dt;
      S.vx = 0; S.vy = 0;
      if (S.tx != null) { const dx = S.tx - S.px, dy = S.ty - S.py, d = Math.hypot(dx, dy); if (d > 3) { S.vx = dx / d * (dx > 0 ? 100 : 200); S.vy = dy / d * 200; } }
      S.px = Math.max(10, Math.min(630, S.px + S.vx * dt)); S.py = Math.max(10, Math.min(350, S.py + S.vy * dt));
      const contact = P.radii ? 3 : 8, hurt = P.radii ? 8 : 3;
      S.cd -= dt;
      if (S.cd <= 0) {
        S.cd = 4;
        const base = 60 + kit.rand() * 240;
        [0, 1, -1, 2].forEach((s, i) => {
          const ty = Math.max(30, Math.min(330, base + s * 40)), tx = 560 - Math.abs(s) * 10;
          const k = { x: tx + 200, y: ty, tx, ty, phase: P.onscreen ? "arriving" : "pacing", t: 0, delay: 1 + i * 0.6, laser: null, vx: 0, vy: 0, blind: false };
          S.ks.push(k);
        });
      }
      for (const k of S.ks) {
        k.t += dt;
        if (k.phase === "arriving") {
          k.x += (k.tx - k.x) * 2 * dt; k.y += (k.ty - k.y) * 2 * dt;
          if (Math.hypot(k.tx - k.x, k.ty - k.y) < 10) { k.phase = "pacing"; k.t = 0; }
        } else if (k.phase === "pacing") {
          if (!P.fwd) k.y += S.vy * dt;
          const ang = Math.atan2(S.py - k.y, S.px - k.x);
          if (k.delay - k.t <= 0.5) k.laser = (P.lock && k.laser != null) ? k.laser : ang;
          if (k.t >= k.delay) {
            const dx = S.px - k.x, dy = S.py - k.y, d = Math.hypot(dx, dy) || 1, lt = d / 500;
            const lx = dx + S.vx * lt, ly = dy + S.vy * lt, ll = Math.hypot(lx, ly) || 1;
            k.vx = lx / ll * 500; k.vy = ly / ll * 500; k.phase = "diving"; k.laser = null;
            k.blind = k.x > 640 || k.y < 0 || k.y > 360;
          }
        } else {
          for (let i = 0; i < 4 && !k.dead; i++) {
            k.x += k.vx * dt / 4; k.y += k.vy * dt / 4;
            if (Math.hypot(k.x - S.px, k.y - S.py) < contact + 3) { k.dead = true; S.hits++; S.flash = 0.3; if (k.blind) S.blind++; }
          }
          if (k.x < -100 || k.y < -100 || k.y > 460 || k.x > 900) k.dead = true;
        }
      }
      S.fire -= dt;
      if (S.fire <= 0) { S.fire = 0.12; S.bul.push({ x: S.px + 6, y: S.py }); }
      for (const b of S.bul) {
        b.x += 600 * dt;
        for (const k of S.ks) if (!k.dead && !b.dead && k.x < 640 && Math.hypot(k.x - b.x, k.y - b.y) < hurt + 1) { k.dead = true; b.dead = true; S.kills++; }
      }
      S.bul = S.bul.filter((b) => !b.dead && b.x < 660);
      S.ks = S.ks.filter((k) => !k.dead);
      S.flash = Math.max(0, S.flash - dt);
    },
    draw(g, S, P) {
      const C = g.C, k = 0.6;
      g.clear();
      for (let i = 0; i < 40; i++) { const x = ((i * 53 - S.time * 200) % 640 + 640) % 640; g.rect(x * k, ((i * 97) % 360) * k, 2, 1, C.ink3); }
      for (const b of S.bul) g.line(b.x * k, b.y * k, (b.x - 10) * k, b.y * k, C.accent, 1);
      for (const q of S.ks) {
        if (q.laser != null) g.line(q.x * k, q.y * k, q.x * k + Math.cos(q.laser) * 400, q.y * k + Math.sin(q.laser) * 400, C.enemy, 1);
        const x = q.x * k, y = q.y * k;
        if (x > 384) { g.label("!", 378, Math.max(10, Math.min(210, y)), C.enemy); continue; }
        g.circle(x, y, (P.radii ? 8 : 3) * k, C.ink3, 1);
        g.circle(x, y, 3, q.phase === "diving" ? C.enemy : q.phase === "pacing" ? C.gold : C.ink2);
      }
      g.poly([[S.px * k + 6, S.py * k], [S.px * k - 4, S.py * k - 4], [S.px * k - 4, S.py * k + 4]], S.flash > 0 ? C.enemy : C.ink);
      g.circle(S.px * k, S.py * k, ((P.radii ? 3 : 8) + 3) * k, C.ink3, 1);
    },
    readout(S) {
      return "hits taken " + S.hits + " (from off screen " + S.blind + ")\nkills " + S.kills;
    },
  },
});
