(function () {
  const SCHEMA = [
    { key: "enemy.grunt.speed", def: 30, min: 0, max: 300 },
    { key: "enemy.swarmer.speed", def: 96, min: 0, max: 300 },
    { key: "enemy.brute.chargeSpeed", def: 300, min: 0, max: 600 },
    { key: "enemy.spitter.shootCooldown", def: 2.4, min: 0.2, max: 10 },
    { key: "player.moveSpeed", def: 82, min: 10, max: 400 },
    { key: "run.waveSeconds", def: 15, min: 5, max: 60 },
  ];
  // What config/profiles/default.json holds today (rounded).
  const COMMITTED = { "enemy.grunt.speed": 65.7, "enemy.swarmer.speed": 63, "enemy.brute.chargeSpeed": 232.7, "enemy.spitter.shootCooldown": 4.9 };
  const DELAY = 0.8, ROW = 22, Y0 = 52, SX = 6, SW = 150;

  const round = (v) => Math.round(v * 10) / 10;
  function diff(S) {
    const out = {};
    for (const e of S.schema) if (S.values[e.key] !== e.def) out[e.key] = S.values[e.key];
    return out;
  }
  function save(S) {
    const f = S.files[S.active];
    f.values = diff(S); f.saved = S.t; S.orphans = [];
    S.writes++;
  }
  function load(S) {
    for (const e of S.schema) S.values[e.key] = e.def;            // config.resetAll first
    const vals = S.files[S.active].values;
    S.orphans = Object.keys(vals).filter((k) => !S.schema.some((e) => e.key === k));
    for (const e of S.schema) if (vals[e.key] != null) S.values[e.key] = vals[e.key];
    S.dirty = false;                                               // loads never dirty
  }

  Wiki.construct({
    id: "diff-profiles",
    name: "Profiles that store only what changed",
    family: "tooling",
    origin: "playground",
    status: "built",
    statusNote: "Built and in daily use. The committed <code>default.json</code> has drifted from schema defaults through autosave, so the game at launch and the balance harness currently run different enemy speeds.",
    summary: "A profile is a JSON file of overrides from the schema defaults, never a snapshot, so new settings inherit their defaults, removed ones become prunable orphans, and the file diffs cleanly in git.",
    tags: ["profiles", "presets", "autosave", "json", "drift"],

    intent:
      "<p>A designer wants to keep a tuning pass (\"brutal\", \"sandbox\", \"my Tuesday experiment\") without freezing every other number at the moment of saving. Storing only the differences means a setting added next week arrives in every old profile at its default, and a setting deleted from the code shows up as a stale line rather than a crash.</p>" +
      "<p>Profiles live in the repo as JSON, so a tuning pass is a reviewable commit and a diff reads as balance-patch notes.</p>",

    how:
      "<h3>Load, save, prune</h3>" +
      "<ul><li><b>Load</b> (<code>profiles.applyLoad</code>): <code>config.resetAll()</code> to schema defaults first, so loading is absolute rather than cumulative; collect any key the schema no longer declares into <code>profiles.orphans</code>; apply the rest silently; clear restart flags. The status line reports \"(N stale key(s))\".</li>" +
      "<li><b>Save</b> (<code>profiles.save</code>): writes <code>{name, description, savedAt, values = config.diffFromDefaults()}</code>. The diff walks the schema, so orphans are dropped on every save.</li>" +
      "<li><b>Prune</b> (<code>profiles.pruneOrphans</code>) is just a save of the active profile.</li></ul>" +
      "<p><code>_index.json</code> holds the profile order and which one is the <b>startup</b> profile, loaded at launch and by every screenshot capture. The <b>active</b> profile is whichever was loaded last. They start out the same, which is where the trouble below comes from. Shipped profiles: <code>default</code>, <code>sandbox</code> (god mode, 3-minute run, overlays on), <code>brutal</code> (steeper HP growth, elite chance 7%, less gold).</p>" +
      "<h3>Autosave</h3>" +
      "<p>Any edit marks the active profile dirty and restarts a quiet timer; after <code>profiles.autosaveDelay</code> (0.8 s) with no further change it is written. A slider drag produces one write, not one per frame. Loading a profile is suppressed from dirtying, or every load would immediately rewrite what it read. Capture runs switch autosave off so a <code>--set</code> never touches the repo.</p>" +
      "<h3>The drift finding</h3>" +
      "<p>Autosave writes into the <em>active</em> profile, which is usually <code>default</code>. Commit <code>9d889f4</code> (\"Playtested values, autosaved into the default profile\") turned a playtest into the shipped default, and <code>save</code> keeps the old description, so the file still opens with \"Empty on purpose: profiles store only overrides.\" It is not empty:</p>" +
      "<div class=\"tbl-wrap\"><table><thead><tr><th>Key</th><th>Schema</th><th>default.json</th></tr></thead><tbody>" +
      "<tr><td><code>enemy.grunt.speed</code></td><td>30</td><td>65.71</td></tr>" +
      "<tr><td><code>enemy.swarmer.speed</code></td><td>96</td><td>62.96</td></tr>" +
      "<tr><td><code>enemy.brute.chargeRange</code> / <code>chargeSpeed</code></td><td>150 / 300</td><td>129.6 / 232.7</td></tr>" +
      "<tr><td><code>enemy.lancer.chargeSpeed</code></td><td>260</td><td>234</td></tr>" +
      "<tr><td><code>enemy.spitter.shootCooldown</code></td><td>2.4</td><td>4.9</td></tr>" +
      "<tr><td><code>bench.holdFire</code> (uncommitted)</td><td>false</td><td>true</td></tr>" +
      "</tbody></table></div>" +
      "<p>Meanwhile the [[balance-harness]] builds from schema defaults and loads no profile unless given <code>--profile</code>, although its own header comment says \"full run, default profile\". The harness and the game a human plays are measuring different grunts.</p>",

    knobs: [
      ["Autosave", "on", "Write edits back to the active profile", "profiles.autosave"],
      ["Autosave delay", "0.8 s", "Quiet time after the last change before writing", "profiles.autosaveDelay"],
      ["Startup profile", "default", "Loaded at launch and by captures", "config/profiles/_index.json startup"],
    ],

    related: [
      { id: "schema-editor", how: "The diff is taken against schema defaults; orphans are keys the schema dropped." },
      { id: "balance-harness", how: "Reads schema defaults only, so it does not see the drifted default.json." },
      { id: "reproducible-capture", how: "Captures load the startup profile and switch autosave off." },
      { id: "json-tunables", how: "A whole-file tunables approach, where every value is a snapshot." },
    ],

    questions: [
      "Which fix for the drift: harness loads the startup profile by default, or autosave targets a separate working profile and <code>default</code> stays truly empty?",
      "Should a save rewrite a description that no longer matches the contents, or warn?",
    ],

    sparks: [
      "Ship profiles to players as difficulty modes: a mode is a short, readable list of overrides.",
      "Stack profiles as layers (base, then brutal, then my tweaks), with the editor showing which layer set each value.",
      "Publish the git diff of a profile as the balance-patch notes, generated rather than written.",
      "A puzzle game where each level is a diff against a base ruleset, so new rules never break old levels.",
    ],

    terms: [
      { term: "Profile", def: "A saved set of overrides from schema defaults, stored as JSON in config/profiles.", code: "profiles.save, config.diffFromDefaults" },
      { term: "Orphan", def: "A key in a profile that the schema no longer declares; reported on load, dropped on the next save.", code: "profiles.orphans, profiles.pruneOrphans" },
      { term: "Startup profile", def: "The profile loaded at launch and by captures.", code: "_index.json startup" },
      { term: "Active profile", def: "The profile loaded last, and the one autosave writes to.", code: "profiles.active" },
      { term: "Autosave", def: "Writing the active profile after a quiet interval following an edit.", code: "profiles.update" },
    ],

    sources: [
      "playground:shared/framework/profiles.lua:113",
      "playground:shared/framework/profiles.lua:221",
      "playground:shared/framework/config.lua:117",
      "playground:config/profiles/default.json",
      "playground:config/profiles/_index.json",
      "playground:tools/balance.lua:3",
      "playground:HANDOFF.md",
    ],

    toy: {
      title: "Drag a value, watch the file",
      hint: "drag sliders; delete a setting; load the file again",
      caption: "The file on the right is written only after 0.8 s of quiet. It starts as the committed default.json, playtest values included. Simplified: six settings, two profiles, one key deleted per press.",
      w: 384, h: 216,
      controls: [
        { type: "select", key: "start", label: "default.json", value: "committed", reset: true, options: [["committed", "as committed"], ["empty", "truly empty"]] },
        { type: "select", key: "target", label: "autosave into", value: "default", options: [["default", "default (active)"], ["working", "a working profile"]] },
        { type: "button", label: "delete a setting", press(S) { if (S.schema.length > 1) { const e = S.schema.shift(); delete S.values[e.key]; S.removed.push(e.key); } } },
        { type: "button", label: "load profile", press(S) { load(S); } },
        { type: "button", label: "prune", press(S) { save(S); } },
      ],
      init(S, P) {
        S.schema = SCHEMA.map((e) => Object.assign({}, e));
        S.files = { default: { values: P.start === "committed" ? Object.assign({}, COMMITTED) : {}, saved: 0 }, working: { values: {}, saved: 0 } };
        S.active = "default"; S.values = {}; S.removed = []; S.t = 0; S.writes = 0; S.drag = null;
        load(S); S.since = 0;
      },
      change(key, S, P) {
        if (key === "target") { S.active = P.target; if (P.target === "working") { S.files.working.values = diff(S); } }
      },
      update(S, P, dt) {
        S.t += dt;
        if (S.dirty) { S.since += dt; if (S.since >= DELAY) { S.dirty = false; save(S); } }
      },
      pointer(e, S) {
        if (e.type === "up") { S.drag = null; return; }
        if (e.type === "down") {
          const i = Math.floor((e.y - Y0 + 10) / ROW);
          if (i >= 0 && i < S.schema.length && e.x > SX - 4 && e.x < SX + SW + 4) S.drag = S.schema[i];
        }
        if (S.drag && e.down) {
          const d = S.drag, f = Math.max(0, Math.min(1, (e.x - SX) / SW));
          const v = round(d.min + f * (d.max - d.min));
          if (v !== S.values[d.key]) { S.values[d.key] = v; S.dirty = true; S.since = 0; }
        }
      },
      draw(g, S) {
        const C = g.C;
        g.clear();
        g.label("EDITOR", 4, 40, C.ink);
        S.schema.forEach((d, i) => {
          const y = Y0 + i * ROW, v = S.values[d.key], f = (v - d.min) / (d.max - d.min);
          const mod = v !== d.def;
          g.label(d.key.replace("enemy.", ""), SX, y, mod ? C.gold : C.ink3);
          g.tone(SX, y + 3, SW, 5, 0.25, C.ink); g.rect(SX, y + 3, SW * f, 5, mod ? C.gold : C.accent);
          g.rect(SX + SW * ((d.def - d.min) / (d.max - d.min)) - 0.5, y + 1, 1, 9, C.ink);
          g.label(String(v), SX + SW, y, C.ink2, "right");
        });
        // autosave timer
        if (S.dirty) { g.meter(4, 194, 180, 4, S.since / DELAY, C.accent); g.label("AUTOSAVE IN " + Math.max(0, DELAY - S.since).toFixed(1) + "S", 4, 210, C.ink2); }
        else g.label("SAVED " + S.writes + "X", 4, 210, C.ink3);
        // the file
        const X = 196, f = S.files.default;
        g.rect(X - 4, 30, 192, 184, C.rule, 1);
        g.label("DEFAULT.JSON" + (S.active === "default" ? "  (ACTIVE)" : ""), X, 42, C.ink);
        g.label("\"description\": \"Empty on purpose\"", X, 56, C.ink3);
        let y = 70;
        const keys = Object.keys(f.values);
        g.label("\"values\": {" + (keys.length ? "" : " }"), X, y, C.ink3); y += 11;
        for (const k of keys) {
          const orphan = !S.schema.some((e) => e.key === k);
          g.label("  " + k.replace("enemy.", "") + ": " + f.values[k], X, y, orphan ? C.enemy : C.gold);
          if (orphan) g.label("STALE", X + 160, y, C.enemy);
          y += 11;
        }
        if (keys.length) { g.label("}", X, y, C.ink3); y += 11; }
        if (S.active === "working") {
          y += 6; g.label("WORKING.JSON  (ACTIVE)", X, y, C.accent); y += 11;
          for (const k of Object.keys(S.files.working.values)) { g.label("  " + k.replace("enemy.", "") + ": " + S.files.working.values[k], X, y, C.accent); y += 11; }
        }
        g.label("GAME GRUNT " + (f.values["enemy.grunt.speed"] != null ? f.values["enemy.grunt.speed"] : 30) + " / HARNESS 30", X, 210, f.values["enemy.grunt.speed"] != null ? C.enemy : C.ink3);
      },
      readout(S) {
        const n = Object.keys(S.files.default.values).length;
        return "default.json: " + n + " override" + (n === 1 ? "" : "s") + "\norphans on load: " + S.orphans.length;
      },
    },
  });
})();
