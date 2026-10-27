Wiki.construct({
  id: "portal-stitching",
  name: "Portal stitching: the direction you fly in picks the boss",
  origin: "shmuprouge",
  status: "spec",
  statusNote: "Spec only, in two competing versions: a directional portal bubble with material-locked directions (Portal_Stitching.md, Solar_System_Arena.md) and a portal built at a construction site for a resource cost (Levels_Overview.md). No portal code exists; CorridorBounds, the non-wrapping bounds a corridor would use, is never instantiated and has no diagonal mode.",
  summary: "The exit from the arena is a bubble bigger than the screen; your velocity angle as you cross its threshold chooses one of eight corridors and bosses, and some directions stay locked until you have mined their material.",
  tags: ["transition", "direction", "lock and key", "no loading screen"],

  intent:
    "<p>A boss-select menu stops the game. Here the choice is a flight manoeuvre: the portal is a spatial threshold, not an object to interact with, and the angle you hit it at decides where you go. Lining up a diagonal entry is a small skill test, and there is no prompt or loading screen between the arena and the corridor.</p>" +
    "<p>Direction locks give the arena a shopping list. If the up corridor needs 50 Uranium, the player has a reason to go and mine the uranium planet, and the designer has a lever for which bosses are reachable early.</p>",

  how:
    "<h3>Version 1: the portal bubble</h3>" +
    "<p>A world entity placed by level generation with a radius larger than the viewport, optional terrain, sprites, an optional attractor and a transition shader that hides corridor chunk loading. In the Solar System loop it activates when the [[harvest-bar]] fills, with a dialog and a HUD waypoint.</p>" +
    "<p>The player's velocity at the threshold crossing picks a 45&deg; sector:</p>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>Direction</th><th>Angle</th><th>Corridor scroll</th><th>Boss</th></tr></thead><tbody>" +
    "<tr><td>Right</td><td>-22.5&deg; to 22.5&deg;</td><td>Horizontal &rarr;</td><td>B</td></tr>" +
    "<tr><td>Up-Right</td><td>22.5&deg; to 67.5&deg;</td><td>Diagonal &#8599;</td><td>TBD</td></tr>" +
    "<tr><td>Up</td><td>67.5&deg; to 112.5&deg;</td><td>Vertical &uarr;</td><td>A</td></tr>" +
    "<tr><td>Up-Left</td><td>112.5&deg; to 157.5&deg;</td><td>Diagonal &#8598;</td><td>TBD</td></tr>" +
    "<tr><td>Left</td><td>157.5&deg; to 202.5&deg;</td><td>Horizontal &larr;</td><td>D</td></tr>" +
    "<tr><td>Down-Left</td><td>202.5&deg; to 247.5&deg;</td><td>Diagonal &#8601;</td><td>TBD</td></tr>" +
    "<tr><td>Down</td><td>247.5&deg; to 292.5&deg;</td><td>Vertical &darr;</td><td>C</td></tr>" +
    "<tr><td>Down-Right</td><td>292.5&deg; to 337.5&deg;</td><td>Diagonal &#8600;</td><td>TBD</td></tr>" +
    "</tbody></table></div>" +
    "<p>Eight directions, eight corridors, eight bosses, eight [[celestial-upgrades|fragments]]. Velocity is sampled <code>direction_sample_distance</code> before the threshold; momentum carries through the camera handoff. Travel is bidirectional: fly back out at any time, though leaving after engaging the boss can produce an [[escaped-boss]].</p>" +
    "<p><b>Direction locks</b>: a locked sector shows a gate, the material icon, the amount and a progress bar (the example: Up needs 50 Uranium, Right 100 Ironite, Down open). You cannot enter from a locked angle; the lock opens when the requirement is met.</p>" +
    "<h3>Version 2: the construction site</h3>" +
    "<p><code>Levels_Overview.md</code>: each arena segment has a <code>portal_site</code> spawn point and a <code>portal_cost</code>. The player spends resources to build a portal there. Cost rises with progression (later portals need rare resources), a built portal is permanent for the run, and sites are marked on the minimap once found. There is no direction choice; the arena leads to one corridor.</p>" +
    "<h3>What they disagree on</h3>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th></th><th>Bubble</th><th>Construction site</th></tr></thead><tbody>" +
    "<tr><td>Opens when</td><td>Harvest bar fills</td><td>You pay <code>portal_cost</code></td></tr>" +
    "<tr><td>Materials gate</td><td>Individual directions</td><td>The whole portal</td></tr>" +
    "<tr><td>Destinations</td><td>8, by entry angle</td><td>1</td></tr>" +
    "<tr><td>Persistence</td><td>Bidirectional threshold</td><td>Permanent for the run</td></tr>" +
    "</tbody></table></div>",

  knobs: [
    ["Bubble radius", "TBD (2–5 screens)", "Must be large enough to hide corridor loading", "bubble_radius"],
    ["Direction sample distance", "TBD (0.5–2 screens)", "How far before the threshold velocity is sampled", "direction_sample_distance"],
    ["Escape probability", "TBD (0.5–1.0)", "Chance an engaged boss follows you out", "escape_probability"],
    ["Portal cost", "scales with progression", "Construction-site version: price to build", "portal_cost"],
  ],

  related: [
    { id: "level-loop", how: "The portal is the arena-to-corridor edge of the loop." },
    { id: "celestial-upgrades", how: "Direction picks the boss and so the fragment." },
    { id: "escaped-boss", how: "The cost of flying back out mid-fight." },
    { id: "corridor-spine", how: "The corridor on the other side, whose scroll direction the entry angle sets." },
    { id: "flow-field-gravity", how: "An optional attractor could pull the player toward the bubble." },
  ],

  questions: [
    "Bubble or construction site? They differ on what opens the exit, what materials gate, and how many destinations there are.",
    "Does the player see which direction they are about to choose while orbiting the bubble?",
    "Is there a minimum crossing speed, and what happens if the player oscillates across the threshold?",
    "How many directions start unlocked, and are lock amounts flat or escalating?",
    "Diagonal corridors need a diagonal CorridorBounds, which does not exist. Are diagonals worth the camera and chunk cost?",
  ],

  sparks: [
    "Make locked sectors physically narrow gates you have to thread at speed, so a lock is also a dexterity test.",
    "Slingshot entries: orbit the bubble's attractor to line up a diagonal you could not reach in a straight line.",
    "Crossing speed sets the corridor's scroll speed, so a fast entry is a harder, shorter gauntlet.",
    "Any hub with radial exits can key the exit to approach vector: a racing garage, a dungeon wheel.",
  ],

  terms: [
    { term: "Portal bubble", def: "Spec: a threshold larger than the screen joining arena and corridor." },
    { term: "Entry angle", def: "Spec: the player's velocity angle at the crossing; picks one of eight 45° sectors." },
    { term: "Direction lock", def: "Spec: a sector closed until a material quota is collected." },
    { term: "Portal construction site", def: "Spec (Levels_Overview): an arena spawn point where a portal is built for a cost.", code: "SpawnData.portal_site, portal_cost" },
    { term: "Chunk stitching", def: "Spec: pre-loading corridor chunks behind the bubble so the handoff is seamless." },
  ],

  sources: [
    "shmuprouge:docs/design/Portal_Stitching.md",
    "shmuprouge:docs/levels/solar_system/Solar_System_Arena.md",
    "shmuprouge:docs/levels/Levels_Overview.md",
    "shmuprouge:docs/design/Celestial_Upgrades.md",
    "shmuprouge:engine/rendering/camera/corridor_bounds.lua",
  ],

  toy: {
    title: "Thread the bubble",
    hint: "hold to thrust toward the pointer; click a lock badge to mine for it",
    caption: "The bubble is shrunk to fit; the threshold is the inner ring. The sector lit is the one your current velocity points into. Locks use the spec's example amounts; each click on a badge adds 10. Edges wrap like the arena.",
    w: 384, h: 216,
    controls: [
      { type: "select", key: "mode", label: "version", value: "bubble", reset: true, options: [["bubble", "direction bubble"], ["site", "construction site"]] },
      { type: "range", key: "minv", label: "min speed", min: 0, max: 120, value: 30, fmt: "{} u/s" },
    ],
    init(S) {
      S.cx = 236; S.cy = 120; S.R = 86; S.r = 26;
      S.x = 70; S.y = 180; S.vx = 30; S.vy = -20; S.thrust = false; S.tx = 0; S.ty = 0;
      S.locks = { 2: [0, 50, "U"], 0: [0, 100, "IRONITE"] };
      S.msg = ""; S.msgT = 0; S.inside = false; S.build = 0; S.cost = 100; S.entries = 0;
    },
    badge(S, k) { const a = k * Math.PI / 4; return [S.cx + Math.cos(a) * (S.R + 4), S.cy - Math.sin(a) * (S.R + 4)]; },
    pointer(e, S, P) {
      S.tx = e.x; S.ty = e.y;
      if (e.type === "down" && P.mode === "bubble") for (const k in S.locks) {
        const [bx, by] = this.badge(S, +k);
        if (Math.hypot(e.x - bx, e.y - by) < 14) { S.locks[k][0] = Math.min(S.locks[k][1], S.locks[k][0] + 10); S.thrust = false; return; }
      }
      S.thrust = e.down && e.type !== "up";
    },
    update(S, P, dt) {
      if (S.thrust) { const dx = S.tx - S.x, dy = S.ty - S.y, d = Math.hypot(dx, dy) || 1; S.vx += dx / d * 140 * dt; S.vy += dy / d * 140 * dt; }
      const sp = Math.hypot(S.vx, S.vy); if (sp > 150) { S.vx *= 150 / sp; S.vy *= 150 / sp; }
      S.vx *= 0.998; S.vy *= 0.998;
      S.x = ((S.x + S.vx * dt) % 384 + 384) % 384; S.y = ((S.y + S.vy * dt) % 216 + 216) % 216;
      S.msgT = Math.max(0, S.msgT - dt);
      const d = Math.hypot(S.x - S.cx, S.y - S.cy);
      if (P.mode === "site") {
        if (S.build < S.cost && d < S.R * 0.6) S.build = Math.min(S.cost, S.build + 25 * dt);
        if (S.build >= S.cost && d < S.r && !S.inside && Math.hypot(S.vx, S.vy) >= P.minv) this.enter(S, "CORRIDOR (ONE EXIT)");
        S.inside = d < S.r; return;
      }
      if (d < S.r && !S.inside) {
        const v = Math.hypot(S.vx, S.vy), k = this.sector(S);
        if (v < P.minv) { S.msg = "TOO SLOW"; S.msgT = 0.8; }
        else if (S.locks[k] && S.locks[k][0] < S.locks[k][1]) {
          const nx = (S.x - S.cx) / d, ny = (S.y - S.cy) / d, dot = S.vx * nx + S.vy * ny;
          S.vx -= 2 * dot * nx; S.vy -= 2 * dot * ny; S.x = S.cx + nx * (S.r + 1); S.y = S.cy + ny * (S.r + 1);
          S.msg = "LOCKED: " + S.locks[k][1] + " " + S.locks[k][2]; S.msgT = 1; return;
        } else {
          const names = ["RIGHT", "UP-RIGHT", "UP", "UP-LEFT", "LEFT", "DOWN-LEFT", "DOWN", "DOWN-RIGHT"], boss = ["B", "?", "A", "?", "D", "?", "C", "?"];
          this.enter(S, names[k] + " CORRIDOR, BOSS " + boss[k]);
        }
      }
      S.inside = Math.hypot(S.x - S.cx, S.y - S.cy) < S.r;
    },
    enter(S, text) { S.msg = text; S.msgT = 1.6; S.entries++; S.x = 40; S.y = 190; S.vx = 30; S.vy = -20; S.inside = false; },
    sector(S) { const deg = (Math.atan2(-S.vy, S.vx) * 180 / Math.PI + 360) % 360; return Math.floor(((deg + 22.5) % 360) / 45); },
    draw(g, S, P) {
      const C = g.C; g.clear();
      if (P.mode === "bubble") {
        const k = this.sector(S);
        for (let i = 0; i < 8; i++) {
          const a0 = -(i * 45 + 22.5) * Math.PI / 180, a1 = -(i * 45 - 22.5) * Math.PI / 180;
          const locked = S.locks[i] && S.locks[i][0] < S.locks[i][1];
          g.ctx.globalAlpha = i === k ? 0.35 : 0.08; g.wedge(S.cx, S.cy, S.R, a0, a1, locked ? C.enemy : C.accent); g.ctx.globalAlpha = 1;
          g.line(S.cx, S.cy, S.cx + Math.cos(a0) * S.R, S.cy + Math.sin(a0) * S.R, C.rule, 1);
          if (locked) g.arc(S.cx, S.cy, S.r + 3, a0, a1, C.enemy, 3);
        }
        g.circle(S.cx, S.cy, S.R, C.ink3, 1);
        for (const kk in S.locks) {
          const [bx, by] = this.badge(S, +kk), L = S.locks[kk];
          g.rect(bx - 14, by - 7, 28, 14, C.bg); g.rect(bx - 14, by - 7, 28, 14, L[0] >= L[1] ? C.accent : C.enemy, 1);
          g.meter(bx - 12, by + 2, 24, 3, L[0] / L[1], C.gold);
          g.label(L[1] + (L[2] === "U" ? " U" : " IR"), bx, by, C.ink, "center");
        }
      } else {
        g.circle(S.cx, S.cy, S.R * 0.6, C.ink3, 1);
        g.meter(S.cx - 40, S.cy + S.R * 0.6 + 8, 80, 5, S.build / S.cost, C.gold);
        g.label(S.build >= S.cost ? "BUILT: PERSISTS FOR RUN" : "SITE: HOVER TO PAY " + S.cost, S.cx, S.cy - S.R * 0.6 - 6, C.ink2, "center");
        if (S.build >= S.cost) g.toneCircle(S.cx, S.cy, S.r, 0.5, C.accent);
      }
      g.circle(S.cx, S.cy, S.r, C.ink, 1);
      const a = Math.atan2(S.vy, S.vx);
      g.poly([[S.x + Math.cos(a) * 7, S.y + Math.sin(a) * 7], [S.x + Math.cos(a + 2.5) * 5, S.y + Math.sin(a + 2.5) * 5], [S.x + Math.cos(a - 2.5) * 5, S.y + Math.sin(a - 2.5) * 5]], S.thrust ? C.gold : C.accent);
      g.arrow(S.x, S.y, S.x + S.vx * 0.25, S.y + S.vy * 0.25, C.ink3, 1);
      if (S.msgT > 0) g.text(S.msg, S.cx, 212, { align: "center", color: S.msg.startsWith("LOCK") || S.msg.startsWith("TOO") ? C.enemy : C.gold });
    },
    readout(S) {
      const deg = Math.round((Math.atan2(-S.vy, S.vx) * 180 / Math.PI + 360) % 360);
      return "angle " + deg + "°  speed " + Math.round(Math.hypot(S.vx, S.vy)) + "\nentries " + S.entries;
    },
  },
});
