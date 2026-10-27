(function () {
  const LAYERS = [
    ["colliders", "Colliders"], ["hitAreas", "Weapon hit areas"], ["pickupRange", "Pickup range"],
    ["playerAim", "Aim lines"], ["enemyState", "Enemy state"], ["enemyPaths", "Movement vectors"],
    ["spawnRing", "Spawn boundary"], ["grid", "Spatial hash grid"],
  ];
  const K = 0.55;                                   // world px -> stage px
  const VIEW = { x: 26, y: 62, w: 384 * K, h: 216 * K };
  const M = 24 * K;                                 // wave.spawnMargin
  const PX = 268, PY = 50, ROW = 13;

  // config.set with listeners: what the editor and F3 do.
  function set(S, id, v) { S.cfg[id] = v; S.on[id] = v; }

  function spawn(S, kit) {
    const r = kit.rand, side = r.int(0, 3), brute = r() < 0.3;
    let x = VIEW.x - M + r() * (VIEW.w + 2 * M), y = VIEW.y - M + r() * (VIEW.h + 2 * M);
    if (side === 0) x = VIEW.x - M; else if (side === 1) x = VIEW.x + VIEW.w + M;
    else if (side === 2) y = VIEW.y - M; else y = VIEW.y + VIEW.h + M;
    return { x, y, vx: 0, vy: 0, brute, hp: brute ? 52 : 12, max: brute ? 52 : 12, r: (brute ? 7 : 4) * K * 1.4,
      speed: (brute ? 24 : 30) * K, phase: brute ? "approach" : "", t: r.range(0.5, 3) };
  }

  Wiki.construct({
    id: "debug-layers",
    name: "Debug layers as ordinary settings",
    origin: "playground",
    status: "built",
    statusNote: "Built, ten layers in the survival game. Two open faults: enemy-state labels draw about 3&times; too large, and <code>--set overlay.&lt;id&gt;=true</code> in a capture draws nothing.",
    summary: "Each debug overlay is registered as a bool setting on the Overlays page, so it gets an editor toggle and saves into profiles for free, and a mirrored table lets draw code test it in one lookup.",
    tags: ["debug draw", "overlays", "visualisation"],

    intent:
      "<p>Most tuning questions are spatial: is the pickup radius bigger than it feels, which enemy is the aim line on, where exactly do spawns appear. A designer should be able to turn on just the picture that answers the question, keep it on across restarts, and save \"my debugging view\" with a profile.</p>" +
      "<p>Registering layers as settings means one mechanism instead of two: no separate overlay menu, no separate persistence.</p>",

    how:
      "<h3>Registering a layer</h3>" +
      "<p><code>dd.register{id, label, group, default, color, help}</code> does three things: registers schema key <code>overlay.&lt;id&gt;</code> as a bool on the Overlays page under its group; records the layer's colour; and adds a <code>config.listen</code> on that key that copies the value into <code>dd.on[id]</code>. Hot draw code then guards with <code>if dd.on.colliders then ... end</code>, one table lookup. The helpers <code>dd.circle</code>, <code>line</code>, <code>rect</code>, <code>cross</code>, <code>text</code> no-op unless <code>dd.master and dd.on[id]</code>.</p>" +
      "<div class=\"tbl-wrap\"><table><thead><tr><th>Group</th><th>Layers in horde-survivor</th></tr></thead><tbody>" +
      "<tr><td>Collision</td><td><code>colliders</code>, <code>hitAreas</code> (aura radius, orbit paths, projectile sweeps)</td></tr>" +
      "<tr><td>Player</td><td><code>pickupRange</code>, <code>playerAim</code> (which enemy each weapon targets)</td></tr>" +
      "<tr><td>Enemies</td><td><code>enemyState</code> (\"hp/max phase\" text), <code>enemyPaths</code> (velocity &times; 0.25 s)</td></tr>" +
      "<tr><td>World</td><td><code>spawnRing</code> (view rect grown by <code>wave.spawnMargin</code>, 24 px), <code>arenaBounds</code>, <code>grid</code> (16 px cells), <code>pickups</code></td></tr>" +
      "</tbody></table></div>" +
      "<h3>Keys</h3>" +
      "<p><b>F4</b> flips <code>dd.master</code>, a plain field that is not a setting and is not saved: it hides every layer without losing which ones were on. <b>F3</b> toggles <code>colliders</code> directly. The editor's Overlays page has all-on and all-off actions (<code>dd.setAll</code>).</p>" +
      "<h3>The mirror has to be re-synced after silent writes</h3>" +
      "<p>A bulk write such as loading a profile calls <code>config.set(key, v, true)</code>, which skips listeners, so <code>dd.on</code> goes stale until <code>dd.sync()</code> re-reads every layer. The launcher calls it after the startup profile; the editor calls it after its own loads and resets. The capture path does not: <code>--set</code> applies silently (<code>capture.lua:263</code>) and nothing syncs afterwards, so <code>--set overlay.colliders=true</code> changes config and draws nothing. Only <code>--overlays</code>, which goes through <code>dd.setAll</code> and its listeners, works.</p>" +
      "<h3>The label-scale bug</h3>" +
      "<p>HANDOFF records that enemy-state labels render roughly 3&times; too large and overlap into an unreadable pile when overlays are on. Geometry is correct; only text is wrong. <code>dd.text</code> prints with whatever font is current, which is sized for screen-space UI, into the 384&times;216 canvas that is then scaled up.</p>",

    knobs: [
      ["Master switch", "on", "Hide or show every layer at once; not saved", "dd.master (F4)"],
      ["Layer", "off", "One per layer, on the Overlays page", "overlay.<id>"],
      ["Spawn margin", "24 px", "How far outside the view the spawn boundary sits", "wave.spawnMargin"],
      ["Pickup range", "26 px", "Radius the pickupRange layer draws", "player.pickupRange"],
    ],

    related: [
      { id: "schema-editor", how: "A layer is a schema entry, so the editor and profiles pick it up with no extra code." },
      { id: "reproducible-capture", how: "--overlays works in captures; --set overlay.* does not, for want of a dd.sync()." },
      { id: "diff-profiles", how: "The sandbox profile is partly a saved set of layers." },
      { id: "crowd-separation", how: "The grid layer shows the 16 px buckets separation tests within." },
    ],

    questions: [
      "Should <code>config.set(..., silent)</code> mark the mirror dirty, so no caller has to remember <code>dd.sync()</code>?",
      "Should overlay text draw in screen space after the canvas is scaled, like the rest of the UI, rather than in the canvas?",
    ],

    sparks: [
      "An x-ray mode for players as an unlock: the same layers, a curated subset, shipped as a toggle.",
      "Record layer state into replays, so a bug report opens with the designer's overlays already on.",
      "A tower-defence game whose range and path overlays are the debug layers, styled, rather than separate art.",
    ],

    terms: [
      { term: "Layer", def: "A named overlay registered as an overlay.<id> bool setting.", code: "dd.register" },
      { term: "Master switch", def: "F4: hides every layer without changing which are on.", code: "dd.master" },
      { term: "Layer mirror", def: "Plain table of layer states for one-lookup guards; re-read after silent writes.", code: "dd.on, dd.sync" },
    ],

    sources: [
      "playground:shared/framework/debugdraw.lua:33",
      "playground:shared/framework/debugdraw.lua:66",
      "playground:games/horde-survivor/settings.lua:454",
      "playground:games/horde-survivor/render.lua:330",
      "playground:shared/framework/capture.lua:263",
      "playground:main.lua:171",
      "playground:HANDOFF.md",
    ],

    toy: {
      title: "Every checkbox is a bool in config",
      hint: "click a layer to toggle it; then try the silent --set",
      caption: "The two columns are config (the saved setting) and dd.on (what draw code reads). A silent write changes only the first, which is the capture bug. Simplified: fixed camera, two enemy types, one aura weapon.",
      w: 384, h: 216,
      controls: [
        { type: "toggle", key: "master", label: "master (F4)", value: true },
        { type: "toggle", key: "bug", label: "label bug", value: false },
        { type: "button", label: "--set colliders (silent)", press(S) { S.cfg.colliders = !S.cfg.colliders; S.note = "cfg set, mirror stale"; } },
        { type: "button", label: "dd.sync()", press(S) { for (const [id] of LAYERS) S.on[id] = S.cfg[id]; S.note = "mirror re-read"; } },
        { type: "button", label: "--overlays", press(S) { for (const [id] of LAYERS) set(S, id, true); S.note = "listeners fired"; } },
      ],
      init(S, P, kit) {
        S.cfg = {}; S.on = {}; S.t = 0; S.note = "";
        for (const [id] of LAYERS) { S.cfg[id] = false; S.on[id] = false; }
        set(S, "colliders", true); set(S, "enemyState", true);
        S.p = { x: VIEW.x + VIEW.w / 2, y: VIEW.y + VIEW.h / 2 };
        S.e = []; for (let i = 0; i < 9; i++) { const e = spawn(S, kit); e.x = kit.lerp(e.x, S.p.x, 0.6); e.y = kit.lerp(e.y, S.p.y, 0.6); S.e.push(e); }
        S.gems = []; S.cd = 0; S.target = null;
      },
      update(S, P, dt, kit) {
        S.t += dt;
        const p = S.p;
        p.x = VIEW.x + VIEW.w / 2 + Math.sin(S.t * 0.5) * 60; p.y = VIEW.y + VIEW.h / 2 + Math.sin(S.t * 0.8) * 30;
        S.cd -= dt; S.target = null; let best = 70;
        for (const e of S.e) {
          const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
          if (d < best) { best = d; S.target = e; }
          e.t -= dt;
          if (e.phase === "windup") { e.vx *= 0.82; e.vy *= 0.82; if (e.t <= 0) { e.phase = "charging"; e.t = 0.55; e.vx = dx / d * 300 * K; e.vy = dy / d * 300 * K; } }
          else if (e.phase === "charging") { if (e.t <= 0) { e.phase = "approach"; e.t = 3.2; } }
          else { e.vx = dx / d * e.speed; e.vy = dy / d * e.speed; if (e.brute && d < 150 * K && e.t <= 0) { e.phase = "windup"; e.t = 0.8; } }
          e.x += e.vx * dt; e.y += e.vy * dt;
          if (d < 34 * K && S.cd <= 0) e.hp -= 4;
        }
        if (S.cd <= 0) S.cd = 0.5;
        for (let i = 0; i < S.e.length; i++) if (S.e[i].hp <= 0) { S.gems.push({ x: S.e[i].x, y: S.e[i].y }); S.e[i] = spawn(S, kit); }
        for (const gm of S.gems) { const d = kit.dist(gm.x, gm.y, p.x, p.y); if (d < 26 * K * 1.5) { gm.x += (p.x - gm.x) * 0.15; gm.y += (p.y - gm.y) * 0.15; } }
        S.gems = S.gems.filter((gm) => kit.dist(gm.x, gm.y, p.x, p.y) > 2).slice(-20);
      },
      pointer(e, S) {
        if (e.type !== "down" || e.x < PX) return;
        const i = Math.floor((e.y - PY + 9) / ROW);
        if (i >= 0 && i < LAYERS.length) { const id = LAYERS[i][0]; set(S, id, !S.cfg[id]); S.note = ""; }
      },
      draw(g, S, P) {
        const C = g.C, on = (id) => P.master && S.on[id], p = S.p;
        g.clear();
        g.tone(0, 30, PX - 4, 186, 0.12, C.ink);
        g.rect(VIEW.x, VIEW.y, VIEW.w, VIEW.h, C.bg);
        g.rect(VIEW.x, VIEW.y, VIEW.w, VIEW.h, C.rule, 1);
        if (on("grid")) for (let x = VIEW.x; x <= VIEW.x + VIEW.w; x += 16 * K) g.line(x, VIEW.y, x, VIEW.y + VIEW.h, C.rule, 0.5);
        if (on("grid")) for (let y = VIEW.y; y <= VIEW.y + VIEW.h; y += 16 * K) g.line(VIEW.x, y, VIEW.x + VIEW.w, y, C.rule, 0.5);
        if (on("spawnRing")) g.rect(VIEW.x - M, VIEW.y - M, VIEW.w + 2 * M, VIEW.h + 2 * M, C.sky, 1);
        for (const gm of S.gems) g.rect(gm.x - 1, gm.y - 1, 2, 2, C.accent);
        for (const e of S.e) {
          const blink = e.phase === "windup" && Math.floor(S.t * 14) % 2;
          g.circle(e.x, e.y, e.r, blink ? C.ink : C.enemy);
          if (on("colliders")) g.circle(e.x, e.y, e.r + 1, C.enemy, 0.6);
          if (on("enemyPaths")) g.line(e.x, e.y, e.x + e.vx * 0.25, e.y + e.vy * 0.25, C.violet, 1);
          if (on("enemyState")) {
            const s = Math.ceil(e.hp) + "/" + e.max + " " + e.phase;
            if (P.bug) g.text(s, e.x - 30, e.y - e.r - 27, { size: 24, color: C.gold });
            else g.text(s, e.x - 10, e.y - e.r - 3, { size: 8, color: C.gold });
          }
        }
        g.circle(p.x, p.y, 3, C.ink);
        if (on("colliders")) g.circle(p.x, p.y, 4, C.enemy, 0.6);
        if (on("hitAreas")) g.circle(p.x, p.y, 34 * K, C.gold, 0.6);
        if (on("pickupRange")) g.circle(p.x, p.y, 26 * K * 1.5, C.accent, 0.6);
        if (on("playerAim") && S.target) g.line(p.x, p.y, S.target.x, S.target.y, C.sky, 0.8);
        // the panel: config vs mirror
        g.label("OVERLAYS", PX, 38, C.ink); g.label("CFG ON", PX + 84, 38, C.ink3);
        LAYERS.forEach(([id, label], i) => {
          const y = PY + i * ROW;
          g.rect(PX, y - 7, 7, 7, C.ink2, 1); if (S.cfg[id]) g.rect(PX + 2, y - 5, 4, 4, C.accent);
          g.label(label.length > 12 ? label.slice(0, 11) + "." : label, PX + 10, y, C.ink2);
          g.label(S.cfg[id] ? "T" : "F", PX + 88, y, S.cfg[id] ? C.accent : C.ink3);
          g.label(S.on[id] ? "T" : "F", PX + 104, y, S.cfg[id] !== S.on[id] ? C.enemy : S.on[id] ? C.accent : C.ink3);
        });
        if (!P.master) g.label("MASTER OFF", PX, PY + LAYERS.length * ROW + 6, C.enemy);
        if (S.note) g.label(S.note, PX - 2, 210, C.ink3);
      },
      readout(S, P) {
        const stale = LAYERS.filter(([id]) => S.cfg[id] !== S.on[id]).length;
        return "drawn layers " + LAYERS.filter(([id]) => P.master && S.on[id]).length + "\nstale mirror " + stale;
      },
    },
  });
})();
