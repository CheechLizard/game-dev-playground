(function () {
function fmt(v) { return typeof v === "number" ? String(Math.round(v * 100) / 100) : typeof v === "string" ? "\"" + v + "\"" : String(v); }
function flash(S, m) { S.msg = m; S.msgT = 3; }
function setSlider(S, ent, x) {
  const f = Math.max(0, Math.min(1, (x - 192) / 40));
  let v = ent.min + f * (ent.max - ent.min);
  v = ent.max - ent.min > 20 ? Math.round(v) : Math.round(v * 100) / 100;
  S.values[ent.key] = v;
}
function addNext(S) {
  if (!S.pool.length) { flash(S, "nothing left to add"); return; }
  if (S.schema.length >= 10) { flash(S, "panel full: delete one first"); return; }
  const ent = S.pool.shift();
  if (ent.type === "number" && (ent.min == null || ent.max == null)) { flash(S, "schema: numeric setting needs min and max"); return; }
  if (S.schema.some((e) => e.key === ent.key)) { flash(S, "schema: duplicate setting key"); return; }
  S.schema.push(ent); S.values[ent.key] = ent.def; flash(S, "added " + ent.key);
}

Wiki.construct({
  id: "schema-editor",
  name: "One list of settings: the schema-generated editor",
  origin: "playground",
  status: "built",
  statusNote: "Built and used by every surface. A handful of tuning constants still live in <code>run.lua</code> outside the schema; they are listed under How it works.",
  summary: "Every tunable is declared once, with its type and range, and the editor, the defaults and the saved profiles are all generated from that one declaration, so deleting a setting removes it everywhere.",
  tags: ["single source of truth", "editor", "generated UI", "invariant"],

  intent:
    "<p>Tuning is only fast if a new number costs nothing to expose. In the playground a designer adds one entry to the schema and gets a slider in the F1 editor, a default in <code>config</code>, a line in saved profiles, a placard row in the zoo and a key the screenshot tool can <code>--set</code>. Nobody wires a widget by hand.</p>" +
    "<p>The other half matters as much: removing a setting from the code removes it from the editor too, because the editor has no list of its own. HANDOFF calls this the one invariant that matters, true \"by construction rather than by discipline\".</p>",

  how:
    "<h3>Declaring a setting</h3>" +
    "<p><code>schema.register{page, section, order, sectionOrder, settings}</code> validates each entry before accepting it: the key must be unique; the type is one of <code>number</code>, <code>int</code>, <code>bool</code>, <code>enum</code>, <code>color</code>, <code>string</code>; a numeric setting must carry <code>min</code> and <code>max</code>, because the editor cannot draw a slider for an unbounded number; an enum default must be one of its values; a colour needs three components. A bad entry is an assertion at load, not a broken widget later.</p>" +
    "<p><code>config.build()</code> walks <code>schema.keys()</code> and copies every default into a flat table and a nested tree, so hot code reads <code>config.values.player.moveSpeed</code> in two lookups. <code>schema.coerce</code> clamps numbers, rounds ints and rejects bad enums on every write. A setting with <code>live = false</code> gets a <code>*</code> in the editor and a \"restart run to apply\" banner.</p>" +
    "<h3>What is generated from it</h3>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>Surface</th><th>Generated how</th></tr></thead><tbody>" +
    "<tr><td>F1 editor pages</td><td>Schema pages sorted by order (Run 10, Player 20 ... Overlays 95, Debug 99), plus action-only pages, plus Profiles. <code>editor.pageNames()</code></td></tr>" +
    "<tr><td>Widgets</td><td><code>drawSetting</code> maps type to widget: bool toggle, enum dropdown, colour picker, string field, int stepper when the range is 12 or less, else a slider. A reset <b>x</b> sits in a reserved gutter, so rows do not jump when a value changes.</td></tr>" +
    "<tr><td>Profiles</td><td><code>config.diffFromDefaults()</code> walks the schema; see [[diff-profiles]].</td></tr>" +
    "<tr><td>Debug overlays</td><td>Each layer is a bool setting; see [[debug-layers]].</td></tr>" +
    "<tr><td>Zoo and range placards</td><td>The same <code>editor.drawSetting</code>; see [[inspection-levels]].</td></tr>" +
    "</tbody></table></div>" +
    "<h3>Settings derived from content</h3>" +
    "<p>Per-enemy, per-weapon and per-passive settings are not typed into the schema. <code>settings.lua</code> walks <code>content.enemies</code> with <code>content.enemyFields</code> plus <code>content.behaviourFields[behaviour]</code> and registers <code>enemy.&lt;id&gt;.&lt;field&gt;</code>; weapons add <code>weaponTypeFields[kind]</code>, a <code>perLevel.*</code> growth row per field, and cost, upgrade cost and max level. A field can carry a <code>fallback</code> (pack size 1) so loners need not repeat it. Add an enemy to <code>content.lua</code> and it gets an editor section, a zoo cage and a \"Spawn 10\" debug button in the same edit.</p>" +
    "<h3>The one exception: weapon graphs</h3>" +
    "<p>An [[mws-graph|MWS graph]] has variable topology, so \"node 7's fire rate\" has no fixed key. Module properties are declared once in <code>mws/modules.lua</code> (legacy) or <code>mws/v2modules.lua</code>, which plays the schema's part for graphs: inspector, node defaults and graph JSON are generated from it. Global MWS numbers that are a fixed list, such as each module type's energy cost, stay in the schema.</p>" +
    "<h3>Two rules that keep it true</h3>" +
    "<ol><li><b>Values go in <code>settings.lua</code>; actions go in <code>editor.action</code>.</b> A setting registered elsewhere exists in the game but not in headless runs, and profiles that mention it get flagged stale. It happened once, with the <code>debug.*</code> keys briefly registered in <code>game.lua</code>.</li>" +
    "<li><b><code>run.lua</code> stays free of drawing and input</b>, so the schema-driven simulation can run headless. See [[headless-sim]].</li></ol>" +
    "<h3>Constants that escaped</h3>" +
    "<p>Read the code and a few tuning numbers are still literals in <code>run.lua</code>, invisible to the editor, to profiles and to the harness:</p>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>Constant</th><th>Where</th><th>What it does</th></tr></thead><tbody>" +
    "<tr><td>Elite radius &times;1.7</td><td><code>run.lua:315</code></td><td>Elites grow; every other elite multiplier is <code>scale.elite*</code></td></tr>" +
    "<tr><td>Nearest-target range 260 px</td><td><code>run.lua:991</code></td><td>Legacy projectile weapons ignore anything further</td></tr>" +
    "<tr><td>Pickup damping 0.86 per tick</td><td><code>run.lua:747</code></td><td>Frame-rate dependent drag on pickups</td></tr>" +
    "<tr><td>No-target retry 0.1 s, separation cell 16 px</td><td><code>run.lua</code></td><td>Retry and broadphase constants</td></tr>" +
    "</tbody></table></div>",

  knobs: [
    ["Page order", "Run 10 ... Debug 99", "Sidebar order; reads in the order you would tune a run", "settings.lua PAGE"],
    ["live", "true", "false marks the row * and defers the change to the next run", "entry.live"],
    ["Stepper threshold", "range ≤ 12", "Ints with a narrow range get a stepper instead of a slider", "editor.lua drawSetting"],
    ["Text size", "1x (1-3)", "Scales every widget and the spacing unit together", "ui.fontScale"],
  ],

  related: [
    { id: "diff-profiles", how: "Profiles serialise against the schema, so a deleted key becomes an orphan." },
    { id: "debug-layers", how: "Overlay layers are ordinary bool settings." },
    { id: "inspection-levels", how: "Placards reuse the editor's one type-to-widget mapping." },
    { id: "reproducible-capture", how: "--set takes any schema key, so there is no list of capturable states." },
    { id: "json-tunables", how: "The flat-file alternative to a typed schema." },
  ],

  questions: [
    "Should the escaped constants (elite radius, target range 260, damping) become settings, or is a literal the right call for numbers nobody tunes?",
    "Can the schema carry design constraints, such as keeping <code>scale.hpPerWave</code> below the rate player damage grows, and check them live?",
  ],

  sparks: [
    "Generate the player-facing options and accessibility menu from the same schema, with a <code>player</code> flag per entry.",
    "Expose the schema as a mod API: a mod is a profile plus new content rows, and it can never reference a setting that no longer exists.",
    "Give each entry a <em>why</em> field and show it on hover, so the schema doubles as the design rationale document.",
    "A card game whose card text is generated from the schema, so a balance patch rewrites the cards.",
  ],

  terms: [
    { term: "Schema", def: "The single registry of every tunable: key, type, default, range, page and section.", code: "shared/framework/schema.lua" },
    { term: "Setting", def: "One schema entry, read through config.", code: "schema.register, config.values" },
    { term: "Content-derived setting", def: "A setting generated by walking content.lua field descriptors rather than written by hand.", code: "content.enemyFields, content.weaponFields" },
    { term: "Action", def: "An editor button that runs code instead of holding a value.", code: "editor.action" },
    { term: "Module spec", def: "The schema's counterpart for weapon-graph node properties, which have no fixed keys.", code: "mws/v2modules.lua" },
  ],

  sources: [
    "playground:shared/framework/schema.lua:65",
    "playground:shared/framework/config.lua:37",
    "playground:shared/framework/editor.lua:105",
    "playground:games/horde-survivor/settings.lua:347",
    "playground:games/horde-survivor/run.lua:315",
    "playground:CLAUDE.md",
    "playground:HANDOFF.md",
  ],

  shots: [
    { src: "img/editor-waves.png", caption: "The Waves page of the F1 editor: every row here is generated from a schema entry.", cmd: "luajit tools/screenshot.lua editor-waves.png --seed 7 --at 2 --editor Waves" },
  ],

  toy: {
    title: "Delete a setting, watch it vanish everywhere",
    hint: "click x to delete, drag a slider, add a setting",
    caption: "Left is the schema, the only list. The editor and profile columns are computed from it every frame and hold no list of their own. Simplified: six settings, one page, the profile is autosaved instantly.",
    w: 384, h: 216,
    controls: [
      { type: "button", label: "add setting", press(S) { addNext(S); } },
      { type: "button", label: "reset values", press(S) { for (const e of S.schema) S.values[e.key] = e.def; } },
    ],
    init(S) {
      S.schema = [
        { key: "run.waveSeconds", type: "number", def: 15, min: 5, max: 60 },
        { key: "player.moveSpeed", type: "number", def: 82, min: 10, max: 400 },
        { key: "enemy.grunt.speed", type: "number", def: 30, min: 0, max: 300 },
        { key: "ui.fontScale", type: "int", def: 1, min: 1, max: 3 },
        { key: "overlay.colliders", type: "bool", def: false },
        { key: "ui.textFont", type: "enum", def: "pixel", values: ["pixel", "arcade", "blocky"] },
      ];
      S.pool = [
        { key: "scale.eliteRadius", type: "number", def: 1.7 },
        { key: "scale.eliteRadius", type: "number", def: 1.7, min: 1, max: 3 },
        { key: "weapon.targetRange", type: "number", def: 260, min: 40, max: 600 },
        { key: "pickup.damping", type: "number", def: 0.86, min: 0.5, max: 1 },
      ];
      S.values = {}; for (const e of S.schema) S.values[e.key] = e.def;
      S.values["enemy.grunt.speed"] = 65.7;
      S.msg = ""; S.msgT = 0; S.drag = null;
    },
    update(S, P, dt) { S.msgT = Math.max(0, S.msgT - dt); },
    pointer(e, S) {
      const ROW = 15, Y0 = 50;
      const i = Math.floor((e.y - Y0 + 4) / ROW);
      if (e.type === "up") { S.drag = null; return; }
      if (e.type === "move" && S.drag) { setSlider(S, S.drag, e.x); return; }
      if (e.type !== "down" || i < 0 || i >= S.schema.length) return;
      const ent = S.schema[i];
      if (e.x > 112 && e.x < 126) { S.schema.splice(i, 1); delete S.values[ent.key]; flash(S, "deleted " + ent.key); return; }
      if (e.x > 236 && e.x < 250 && S.values[ent.key] !== ent.def) { S.values[ent.key] = ent.def; return; }
      if (e.x < 132 || e.x > 236) return;
      if (ent.type === "number") { S.drag = ent; setSlider(S, ent, e.x); }
      else if (ent.type === "bool") S.values[ent.key] = !S.values[ent.key];
      else if (ent.type === "int") S.values[ent.key] = e.x < 210 ? Math.max(ent.min, S.values[ent.key] - 1) : Math.min(ent.max, S.values[ent.key] + 1);
      else if (ent.type === "enum") { const v = ent.values; S.values[ent.key] = v[(v.indexOf(S.values[ent.key]) + 1) % v.length]; }
    },
    draw(g, S) {
      const C = g.C, ROW = 15, Y0 = 50;
      g.clear();
      g.label("SCHEMA", 4, 40, C.ink); g.label("EDITOR (F1)", 134, 40, C.ink); g.label("PROFILE JSON", 256, 40, C.ink);
      g.line(129, 32, 129, 212, C.rule); g.line(252, 32, 252, 212, C.rule);
      S.schema.forEach((ent, i) => {
        const y = Y0 + i * ROW, v = S.values[ent.key];
        g.label(ent.key, 4, y, C.ink2);
        g.text("x", 116, y, { color: C.enemy });
        const name = ent.key.split(".").pop();
        g.label(name, 134, y, C.ink3);
        const wx = 192, ww = 40;
        if (ent.type === "number") {
          const f = (v - ent.min) / (ent.max - ent.min);
          g.tone(wx, y - 6, ww, 6, 0.25, C.ink); g.rect(wx, y - 6, ww * f, 6, C.accent);
        } else if (ent.type === "bool") {
          g.rect(wx, y - 7, 8, 8, C.ink, 1); if (v) g.rect(wx + 2, y - 5, 5, 5, C.accent);
        } else if (ent.type === "int") {
          g.label("-  " + v + "x  +", wx, y, C.accent);
        } else g.label("[" + v + "]", wx, y, C.accent);
        if (v !== ent.def) g.text("x", 241, y, { color: C.ink3 });
      });
      const diff = S.schema.filter((e) => S.values[e.key] !== e.def);
      const lines = ["{", " \"name\": \"default\",", " \"values\": {"];
      for (const e of diff) lines.push(" \"" + e.key + "\":" + fmt(S.values[e.key]) + ",");
      lines.push(" }", "}");
      lines.forEach((l, i) => g.label(l, 256, 52 + i * 11, i > 2 && i < lines.length - 2 ? C.gold : C.ink3));
      if (S.msgT > 0) g.text(S.msg, 4, 208, { color: S.msg.startsWith("schema:") ? C.enemy : C.accent });
    },
    readout(S) {
      const diff = S.schema.filter((e) => S.values[e.key] !== e.def).length;
      return "schema " + S.schema.length + " keys\neditor " + S.schema.length + " rows · profile " + diff + " override" + (diff === 1 ? "" : "s");
    },
  },
});
})();
