// Toy helpers. Works in wu; drawn at 1 px = 10 wu around (ASM_CX, ASM_CY).
var ASM_CX = 250, ASM_CY = 110, ASM_PX = 0.1, ASM_RI = 600, ASM_RO = 1050;
function asmInRing(x, y, m) { const d = Math.hypot(x, y); return d >= ASM_RI + (m || 0) && d <= ASM_RO - (m || 0); }
function asmRandPt(r) { const a = r() * Math.PI * 2, d = Math.sqrt(ASM_RI * ASM_RI + r() * (ASM_RO * ASM_RO - ASM_RI * ASM_RI)); return [Math.cos(a) * d, Math.sin(a) * d]; }
function asmFar(pts, x, y, min) { for (const p of pts) if ((p.x - x) * (p.x - x) + (p.y - y) * (p.y - y) < min * min) return false; return true; }
function asmScatter(S, P, kit) {
  const r = kit.rng(S.seed), pts = [], min = P.spacing, size = () => r.range(14, 25) / 2;
  if (P.scatter === "random") {
    // RandomScatter: count from area x density, up to 30 tries each against minDist
    const want = Math.round(Math.PI * (ASM_RO * ASM_RO - ASM_RI * ASM_RI) * P.density * 1e-5);
    for (let i = 0; i < want; i++) for (let k = 0; k < 30; k++) { const [x, y] = asmRandPt(r); if (asmFar(pts, x, y, min)) { pts.push({ x, y, r: size() }); break; } }
  } else {
    // Bridson Poisson disk, 30 candidates; density is ignored, as in the game
    const [x0, y0] = asmRandPt(r); pts.push({ x: x0, y: y0, r: size() }); const active = [0];
    while (active.length && pts.length < 600) {
      const ai = Math.floor(r() * active.length), a = pts[active[ai]]; let found = false;
      for (let k = 0; k < 30; k++) {
        const ang = r() * Math.PI * 2, d = min * (1 + r()), x = a.x + Math.cos(ang) * d, y = a.y + Math.sin(ang) * d;
        if (asmInRing(x, y) && asmFar(pts, x, y, min)) { pts.push({ x, y, r: size() }); active.push(pts.length - 1); found = true; break; }
      }
      if (!found) active.splice(ai, 1);
    }
  }
  S.pts = pts; asmBuild(S);
}
function asmCirc(p, a, b, c) {
  const ax = p[a].x, ay = p[a].y, bx = p[b].x, by = p[b].y, cx = p[c].x, cy = p[c].y;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-9) return { x: 0, y: 0, r2: Infinity };
  const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
  const x = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d, y = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  return { x, y, r2: (ax - x) * (ax - x) + (ay - y) * (ay - y) };
}
// Bowyer-Watson, then the game's two prunes: centroid outside the ring, circumcentre outside the ring.
function asmBuild(S) {
  const p = S.pts.slice(), n = p.length; S.tris = []; S.edges = []; S.vor = [];
  if (n < 3) return;
  p.push({ x: -1e5, y: -1e5 }, { x: 1e5, y: -1e5 }, { x: 0, y: 1e5 });
  let tris = [[n, n + 1, n + 2]]; tris[0].c = asmCirc(p, n, n + 1, n + 2);
  for (let i = 0; i < n; i++) {
    const bad = [], keep = [];
    for (const t of tris) ((p[i].x - t.c.x) ** 2 + (p[i].y - t.c.y) ** 2 < t.c.r2 ? bad : keep).push(t);
    const cnt = new Map();
    for (const t of bad) for (const [u, v] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) { const k = u < v ? u + "," + v : v + "," + u; cnt.set(k, (cnt.get(k) || 0) + 1); }
    for (const [k, c] of cnt) if (c === 1) { const [u, v] = k.split(",").map(Number); const t = [u, v, i]; t.c = asmCirc(p, u, v, i); keep.push(t); }
    tris = keep;
  }
  tris = tris.filter((t) => t[0] < n && t[1] < n && t[2] < n)
    .filter((t) => asmInRing((p[t[0]].x + p[t[1]].x + p[t[2]].x) / 3, (p[t[0]].y + p[t[1]].y + p[t[2]].y) / 3))
    .filter((t) => asmInRing(t.c.x, t.c.y));
  S.tris = tris;
  const owner = new Map();
  tris.forEach((t, ti) => { for (const [u, v] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) { const k = u < v ? u + "," + v : v + "," + u; if (!owner.has(k)) owner.set(k, []); owner.get(k).push(ti); } });
  for (const [k, ts] of owner) {
    const [u, v] = k.split(",").map(Number), len = Math.hypot(p[u].x - p[v].x, p[u].y - p[v].y);
    S.edges.push({ u, v, len, gap: len - p[u].r - p[v].r });
    if (ts.length === 2) S.vor.push([tris[ts[0]].c, tris[ts[1]].c]);
  }
}

