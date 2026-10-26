Wiki.construct({
  id: "ship-control",
  name: "Ship control: scroll box, direct and thrust",
  family: "body",
  origin: "shmuprouge",
  status: "built",
  statusNote: "All three modes are built. The default, <code>controlScheme = \"arcade\"</code>, is undocumented: <code>docs/systems/Control.md</code> and <code>PlayContext.md</code> describe only direct and thrust, and Control.md's <code>controlScheme: thrust</code>, <code>friction 400</code> and file paths are stale.",
  summary: "By default the ship lives in a box: push against its edge and the game starts auto-scrolling that way (flight); pull back to its rear edge and it stops (mech). Direct and thrust handling, with a free or locked heading, are the alternatives.",
  tags: ["controls", "auto-scroll", "camera", "modes", "handling"],

  intent:
    "<p>ShmupRouge's world is a free-roaming torus, but the game wants to feel like a classic auto-scroller. The arcade scroll box squares that: there is no fixed scroll axis, the player <em>chooses</em> one by pushing into the edge of the screen, and stops by pulling back. Cruising is fast, guns face the scroll; stopping gives slow, free movement.</p>" +
    "<p>Those two states, flight and mech, are what the enemy design targets: Kamikazes hunt flight, Cordons deny it (see [[npc-roster]]). Direct (twin-stick) and thrust (Asteroids) handling exist as alternative strategies, with a heading mode that can lock the ship's facing to a compass direction.</p>",

  how:
    "<h3>Arcade: the scroll box</h3>" +
    "<p>State is <code>scrolling</code> or <code>stopped</code>; a new ship starts <em>scrolling</em> east. The box half-size is 10% of the 360-wu viewport height (36 wu) while scrolling and 360 wu while stopped.</p>" +
    "<ul>" +
    "<li><b>Stopped</b>: velocity = input &times; <code>STOPPED_SPEED</code> 200, no inertia, ship snaps to face the input. An edge triggers when input is past the 0.1 dead zone and the offset is at least 95% of the half-size on that side. A corner triggers when <code>|x|/hw + |y|/hh &ge; 1.75 &times; 0.95</code>, which makes the box an octagon. Triggering calls <code>startScrolling</code> with 0, 90, 180, 270&deg; or the diagonal: the box shrinks to 36 wu and is re-centred just behind the ship.</li>" +
    "<li><b>Scrolling</b>: the box centre advances at <code>SCROLL_SPEED</code> 200 along the heading and follows the ship sideways. Ship velocity = <code>heading &times; (200 + adj) + perp &times; lateral &times; 200</code>, with <code>adj = +100 &times; forward</code> or <code>+300 &times; forward</code> when pulling back, so braking is three times stronger than boosting. Forward push is ignored at the front edge.</li>" +
    "<li>Pulling back to the rear edge stops the ship (velocity zeroed). A terrain bounce forces stopped. Releasing all keys re-centres the box on the ship.</li>" +
    "</ul>" +
    "<p>Camera target: scrolling, <code>heading &times; 92 + perp &times; lateralNorm &times; 92 &times; 0.5</code>; stopped, <code>offset / half &times; 92</code>. While scrolling, weapons aim along the scroll heading.</p>" +
    "<h3>Direct and thrust</h3>" +
    "<p><code>PlayerMovementSystem</code> swaps strategy objects by control mode.</p>" +
    "<ul>" +
    "<li><b>Direct</b>: <code>v += normalize(input) &times; acceleration &times; dt</code> (1200 wu/s&sup2;). The control angle turns toward the input; with <code>normalizedTurn</code> each frame closes the gap by the ease-out <code>t(2&minus;t)</code> of <code>t = dt / turnTime</code> (0.15 s). The sprite faces the velocity above 10 wu/s.</li>" +
    "<li><b>Thrust</b>: left and right turn at <code>turnSpeed</code> 180&deg;/s; up and down thrust &plusmn;1 along the facing.</li>" +
    "<li>Shared: linear friction (0, so the ship drifts forever), speed clamp 400, sprite rotation lerp &times; 10.</li>" +
    "<li><b>Heading mode</b> from the level's [[play-contexts|play context]]: <code>free</code>, or a compass point (Corridor locks E, BossArena locks N) that pins <code>controlAngle</code>. In thrust a locked heading means you cannot turn at all.</li>" +
    "</ul>" +
    "<p>Direct's camera looks ahead 0&ndash;100 wu as speed rises from 300 to 400, stretched by the aspect ratio horizontally.</p>",

  knobs: [
    ["Control scheme", "arcade", "arcade, direct or thrust", "Player.json movement.controlScheme"],
    ["Scroll speed", "200 wu/s", "Box and cruise speed", "arcade/velocity.lua SCROLL_SPEED"],
    ["Boost / brake / lateral", "100 / 300 / 200", "Speed added forward, removed back, sideways", "SHIP_FORWARD_SPEED, SHIP_BACKWARD_SPEED, SHIP_LATERAL_SPEED"],
    ["Box half-size", "36 / 360 wu", "Scrolling and stopped box", "arcade.lua AREA_SCROLLING_HALF, AREA_STOPPED_HALF"],
    ["Edge ratio / octagon", "0.95 / 1.75", "How close to an edge or corner triggers", "arcade/edges.lua EDGE_TRIGGER_RATIO, OCTAGON_THRESHOLD"],
    ["Max speed / acceleration / friction", "400 / 1200 / 0", "Direct and thrust physics", "Player.json movement.*"],
    ["Turn time / turn speed", "0.15 s / 180°/s", "Direct and thrust turning", "Player.json turning.*"],
    ["Arcade look-ahead", "92 wu, lateral 0.5", "Camera offset in arcade mode", "engine/Lookahead.json arcadeMaxOffset, arcadeLateralRatio"],
  ],

  related: [
    { id: "player-movement", how: "The playground's single handling model, for contrast." },
    { id: "encounter-spawner", how: "Reads scrolling or stopped to decide which enemies may spawn." },
    { id: "kamikaze-dive", how: "Reads the scroll heading and velocity to place its slots." },
    { id: "play-contexts", how: "Supplies the heading mode per level." },
    { id: "npc-roster", how: "Flight and mech are the targets of the Disrupt and Deny goals." },
  ],

  questions: [
    "How does the player learn the box exists? It is drawn only in a debug overlay.",
    "Flight starts at a full 200 wu/s instantly. Should it ramp?",
    "The stopped box is 720 wu across, wider than the 640-wu screen, so its side edges start off screen. Is that intended?",
    "Touch controls, and how a mode change is signalled to the player.",
  ],

  sparks: [
    "Edge-push to auto-run in any top-down explorer: cheap travel in a direction the player picked.",
    "A two-stance ship: flight is fast with guns locked forward, mech is slow with free aim, and the stance is the build decision.",
    "Enemies that shrink your box, so the edge that starts flight is never quite reachable.",
    "Handling as a biome property: an ice zone switches you to thrust physics.",
  ],

  terms: [
    { term: "Arcade mode", def: "The default control strategy built on the scroll box.", code: "ControlMode.ARCADE" },
    { term: "Scroll box / trigger box", def: "The box around the ship whose edges switch between flight and mech.", code: "areaWorldX, areaHalfWidth" },
    { term: "Flight / mech", def: "Arcade scrolling and stopped states.", code: "ArcadeMovement.state" },
    { term: "Scroll heading", def: "The direction the box is scrolling.", code: "scrollHeading" },
    { term: "Heading mode", def: "Free, or a compass point that pins the control angle.", code: "headingMode, facing.controlAngle" },
    { term: "Normalized turn", def: "Every turn takes the same time regardless of angle.", code: "normalizedTurn, turnTime" },
  ],

  sources: [
    "shmuprouge:game/systems/movement/arcade.lua",
    "shmuprouge:game/systems/movement/arcade/edges.lua",
    "shmuprouge:game/systems/movement/arcade/velocity.lua",
    "shmuprouge:game/systems/movement/direct.lua",
    "shmuprouge:game/systems/movement/thrust.lua",
    "shmuprouge:game/systems/movement/physics.lua",
    "shmuprouge:game/play_context.lua",
    "shmuprouge:shared/data/entities/Player.json",
    "shmuprouge:docs/systems/Control.md",
  ],

  toy: {
    title: "Push the edge",
    hint: "hold the pointer away from the ship: it acts as the arrow keys",
    caption: "0.6 scale, so the stage is the viewport. The pointer's direction from the ship is quantised to eight-way keys (the d-pad, bottom right). The box is green while scrolling, violet while stopped. Arcade omits the diagonal input remap; thrust borrows direct's camera.",
    w: 384, h: 216,
    controls: [
      { type: "select", key: "mode", label: "control", value: "arcade", reset: true, options: [["arcade", "arcade (default)"], ["direct", "direct"], ["thrust", "thrust"]] },
      { type: "select", key: "headingMode", label: "heading", value: "free", options: [["free", "free"], ["N", "N"], ["E", "E"], ["S", "S"], ["W", "W"], ["NE", "NE"]] },
      { type: "toggle", key: "norm", label: "normalized turn", value: true },
    ],
    init(S, P) {
      S.x = 0; S.y = 0; S.vx = P.mode === "arcade" ? 200 : 0; S.vy = 0; S.state = "scrolling"; S.head = 0; S.ax = -36; S.ay = 0; S.half = 36; S.had = false;
      S.ctrl = 0; S.rot = 0; S.face = 0; S.camx = 92; S.camy = 0; S.ix = 0; S.iy = 0; S.trail = []; S.held = null;
    },
    pointer(e, S) { S.held = e.down ? [e.x, e.y] : null; },
    update(S, P, dt) {
      const k = 0.6;
      let ix = 0, iy = 0;
      if (S.held) {
        const dx = S.held[0] - (192 + (S.x - S.camx) * k), dy = S.held[1] - (108 + (S.y - S.camy) * k), d = Math.hypot(dx, dy);
        if (d > 8) { if (Math.abs(dx) > 0.38 * d) ix = Math.sign(dx); if (Math.abs(dy) > 0.38 * d) iy = Math.sign(dy); }
      }
      S.ix = ix; S.iy = iy;
      const CARD = { N: -Math.PI / 2, NE: -Math.PI / 4, E: 0, S: Math.PI / 2, W: Math.PI };
      let tcx = 0, tcy = 0;
      if (P.mode === "arcade") {
        const has = ix || iy, keyUp = S.had && !has;
        const hx = Math.cos(S.head), hy = Math.sin(S.head), px = hy, py = -hx;
        if (S.state === "scrolling") {
          S.ax += hx * 200 * dt; S.ay += hy * 200 * dt;
          const lo = (S.x - S.ax) * px + (S.y - S.ay) * py; S.ax += lo * px; S.ay += lo * py;
          if (keyUp) { S.ax = S.x; S.ay = S.y; }
        } else if (keyUp) { S.ax = S.x; S.ay = S.y; }
        S.had = has;
        const ox = S.x - S.ax, oy = S.y - S.ay, h = S.half;
        if (S.state === "scrolling") {
          const fwd = ix * hx + iy * hy, lat = ix * px + iy * py, fo = ox * hx + oy * hy;
          const maxF = h * Math.abs(hx) + h * Math.abs(hy);
          if (fwd < -0.1 && fo <= -maxF * 0.95) { S.state = "stopped"; S.half = 360; S.ax = S.x; S.ay = S.y; S.vx = 0; S.vy = 0; }
          else {
            let f = fwd; if (f > 0.1 && fo >= maxF * 0.95) f = 0;
            const adj = f > 0 ? f * 100 : f * 300;
            S.vx = hx * (200 + adj) + px * lat * 200; S.vy = hy * (200 + adj) + py * lat * 200;
          }
        } else {
          S.vx = ix * 200; S.vy = iy * 200;
          if (has) S.rot = S.face = Math.atan2(iy, ix);
          const rx = Math.abs(ox) / h, ry = Math.abs(oy) / h, cr = rx + ry;
          let nh = null;
          const outX = (ox > 0 && ix > 0.1) || (ox < 0 && ix < -0.1), outY = (oy > 0 && iy > 0.1) || (oy < 0 && iy < -0.1);
          if (cr >= 1.75 * 0.95 && (outX || outY)) nh = Math.atan2(Math.sign(oy) || 1, Math.sign(ox) || 1);
          else if (cr < 1.75 && ix > 0.1 && ox >= h * 0.95) nh = 0;
          else if (cr < 1.75 && iy > 0.1 && oy >= h * 0.95) nh = Math.PI / 2;
          else if (cr < 1.75 && ix < -0.1 && ox <= -h * 0.95) nh = Math.PI;
          else if (cr < 1.75 && iy < -0.1 && oy <= -h * 0.95) nh = -Math.PI / 2;
          if (nh != null) {
            S.head = nh; S.rot = S.face = nh; S.half = 36; S.state = "scrolling";
            S.ax = S.x - Math.cos(nh) * 36; S.ay = S.y - Math.sin(nh) * 36; S.vx = Math.cos(nh) * 200; S.vy = Math.sin(nh) * 200;
          }
        }
        if (S.state === "scrolling") S.rot = S.face = S.head;
        const ox2 = S.x - S.ax, oy2 = S.y - S.ay;
        if (!ix && !iy) { if (S.state === "scrolling") { tcx = Math.cos(S.head) * 92; tcy = Math.sin(S.head) * 92; } }
        else if (S.state === "scrolling") {
          const hx2 = Math.cos(S.head), hy2 = Math.sin(S.head), ln = (ox2 * hy2 - oy2 * hx2) / S.half;
          tcx = hx2 * 92 + hy2 * ln * 46; tcy = hy2 * 92 - hx2 * ln * 46;
        } else { tcx = ox2 / S.half * 92; tcy = oy2 / S.half * 92; }
        S.ctrl = S.rot;
      } else {
        const locked = P.headingMode !== "free";
        if (P.mode === "direct") {
          if (locked) S.ctrl = CARD[P.headingMode];
          else if (ix || iy) {
            const tgt = Math.atan2(iy, ix); let diff = Math.atan2(Math.sin(tgt - S.ctrl), Math.cos(tgt - S.ctrl)); const ad = Math.abs(diff);
            let amt;
            if (P.norm) { const t = Math.min(1, dt / 0.15); amt = ad * t * (2 - t); }
            else { const t = Math.min(1, ad / Math.PI); amt = Math.PI / 0.15 * dt * (0.5 + 1.5 * t * (2 - t)); }
            S.ctrl = ad <= amt ? tgt : S.ctrl + Math.sign(diff) * amt;
          }
          if (ix || iy) { const l = Math.hypot(ix, iy); S.vx += ix / l * 1200 * dt; S.vy += iy / l * 1200 * dt; }
        } else {
          if (locked) S.ctrl = CARD[P.headingMode];
          else if (ix) S.ctrl += ix * Math.PI * dt;
          const th = iy < 0 ? 1 : iy > 0 ? -1 : 0;
          if (th) { S.vx += Math.cos(S.ctrl) * th * 1200 * dt; S.vy += Math.sin(S.ctrl) * th * 1200 * dt; }
        }
        const sp = Math.hypot(S.vx, S.vy);
        if (sp > 400) { S.vx *= 400 / sp; S.vy *= 400 / sp; }
        if (sp < 1) { S.vx = 0; S.vy = 0; }
        if (P.mode === "direct") { if (sp > 10) S.face = Math.atan2(S.vy, S.vx); } else S.face = S.ctrl;
        let rd = Math.atan2(Math.sin(S.face - S.rot), Math.cos(S.face - S.rot)); S.rot += rd * Math.min(1, 10 * dt);
        const t = Math.max(0, Math.min(1, (sp - 300) / 100));
        if (sp >= 1) { tcx = S.vx / sp * t * 100 * 16 / 9; tcy = S.vy / sp * t * 100; }
      }
      S.x += S.vx * dt; S.y += S.vy * dt;
      const f = Math.min(1, 3 * dt);
      S.camx += (S.x + tcx - S.camx) * f; S.camy += (S.y + tcy - S.camy) * f;
      S.tt = (S.tt || 0) + dt;
      if (S.tt > 0.08) { S.tt = 0; S.trail.push([S.x, S.y]); if (S.trail.length > 40) S.trail.shift(); }
    },
    draw(g, S, P) {
      const C = g.C, k = 0.6, X = (x) => 192 + (x - S.camx) * k, Y = (y) => 108 + (y - S.camy) * k;
      g.clear();
      const gs = 80, ox = ((-(S.camx - 320) % gs) + gs) % gs, oy = ((-(S.camy - 180) % gs) + gs) % gs;
      for (let x = ox; x < 640; x += gs) g.line(x * k, 0, x * k, 216, C.rule, 1);
      for (let y = oy; y < 360; y += gs) g.line(0, y * k, 384, y * k, C.rule, 1);
      S.trail.forEach(([x, y], i) => g.rect(X(x) - 1, Y(y) - 1, 2, 2, i % 2 ? C.ink3 : C.ink2));
      if (P.mode === "arcade") {
        const col = S.state === "scrolling" ? C.accent : C.violet, h = S.half * k;
        if (S.state === "stopped") {
          const c = 1.75 * 0.95 - 1, cx = X(S.ax), cy = Y(S.ay);
          g.poly([[cx - c * h, cy - h], [cx + c * h, cy - h], [cx + h, cy - c * h], [cx + h, cy + c * h], [cx + c * h, cy + h], [cx - c * h, cy + h], [cx - h, cy + c * h], [cx - h, cy - c * h]], col, 1, true);
        } else g.rect(X(S.ax) - h, Y(S.ay) - h, h * 2, h * 2, col, 1);
      }
      const x = X(S.x), y = Y(S.y), r = S.rot;
      if (P.mode !== "arcade") g.line(x, y, x + Math.cos(S.ctrl) * 18, y + Math.sin(S.ctrl) * 18, C.enemy, 1);
      g.poly([[x + Math.cos(r) * 7, y + Math.sin(r) * 7], [x + Math.cos(r + 2.5) * 5, y + Math.sin(r + 2.5) * 5], [x + Math.cos(r - 2.5) * 5, y + Math.sin(r - 2.5) * 5]], C.ink);
      // d-pad
      const dx = 360, dy = 192;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.rect(dx + a * 8 - 3, dy + b * 8 - 3, 6, 6, (a && a === S.ix) || (b && b === S.iy) ? C.accent : C.ink3, (a && a === S.ix) || (b && b === S.iy) ? 0 : 1);
    },
    readout(S, P) {
      const sp = Math.hypot(S.vx, S.vy);
      return P.mode + (P.mode === "arcade" ? "  " + (S.state === "scrolling" ? "SCROLLING (flight)" : "STOPPED (mech)") : "  heading " + P.headingMode) + "\nspeed " + sp.toFixed(0) + " wu/s";
    },
  },
});
