Wiki.construct({
  id: "escaped-boss",
  name: "Escaped boss: retreat that follows you home",
  family: "structure",
  origin: "shmuprouge",
  status: "spec",
  statusNote: "Spec only (Portal_Stitching.md Escaped Boss, Solar_System_Arena.md Corridor Abort and open question 8). There are no bosses, corridors or portals in code; escape probability and the escaped boss's behaviour are TBD.",
  summary: "You can always fly back out of a corridor, but if you leave after engaging its boss it may follow you into the arena, where it hunts you, never despawns, and is harder to kill than it was in its own room.",
  tags: ["consequence", "persistence", "retreat", "boss order"],

  intent:
    "<p>Bidirectional portals mean a corridor is never a trap; you can turn round at any time. Escaped bosses keep that freedom from being free. Leaving before the boss costs nothing, leaving mid-fight probably wakes something that comes after you.</p>" +
    "<p>That turns boss order into strategy: \"be careful which boss you wake first.\" A hard boss woken early and abandoned haunts the rest of your time in the arena.</p>",

  how:
    "<h3>The rule</h3>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>Scenario</th><th>Escape chance</th><th>Consequence</th></tr></thead><tbody>" +
    "<tr><td>Abort before the boss</td><td>0%</td><td>Safe exit to the arena</td></tr>" +
    "<tr><td>Abort during the boss fight</td><td>High (<code>escape_probability</code> 0.5&ndash;1.0)</td><td>The boss follows you through the portal</td></tr>" +
    "<tr><td>Boss escaped</td><td>&mdash;</td><td>Haunts the system until killed</td></tr>" +
    "</tbody></table></div>" +
    "<h3>Escaped boss behaviour</h3>" +
    "<ul><li>Pursues the player in the arena.</li><li>Does not despawn.</li><li>Can be killed in the arena, but it is harder there than in the corridor.</li><li>Maybe cannot be lured back into its corridor (marked with a question mark in the spec).</li></ul>" +
    "<p>In the toroidal arena ([[level-loop]]) a pursuer has no corner to be trapped in; it closes on you along the shortest wrapped path. On top of the arena's own [[combat-pressure]], and with [[fuel]] draining in the Solar System model, it becomes a persistent elite you have to plan around.</p>",

  knobs: [
    ["Escape probability", "TBD (0.5–1.0)", "Chance an engaged boss follows you out", "escape_probability (Portal_Stitching.md)"],
    ["Abort before boss", "0%", "Leaving before engagement is always safe", "Portal_Stitching.md"],
  ],

  related: [
    { id: "portal-stitching", how: "Bidirectional travel is what makes aborting possible." },
    { id: "celestial-upgrades", how: "Boss order matters more when a wrong order can haunt you." },
    { id: "combat-pressure", how: "An escaped boss adds a persistent elite on top of the spawn rate." },
    { id: "level-loop", how: "The arena it escapes into, and the hub you keep returning to." },
  ],

  questions: [
    "How aggressive is an escaped boss, and does it ever give up the chase?",
    "Can it be lured back into its corridor, and does that restore the normal fight?",
    "Does killing it in the arena still drop its fragment?",
    "Can more than one boss be loose at once, and do they stack with the time-in-arena pressure multipliers?",
  ],

  sparks: [
    "A nemesis that grows every time it escapes, remembering the player across encounters.",
    "Escaped bosses that act on the falling-sand world: tunnelling through planets, eating the matter you came to mine.",
    "Escape on purpose: drag the boss out of its arena and into a hazard like the sun or a gas giant.",
    "Apply it to any game with a retreat button: fleeing a fight leaves a hunter on the map.",
  ],

  terms: [
    { term: "Abort", def: "Spec: flying back out of a corridor before finishing it." },
    { term: "Engaged", def: "Spec: the boss fight has started; aborting now risks escape." },
    { term: "Escaped boss", def: "Spec: a boss that followed the player into the arena.", code: "escape_probability" },
    { term: "Haunt", def: "Spec: the escaped boss pursues the player and never despawns." },
  ],

  sources: [
    "shmuprouge:docs/design/Portal_Stitching.md",
    "shmuprouge:docs/levels/solar_system/Solar_System_Arena.md",
    "shmuprouge:docs/design/Celestial_Upgrades.md",
  ],

  toy: {
    title: "Wake it, then run",
    hint: "steer with the pointer; cross the line to engage, fly back out, click the boss to fight",
    caption: "The ship follows your pointer. The arena wraps for the boss, which chases along the shortest wrapped path. 8 clicks kill it in the arena; it would take fewer in its room. All numbers are invented.",
    w: 384, h: 216,
    controls: [
      { type: "range", key: "esc", label: "escape p", min: 0, max: 100, value: 75, fmt: "{}%" },
      { type: "range", key: "bs", label: "boss speed", min: 10, max: 80, value: 35, fmt: "{} u/s" },
    ],
    init(S) {
      S.A = { x: 10, y: 36, w: 220, h: 170 }; S.portal = { x: 222, y: 120 };
      S.px = 60; S.py = 120; S.tx = 60; S.ty = 120; S.where = "arena";
      S.engaged = false; S.loose = false; S.bx = 0; S.by = 0; S.hp = 8; S.hits = 0; S.msg = ""; S.msgT = 0; S.escapes = 0; S.safe = 0; S.flash = 0; S.grace = 0;
    },
    pointer(e, S) {
      S.tx = e.x; S.ty = e.y;
      if (e.type === "down" && S.loose && Math.hypot(e.x - S.bx, e.y - S.by) < 12) {
        S.hp--; S.flash = 0.1;
        if (S.hp <= 0) { S.loose = false; S.msg = "BOSS KILLED IN ARENA"; S.msgT = 1.5; }
      }
    },
    update(S, P, dt, kit) {
      const A = S.A;
      const dx = S.tx - S.px, dy = S.ty - S.py, d = Math.hypot(dx, dy);
      if (d > 1) { S.px += dx / d * Math.min(d, 90 * dt); S.py += dy / d * Math.min(d, 90 * dt); }
      S.msgT = Math.max(0, S.msgT - dt); S.flash = Math.max(0, S.flash - dt);
      if (S.where === "arena") {
        S.px = Math.max(A.x + 4, Math.min(A.x + A.w - 4, S.px)); S.py = Math.max(A.y + 4, Math.min(A.y + A.h - 4, S.py));
        if (Math.hypot(S.px - S.portal.x, S.py - S.portal.y) < 10 && !S.loose) { S.where = "corridor"; S.px = 258; S.py = 120; }
      } else {
        S.py = Math.max(106, Math.min(134, S.py)); S.px = Math.min(372, S.px);
        if (S.px > 318 && !S.engaged) { S.engaged = true; S.msg = "BOSS ENGAGED"; S.msgT = 1; }
        if (S.px < 250) {
          S.where = "arena"; S.px = S.portal.x - 18; S.py = S.portal.y;
          if (S.engaged) {
            if (kit.rand() * 100 < P.esc) { S.loose = true; S.hp = 8; S.bx = S.portal.x - 4; S.by = S.portal.y; S.escapes++; S.grace = 1.5; S.msg = "IT FOLLOWED YOU"; }
            else { S.safe++; S.msg = "IT STAYED BEHIND"; }
            S.msgT = 1.5; S.engaged = false;
          }
        }
      }
      S.grace = Math.max(0, S.grace - dt);
      if (S.loose && S.grace <= 0) {
        let ex = S.px - S.bx, ey = S.py - S.by;
        if (S.where !== "arena") { ex = S.portal.x - S.bx; ey = S.portal.y - S.by; }
        if (ex > A.w / 2) ex -= A.w; if (ex < -A.w / 2) ex += A.w; if (ey > A.h / 2) ey -= A.h; if (ey < -A.h / 2) ey += A.h;
        const e = Math.hypot(ex, ey) || 1;
        S.bx += ex / e * P.bs * dt; S.by += ey / e * P.bs * dt;
        S.bx = ((S.bx - A.x) % A.w + A.w) % A.w + A.x; S.by = ((S.by - A.y) % A.h + A.h) % A.h + A.y;
        if (S.where === "arena" && Math.hypot(S.px - S.bx, S.py - S.by) < 12) { S.hits++; S.px = A.x + 30; S.py = A.y + 30; S.msg = "HIT"; S.msgT = 0.6; }
      }
    },
    draw(g, S) {
      const C = g.C, A = S.A; g.clear();
      g.tone(A.x, A.y, A.w, A.h, 0.08, C.ink3); g.rect(A.x, A.y, A.w, A.h, C.ink3, 1, [2, 2]);
      g.label("ARENA (WRAPS)", A.x + 4, A.y + A.h - 4, C.ink3);
      g.rect(250, 100, 128, 40, C.ink3, 1); g.label("CORRIDOR", 254, 96, C.ink2);
      g.line(318, 100, 318, 140, C.enemy, 1, [3, 2]);
      g.circle(S.portal.x, S.portal.y, 10, C.violet, 2); g.line(232, 120, 250, 120, C.violet, 1, [2, 2]);
      if (!S.loose) g.circle(360, 120, 9, S.engaged ? C.enemy : C.ink3);
      if (S.loose) {
        g.circle(S.bx, S.by, 10, S.flash > 0 ? C.ink : C.enemy);
        g.meter(S.bx - 12, S.by - 16, 24, 3, S.hp / 8, C.enemy);
        g.text("HAUNTED", 180, 30, { align: "center", color: C.enemy });
      }
      g.circle(S.px, S.py, 4, C.accent);
      if (S.msgT > 0) g.text(S.msg, 314, 170, { align: "center", color: S.msg.indexOf("FOLLOW") >= 0 || S.msg === "HIT" ? C.enemy : C.gold });
    },
    readout(S) { return "escaped " + S.escapes + "   stayed " + S.safe + "\nhits taken " + S.hits; },
  },
});
