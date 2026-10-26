(function () {
  const SETTLE = 3, FIXED = 1 / 60;

  // One capture: returns the simulated time at each shot. A frozen capture
  // advances only in fixed steps; an unfrozen one also lets every drawn frame
  // (3 settle frames, each shot frame) step the sim by whatever dt it got.
  function capture(P, frozen, rand) {
    let ticks = 0, wall = 0;
    const jitter = () => { if (!frozen) wall += 0.012 + rand() * 0.01; };
    for (let i = 0; i < SETTLE; i++) jitter();
    ticks += Math.round(P.at * 60);
    ticks += P.presses;                       // one step per --press
    const shots = [];
    for (let f = 0; f < P.frames; f++) {
      if (f > 0) ticks += Math.round(P.every * 60);
      shots.push(ticks * FIXED + wall);
      jitter();
    }
    return shots;
  }
  function scene(t) {
    const out = [];
    for (let i = 0; i < 6; i++) { const a = t * 0.9 + i * 1.05, r = 14 + 6 * Math.sin(t * 0.5 + i); out.push([Math.cos(a) * r, Math.sin(a) * r * 0.7]); }
    return out;
  }
  function hash(t) { let h = 7; for (const [x, y] of scene(t)) h = (h * 131 + Math.round(x * 1000) * 3 + Math.round(y * 1000)) % 999983; return h; }

  Wiki.construct({
    id: "reproducible-capture",
    name: "Byte-reproducible scripted screenshots",
    family: "tooling",
    origin: "playground",
    status: "built",
    statusNote: "Built and used after every drawn change. Known gaps: <code>--set overlay.*</code> draws nothing, and in run mode any <code>--at</code> of 30 s or more lands on the shop.",
    summary: "One command line launches the game, fast-forwards the frozen simulation in fixed steps, applies editor actions and key presses, draws a frame, writes a PNG and quits, and the same command line always writes the same bytes.",
    tags: ["screenshots", "determinism", "automation", "visual testing"],

    intent:
      "<p>Every pixel in the playground is drawn from primitives and every editor surface is generated, so \"does this look right?\" can only be answered by looking. The agents doing most of the work run in worktrees with nobody at the keyboard. They need to ask for a picture of any state and get one back at a known path in about a second.</p>" +
      "<p>Reproducibility turns that into a test: two captures of the same command line, before and after a change, are a real before-and-after. CLAUDE.md records that every bug found in the draw path so far was found this way; headless tests cannot see a widget at the wrong scale.</p>",

    how:
      "<h3>The command</h3>" +
      "<p><code>luajit tools/screenshot.lua out.png [flags]</code> spawns LÖVE with <code>--capture</code>, enforces a timeout (60 s, <code>SCREENSHOT_TIMEOUT</code>), checks the PNG signature and returns non-zero on any error, with the error on stderr instead of LÖVE's blue screen. The flags \"bottom out in things that already exist\": <code>--set</code> takes any [[schema-editor|schema key]], <code>--do</code> any editor action label, <code>--press</code> any input action, so there is no list of capturable states to maintain.</p>" +
      "<h3>Order of events</h3>" +
      "<ol><li><b>Begin</b>: autosave off (a capture must not touch the repo), <code>--profile</code>, <code>--set</code> (silent), <code>--seed</code> pins LÖVE's generator and restarts the run on that seed, <code>--mode zoo|range|bench</code>, <code>--overlays</code>, <code>--perf</code>. The live-inspection server stays off.</li>" +
      "<li><b>Settle</b>: draw 3 frames so the window and GL context are real. The simulation is frozen.</li>" +
      "<li><b>Warm-up</b>: <code>round(at &times; 60)</code> steps of exactly 1/60 s, in one update. Default <code>--at 2</code>.</li>" +
      "<li><b>Actions</b>: each <code>--do</code>, by label. Then each <code>--press</code> with one fixed step after it, so two presses of <code>next</code> cycle twice.</li>" +
      "<li><b>Editor</b>: <code>--editor [page]</code> opens F1 on that page; <code>--dropdown key</code> opens a menu.</li>" +
      "<li><b>Shoot</b>, then for a series (<code>--frames n --every s</code>) advance <code>every &times; 60</code> fixed steps and shoot again, writing <code>out-001.png</code> onwards. Then quit.</li></ol>" +
      "<p><code>capture.frozen()</code> is true for the whole capture: the frames spent settling and the frame each shot is taken on would otherwise run at whatever dt the machine handed them. The only time that passes is fixed-step.</p>" +
      "<h3>Gotchas found by using it</h3>" +
      "<ul><li>In run mode the first shop opens at 30 s and stops the clock, so <code>--at 30</code> or later shows the shop unless <code>--set run.wavesPerShop=10</code> pushes it out.</li>" +
      "<li>Actions run after the warm-up, so an action whose effect takes time (\"Skip to last wave\") needs <code>--frames</code>/<code>--every</code> to show it.</li>" +
      "<li>Captures load the startup profile, so they show [[diff-profiles|default.json's]] overrides.</li>" +
      "<li><code>--set overlay.&lt;id&gt;=true</code> is silent and nothing re-syncs [[debug-layers|the layer mirror]]; use <code>--overlays</code>.</li></ul>",

    knobs: [
      ["--at", "2 s", "Simulated seconds of fixed-step warm-up", "capture.lua DEFAULT_AT"],
      ["Settle frames", "3", "Frames drawn before the first shot, sim frozen", "SETTLE_FRAMES"],
      ["--frames / --every", "1 / 0.5 s", "Series length and fixed-step spacing", "plan.frames, plan.every"],
      ["Timeout", "60 s", "Launcher kills a hung capture", "SCREENSHOT_TIMEOUT"],
    ],

    related: [
      { id: "headless-sim", how: "Fast-forwarding works because the run steps on dt alone." },
      { id: "schema-editor", how: "--set reaches every setting with no capture-specific list." },
      { id: "debug-layers", how: "--overlays works; --set overlay.* does not." },
      { id: "diff-profiles", how: "Captures switch autosave off and load the startup profile." },
      { id: "inspection-levels", how: "--mode zoo and range reproduce because the sandbox seed comes from the pinned generator." },
    ],

    questions: [
      "Should captures default to a clean profile, so a picture does not depend on whatever default.json drifted to?",
      "Should golden-image comparison run in CI, now that byte-identical output is a guarantee?",
    ],

    sparks: [
      "Generate every illustration in a design wiki from capture command lines, so the pictures update when the game does.",
      "Bug reports as a command line: seed, profile, actions, time. Paste it and the reporter's frame appears.",
      "A photo mode that is the capture plan with a UI: players script a shot and share the line, not the image.",
    ],

    terms: [
      { term: "Capture", def: "A scripted screenshot run that writes a PNG and exits.", code: "capture.lua, tools/screenshot.lua" },
      { term: "Warm-up", def: "The fixed 1/60 s steps that fast-forward to --at.", code: "capture.advance" },
      { term: "Settle frames", def: "Frames drawn with the sim frozen so the window is real before shooting.", code: "SETTLE_FRAMES" },
      { term: "Capture series", def: "Several shots of one simulation, every s seconds apart.", code: "--frames, --every" },
    ],

    sources: [
      "playground:shared/framework/capture.lua:1",
      "playground:shared/framework/capture.lua:206",
      "playground:shared/framework/capture.lua:241",
      "playground:shared/framework/capture.lua:303",
      "playground:tools/screenshot.lua",
      "playground:main.lua:105",
      "playground:CLAUDE.md",
    ],

    shots: [
      { src: "img/editor-waves.png", caption: "Reached by flags alone: the editor opened on the Waves page.", cmd: "luajit tools/screenshot.lua editor-waves.png --seed 7 --at 2 --editor Waves" },
      { src: "img/shop.png", caption: "Two editor actions after an 8 s warm-up: +100 gold, then Open shop.", cmd: "luajit tools/screenshot.lua shop.png --at 8 --seed 7 --do \"+100 gold\" --do \"Open shop\"" },
    ],

    toy: {
      title: "Settle, warm up, act, shoot",
      hint: "set the flags, then capture twice",
      caption: "The bar is simulated time; settle frames take none while the sim is frozen. Each thumbnail is the frame at its shot time and its hash. Unfreeze the sim and the settle and shot frames leak variable dt, so two runs of one command line differ. Simplified scene; the real launcher also checks the PNG.",
      w: 384, h: 216,
      controls: [
        { type: "range", key: "at", label: "--at", min: 0, max: 40, step: 0.5, value: 8, fmt: "{} s" },
        { type: "range", key: "presses", label: "--press", min: 0, max: 3, value: 0 },
        { type: "range", key: "frames", label: "--frames", min: 1, max: 4, value: 3 },
        { type: "range", key: "every", label: "--every", min: 0.25, max: 4, step: 0.25, value: 0.5, fmt: "{} s" },
        { type: "toggle", key: "frozen", label: "sim frozen", value: true },
        { type: "button", label: "capture twice", press(S, P, kit) { S.runs = [capture(P, P.frozen, kit.rand), capture(P, P.frozen, kit.rand)]; } },
      ],
      init(S) { S.t = 0; S.runs = null; },
      change(key, S) { S.runs = null; },
      update(S, P, dt) { S.t = (S.t + dt) % 4; },
      draw(g, S, P, kit) {
        const C = g.C;
        g.clear();
        const shots = capture(P, true, kit.rand);
        const end = shots[shots.length - 1], span = Math.max(end, 1) * 1.08;
        const X0 = 60, X1 = 376, Y = 58, X = (t) => X0 + (t / span) * (X1 - X0);
        // settle block: no simulated time
        g.tone(10, Y - 8, 44, 16, 0.5, C.ink2); g.label("SETTLE 3F", 32, Y - 12, C.ink3, "center");
        g.tone(X0, Y - 6, X(P.at) - X0, 12, 0.25, C.accent); g.rect(X0, Y - 6, X(P.at) - X0, 12, C.accent, 1);
        g.label("WARM-UP " + Math.round(P.at * 60) + " STEPS", X0 + 2, Y + 18, C.accent);
        g.line(X(P.at), Y - 12, X(P.at), Y + 10, C.gold, 1.5); g.label("--DO", X(P.at), Y - 14, C.gold, "center");
        for (let i = 0; i < P.presses; i++) g.rect(X(P.at + (i + 1) / 60) - 0.5, Y - 4, 1.5, 8, C.violet);
        shots.forEach((t, i) => { g.line(X(t), Y - 10, X(t), Y + 10, C.ink, 1); g.label("#" + (i + 1), X(t), Y + 30, C.ink, "center"); });
        if (P.at < 30 && end >= 30) { g.line(X(30), Y - 10, X(30), Y + 10, C.enemy, 1, [2, 2]); g.label("SHOP AT 30S", X(30), Y + 40, C.enemy, "center"); }
        else if (P.at >= 30) g.label("RUN MODE: THIS SHOWS THE SHOP", X0, Y + 40, C.enemy);
        // playhead
        const ph = S.t < 0.6 ? 10 + (S.t / 0.6) * 44 : X0 + Math.min(1, (S.t - 0.6) / 2.6) * (X(end) - X0);
        g.line(ph, Y - 16, ph, Y + 14, C.ink2, 1);
        // thumbnails: each run's frames
        const rows = S.runs || [shots];
        rows.forEach((run, ri) => {
          const y0 = 112 + ri * 52;
          g.label(S.runs ? "RUN " + (ri ? "B" : "A") : "FRAMES", 8, y0 + 26, C.ink3);
          run.forEach((t, i) => {
            const x0 = 60 + i * 80, cx = x0 + 34, cy = y0 + 20;
            g.rect(x0, y0, 68, 40, C.rule, 1);
            for (const [x, y] of scene(t)) g.circle(cx + x, cy + y, 2, C.enemy);
            g.circle(cx, cy, 2.5, C.ink);
            const same = S.runs && hash(S.runs[0][i]) === hash(S.runs[1][i]);
            g.label(String(hash(t)).padStart(6, "0"), x0 + 34, y0 + 50, S.runs ? (same ? C.accent : C.enemy) : C.ink3, "center");
          });
        });
      },
      readout(S, P) {
        const steps = Math.round(P.at * 60) + P.presses + (P.frames - 1) * Math.round(P.every * 60);
        let verdict = "";
        if (S.runs) verdict = S.runs[0].every((t, i) => hash(t) === hash(S.runs[1][i])) ? "  identical" : "  differ";
        return steps + " fixed steps" + verdict;
      },
    },
  });
})();
