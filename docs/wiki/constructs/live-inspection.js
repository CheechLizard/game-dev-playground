(function () {
  const ROWS = 15, RY = 64, RH = 10;

  function rec(S, kind, f) { const ev = Object.assign({ id: ++S.nextId, time: S.t, kind }, f); S.log.push(ev); if (S.log.length > 200) S.log.shift(); return ev; }

  function voice(S, P, sid, q, cause, cool) {
    S.voices = S.voices.filter((v) => v > S.t);
    const f = { strike: sid, queuedEvent: q.id, causeEvent: cause.id };
    if (cool) rec(S, "sound_suppressed", Object.assign(f, { reason: "target_cooldown" }));
    else if (S.voices.length >= P.voices) rec(S, "sound_suppressed", Object.assign(f, { reason: "voice_limit" }));
    else { S.voices.push(S.t + 0.9); rec(S, "sound_played", f); }
  }
  function tick(S, P, kit) {
    // a weapon with one striker, firing every 0.6 s
    S.fireT -= 1 / 60;
    if (S.fireT <= 0) {
      S.fireT = 0.6;
      const sid = ++S.nextStrike, start = rec(S, "strike_start", { strike: sid });
      const q = rec(S, "sound_queued", { strike: sid, sound: "shot", causeEvent: start.id });
      voice(S, P, sid, q, start, false);
      S.pending.push({ sid, at: S.t + 0.2 + kit.rand() * 0.15, target: kit.rand.int(1, 3), hit: kit.rand() < 0.7 });
    }
    for (const p of S.pending) if (!p.done && S.t >= p.at) {
      p.done = true;
      if (p.hit) {
        rec(S, "hit", { strike: p.sid, target: p.target });
        const dmg = rec(S, "damage", { strike: p.sid, target: p.target, amount: 6 });
        const q = rec(S, "sound_queued", { strike: p.sid, sound: "hit", causeEvent: dmg.id });
        voice(S, P, p.sid, q, dmg, S.t - (S.lastHitOn[p.target] || -9) < 0.15);
        S.lastHitOn[p.target] = S.t;
      }
      rec(S, "complete", { strike: p.sid, hits: p.hit ? 1 : 0, miss: !p.hit });
      rec(S, "strike_end", { strike: p.sid, reason: p.hit ? "energy" : "duration" });
    }
    S.pending = S.pending.filter((p) => !p.done);
  }
  function describe(ev) {
    let s = "#" + ev.id + " " + ev.time.toFixed(2) + " " + ev.kind + " s" + ev.strike;
    if (ev.sound) s += " " + ev.sound;
    if (ev.causeEvent) s += " cause#" + ev.causeEvent;
    if (ev.queuedEvent) s += " q#" + ev.queuedEvent;
    if (ev.reason) s += " " + ev.reason;
    if (ev.miss) s += " miss";
    return s;
  }

  Wiki.construct({
    id: "live-inspection",
    name: "Live read-only inspection of the running game",
    origin: "playground",
    status: "built",
    summary: "The running game serves a read-only MCP endpoint that reports its active config including unsaved edits, its live weapon runtime, and an event trace that links each strike to its hits, its completion and the sounds it asked for.",
    tags: ["debugging", "telemetry", "mcp", "event trace", "causality"],

    intent:
      "<p>When a designer says \"that beam stopped humming\", the useful question is what <em>this</em> running instance is doing, not what a saved preset or a fresh screenshot would do. Unsaved bench edits exist only in memory. Live inspection lets an assistant, or a script, read the instance the designer is looking at without touching it.</p>" +
      "<p>The event trace answers why something happened: a sound that did not play has a row saying it was suppressed and the reason, linked to the damage that asked for it.</p>",

    how:
      "<h3>The endpoint</h3>" +
      "<p><code>http://127.0.0.1:49321/mcp</code>, Streamable HTTP with stateless JSON on a nonblocking LuaSocket listener, bound to localhost, bounded at 8 KB headers, 64 KB bodies and 8 clients (<code>mcp.lua</code>). It starts with the game, keeps answering while the game or editor is paused, and is disabled in capture runs so a scripted screenshot cannot become the instance an assistant inspects. F1 &rarr; Debug &rarr; Live inspection has the on/off switch, the port, and a connection check.</p>" +
      "<div class=\"tbl-wrap\"><table><thead><tr><th>Tool</th><th>Returns</th></tr></thead><tbody>" +
      "<tr><td><code>get_active_config</code></td><td>Every setting from <code>config.flat</code> (optional key <code>prefix</code>), profile name, restart-pending flag, and each equipped weapon graph labelled <code>source = live_memory</code>.</td></tr>" +
      "<tr><td><code>get_runtime_state</code></td><td>Battery charge, capacity and refill per sequence; hot or cold triggers; live strikes with position, direction, hits and payloads; player position and aim; up to 100 enemies.</td></tr>" +
      "<tr><td><code>get_recent_events</code></td><td>The event trace, with an <code>after</code> cursor and <code>limit</code> 1-500 (default 100).</td></tr>" +
      "</tbody></table></div>" +
      "<p>No tool edits settings or controls the player. The same data is exposed as resources (<code>playground://active-config</code>, <code>runtime</code>, <code>events</code>). <code>python3 tools/inspect.py config|runtime|events</code> is a standard-library client for when an MCP client has not reloaded its tools.</p>" +
      "<h3>Which instance is this?</h3>" +
      "<p>Every result carries <code>instance.source</code> (the checkout path), <code>session</code>, <code>startedAt</code> and <code>url</code>, plus <code>world.mode</code> (run, zoo, range, bench), pause state and run <code>epoch</code>. Several worktrees can run builds at once; <code>inspect.py --expect-source /abs/checkout</code> refuses an answer from the wrong one. CLAUDE.md: check <code>instance.source</code> and <code>world.mode</code> before attributing data to the user's setup.</p>" +
      "<h3>The event trace</h3>" +
      "<p>Each run keeps its latest 2,048 events with a monotonic <code>id</code>. Strike events carry the strike, group, striker, sequence, runtime generation, age and remaining charge (<code>diagnostics.strike</code>).</p>" +
      "<ul><li><code>strike_start</code>: a funded collider was created. <code>hit</code> and <code>damage</code>: contact, and damage that reached feedback.</li>" +
      "<li><code>complete</code>: the strike group finished, with hit count; <code>miss: true</code> means zero hits. <code>strike_end</code>: one collider ended, with a reason.</li>" +
      "<li><code>sound_queued</code> links to the event that caused it (<code>causeEvent</code>); <code>sound_played</code> and <code>sound_suppressed</code> link back to the queue entry (<code>queuedEvent</code>). Suppression reasons: <code>target_cooldown</code>, <code>sound_cooldown</code>, <code>voice_limit</code>, <code>queue_limit</code>, <code>audio_disabled</code>, <code>feedback_reset</code>, <code>inactive</code>.</li></ul>" +
      "<p>A restart changes the epoch, so a reader resets its cursor; <code>dropped</code> reports a cursor older than the retained history, and <code>hasMore</code>/<code>cursor</code> paginate without duplicates.</p>",

    knobs: [
      ["Allow local inspection", "on", "Serve the endpoint", "mcp.enabled"],
      ["Inspection port", "49321", "Local port; a second instance does not take an owned port", "mcp.port"],
      ["Event limit", "100 (1-500)", "Events per read", "get_recent_events limit"],
      ["History", "2,048 events", "Events retained per run", "framework/eventtrace.lua"],
    ],

    related: [
      { id: "reproducible-capture", how: "Captures show a scripted state; inspection shows the live one, and stays off during captures." },
      { id: "strikers", how: "Strike ids in the trace are the Striker's colliders." },
      { id: "synth-sound", how: "Sound rows explain why a synthesised sound did or did not play." },
      { id: "sequence-reservoir", how: "Runtime state reports each sequence's charge and refill live." },
    ],

    questions: [
      "Should inspection ever be allowed to write (set a value, press an action), or does read-only keep it trustworthy?",
      "Is 2,048 events enough for a beam-heavy build, or should the trace be filterable at record time?",
    ],

    sparks: [
      "A playtest dashboard that streams the trace and plots why sounds were suppressed per minute.",
      "A spectator or coach view on the same endpoint: the coach sees the battery and the triggers the player cannot.",
      "Causal links as a player-facing replay feature: click a kill and see the chain of events that produced it.",
    ],

    terms: [
      { term: "Live inspection", def: "The read-only MCP endpoint served by the running game.", code: "framework/mcp.lua, inspection.lua" },
      { term: "Event trace", def: "Bounded, ordered history of strike and sound events with causal links.", code: "eventtrace.lua, diagnostics.lua" },
      { term: "Instance source", def: "The checkout path that identifies which build answered.", code: "instance.source" },
      { term: "Epoch", def: "Run identity in the trace; changes on restart.", code: "trace.epoch" },
    ],

    sources: [
      "playground:shared/framework/mcp.lua:9",
      "playground:games/horde-survivor/inspection.lua:1",
      "playground:games/horde-survivor/diagnostics.lua:1",
      "playground:games/horde-survivor/feedback.lua:18",
      "playground:games/horde-survivor/sound.lua:60",
      "playground:docs/Live_Inspection.md",
      "playground:tools/inspect.py",
    ],

    toy: {
      title: "Follow one strike through the trace",
      hint: "click a row to pick its strike; click again to let go",
      caption: "A stand-in weapon fires every 0.6 s; each strike starts, may hit, completes and ends, and each hit queues a sound that plays or is suppressed. Arcs on the left are causeEvent and queuedEvent links. Simplified: one weapon, three targets, a made-up voice budget.",
      w: 384, h: 216,
      controls: [
        { type: "toggle", key: "live", label: "follow live", value: true },
        { type: "range", key: "voices", label: "voice limit", min: 1, max: 6, value: 2 },
        { type: "toggle", key: "wrong", label: "wrong checkout", value: false },
      ],
      init(S, P, kit) { S.t = 0; S.nextId = 0; S.nextStrike = 0; S.log = []; S.pending = []; S.voices = []; S.lastHitOn = {}; S.fireT = 0.2; S.sel = null;
        for (let i = 0; i < 300; i++) { S.t += 1 / 60; tick(S, P, kit); }
        S.view = S.log.slice(-ROWS);
      },
      update(S, P, dt, kit) {
        if (!P.live) return;
        S.t += dt; tick(S, P, kit);
        if (S.sel == null) S.view = S.log.slice(-ROWS);           // a selection holds the view still
      },
      pointer(e, S) {
        if (e.type !== "down") return;
        const i = Math.floor((e.y - RY + 8) / RH);
        if (i >= 0 && i < S.view.length) S.sel = S.view[i].strike === S.sel ? null : S.view[i].strike;
      },
      draw(g, S, P) {
        const C = g.C;
        g.clear();
        const src = P.wrong ? "~/Dev/game-dev-playground/worktrees/feature-x" : "~/Dev/game-dev-playground/main";
        g.label("SOURCE " + src, 120, 14, P.wrong ? C.enemy : C.ink2);
        g.label("MODE RUN  EPOCH 1  AFTER #" + (S.view.length ? S.view[0].id - 1 : 0), 120, 26, C.ink3);
        if (P.wrong) g.label("--EXPECT-SOURCE: REJECTED", 120, 38, C.enemy);
        g.line(4, 46, 380, 46, C.rule);
        const rowOf = {}; S.view.forEach((ev, i) => (rowOf[ev.id] = i));
        S.view.forEach((ev, i) => {
          const y = RY + i * RH, on = S.sel != null && ev.strike === S.sel;
          if (on) g.tone(36, y - 8, 344, RH, 0.25, C.accent);
          const col = ev.kind === "sound_suppressed" ? C.enemy : ev.kind === "sound_played" ? C.accent : ev.kind.startsWith("sound") ? C.sky : ev.kind === "complete" && ev.miss ? C.ink3 : C.ink2;
          g.label(describe(ev), 40, y, on ? C.ink : col);
        });
        // causal arcs for the selected strike
        S.view.forEach((ev, i) => {
          if (S.sel == null || ev.strike !== S.sel) return;
          for (const [link, color] of [[ev.causeEvent, C.gold], [ev.queuedEvent, C.sky]]) {
            if (link == null || rowOf[link] == null) continue;
            const y1 = RY + i * RH - 3, y2 = RY + rowOf[link] * RH - 3, x = 32 - Math.min(26, (i - rowOf[link]) * 4);
            g.poly([[36, y1], [x, y1], [x, y2], [36, y2]], color, 1, false);
          }
        });
      },
      readout(S) {
        const sup = S.log.filter((e) => e.kind === "sound_suppressed").length;
        return "events " + S.nextId + "\nsuppressed " + sup;
      },
    },
  });
})();
