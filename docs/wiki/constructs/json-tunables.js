(function () {
  // Two real classes: combat/Debris (read every frame: live) and combat/Turbulence (read once: restart needed).
  const ROWS = [
    { cls: "combat/Debris", key: "gravity", ctl: "grav", min: 100, max: 800, live: true },
    { cls: "combat/Debris", key: "friction", ctl: "fric", min: 0.9, max: 1, live: true, div: 1000 },
    { cls: "combat/Turbulence", key: "radius", ctl: "rad", min: 16, max: 128, live: false },
    { cls: "combat/Turbulence", key: "strength", ctl: "str", min: 0.05, max: 0.5, live: false, div: 100 },
  ];
  const val = (r, P) => (r.div ? P[r.ctl] / r.div : P[r.ctl]);
  const fmt = (v) => (Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : String(+v.toFixed(3)));
  function loadTurbulence(S, P) { S.turb = { radius: val(ROWS[2], P), strength: val(ROWS[3], P) }; } // the first-update cache
  function swirl(S, x, y) { // a fixed vorton pair, Rankine profile as in vorton.lua
    let vx = 0, vy = 0;
    for (const [cx, cy, sign] of [[76, 140, 1], [124, 140, -1]]) {
      const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy), r = S.turb.radius;
      if (d > 2 * r || d < 1) continue;
      const f = d < r ? S.turb.strength * sign * d / (r * r) : S.turb.strength * sign / r * (1 - (d - r) / r);
      vx += -dy * f; vy += dx * f;
    }
    return [vx * 600, vy * 600];
  }

  Wiki.construct({
    id: "json-tunables",
    name: "JSON tunables with a live bridge editor",
    origin: "shmuprouge",
    status: "built",
    summary: "\"Lua defines behaviour, JSON defines values\": every tunable is a JSON entry carrying its own range and label, a React editor generates sliders from them, and a bridge pushes each change into the running game, which applies it only if the code reads the value at use time.",
    tags: ["tuning", "editor", "data-driven", "live"],

    intent:
      "<p>Feel is tuned while playing, not between builds. If every number a programmer exposes arrives with a label and a range, the editor can draw a slider for it without anyone writing UI, and a designer can drag gravity or a blast radius while the game runs. The same files stay readable and editable by hand or by an AI, so the editor is one way in, not the only one.</p>" +
      "<p>The catch is liveness: a value applies immediately only if the code that uses it asks for it at the moment of use. Anything read once at startup silently ignores the slider.</p>",

    how:
      "<h3>The format</h3>" +
      "<p>Every file under <code>shared/data/</code> wraps each value as <code>{value, label, min, max, step, options, control, desc}</code>, grouped into sections, with an <code>_editor {tab, panel}</code> hint saying where it appears. Materials, weapons, debris, turbulence, terrain and input bindings all use it.</p>" +
      "<h3>The loop</h3>" +
      "<ol><li><code>Loader.get(class, prop)</code> returns the flattened value (class is the file path, such as <code>combat/Debris</code>).</li>" +
      "<li>The React editor (React 18, Vite, Tailwind, Zustand; React Flow for weapon graphs) talks over WebSocket on port 9001 to a Node bridge (<code>editor/bridge/server.js</code>).</li>" +
      "<li>The bridge talks TCP on 9002 to <code>core/editor_client.lua</code> in the game, a non-blocking client that reconnects every 2 s. An <code>update</code> message calls <code>Loader.set</code>, which validates against the schema, stores the value and notifies watchers. Other messages pause and step the game, assign weapons, or rebuild a weapon graph and resend the schema. Telemetry flows back every 0.5 s.</li>" +
      "<li>The bridge writes the file back to disk, debounced 500 ms per class. With no game running it loads the schema straight from the files, for offline editing.</li></ol>" +
      "<h3>What is live</h3>" +
      "<div class=\"tbl-wrap\"><table><thead><tr><th>Reads at use time (live)</th><th>Cached or not JSON (restart needed)</th></tr></thead><tbody>" +
      "<tr><td><code>combat/Debris</code>, read every debris update and collision</td><td><code>combat/Turbulence</code>, read on the wake system's first update ([[wake-turbulence]])</td></tr>" +
      "<tr><td><code>DamageCalculator</code>, via <code>getConfig()</code> per call</td><td>GLSL constants: acid erosion and dissolution chances ([[reactivity-chemistry]])</td></tr>" +
      "<tr><td><code>GameConfig:refresh*</code>, if refresh is called</td><td>Engine constants in <code>shared/constants/init.lua</code>, which are not JSON at all</td></tr>" +
      "</tbody></table></div>" +
      "<p>Nothing marks which is which: the editor shows every slider the same way. Some files drift from their own schema; <code>Turbulence.json</code> ships <code>spawnBehindDistance</code> 0 with <code>min 8</code>.</p>" +
      "<h3>Compared with the playground's schema</h3>" +
      "<p>The playground's [[schema-editor]] solves the same problem from the other side. There a Lua <code>schema.register</code> call is the single list of settings; the in-game editor, defaults and saved profiles are generated from it, and each entry declares <code>live</code>, so a non-live setting is starred and labelled \"restart run to apply\". ShmupRouge keeps the schema in the data files themselves and edits them from an external app over a socket, which makes offline and AI editing easy but leaves liveness implicit in how each system happens to read its config.</p>",

    knobs: [
      ["Entry format", "{value, label, min, max, step}", "What the editor needs to draw a control", "shared/data/**/*.json"],
      ["Bridge ports", "9001 WS, 9002 TCP", "Editor ↔ bridge ↔ game", "editor/bridge/server.js"],
      ["Save debounce", "500 ms per class", "Delay before an edit is written to disk", "SAVE_DEBOUNCE_MS"],
      ["Reconnect", "every 2 s", "Game client retry when the bridge is down", "core/editor_client.lua"],
      ["Telemetry", "every 0.5 s", "Game state sent back to the editor", "core/editor_client.lua"],
    ],

    related: [
      { id: "schema-editor", how: "The playground's in-game, code-declared version, with an explicit live flag." },
      { id: "material-properties", how: "Each material is one of these files." },
      { id: "wake-turbulence", how: "The standing example of a cached, not-live class." },
      { id: "diff-profiles", how: "Snapshots of values, which this pipeline has no equivalent of yet." },
    ],

    questions: [
      "Should each entry declare <code>live</code>, as the playground's schema does, and should a lint flag classes that are cached?",
      "Promote the GLSL rule constants to uniforms fed from JSON so chemistry becomes tunable?",
      "The parked \"fields layer\" would let designers paint gravity or temperature maps in the editor. Is that the next tool?",
    ],

    sparks: [
      "A designer-facing field painter for gravity zones, writing modifiers straight into the flow field.",
      "A/B feel presets: snapshot a class's values and flip between them mid-fight.",
      "Telemetry beside sliders, so a tuning change shows its effect on kill rate or damage taken as you drag.",
    ],

    terms: [
      { term: "Tunable", def: "A JSON value wrapped with its label, range and control hint.", code: "{value, label, min, max, step}" },
      { term: "Class", def: "A data file addressed by its path under shared/data.", code: "Loader.get(\"combat/Debris\", ...)" },
      { term: "Bridge", def: "The Node relay between the React editor and the running game.", code: "editor/bridge/server.js" },
      { term: "Liveness", def: "Whether a change applies at once: only if the code reads it at use time.", code: "Loader.get at use vs cached config" },
    ],

    sources: [
      "shmuprouge:shared/data/loader.lua",
      "shmuprouge:shared/data/loader_validation.lua",
      "shmuprouge:core/editor_client.lua",
      "shmuprouge:editor/bridge/server.js",
      "shmuprouge:engine/physics/debris/debris.lua",
      "shmuprouge:game/systems/wake_turbulence_system.lua",
      "shmuprouge:shared/data/combat/Debris.json",
      "shmuprouge:shared/data/combat/Turbulence.json",
      "shmuprouge:docs/meta/Editor_UI.md",
      "playground:shared/framework/schema.lua",
    ],

    toy: {
      title: "Which sliders actually do something",
      hint: "drag the sliders; restart to apply the cached ones",
      caption: "Real keys and ranges. Debris values are read every frame, as debris.lua does; the turbulence pair is read once, as the wake system does. The panel shows the JSON entry and the bridge's 500 ms save debounce.",
      w: 384, h: 216,
      controls: [
        { type: "range", key: "grav", label: "Debris.gravity", min: 100, max: 800, step: 50, value: 450 },
        { type: "range", key: "fric", label: "Debris.friction", min: 900, max: 1000, step: 10, value: 990, fmt: (v) => (v / 1000).toFixed(2) },
        { type: "range", key: "rad", label: "Turbulence.radius", min: 16, max: 128, step: 8, value: 16 },
        { type: "range", key: "str", label: "Turbulence.strength", min: 5, max: 50, step: 5, value: 10, fmt: (v) => (v / 100).toFixed(2) },
        { type: "button", label: "restart game", press(S, P) { loadTurbulence(S, P); S.restarts++; } },
      ],
      init(S, P, kit) { S.p = []; S.t = 0; S.saved = {}; S.edit = {}; S.rand = kit.rand; S.restarts = 0; loadTurbulence(S, P); S.last = Object.assign({}, P); },
      update(S, P, dt) {
        S.t += dt;
        for (const r of ROWS) if (P[r.ctl] !== S.last[r.ctl]) { S.edit[r.cls] = S.t; S.hot = r; }
        S.last = Object.assign({}, P);
        for (let k = 0; k < 4; k++) S.p.push({ x: 100 + (S.rand() - 0.5) * 6, y: 206, vx: (S.rand() - 0.5) * 60, vy: -260 - S.rand() * 60, life: 3 });
        const g = val(ROWS[0], P), f = val(ROWS[1], P);
        for (const q of S.p) {
          const [sx, sy] = swirl(S, q.x, q.y);
          q.vy += g * dt; q.vx *= f; q.vy *= f;
          q.x += (q.vx + sx) * dt; q.y += (q.vy + sy) * dt; q.life -= dt;
        }
        S.p = S.p.filter((q) => q.life > 0 && q.y < 220 && q.x > -10 && q.x < 210);
      },
      draw(g, S, P) {
        const C = g.C;
        g.clear();
        g.rect(204, 0, 1, 216, C.rule);
        for (const [cx, cy, sign] of [[76, 140, 1], [124, 140, -1]]) {
          g.circle(cx, cy, S.turb.radius, sign > 0 ? C.sky : C.rose, 0.5);
          g.circle(cx, cy, 2, sign > 0 ? C.sky : C.rose);
        }
        for (const q of S.p) g.rect(q.x - 0.75, q.y - 0.75, 1.5, 1.5, C.gold);
        let y = 14;
        for (const cls of ["combat/Debris", "combat/Turbulence"]) {
          const since = S.edit[cls] == null ? 99 : S.t - S.edit[cls];
          g.label(cls + ".json", 212, y, C.ink);
          g.label(since < 0.5 ? "saving..." : since < 99 ? "saved" : "", 340, y, since < 0.5 ? C.gold : C.ink3);
          y += 14;
          for (const r of ROWS.filter((rr) => rr.cls === cls)) {
            const v = val(r, P), applied = r.live ? v : S.turb[r.key], stale = Math.abs(applied - v) > 1e-9;
            g.label('"' + r.key + '": {', 216, y, S.hot === r ? C.accent : C.ink2); y += 10;
            g.label('"value": ' + fmt(v) + "  [" + fmt(r.min) + ".." + fmt(r.max) + "]", 224, y, C.ink2); y += 10;
            g.label(r.live ? "live" : stale ? "restart needed (running " + fmt(applied) + ")" : "read at startup", 224, y, r.live ? C.accent : stale ? C.enemy : C.ink3); y += 16;
          }
          y += 4;
        }
      },
      readout(S) { return "particles " + S.p.length + "\nrestarts " + S.restarts; },
    },
  });
})();
