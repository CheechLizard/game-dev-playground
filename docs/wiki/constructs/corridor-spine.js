Wiki.construct({
  id: "corridor-spine",
  name: "Corridor spine and branches",
  family: "structure",
  origin: "shmuprouge",
  status: "spec",
  statusNote: "Spec only (Levels_Overview.md Corridor and Procedural Generation). No segment library, generator or corridor stage exists; CorridorBounds, the camera bounds a corridor would use, is defined but never created.",
  summary: "A corridor is a guaranteed spine of tag-compatible segments from entrance to boss gate, with optional branches rolled at each interior node that either rejoin the spine or dead-end in a reward.",
  tags: ["procedural", "graph", "segments", "risk/reward"],

  intent:
    "<p>The corridor has to get the player to the boss every time, and it should still offer choices. The Dead Cells answer is a fixed-length main path per difficulty tier, so a run's pacing is predictable, with side paths that cost time and danger and pay in modules, upgrades or secrets.</p>" +
    "<p>Building it from authored segments joined by tagged connections keeps each piece hand-made while the arrangement changes every seed.</p>",

  how:
    "<h3>Inputs</h3>" +
    "<p><code>spine_length</code>, <code>branch_probability</code>, <code>max_branch_depth</code>, <code>environment_type</code> (inherited from the arena). The stage table also names <code>branch_count</code> and <code>branch_depth</code>; the algorithm uses the probability form.</p>" +
    "<h3>Algorithm</h3>" +
    "<ol>" +
    "<li><b>Spine</b>: a linear sequence of <code>spine_length</code> nodes; each segment is picked from the pool so its connection tags match the previous one (<code>wide_passage</code> to <code>wide_passage</code>). The first node is the Entrance; the last connects to the Boss Gate.</li>" +
    "<li><b>Branches</b>: for each spine node except the first and last, roll <code>branch_probability</code>. On success grow up to <code>max_branch_depth</code> segments, then either reconnect downstream (a loop) or dead-end with a reward.</li>" +
    "<li><b>Validate</b>: the main path is traversable and every connection is satisfied.</li>" +
    "<li><b>Instantiate</b>: place segments in space from their connection points, populate spawns, set transition triggers.</li>" +
    "</ol>" +
    "<h3>Segment schema</h3>" +
    "<p><code>Connection { id, edge: N|S|E|W, position: 0..1, direction: In|Out|Bidirectional, tags[] }</code>. Corridor segments have 1&ndash;4 connections. <code>SegmentMetadata { difficulty: 0..1, tags, author, version }</code>. <code>SpawnData { enemies, resources, hazards, portal_site? }</code>. Same seed, same segments and spawn locations.</p>" +
    "<p>The [[portal-stitching|portal bubble]] spec gives corridors eight scroll directions including diagonals; the existing <code>CorridorBounds</code> supports only horizontal and vertical.</p>",

  knobs: [
    ["Spine length", "TBD per tier", "Segments from entrance to boss gate", "spine_length"],
    ["Branch probability", "TBD", "Chance per interior spine node", "branch_probability"],
    ["Max branch depth", "TBD", "Longest branch", "max_branch_depth"],
    ["Tags", "e.g. wide_passage", "Which connections may join", "Connection.tags"],
  ],

  related: [
    { id: "level-loop", how: "The corridor is the second stage of the loop." },
    { id: "portal-stitching", how: "Entry angle would set the corridor's direction." },
    { id: "crate-haul", how: "The gauntlet where towed crates are at risk." },
    { id: "world-gen-stack", how: "Corridors sit in the conceptual top layer of the world generation stack." },
  ],

  questions: [
    "How strict is tag matching? Exact tag, any shared tag, or a compatibility table?",
    "What makes branches worth the risk, and how does the reward scale with depth?",
    "How does a segment's difficulty rating combine with the level's progression?",
    "Can a branch reconnect upstream (a backtrack loop), or only downstream?",
  ],

  sparks: [
    "Let a scanner reveal what is at the end of each branch, so information is the thing you buy.",
    "In a destructible world, let the player blast a shortcut between spine and branch, editing the graph by hand.",
    "A tag grammar as a design language for any segment-based generator: rooms, roads, songs.",
  ],

  terms: [
    { term: "Spine", def: "Spec: the guaranteed main path from entrance to boss gate." },
    { term: "Branch", def: "Spec: an optional path off a spine node; loops back or dead-ends." },
    { term: "Connection", def: "Spec: an edge point on a segment with direction and tags.", code: "Connection {edge, position, direction, tags}" },
    { term: "Tag matching", def: "Spec: two connections join only when their tags are compatible." },
    { term: "Boss Gate", def: "Spec: the exit from the last spine node into the boss stage." },
  ],

  sources: [
    "shmuprouge:docs/levels/Levels_Overview.md",
    "shmuprouge:docs/design/World_Generation_Stack_Design_v0_1.md",
    "shmuprouge:engine/rendering/camera/corridor_bounds.lua",
  ],

  toy: {
    title: "Grow a corridor",
    hint: "change the sliders, then reseed",
    caption: "A toy pool of six segments with one in-tag and one out-tag each; edge colour is the tag. Rejoin chance is an extra knob the spec implies but does not name. Validation is trivial here because the spine is built first.",
    w: 384, h: 216,
    static: true,
    controls: [
      { type: "range", key: "len", label: "spine", min: 3, max: 12, value: 7, reset: true },
      { type: "range", key: "p", label: "branch p", min: 0, max: 100, value: 45, fmt: "{}%", reset: true },
      { type: "range", key: "depth", label: "max depth", min: 1, max: 4, value: 2, reset: true },
      { type: "range", key: "rejoin", label: "rejoin", min: 0, max: 100, value: 50, fmt: "{}%", reset: true },
      { type: "button", label: "reseed", press(S, P, kit) { S.seed++; S.regen(S, P, kit); } },
    ],
    init(S, P, kit) { S.seed = S.seed || 1; S.regen = this.gen.bind(this); this.gen(S, P, kit); },
    gen(S, P, kit) {
      const r = kit.rng(S.seed * 7919);
      const pool = [["wide", "wide"], ["wide", "narrow"], ["narrow", "narrow"], ["narrow", "vent"], ["vent", "wide"], ["vent", "vent"]];
      S.spine = []; let tag = "wide";
      for (let i = 0; i < P.len; i++) {
        const ok = pool.filter((s) => s[0] === tag);
        const seg = r.pick(ok); S.spine.push({ in: seg[0], out: seg[1] }); tag = seg[1];
      }
      S.branches = []; S.rewards = 0; S.loops = 0;
      for (let i = 1; i < P.len - 1; i++) {
        if (r() * 100 >= P.p) continue;
        const n = 1 + Math.floor(r() * P.depth), segs = []; let t = S.spine[i].out;
        for (let k = 0; k < n; k++) { const seg = r.pick(pool.filter((s) => s[0] === t)); segs.push(seg); t = seg[1]; }
        const target = i + 1 + Math.floor(r() * 2);
        const rejoin = target < P.len && r() * 100 < P.rejoin;
        S.branches.push({ from: i, segs, to: rejoin ? target : -1, up: S.branches.length % 2 === 0 });
        if (rejoin) S.loops++; else S.rewards++;
      }
    },
    update() {},
    draw(g, S, P) {
      const C = g.C; g.clear();
      const col = { wide: C.sky, narrow: C.gold, vent: C.violet };
      const n = S.spine.length, x0 = 30, x1 = 340, sy = 120;
      const X = (i) => x0 + (x1 - x0) * (n === 1 ? 0 : i / (n - 1));
      for (let i = 0; i < n - 1; i++) g.line(X(i), sy, X(i + 1), sy, col[S.spine[i].out], 3);
      g.arrow(X(n - 1), sy, 372, sy, col[S.spine[n - 1].out], 3);
      g.label("BOSS", 372, sy - 8, C.enemy, "right");
      for (const b of S.branches) {
        const dir = b.up ? -1 : 1, step = 20;
        let px = X(b.from), py = sy;
        b.segs.forEach((seg, k) => {
          const nx = X(b.from) + (b.to >= 0 ? (X(b.to) - X(b.from)) * (k + 1) / (b.segs.length + 1) : 6 * (k + 1)), ny = sy + dir * step * (k + 1);
          g.line(px, py, nx, ny, col[seg[0]], 2); g.rect(nx - 4, ny - 4, 8, 8, C.ink2); px = nx; py = ny;
        });
        if (b.to >= 0) g.line(px, py, X(b.to), sy, col[b.segs[b.segs.length - 1][1]], 2, [3, 2]);
        else { g.rect(px - 5, py + dir * 8 - 4, 10, 8, C.gold); g.label("REWARD", px + 8, py + dir * 8 + 3, C.gold); }
      }
      for (let i = 0; i < n; i++) {
        g.circle(X(i), sy, 6, i === 0 ? C.accent : C.ink);
        g.circle(X(i), sy, 6, col[S.spine[i].in], 2);
      }
      g.label("ENTRANCE", x0 - 6, sy + 18, C.accent);
      let lx = 220;
      for (const k of ["wide", "narrow", "vent"]) { g.rect(lx, 22, 10, 3, col[k]); g.label(k.toUpperCase(), lx + 13, 26, C.ink2); lx += 54; }
    },
    readout(S) { return "seed " + S.seed + "   branches " + S.branches.length + "\nloops " + S.loops + "   dead ends " + S.rewards; },
  },
});
