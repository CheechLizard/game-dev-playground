Wiki.construct({
  id: "level-loop",
  name: "Level loop: arena, corridor, boss, store",
  family: "structure",
  origin: "shmuprouge",
  status: "partial",
  statusNote: "Only the arena is built: a level JSON sets its size in 256-wu chunks and ArenaBounds wraps positions and distances toroidally. There is no corridor, boss or store stage, no stage transition and no backtracking; CorridorBounds exists but nothing creates one.",
  summary: "A level is one pass through four stage types (free-roaming toroidal arena, linear corridor, fixed boss room, store) with unlimited backtracking between stages you have unlocked, in runs of about 25 minutes.",
  tags: ["run structure", "toroidal", "pacing", "backtracking"],

  intent:
    "<p>Four stages, four paces: the arena is free roaming, the corridor a gauntlet with a direction, the boss a set piece and the store a safe pause. Alternating open and linear space keeps a run from settling into one rhythm, and \"backtrack anywhere\" gives the loop a reason to look back: dropped loot, an unexplored branch, a stronger build.</p>" +
    "<p>The arena wraps at its edges, Defender and Hunter's Moon style, so it never has a wall to hide against and the corridor's hard edges feel different by contrast.</p>",

  how:
    "<h3>The four stages (Levels_Overview.md)</h3>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>Stage</th><th>Space</th><th>Properties</th></tr></thead><tbody>" +
    "<tr><td>Arena</td><td>One toroidal segment; harvest, fight, unlock the exit</td><td><code>environment_type</code>, <code>dimensions</code>, <code>portal_cost</code>, <code>segment_id</code></td></tr>" +
    "<tr><td>Corridor</td><td>[[corridor-spine|Spine and branches]], directional bias</td><td><code>spine_length</code>, <code>branch_count</code>, <code>branch_depth</code></td></tr>" +
    "<tr><td>Boss</td><td>One fixed segment; may or may not wrap</td><td><code>boss_id</code>, <code>segment_id</code>, <code>dimensions</code></td></tr>" +
    "<tr><td>Store</td><td>Fixed UI ([[store-gambling]])</td><td><code>inventory_pool</code>, <code>pricing_tier</code></td></tr>" +
    "</tbody></table></div>" +
    "<p>Run rules: about 25 minutes; levels rise in difficulty; backtracking is unlimited between unlocked stages; built portals persist for the run; an endless mode escalates portal costs. Seeds fix segment choice, placement and spawn <em>locations</em>; timing still varies with play.</p>" +
    "<h3>The arena (built)</h3>" +
    "<p><code>game_init.lua</code> builds <code>ArenaBounds.new(widthChunks, heightChunks)</code> from the level JSON (<code>alpha_arena</code> is 50 &times; 50 chunks of 256 wu, a 12,800 wu square). <code>ArenaBounds:wrap</code> folds a position back into the square with a modulo; <code>wrapDelta</code> returns the shortest offset between two points by subtracting the world size when a component exceeds half of it. Gravity, proximity checks and spawns use the wrapped delta, so something just past the right edge is near you, not 12,000 wu away.</p>" +
    "<p><code>CorridorBounds</code> offers the same interface without wrapping, horizontal or vertical only. It is exported from the camera module and never instantiated.</p>" +
    "<h3>Two orders of events</h3>" +
    "<p>Game_Overview: arena (bar fills, stripes become [[crate-haul|crates]]) &rarr; corridor &rarr; boss &rarr; store &rarr; backtrack for dropped crates. Solar_System_Arena: arena under constant [[fuel]] pressure &rarr; bar fills, [[portal-stitching|portal]] activates &rarr; entry angle picks one of eight corridors &rarr; success to shop and back to the <em>same</em> arena, abort risks an [[escaped-boss]] &rarr; repeat until eight bosses, then the sun. The second is a hub with spokes rather than a chain.</p>",

  knobs: [
    ["Arena size", "50 x 50 chunks (alpha_arena)", "Toroidal world size", "level JSON size.widthChunks/heightChunks"],
    ["Chunk size", "256 wu", "Unit of arena and corridor dimensions", "Constants.CHUNK_SIZE_WU"],
    ["Run length", "~25 min", "Target per run (spec)", "Levels_Overview.md"],
    ["Corridor direction", "horizontal | vertical", "CorridorBounds orientation; no diagonals", "CorridorBounds.new(..., direction)"],
  ],

  related: [
    { id: "corridor-spine", how: "How the corridor stage would be generated." },
    { id: "portal-stitching", how: "The arena-to-corridor transition, in two competing versions." },
    { id: "solar-system-arena", how: "The arena stage as the Solar System docs describe it." },
    { id: "store-gambling", how: "The store stage." },
    { id: "escaped-boss", how: "What leaving the corridor early can cost." },
  ],

  questions: [
    "Chain or hub? Levels_Overview runs arena to store once per level; the Solar System docs return to the same arena eight times.",
    "What unlocks the arena's exit: building a portal at a construction site, or filling the harvest bar?",
    "How do segment difficulty ratings combine with level progression?",
    "What persists between runs? Game_Overview leaves meta-progression TBD; Solar_System_Arena lists ship, drone and codex unlocks.",
  ],

  sparks: [
    "Use the wrap/no-wrap contrast deliberately: open toroidal hubs for choice, bounded corridors for commitment.",
    "Persistent built portals as in-run shortcuts, like elevators that stay unlocked once ridden.",
    "Let the store grow as a graph from what you bought, so the shop itself becomes part of the build.",
  ],

  terms: [
    { term: "Level", def: "One pass through arena, corridor, boss and store." },
    { term: "Stage", def: "One of the four space types in a level." },
    { term: "Segment", def: "Spec: an authored spatial unit with connections; stages are made of segments.", code: "Segment schema (Levels_Overview.md)" },
    { term: "Toroidal arena", def: "An arena whose edges wrap; distances use the shortest wrapped offset.", code: "ArenaBounds:wrap, ArenaBounds:wrapDelta" },
    { term: "Backtracking", def: "Spec: unlimited travel back to any unlocked stage." },
  ],

  sources: [
    "shmuprouge:docs/levels/Levels_Overview.md",
    "shmuprouge:docs/Game_Overview.md",
    "shmuprouge:docs/levels/solar_system/Solar_System_Arena.md",
    "shmuprouge:engine/rendering/camera/arena_bounds.lua",
    "shmuprouge:engine/rendering/camera/corridor_bounds.lua",
    "shmuprouge:game/game_init.lua",
    "shmuprouge:shared/data/world/levels/alpha_arena.json",
  ],

  toy: {
    title: "The wrapping arena and the loop around it",
    hint: "drag the ship in the arena; the line to the beacon takes the short way round",
    caption: "Left: the built part, ArenaBounds wrap and wrapDelta on a small square. Right: the spec loop; the token walks the stages and backtracks when you toggle it. Stage times are an invented split of 25 minutes.",
    w: 384, h: 216,
    controls: [
      { type: "toggle", key: "wrap", label: "wrapDelta", value: true },
      { type: "toggle", key: "back", label: "backtrack", value: false },
      { type: "range", key: "speed", label: "run speed", min: 1, max: 20, value: 6, fmt: "{}x" },
    ],
    init(S) {
      S.A = { x: 20, y: 40, w: 150, h: 150 };
      S.px = 150; S.py = 70; S.bx = 30; S.by = 170; S.drag = false;
      S.stage = 0; S.t = 0; S.clock = 0; S.trail = [];
    },
    pointer(e, S) {
      const A = S.A;
      if (e.type === "down" && e.x < A.x + A.w + 10) S.drag = true;
      if (e.type === "up") S.drag = false;
      if (S.drag && e.down) {
        // positions outside the square fold back in, as ArenaBounds:wrap does
        S.px = ((e.x - A.x) % A.w + A.w) % A.w + A.x;
        S.py = ((e.y - A.y) % A.h + A.h) % A.h + A.y;
      }
    },
    update(S, P, dt) {
      const dur = [10, 8, 4, 3]; // minutes per stage: arena, corridor, boss, store
      S.t += dt * P.speed / 6; S.clock += dt * P.speed / 6;
      if (S.t >= dur[S.stage] / 3) {
        S.t = 0;
        if (P.back) S.stage = Math.max(0, S.stage - 1);
        else S.stage = (S.stage + 1) % 4;
      }
    },
    draw(g, S, P) {
      const C = g.C, A = S.A; g.clear();
      g.tone(A.x, A.y, A.w, A.h, 0.1, C.ink3); g.rect(A.x, A.y, A.w, A.h, C.ink3, 1);
      g.label("ARENA (TORUS)", A.x, A.y - 4, C.ink2);
      let dx = S.bx - S.px, dy = S.by - S.py;
      if (P.wrap) { if (dx > A.w / 2) dx -= A.w; if (dx < -A.w / 2) dx += A.w; if (dy > A.h / 2) dy -= A.h; if (dy < -A.h / 2) dy += A.h; }
      // draw the delta, splitting at the edges so it reappears on the far side
      const ctx = g.ctx; ctx.save(); ctx.beginPath(); ctx.rect(A.x, A.y, A.w, A.h); ctx.clip();
      for (const ox of [-A.w, 0, A.w]) for (const oy of [-A.h, 0, A.h]) g.line(S.px + ox, S.py + oy, S.px + dx + ox, S.py + dy + oy, C.accent, 1, [3, 2]);
      ctx.restore();
      g.circle(S.bx, S.by, 5, C.gold); g.circle(S.px, S.py, 5, C.accent);
      g.label("DIST " + Math.round(Math.hypot(dx, dy)), A.x + A.w, A.y + A.h + 12, C.ink2, "right");
      // loop diagram
      const names = ["ARENA", "CORRIDOR", "BOSS", "STORE"], nx = [224, 300, 300, 224], ny = [64, 64, 150, 150];
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        g.arrow(nx[i] + (nx[j] - nx[i]) * 0.3, ny[i] + (ny[j] - ny[i]) * 0.3, nx[i] + (nx[j] - nx[i]) * 0.7, ny[i] + (ny[j] - ny[i]) * 0.7, C.ink3, 1);
      }
      for (let i = 0; i < 4; i++) {
        const on = S.stage === i;
        if (on) g.tone(nx[i] - 34, ny[i] - 12, 68, 24, 0.4, C.accent);
        g.rect(nx[i] - 34, ny[i] - 12, 68, 24, on ? C.accent : C.ink3, 1);
        g.label(names[i], nx[i], ny[i] + 3, C.ink, "center");
      }
      if (P.back) g.label("BACKTRACKING", 262, 110, C.gold, "center");
      g.label("STORE -> NEXT LEVEL", 262, 196, C.ink3, "center");
      g.label("RUN " + Math.floor(S.clock * 3) % 25 + " / 25 MIN", 262, 36, C.ink2, "center");
    },
    readout(S) { return ""; },
  },
});
