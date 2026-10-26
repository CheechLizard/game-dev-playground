(function () {
  // Slot choices for the toy. Repeater tiers follow M.triggerProps: period / tierScale, rounded, at least 2.
  const OPTS = [
    ["none", "(empty)"], ["inverter", "Inverter"], ["single", "Single"], ["toggle", "Toggle"],
    ["delay", "Delay 8"], ["rep", "Repeater 6/1"], ["burst", "Repeater 6/3"],
    ["rare", "Repeater 6/1 rare"], ["prox", "Proximity"],
  ];
  const PATTERN = "000111001100" + "0000";
  const NAMES = { inverter: "INVERTER", single: "SINGLE", toggle: "TOGGLE", delay: "DELAY 8", rep: "REPEAT 6/1", burst: "REPEAT 6/3", rare: "REPEAT 4/1", prox: "PROXIMITY" };

  function make(kind) {
    const t = { kind, previous: 0, latched: 0, phase: 0, tick: 0, history: [], period: 6, width: 1, delay: 8 };
    if (kind === "burst") t.width = 3;
    if (kind === "rare") t.period = Math.max(2, Math.floor(6 / 1.5 + 0.5));
    t.width = Math.min(t.period - 1, t.width);
    return t;
  }
  // One simulation tick, as Instance:step in triggers.lua: evaluate, then previous = input, tick++.
  function step(t, input, near) {
    let out = 0;
    if (t.kind === "inverter") out = 1 - input;
    else if (t.kind === "single") out = input === 1 && t.previous === 0 ? 1 : 0;
    else if (t.kind === "toggle") { if (input === 1 && t.previous === 0) t.latched = 1 - t.latched; out = t.latched; }
    else if (t.kind === "delay") { const i = t.tick % t.delay; out = t.history[i] || 0; t.history[i] = input; }
    else if (t.kind === "prox") out = near ? 1 : 0;
    else { if (input === 0) { t.phase = 0; out = 0; } else { out = t.phase < t.width ? 1 : 0; t.phase = (t.phase + 1) % t.period; } }
    t.previous = input; t.tick++;
    return out;
  }
  const ORDER_NOTES = {
    "inverter>single": "INVERTER > SINGLE: ONE PULSE PER RELEASE",
    "single>inverter": "SINGLE > INVERTER: HOT EXCEPT ONE TICK PER PRESS",
    "toggle>rep": "TOGGLE > REPEATER: PRESS TO START AUTOFIRE, PRESS TO STOP",
    "toggle>burst": "TOGGLE > REPEATER: PRESS TO START BURSTS, PRESS TO STOP",
    "inverter>toggle": "INVERTER > TOGGLE: FLIPS ON RELEASE",
    "inverter>inverter": "TWO INVERTERS CANCEL",
    "rep>single": "REPEATER > SINGLE: ONE PULSE PER REPEAT (NEEDS THE COLD TICK)",
    "burst>single": "3-WIDE BURST > SINGLE: ONE PULSE PER BURST",
    "single>delay": "SINGLE > DELAY: ONE ECHO, 8 TICKS LATE",
  };

  Wiki.construct({
    id: "trigger-chain",
    name: "Trigger signal chain",
    family: "weapons",
    origin: "playground",
    status: "built",
    statusNote: "All nine Trigger subclasses run in the MWS v2 runtime, playable in the F8 bench. Proximity departs from the spec: it uses its own sensor radius and ignores its input bit. Event batching (several Hits in one tick) is still an open decision; the runtime gives each event its own context.",
    summary: "Fire modes are small signal processors: each Trigger turns one bit per tick into another bit, chained in graph order, and a hot output is an opportunity to fire, never a queued shot.",
    tags: ["input", "timing", "signal", "order matters", "fire mode"],

    intent:
      "<p>Semi-auto, full-auto, burst, toggle-on autofire, fire-on-release, a mine that waits for company: in most games each is a flag on a weapon. Here they are parts. A designer gets a new fire mode by stacking two Triggers, and a player who finds a Toggle can bolt it in front of a Repeater and stop holding the button.</p>" +
      "<p>Keeping Triggers ignorant of energy is the other half of the idea. <em>When</em> a weapon wants to fire is a property of the signal; <em>whether</em> it can afford to is the [[sequence-reservoir|battery's]] business. A tap is never lost and mashing never banks shots.</p>",

    how:
      "<h3>One bit per simulation tick</h3>" +
      "<p>The weapon never sees a device. The application input layer (<code>shared/framework/input.lua</code>) owns keys, pads, repeat and timing: <code>fireDown(source)</code> marks a press only if that source was not already down, so keyboard repeat adds nothing, and <code>sampleFire()</code> returns hot if a press happened since the last sample or any source is still held. A tap shorter than one tick still yields one hot tick; five taps inside one tick yield one. The weapon input adapter (<code>mws/input.lua</code>) turns <code>FIRE_BUTTON_DOWN</code>/<code>UP</code> into a hot flag and <code>sample()</code> reads it as 1 or 0. Neither layer has a replay queue. The simulation runs at 60 ticks per second (<code>STEP = 1/60</code>).</p>" +
      "<h3>Hot, cold, and the startup rule</h3>" +
      "<p><b>Hot</b> is an output of 1, <b>cold</b> is 0. Each Trigger instance keeps <code>previous</code>, <code>latched</code>, <code>phase</code>, <code>tick</code> and a <code>history</code> ring, all starting at zero. Because previous input starts cold, a button already held when the weapon appears produces a Single pulse and switches a Toggle on, and Inverter &rarr; Single on an idle stream fires once at startup. State is keyed per execution context and route, so the same module reached by two paths keeps two states.</p>" +
      "<h3>The signal Triggers</h3>" +
      "<div class=\"tbl-wrap\"><table><thead><tr><th>Subclass</th><th>Rule each tick</th><th>Props</th></tr></thead><tbody>" +
      "<tr><td>Inverter</td><td><code>1 - input</code>. An idle stream becomes constant autofire.</td><td>none</td></tr>" +
      "<tr><td>Single</td><td>Hot only on a 0&rarr;1 edge. Cold input rearms it.</td><td>none</td></tr>" +
      "<tr><td>Toggle</td><td>Flips <code>latched</code> on each 0&rarr;1 edge and outputs it. Release changes nothing.</td><td>none</td></tr>" +
      "<tr><td>Delay</td><td>Ring buffer of <code>delayTicks</code> bits: outputs the bit written that many ticks ago, then stores this one. Hot and cold both echo; later input cannot cancel pending output. 0 passes through. See [[delay-echo]] for its spatial side.</td><td><code>delayTicks</code> 1 (0-36000)</td></tr>" +
      "<tr><td>Repeater</td><td>Cold input resets <code>phase</code> to 0. Hot: output <code>phase &lt; pulseTicks</code>, then <code>phase = (phase+1) % periodTicks</code>. So the first pulse is immediate. <code>pulseTicks &lt; periodTicks</code> is enforced, leaving a cold tick so a Single downstream can tell pulses apart.</td><td><code>periodTicks</code> 6, <code>pulseTicks</code> 1, <code>tier</code></td></tr>" +
      "<tr><td>Proximity</td><td>Hot while any live enemy is within <code>sensorRadius</code> of the packet origin. Ignores its input bit.</td><td><code>sensorRadius</code> 60 px (1-300)</td></tr>" +
      "</tbody></table></div>" +
      "<p>Hit, Miss and Complete are Triggers too, but they read Striker events at the root of a later sequence; they live on [[sequences]].</p>" +
      "<h3>Repeater tiers</h3>" +
      "<p>Only the Repeater exposes a trigger tier. The effective period is <code>max(2, round(periodTicks / tierScale))</code> and the width is capped at period &minus; 1, with <code>tierScale</code> trash 0.5, common 1, rare 1.5, legendary 2, celestial 3. A 6-tick Repeater becomes 12 / 6 / 4 / 3 / 2 ticks. These numbers are marked provisional in the implementation notes.</p>" +
      "<h3>Order matters</h3>" +
      "<p>The spec's reference stream, each row fed the input row:</p>" +
      "<pre>Input      000111001100\nInverter   111000110011\nSingle     000100001000\nToggle     000111110000</pre>" +
      "<p>Chained, the order changes the meaning: Inverter &rarr; Single pulses on each <em>release</em>; Single &rarr; Inverter stays hot except one cold tick per press; Toggle &rarr; Repeater starts autofire on one press and stops it on the next. Width also interacts with the Striker: a Ranged Striker requests a shot on <em>every</em> hot tick, so a Repeater with <code>pulseTicks</code> 3 is a three-round burst.</p>" +
      "<h3>The firing rule</h3>" +
      "<p>A hot output plus enough stored energy starts a strike. Not enough energy: the opportunity is skipped (<code>stats.skipped</code>), never queued. A Trigger held hot retries every tick, so it fires the moment refill reaches the threshold without needing a new press; a cold Trigger never fires because energy arrived. A sustained Striker that already has a live strike on that route ignores further hot ticks.</p>",

    knobs: [
      ["Subclass", "single", "Which signal rule the Trigger applies", "node.props.subclass"],
      ["Delay", "1 tick", "How far a Delay shifts the whole pattern; 60 ticks = 1 s", "delayTicks"],
      ["Pulse period", "6 ticks", "Start-to-start Repeater interval", "periodTicks"],
      ["Pulse width", "1 tick", "Hot ticks per Repeater pulse; must be below the period", "pulseTicks"],
      ["Trigger tier", "common", "Divides the Repeater period by 0.5 / 1 / 1.5 / 2 / 3", "M.triggerTier, M.tierScale"],
      ["Sensor radius", "60 px", "Proximity's detection circle around the origin", "sensorRadius"],
    ],

    related: [
      { id: "delay-echo", how: "The Delay Trigger also delays where the shot comes from." },
      { id: "sequence-reservoir", how: "Decides whether a hot tick becomes a strike or a skip." },
      { id: "sequences", how: "Hit, Miss and Complete Triggers start the next sequence." },
      { id: "mws-graph", how: "Where Triggers sit in the five-class pipeline." },
    ],

    questions: [
      "Proximity: the spec wants it hot while enemies are inside \"the sequence's AOE\" and leaves upstream gating open. The code uses an explicit circle and ignores its input. Should a cold upstream gate the sensor, and should the geometry come from the Striker's reach?",
      "Delay units and rounding: code stores integer ticks; the spec has not decided whether designers should author seconds.",
      "Numerical Repeater tier rates and the allowed width/period combinations are provisional.",
      "Combining two signals (AND, OR) needs multi-input joins, which the graph does not allow yet.",
    ],

    sparks: [
      "A rhythm shooter where the only input is the bitstream and every weapon is a signal processor on it; the score is how close your output row is to the song's.",
      "Dead-man's switch weapons: Inverter at the root, so the gun fires whenever you are not holding the button and the skill is in letting go.",
      "Author enemy fire patterns as Trigger chains fed by a scripted bitstream, so enemy and player weapons share one inspector and one set of bugs.",
      "A puzzle game that shows a target output row and a drawer of Triggers; the solution is the chain that produces it.",
    ],

    terms: [
      { term: "Input bitstream", def: "One fire bit per simulation tick, sampled from the application input layer through the weapon input adapter.", code: "input:sample(), input.sampleFire" },
      { term: "Hot / cold", def: "A Trigger output of 1 / 0. A hot output is a firing opportunity, taken only if startup energy is stored.", code: "Instance:step" },
      { term: "Firing opportunity", def: "One hot tick reaching a Striker. Unaffordable opportunities are skipped, never queued.", code: "R:offer, stats.skipped" },
      { term: "Trigger tier", def: "Repeater-only rarity that divides the pulse period by the tier scale.", code: "M.triggerTier" },
      { term: "Startup rule", def: "Previous input starts cold, so input already hot on the first tick fires a Single and switches a Toggle on.", code: "previous = 0" },
    ],

    sources: [
      "playground:shared/framework/mws/triggers.lua",
      "playground:shared/framework/mws/input.lua",
      "playground:shared/framework/input.lua:15",
      "playground:shared/framework/mws/v2modules.lua:133",
      "playground:shared/framework/mws/v2runtime.lua:277",
      "playground:docs/Modular_Weapon_System.md",
    ],

    toy: {
      title: "Three Trigger slots on one bitstream",
      hint: "press and hold anywhere on the stage",
      caption: "Each row is fed the row above it. Ticks are slowed to 15 per second so single ticks are visible; the rules are the triggers.lua rules. Proximity's enemy is faked as a bit that comes and goes. A quick click still makes one hot tick, as the application input layer guarantees.",
      w: 384, h: 216,
      controls: [
        { type: "select", key: "s1", label: "slot 1", value: "inverter", options: OPTS, reset: true },
        { type: "select", key: "s2", label: "slot 2", value: "single", options: OPTS, reset: true },
        { type: "select", key: "s3", label: "slot 3", value: "none", options: OPTS, reset: true },
        { type: "select", key: "src", label: "input", value: "hold", options: [["hold", "you hold"], ["spec", "spec pattern"]], reset: true },
      ],
      init(S, P) {
        S.trig = [P.s1, P.s2, P.s3].map(make);
        S.rows = [[], [], [], []]; S.frame = 0; S.tick = 0; S.held = false; S.pressed = false; S.opps = 0;
      },
      pointer(e, S) {
        if (e.type === "down") { if (!S.held) S.pressed = true; S.held = true; }
        if (e.type === "up") S.held = false;
      },
      update(S, P) {
        if (++S.frame % 4) return;
        let input;
        if (P.src === "spec") input = +PATTERN[S.tick % PATTERN.length];
        else { input = S.pressed || S.held ? 1 : 0; S.pressed = false; }
        const near = Math.sin(S.tick * 0.13) > 0.3;
        S.rows[0].push(input);
        let v = input, last = input;
        for (let i = 0; i < 3; i++) {
          if (S.trig[i].kind === "none") { S.rows[i + 1].push(null); continue; }
          v = step(S.trig[i], v, near); last = v; S.rows[i + 1].push(v);
        }
        if (last === 1) S.opps++;
        for (const r of S.rows) while (r.length > 46) r.shift();
        S.tick++;
      },
      draw(g, S, P) {
        const C = g.C;
        g.clear();
        const labels = ["INPUT"].concat(S.trig.map((t, i) => (i + 1) + " " + (NAMES[t.kind] || "-")));
        for (let r = 0; r < 4; r++) {
          const y = 40 + r * 34, row = S.rows[r];
          g.label(labels[r], 6, y + 10, r === 0 ? C.ink : C.ink2);
          if (r > 0) g.line(96, y - 10, 96, y - 3, C.rule, 1);
          for (let i = 0; i < 46; i++) {
            const x = 96 + i * 6, b = row[row.length - 46 + i];
            if (b === undefined || b === null) { g.rect(x, y + 6, 5, 1, C.rule); continue; }
            if (b) g.rect(x, y, 5, 14, r === 0 ? C.ink : C.accent);
            else g.tone(x, y, 5, 14, 0.2, C.ink3);
          }
        }
        const k = S.trig.filter((t) => t.kind !== "none").map((t) => t.kind);
        let note = "";
        for (let i = 0; i + 1 < k.length; i++) note = ORDER_NOTES[k[i] + ">" + k[i + 1]] || note;
        if (note) g.label(note, 6, 186, C.gold);
        if (P.src === "hold") g.label(S.held ? "HOLDING" : "HOLD ANYWHERE ON THE STAGE", 6, 204, S.held ? C.accent : C.ink3);
        else g.label("INPUT LOOPS 000111001100 THEN 0000", 6, 204, C.ink3);
      },
      readout(S) { return "tick " + S.tick + "   firing opportunities " + S.opps; },
    },
  });
})();
