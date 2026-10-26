Wiki.construct({
  id: "voronoi-walkers",
  name: "Voronoi walkers: the spider mech",
  family: "agents",
  origin: "shmuprouge",
  status: "partial",
  statusNote: "Built: the nav graph, BFS pursuit, idle wandering, occupancy, and the six-legged tripod gait on asteroid vertices. Spec only (<code>docs/plans/Mesh_Surgery_and_Spider_Kill_Mechanics.md</code>): mesh surgery when an asteroid dies, and the kill puzzle where the shield drops once all six feet are gone. Today the mesh is static, so feet keep standing on rock that has been blasted away.",
  summary: "Six-legged mechs walk an asteroid field by planting their feet on asteroid vertices of a Delaunay mesh while their body follows a point travelling the Voronoi graph; the plan is to make the rocks under their feet their weak point.",
  tags: ["navigation", "Delaunay", "Voronoi", "procedural gait", "weak point"],

  intent:
    "<p>In zero gravity there is no ground, so a walking enemy needs something to walk on. The spider mech uses the asteroid field itself: its feet visibly grip rocks, and its route threads the gaps between them. That makes it read as territorial (it belongs to the belt) and sets up the planned twist: you cannot shoot it directly while it stands on rock, so you shoot the rock.</p>" +
    "<p>The same structure answers both questions. The Delaunay triangulation of asteroid centres gives the feet their footholds (vertices), and its Voronoi dual gives the body a road network through the widest gaps (circumcentres linked across shared edges).</p>",

  how:
    "<h3>The graph</h3>" +
    "<p>Asteroid positions come from the zone's [[asteroid-mesh]]: in the shipped biome, random scatter at <code>density</code> 0.00006 /wu&sup2; with <code>minSpacing</code> 60 wu and radius 14&ndash;25 wu. Each Delaunay triangle is a nav node located at its circumcentre; two nodes are linked if their triangles share an edge (<code>MeshNav.buildGraph</code>). Twelve spiders spawn when the player comes within <code>boundaryRadius + 200</code> of the <code>inner_belt</code> zone.</p>" +
    "<h3>The control point</h3>" +
    "<p>A control point moves node to node at <code>moveSpeed</code> 160 wu/s (<code>pathProgress += speed&middot;dt / edgeLength</code>). Within <code>detectionRange</code> 500 wu of the player it is in <b>aggro</b>: BFS to the player's nearest triangle, re-planned whenever that triangle changes. Triangles occupied by other spiders block the search; if the next step is taken, a go-left fallback picks the free neighbour with the largest cross product against the heading. Otherwise it is <b>idle</b> and steps to a random free neighbour every <code>idleWanderInterval</code> 4 s.</p>" +
    "<h3>The tripod gait</h3>" +
    "<ul>" +
    "<li>Six legs at body angles &plusmn;0.8, &plusmn;1.57, &plusmn;2.35 rad, in tripods A = {1, 3, 5} and B = {2, 4, 6}.</li>" +
    "<li>A <code>nextMove</code> governor chases the control point at <code>moveSpeed</code>. Each leg's rest position is <code>nextMove + angle &times; idealReach</code> (85 wu).</li>" +
    "<li>When no group is stepping, the group not stepped last steps if any of its feet is more than <code>stepThreshold</code> 50 wu from rest. Each stepping foot takes the nearest unreserved vertex within <code>maxLegReach</code> 100 wu of its rest position <em>and</em> inside that leg's 90&deg; arc relative to the heading. A leg with no vertex in reach stays unplanted.</li>" +
    "<li>Feet move linearly at <code>legMoveSpeed</code> 8 (progress per second) to <code>vertex.y &minus; radius &times; 1.4</code>. The body follows the centroid of planted feet exponentially at <code>bodyFollowSpeed</code> 6 and turns at <code>rotationFollowSpeed</code> 5. Knees bend by <code>kneeHeight</code> 15, alternating sides.</li>" +
    "</ul>" +
    "<h3>Planned: mesh surgery</h3>" +
    "<p>When an asteroid dies, remove its vertex locally: find its triangle fan through a <code>vertexToTriangles</code> index, walk the boundary polygon, ear-clip it choosing ears that maximise the minimum angle (degree ~6 gives 4 new triangles), tombstone the dead slots (<code>triangles[base+1] = 0</code>) and reuse them via <code>freeTriangles</code>, then patch Voronoi edges, the nav graph and the chunk index. Spiders whose path crosses a tombstone re-plan. Budget: one vertex per frame. Tombstones keep stored triangle ids valid.</p>" +
    "<h3>Planned: the kill puzzle</h3>" +
    "<p>The spider is <code>shielded</code>: hits are absorbed with a ripple and do no damage. When the asteroid under a foot dies, that leg is <code>destroyed</code> for good (limp, never steps) and <code>feetDestroyed</code> rises. At 6 the shield drops and normal health (5) applies.</p>",

  knobs: [
    ["Move speed", "160 wu/s", "Control point and governor speed", "SpiderMech.json moveSpeed"],
    ["Detection range", "500 wu", "Aggro radius", "detectionRange"],
    ["Idle wander", "4 s", "Interval between idle steps", "idleWanderInterval"],
    ["Ideal reach / step threshold", "85 / 50 wu", "Rest distance of a foot, and drift before it steps", "legs.idealReach, legs.stepThreshold"],
    ["Max leg reach", "100 wu", "Search radius for a foothold around the rest position", "legs.maxLegReach"],
    ["Health / contact damage", "5 / 30", "Hits to kill, damage on touch", "health, contactDamage"],
    ["Asteroid density", "0.00006 /wu², spacing 60", "How many footholds there are", "biomes/asteroid_field.json"],
  ],

  related: [
    { id: "asteroid-mesh", how: "The Delaunay/Voronoi structure the spider walks." },
    { id: "destructible-terrain", how: "Destroying rock should remove footholds; today it does not touch the mesh." },
    { id: "npc-roster", how: "The only terrain-navigating NPC, and a Territorial one." },
    { id: "crowd-separation", how: "Triangle occupancy is a coarse, exclusive form of separation." },
  ],

  questions: [
    "BFS ignores gap width. Should narrow gaps cost more, so big mechs avoid them? (<code>greedyNext</code> exists but is unused.)",
    "If a foot steps to a new rock before its old one dies, does it escape the count? The plan only counts feet whose rock dies.",
    "With all six legs destroyed, the body follows no feet and stops moving. Is a stranded, unshielded spider the intended end state?",
    "When a tripod steps, <code>tryStartGroup</code> frees the vertices of the whole group, including legs that are not moving, so a stepping foot can land on a rock a sibling still stands on. Two feet sharing one rock shows up in the toy too. Intended?",
    "At the shipped density a foot often finds no vertex in reach. Is a hovering leg acceptable, or should the reach scale with density?",
  ],

  sparks: [
    "Stepping-stone creatures for any graph world: lily pads, floating platforms, rooftops.",
    "Herding: shoot rocks to reshape the graph and steer walkers into a trap through their own re-planning.",
    "Shoot the ground, not the monster: terrain-anchored turrets that fall when you cut their footing.",
    "A player mech that can only move where there is rock, so mining your own path is also cutting off your mobility.",
  ],

  terms: [
    { term: "Nav graph", def: "Delaunay triangles as nodes at their circumcentres, linked across shared edges.", code: "MeshNav.buildGraph" },
    { term: "Control point", def: "The point that walks the nav graph; the body follows the feet, not this.", code: "controlX, controlY" },
    { term: "Tripod group", def: "The two sets of three legs that step alternately.", code: "GROUP_A, GROUP_B" },
    { term: "Leg arc", def: "The 90° sector, relative to heading, a leg may plant in.", code: "LEG_ARC_MIN, LEG_ARC_MAX" },
    { term: "Tombstone", def: "A dead triangle slot kept so stored ids stay valid (planned).", code: "triangles[base+1] = 0" },
    { term: "Shielded", def: "Immune until all six feet have lost their rock (planned).", code: "spider.shielded, feetDestroyed" },
  ],

  sources: [
    "shmuprouge:game/entities/spider_mech_legs.lua",
    "shmuprouge:game/entities/spider_mech_ai.lua",
    "shmuprouge:game/systems/ai/spider_mech_ai_system.lua",
    "shmuprouge:game/world/terrain/mesh_nav.lua",
    "shmuprouge:game/world/parallax/asteroid_mesh.lua",
    "shmuprouge:shared/data/entities/SpiderMech.json",
    "shmuprouge:docs/design/Asteroid_Mesh.md",
    "shmuprouge:docs/plans/Mesh_Surgery_and_Spider_Kill_Mechanics.md",
  ],

  toy: {
    title: "Tripod walker",
    hint: "click space to move the player; click rocks to destroy them; click the spider to shoot",
    caption: "0.4 px per wu; one spider, body drawn at half size. In built mode a destroyed rock leaves its vertex in the mesh, so feet keep landing on nothing. In spec mode the vertex is removed (the toy re-triangulates everything, where the plan patches locally), its foot dies, and the shield drops when all six are gone.",
    w: 384, h: 216,
    controls: [
      { type: "select", key: "mode", label: "rocks", value: "spec", reset: true, options: [["built", "built: mesh static"], ["spec", "spec: surgery + kill puzzle"]] },
      { type: "range", key: "dens", label: "density", min: 4, max: 16, value: 6, reset: true, fmt: "{}e-5" },
      { type: "toggle", key: "graph", label: "graph", value: true },
      { type: "toggle", key: "arcs", label: "leg arcs", value: false },
    ],
    init(S, P, kit) {
      const W = 960, H = 540, n = Math.round(W * H * P.dens * 1e-5);
      S.rocks = [];
      for (let tries = 0; S.rocks.length < n && tries < 5000; tries++) {
        const x = 30 + kit.rand() * (W - 60), y = 30 + kit.rand() * (H - 60);
        if (S.rocks.every((r) => Math.hypot(r.x - x, r.y - y) >= 60)) S.rocks.push({ x, y, r: 14 + kit.rand() * 11, dead: false, gone: false });
      }
      S.player = { x: 820, y: 420 };
      S.ripples = []; S.hp = 5; S.feetDead = 0; S.kills = 0; S.respawn = 0; S.idle = 0;
      this.rebuild(S);
      this.spawn(S, 0);
    },
    spawn(S, ti) {
      const t = S.tris[ti % S.tris.length];
      S.sp = { cur: S.tris.indexOf(t), tgt: -1, prog: 0, path: null, lastPT: -1, cx: t.cx, cy: t.cy, nx: t.cx, ny: t.cy, head: 0, bx: t.cx, by: t.cy, rot: 0, step: null, last: null, init: false,
        legs: [0, 1, 2, 3, 4, 5].map(() => ({ vi: -1, fx: t.cx, fy: t.cy, sx: 0, sy: 0, tx: 0, ty: 0, mov: false, p: 0, dead: false })) };
      S.hp = 5; S.feetDead = 0;
    },
    rebuild(S) {
      const pts = S.rocks.map((r, i) => ({ x: r.x, y: r.y, i })).filter((p) => !S.rocks[p.i].gone);
      const big = [{ x: -5000, y: -5000, i: -1 }, { x: 6000, y: -5000, i: -2 }, { x: 480, y: 6000, i: -3 }];
      const cc = (a, b, c) => {
        const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y)) || 1e-9;
        const ux = ((a.x * a.x + a.y * a.y) * (b.y - c.y) + (b.x * b.x + b.y * b.y) * (c.y - a.y) + (c.x * c.x + c.y * c.y) * (a.y - b.y)) / d;
        const uy = ((a.x * a.x + a.y * a.y) * (c.x - b.x) + (b.x * b.x + b.y * b.y) * (a.x - c.x) + (c.x * c.x + c.y * c.y) * (b.x - a.x)) / d;
        return { cx: ux, cy: uy, r2: (a.x - ux) ** 2 + (a.y - uy) ** 2 };
      };
      let tris = [Object.assign({ v: big }, cc(...big))];
      for (const p of pts) {
        const bad = tris.filter((t) => (p.x - t.cx) ** 2 + (p.y - t.cy) ** 2 < t.r2);
        const edges = [];
        for (const t of bad) for (let k = 0; k < 3; k++) {
          const e = [t.v[k], t.v[(k + 1) % 3]];
          const j = edges.findIndex((f) => (f[0] === e[1] && f[1] === e[0]) || (f[0] === e[0] && f[1] === e[1]));
          if (j >= 0) edges.splice(j, 1); else edges.push(e);
        }
        tris = tris.filter((t) => !bad.includes(t));
        for (const e of edges) tris.push(Object.assign({ v: [e[0], e[1], p] }, cc(e[0], e[1], p)));
      }
      tris = tris.filter((t) => t.v.every((v) => v.i >= 0) && t.cx > 0 && t.cx < 960 && t.cy > 0 && t.cy < 540);
      const emap = {};
      tris.forEach((t, ti) => { t.ids = t.v.map((v) => v.i); t.nb = []; for (let k = 0; k < 3; k++) { const a = t.ids[k], b = t.ids[(k + 1) % 3], key = Math.min(a, b) + "," + Math.max(a, b); (emap[key] = emap[key] || []).push(ti); } });
      for (const key in emap) { const l = emap[key]; if (l.length === 2) { tris[l[0]].nb.push(l[1]); tris[l[1]].nb.push(l[0]); } }
      S.tris = tris; S.edges = Object.keys(emap).map((k) => k.split(",").map(Number));
      if (S.sp) { S.sp.cur = this.nearest(S, S.sp.cx, S.sp.cy); S.sp.tgt = -1; S.sp.path = null; S.sp.lastPT = -1; }
    },
    nearest(S, x, y) { let b = 0, bd = 1e18; S.tris.forEach((t, i) => { const d = (t.cx - x) ** 2 + (t.cy - y) ** 2; if (d < bd) { bd = d; b = i; } }); return b; },
    bfs(S, a, b) {
      const prev = { [a]: -1 }, q = [a];
      while (q.length) { const c = q.shift(); if (c === b) break; for (const n of S.tris[c].nb) if (!(n in prev)) { prev[n] = c; q.push(n); } }
      if (!(b in prev)) return null;
      const path = []; for (let c = b; c !== a; c = prev[c]) path.unshift(c);
      return path;
    },
    pointer(e, S, P) {
      if (e.type !== "down" || !S.sp) return;
      const x = e.x / 0.4, y = e.y / 0.4, sp = S.sp;
      if (Math.hypot(sp.bx - x, sp.by - y) < 70) {
        if (P.mode === "spec" && S.feetDead < 6) S.ripples.push({ a: Math.atan2(y - sp.by, x - sp.bx), t: 0.4 });
        else if (S.respawn <= 0 && --S.hp <= 0) { S.kills++; S.respawn = 2; }
        return;
      }
      const rock = S.rocks.find((r) => !r.dead && Math.hypot(r.x - x, r.y - y) < r.r + 10);
      if (!rock) { S.player = { x, y }; return; }
      rock.dead = true;
      if (P.mode === "spec") {
        const vi = S.rocks.indexOf(rock);
        rock.gone = true;
        for (const L of sp.legs) if (L.vi === vi && !L.dead) { L.dead = true; L.vi = -1; S.feetDead++; }
        this.rebuild(S);
      }
    },
    update(S, P, dt, kit) {
      const sp = S.sp;
      for (const r of S.ripples) r.t -= dt;
      S.ripples = S.ripples.filter((r) => r.t > 0);
      if (S.respawn > 0) { S.respawn -= dt; if (S.respawn <= 0) this.spawn(S, (kit.rand() * S.tris.length) | 0); return; }
      if (!S.tris.length) return;
      if (sp.cur >= S.tris.length) sp.cur = 0;
      // control point along the graph
      if (sp.tgt < 0) {
        if (Math.hypot(S.player.x - sp.cx, S.player.y - sp.cy) < 500) {
          const pt = this.nearest(S, S.player.x, S.player.y);
          if (!sp.path || sp.lastPT !== pt) { sp.path = pt === sp.cur ? null : this.bfs(S, sp.cur, pt); sp.lastPT = pt; }
          if (sp.path && sp.path.length) { sp.tgt = sp.path.shift(); sp.prog = 0; }
        } else {
          S.idle -= dt;
          if (S.idle <= 0) { S.idle = 4; const nb = S.tris[sp.cur].nb; if (nb.length) { sp.tgt = nb[(kit.rand() * nb.length) | 0]; sp.prog = 0; } }
        }
      }
      if (sp.tgt >= 0) {
        const a = S.tris[sp.cur], b = S.tris[sp.tgt], L = Math.hypot(b.cx - a.cx, b.cy - a.cy);
        sp.prog += L > 0.01 ? 160 * dt / L : 1;
        if (L > 0.01) sp.head = Math.atan2(b.cy - a.cy, b.cx - a.cx);
        if (sp.prog >= 1) { sp.cur = sp.tgt; sp.tgt = -1; sp.cx = b.cx; sp.cy = b.cy; }
        else { sp.cx = a.cx + (b.cx - a.cx) * sp.prog; sp.cy = a.cy + (b.cy - a.cy) * sp.prog; }
      }
      // governor
      const gx = sp.cx - sp.nx, gy = sp.cy - sp.ny, gd = Math.hypot(gx, gy);
      if (gd > 0.1) { const s = Math.min(gd, 160 * dt); sp.nx += gx / gd * s; sp.ny += gy / gd * s; }
      this.legs(S, sp, dt);
      let rd = sp.head - sp.rot; rd = Math.atan2(Math.sin(rd), Math.cos(rd)); sp.rot += rd * Math.min(1, 5 * dt);
    },
    legs(S, sp, dt) {
      const ANG = [-0.8, -1.57, -2.35, 0.8, 1.57, 2.35], A = [0, 2, 4], B = [1, 3, 5];
      const H = Math.PI / 2, Q = Math.PI / 4, AMIN = [-H, -3 * Q, -Math.PI, 0, Q, H], AMAX = [0, -Q, -H, H, 3 * Q, Math.PI];
      const rest = (i) => [sp.nx + Math.cos(sp.head + ANG[i]) * 85, sp.ny + Math.sin(sp.head + ANG[i]) * 85];
      const rocks = S.rocks;
      const find = (i, occ) => {
        const [rx, ry] = rest(i); let best = -1, bd = 100 * 100;
        rocks.forEach((r, vi) => {
          if (occ[vi] || r.gone) return;
          let rel = Math.atan2(r.y - sp.ny, r.x - sp.nx) - sp.head; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
          if (rel < AMIN[i] || rel > AMAX[i]) return;
          const d = (r.x - rx) ** 2 + (r.y - ry) ** 2; if (d < bd) { bd = d; best = vi; }
        });
        return best;
      };
      const occ = () => { const o = {}; for (const L of sp.legs) if (L.vi >= 0) o[L.vi] = 1; return o; };
      if (sp.step) {
        let done = true;
        for (const i of sp.step) { const L = sp.legs[i]; if (!L.mov) continue; L.p += 8 * dt; if (L.p >= 1) { L.fx = L.tx; L.fy = L.ty; L.mov = false; } else { L.fx = L.sx + (L.tx - L.sx) * L.p; L.fy = L.sy + (L.ty - L.sy) * L.p; done = false; } }
        if (done) { sp.last = sp.step; sp.step = null; }
      }
      if (!sp.step) {
        const disp = (grp) => { let m = 0; for (const i of grp) { const L = sp.legs[i]; if (L.dead) continue; if (L.vi < 0) return 1e9; const [rx, ry] = rest(i); m = Math.max(m, (L.fx - rx) ** 2 + (L.fy - ry) ** 2); } return m; };
        const order = sp.last && sp.last[0] === 0 ? [B, A] : [A, B];
        for (const grp of order) {
          if (disp(grp) <= 2500) continue;
          const o = occ(); for (const i of grp) if (sp.legs[i].vi >= 0) delete o[sp.legs[i].vi];
          let any = false;
          for (const i of grp) {
            const L = sp.legs[i]; if (L.dead) continue;
            const [rx, ry] = rest(i);
            if (L.vi >= 0 && (L.fx - rx) ** 2 + (L.fy - ry) ** 2 <= 2500) continue;
            const vi = find(i, o);
            if (vi >= 0) { if (!sp.init) { L.fx = rocks[vi].x; L.fy = rocks[vi].y - rocks[vi].r * 1.4; } L.sx = L.fx; L.sy = L.fy; L.vi = vi; L.tx = rocks[vi].x; L.ty = rocks[vi].y - rocks[vi].r * 1.4; L.mov = true; L.p = 0; o[vi] = 1; any = true; }
          }
          if (any) sp.step = grp;
          break;
        }
        sp.init = true;
      }
      let cx = 0, cy = 0, n = 0;
      for (const L of sp.legs) if (L.vi >= 0 && !L.dead) { cx += L.fx; cy += L.fy; n++; }
      if (n) { const f = Math.min(1, 6 * dt); sp.bx += (cx / n - sp.bx) * f; sp.by += (cy / n - sp.by) * f; }
      sp.planted = n;
    },
    draw(g, S, P) {
      const C = g.C, k = 0.4;
      g.clear();
      if (P.graph) {
        for (const [a, b] of S.edges) g.line(S.rocks[a].x * k, S.rocks[a].y * k, S.rocks[b].x * k, S.rocks[b].y * k, C.rule, 1);
        for (const t of S.tris) for (const n of t.nb) g.line(t.cx * k, t.cy * k, S.tris[n].cx * k, S.tris[n].cy * k, C.sky, 1, [2, 2]);
      }
      for (const r of S.rocks) { if (r.dead) g.circle(r.x * k, r.y * k, r.r * k, C.ink3, 1); else g.circle(r.x * k, r.y * k, r.r * k, C.ink3); }
      const sp = S.sp;
      if (sp.path) { let px = sp.cx, py = sp.cy; for (const t of sp.path) { const T = S.tris[t]; if (!T) break; g.line(px * k, py * k, T.cx * k, T.cy * k, C.accent, 1.5); px = T.cx; py = T.cy; } }
      g.circle(S.player.x * k, S.player.y * k, 4, C.accent);
      if (S.respawn > 0) return;
      const ANG = [-0.8, -1.57, -2.35, 0.8, 1.57, 2.35];
      if (P.arcs) {
        const H = Math.PI / 2, Q = Math.PI / 4, AMIN = [-H, -3 * Q, -Math.PI, 0, Q, H];
        AMIN.forEach((a, i) => g.arc(sp.nx * k, sp.ny * k, 100 * k * (1 + i * 0.06), sp.head + a, sp.head + a + H, i % 2 ? C.violet : C.gold, 1));
      }
      sp.legs.forEach((L, i) => {
        const sx = sp.bx + Math.cos(sp.rot + ANG[i]) * 15, sy = sp.by + Math.sin(sp.rot + ANG[i]) * 15;
        let fx = L.fx, fy = L.fy;
        if (L.dead || L.vi < 0) { fx = sp.bx + Math.cos(sp.rot + ANG[i]) * 45; fy = sp.by + Math.sin(sp.rot + ANG[i]) * 45 + (L.dead ? 20 : 0); }
        const dx = fx - sx, dy = fy - sy, len = Math.hypot(dx, dy) || 1, sgn = i % 2 ? 1 : -1;
        const kx = (sx + fx) / 2 - dy / len * 15 * sgn, ky = (sy + fy) / 2 + dx / len * 15 * sgn;
        const col = L.dead ? C.ink3 : L.vi < 0 ? C.ink2 : (i % 2 ? C.violet : C.gold);
        g.line(sx * k, sy * k, kx * k, ky * k, col, 1.5); g.line(kx * k, ky * k, fx * k, fy * k, col, 1.5);
        if (L.vi >= 0 && !L.dead) g.circle(fx * k, fy * k, 1.5, col);
      });
      const shielded = P.mode === "spec" && S.feetDead < 6;
      g.toneCircle(sp.bx * k, sp.by * k, 12, 0.35, C.ink);
      g.circle(sp.bx * k, sp.by * k, 12, C.ink, 1.5);
      if (shielded) g.circle(sp.bx * k, sp.by * k, 70 * k * 0.5, C.sky, 1);
      for (const r of S.ripples) g.arc(sp.bx * k, sp.by * k, 70 * k * 0.5 + (0.4 - r.t) * 20, r.a - 0.5, r.a + 0.5, C.sky, 2);
      g.circle(sp.cx * k, sp.cy * k, 2, C.enemy);
    },
    readout(S, P) {
      const sp = S.sp;
      return "feet planted " + (sp.planted || 0) + "/6" + (P.mode === "spec" ? "   destroyed " + S.feetDead + "/6" : "") +
        "\nhp " + S.hp + "/5" + (P.mode === "spec" ? (S.feetDead < 6 ? "  SHIELDED" : "  EXPOSED") : "") + "   kills " + S.kills;
    },
  },
});