Wiki.construct({
  id: "asteroid-mesh",
  name: "Asteroid mesh",
  family: "world",
  origin: "shmuprouge",
  status: "built",
  statusNote: "Built through implementation phases 1-5 and 7 of 8: points, triangulation, Voronoi dual, chunk index, parallax and terrain use, and the navigation graph. Not built: updating the mesh when an asteroid is destroyed (the mesh-surgery plan), the level-map view, and gameplay uses beyond spider navigation.",
  summary: "Asteroid positions are the vertices of one Delaunay triangulation per zone layer; its Voronoi dual gives gap centrelines for navigation, circumcentres for safe spawns, and every edge a measured gap width, so one structure serves drawing, AI and design.",
  tags: ["procedural", "geometry", "Delaunay", "Voronoi", "navigation", "asteroids"],

  intent:
    "<p>Scattering asteroids per chunk at random looks fine and knows nothing: neighbouring chunks tile visibly, enemies spawn inside rocks, and no system can ask &quot;how wide is the gap between these two?&quot; Making the field a mesh gives every asteroid neighbours, every gap a width and a centreline, and every open space a point of maximum clearance.</p>" +
    "<p>For a designer that turns a backdrop into terrain with structure: routes that thread gaps, territories that are triangles, difficulty measured as gap widths along a path. The spider mechs already walk it ([[voronoi-walkers]]).</p>",

  how:
    "<h3>Points</h3>" +
    "<p>The seed comes from the zone id: <code>byte1 &times; 100003 + byte2 &times; 1009 + byte3 &times; 7919</code>, so a mesh is regenerated, never saved. <code>generatePoints</code> picks the sampler by whether the layer gives a density:</p>" +
    "<ul><li><code>density</code> present: <code>RandomScatter</code>, count = area &times; density, each point retried up to 30 times against <code>minSpacing</code>. Its own comment: natural clusters and gaps.</li>" +
    "<li>no density: <code>PoissonDisk</code> (Bridson, 30 candidates), evenly spaced at <code>minSpacing</code>.</li></ul>" +
    "<p><code>docs/design/Asteroid_Mesh.md</code> prefers Poisson and shows <code>\"scatter\": \"poisson_disk\"</code>. Every shipped layer gives a density, so the game always runs random scatter, and the JSON scatter key is <code>\"mesh\"</code>.</p>" +
    "<h3>Mesh</h3>" +
    "<p>Bowyer-Watson triangulation (<code>engine/geometry/delaunay.lua</code>). Then two prunes: drop triangles whose centroid is outside the circle or ring, and (<code>cullBadCircumcenters</code>) drop those whose circumcentre is outside, so every Voronoi node lies inside the zone. <code>MeshVoronoi.extract</code> builds Voronoi nodes (circumcentres) linked across shared triangle edges, and per Delaunay edge a length, midpoint and <code>gapWidth = length &minus; r1 &minus; r2</code>, where an asteroid's radius is half its size. A chunk index culls drawing.</p>" +
    "<h3>Where it is used</h3>" +
    "<p>Each parallax depth gets its own mesh in its own [[parallax-zones|zone units]]; at depth 1.0, <code>generateTerrain</code> turns each vertex into an asteroid feature in the sand. Shipped numbers, <code>biomes/asteroid_field.json</code>:</p>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>Layer</th><th>Depth</th><th>density /wu&sup2;</th><th>size</th><th>minSpacing</th></tr></thead><tbody>" +
    "<tr><td>terrain asteroids</td><td>1.0</td><td>0.00006</td><td>14&ndash;25</td><td>60</td></tr>" +
    "<tr><td>medium_field</td><td>0.35</td><td>0.00006</td><td>64&ndash;192</td><td>80</td></tr>" +
    "<tr><td>giant_field</td><td>0.65</td><td>0.000008</td><td>256&ndash;512</td><td>200</td></tr>" +
    "</tbody></table></div>" +
    "<p>The inner belt's 1500&ndash;3000 wu ring is about 2.12 &times; 10<sup>7</sup> wu&sup2;, so about 1,270 terrain asteroids.</p>" +
    "<h3>Planned</h3>" +
    "<p>Destroying an asteroid does not change the mesh yet. <code>docs/plans/Mesh_Surgery_and_Spider_Kill_Mechanics.md</code> plans local surgery on vertex death (tombstoned triangle slots, a re-triangulated hole), lazy validation from the stability system, and the spider kill puzzle. Race gates, webs, mining claims and level-map dots are design only.</p>",

  knobs: [
    ["Density", "0.00006 /wu²", "Asteroids per area; also selects random scatter", "biomes/asteroid_field.json features[].density"],
    ["Min spacing", "60 wu", "Closest two centres may be", "features[].minSpacing"],
    ["Size", "14-25 (radius = size / 2)", "Asteroid size; enters gap width", "features[].size"],
    ["Candidates", "30", "Tries per point (both samplers)", "MAX_RETRIES, MAX_CANDIDATES"],
    ["Seed", "from zone id bytes", "Deterministic regeneration", "computeSeed (asteroid_mesh.lua)"],
  ],

  related: [
    { id: "voronoi-walkers", how: "Spider mechs path over the Voronoi graph and plant feet on vertices." },
    { id: "parallax-zones", how: "Each background depth has its own mesh in zone units." },
    { id: "zone-layers", how: "The mesh scatter mode of a biome feature." },
    { id: "destructible-terrain", how: "Mesh surgery would keep the graph true as asteroids break." },
    { id: "spatial-awareness", how: "Circumcentres and gap widths are ready-made spatial queries." },
  ],

  questions: [
    "Random scatter or Poisson? The doc prefers Poisson for even spacing; the data's density key quietly chose clusters and gaps.",
    "When an asteroid dies in the sand, should the mesh update at once (surgery) or on the next stability readback (lazy validation)?",
    "Should non-asteroid biomes (planet surfaces, stations) place features on a mesh too?",
    "Should paths weight edges by gap width, so large enemies avoid narrow gaps? Spiders use unweighted BFS today.",
  ],

  sparks: [
    "A race track is a sequence of Voronoi edges, and each gate's width is the gapWidth of the Delaunay edge it crosses.",
    "Webs on Delaunay edges with strength proportional to 1 / length: short strands hold, long ones snap, and the player cuts a route.",
    "Territories: an enemy claims a triangle, and 'clear this triangle' is an objective the mesh can check.",
    "Shooting edits the map: destroying an asteroid merges triangles and widens a gap, so a player can open a shortcut for themselves or for the swarm.",
  ],

  terms: [
    { term: "Asteroid mesh", def: "The per-layer Delaunay triangulation of asteroid centres and its Voronoi dual.", code: "game/world/parallax/asteroid_mesh.lua AsteroidMesh" },
    { term: "Gap width", def: "Edge length minus both asteroids' radii.", code: "edges.gapWidths" },
    { term: "Voronoi node", def: "A kept triangle's circumcentre: the point of most clearance among three asteroids.", code: "voronoi.nodeXs / nodeYs" },
    { term: "Random scatter", def: "Area x density points with min-distance rejection.", code: "engine/geometry/random_scatter.lua" },
    { term: "Poisson disk", def: "Bridson sampling at a fixed minimum spacing.", code: "engine/geometry/poisson_disk.lua" },
    { term: "Mesh surgery", def: "Planned local re-triangulation when a vertex is destroyed.", code: "Mesh_Surgery_and_Spider_Kill_Mechanics.md" },
  ],

  sources: [
    "shmuprouge:docs/design/Asteroid_Mesh.md",
    "shmuprouge:docs/plans/Mesh_Surgery_and_Spider_Kill_Mechanics.md",
    "shmuprouge:game/world/parallax/asteroid_mesh.lua",
    "shmuprouge:game/world/parallax/mesh_voronoi.lua",
    "shmuprouge:engine/geometry/delaunay.lua",
    "shmuprouge:engine/geometry/random_scatter.lua",
    "shmuprouge:engine/geometry/poisson_disk.lua",
    "shmuprouge:shared/data/world/biomes/asteroid_field.json",
  ],

  toy: {
    title: "Click to add an asteroid",
    hint: "click empty space to add, click an asteroid to remove",
    caption: "A smaller ring (600-1050 wu) at the shipped density, spacing and sizes; 1 px = 10 wu, asteroids drawn larger than scale. The mesh is rebuilt from scratch on every click, which the game does not do yet. Delaunay edges: red under 40 wu of gap, gold under 100, grey above.",
    w: 384, h: 216,
    controls: [
      { type: "select", key: "scatter", label: "scatter", value: "random", reset: true, options: [["random", "random (as shipped)"], ["poisson", "Poisson (doc)"]] },
      { type: "range", key: "density", label: "density x1e-5", min: 2, max: 12, value: 6, reset: true },
      { type: "range", key: "spacing", label: "min spacing", min: 30, max: 120, step: 5, value: 60, fmt: "{} wu", reset: true },
      { type: "toggle", key: "del", label: "Delaunay", value: true },
      { type: "toggle", key: "vor", label: "Voronoi", value: true },
      { type: "button", label: "reseed", press(S, P, kit) { S.seed++; asmScatter(S, P, kit); } },
    ],
    init(S, P, kit) { S.seed = 1; asmScatter(S, P, kit); },
    pointer(e, S) {
      if (e.type !== "down") return;
      const x = (e.x - ASM_CX) / ASM_PX, y = (e.y - ASM_CY) / ASM_PX;
      let hit = -1, best = 50;
      S.pts.forEach((p, i) => { const d = Math.hypot(p.x - x, p.y - y); if (d < best) { best = d; hit = i; } });
      if (hit >= 0) S.pts.splice(hit, 1);
      else if (asmInRing(x, y)) S.pts.push({ x, y, r: 10 });
      else return;
      asmBuild(S); S.flash = 0.3;
    },
    update(S, P, dt) { S.flash = Math.max(0, (S.flash || 0) - dt); },
    draw(g, S, P) {
      const C = g.C, X = (x) => ASM_CX + x * ASM_PX, Y = (y) => ASM_CY + y * ASM_PX; g.clear();
      g.circle(ASM_CX, ASM_CY, ASM_RO * ASM_PX, C.rule, 1); g.circle(ASM_CX, ASM_CY, ASM_RI * ASM_PX, C.rule, 1);
      if (P.vor) for (const [a, b] of S.vor) g.line(X(a.x), Y(a.y), X(b.x), Y(b.y), C.sky, 1, [2, 2]);
      if (P.del) for (const e of S.edges) {
        const a = S.pts[e.u], b = S.pts[e.v];
        g.line(X(a.x), Y(a.y), X(b.x), Y(b.y), e.gap < 40 ? C.enemy : e.gap < 100 ? C.gold : C.ink3, e.gap < 40 ? 1.5 : 1);
      }
      if (P.vor) for (const t of S.tris) g.rect(X(t.c.x) - 1, Y(t.c.y) - 1, 2, 2, C.sky);
      for (const p of S.pts) g.circle(X(p.x), Y(p.y), Math.max(1.6, p.r * ASM_PX * 1.6), C.ink);
      g.label("gap < 40 wu", 8, 60, C.enemy); g.label("gap < 100 wu", 8, 72, C.gold); g.label("voronoi / node", 8, 84, C.sky);
    },
    readout(S) {
      const m = S.edges.length ? S.edges.reduce((a, e) => a + e.len, 0) / S.edges.length : 0;
      const minGap = S.edges.length ? Math.min(...S.edges.map((e) => e.gap)) : 0;
      return "asteroids " + S.pts.length + "  tris " + S.tris.length + "\nmean edge " + Math.round(m) + "  min gap " + Math.round(minGap) + " wu";
    },
  },
});
