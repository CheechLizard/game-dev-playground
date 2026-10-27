(function () {
  const OX = 40, LANES = [72, 144], DUMMY = { x: 112, y: 72 }, STEP = 1 / 60;
  // Which root subclasses accept which events: R:emit in v2runtime.lua.
  function accepts(root, kind, hits) {
    if (root === "hit") return kind === "hit";
    if (root === "complete") return kind === "complete";
    if (root === "miss") return kind === "complete" && hits === 0;
    return true; // any other Trigger at a post-Striker root takes Hit AND Complete
  }

  Wiki.construct({
    id: "sequences",
    name: "Sequences and strike events",
    origin: "playground",
    status: "built",
    statusNote: "Built in the MWS v2 runtime, playable through the <em>Piercing + Miss</em> and <em>Complete + Field</em> bench presets. How several events in one tick should be encoded is an open spec decision; the code's provisional answer is one execution context per event. Multi-input joins and cycles are not supported.",
    summary: "A Striker wired straight into a Trigger starts a new sequence with its own battery; each Hit or Complete event from the first strike runs that sequence once, at the event's position and direction.",
    tags: ["composition", "events", "cluster", "on hit"],

    intent:
      "<p>Cluster bombs, explode-on-contact, a field that drops where a shot fizzled, a ricochet: every one is \"when this strike does something, do something else there\". Rather than a special module for each, the graph lets any Striker's events start another small weapon. Designers compose reactions; players read them as \"this part reacts to that part\".</p>" +
      "<p>Each reaction pays for itself. The follow-up sequence has its own battery, so a chain reaction is limited by its own budget and cannot drain the gun that started it.</p>",

    how:
      "<h3>What a sequence is</h3>" +
      "<p>The graph compiler walks from each root. Every root starts a sequence, and every edge from a Striker directly into a Trigger starts another, recorded with <code>seq.parent</code> = that Striker. A sequence needs at least one Trigger, Battery and Striker; Barrels and Payloads are optional. The checks use these exact messages:</p>" +
      "<ul><li><em>Sequence must begin with a Trigger</em></li>" +
      "<li><em>Sequence 2 requires a Battery</em> / <em>requires a Striker</em></li>" +
      "<li><em>Connect Striker to Trigger to start another sequence</em> (a second Striker on one path with no boundary)</li>" +
      "<li><em>A downstream Trigger must connect directly to a Striker</em> (a Trigger after a Striker but not attached to it)</li></ul>" +
      "<p>Chaining Triggers inside a sequence is only signal processing ([[trigger-chain]]); it never starts a sequence. Energy never crosses the boundary: no inheritance, no copying ([[sequence-reservoir]]). Each node has one parent and no cycles are allowed (<em>Multi-input joins are not available in this test build</em>).</p>" +
      "<h3>Strike events</h3>" +
      "<p>A logical strike reports two kinds of event:</p>" +
      "<div class=\"tbl-wrap\"><table><thead><tr><th>Event</th><th>When</th><th>Carries</th></tr></thead><tbody>" +
      "<tr><td>Hit</td><td>Each first contact with a distinct target, per collider</td><td>Running <code>hitCount</code>, contact point, strike direction, contact normal, target</td></tr>" +
      "<tr><td>Complete</td><td>Once, when the strike ends for any reason</td><td>Final <code>hitCount</code>, reason, endpoint and direction</td></tr>" +
      "</tbody></table></div>" +
      "<p>Reasons are <code>hit</code>, <code>hit_limit</code>, <code>range</code>, <code>duration</code>, <code>release</code> and <code>energy</code>. If the final contact ends a strike, its Hit comes before its Complete. A skipped start emits nothing. There is no Fired event, and events carry <b>no energy</b>. A strike with no Payload still collides and still emits. For a split strike the children report one combined count and one Complete when the last child ends ([[multi-ordering]]).</p>" +
      "<h3>Hit, Miss and Complete Triggers</h3>" +
      "<p>At the root of a post-Striker sequence, the Trigger decides which events start it:</p>" +
      "<div class=\"tbl-wrap\"><table><thead><tr><th>Root Trigger</th><th>Accepts</th></tr></thead><tbody>" +
      "<tr><td>Hit</td><td>Every Hit event</td></tr>" +
      "<tr><td>Complete</td><td>Every Complete event, whatever the count</td></tr>" +
      "<tr><td>Miss</td><td>Complete with <code>hitCount == 0</code> only; it is not an unhandled-event fallback</td></tr>" +
      "<tr><td>Any other subclass</td><td><b>Both</b> Hit and Complete. Undocumented: it falls out of <code>R:emit</code>, so a Single there fires twice for a shot that hits</td></tr>" +
      "</tbody></table></div>" +
      "<h3>Execution contexts</h3>" +
      "<p>Accepted events are queued during the tick. On the next tick each one becomes its own <b>execution context</b> of the child sequence: its own Trigger, Delay and aim state, with a packet fixed at the event position, direction and normal. The root Trigger sees a hot input and the event only on the context's first tick (<code>ctx.age == 0</code>), then cold. All contexts of one sequence <b>share its reservoir</b>, so thirty impacts compete for one tank. A context is pruned once it has no live strikes and its Delays have flushed. Guards: at most 256 contexts and 512 live colliders per weapon; excess work is dropped and counted as LIMIT REACHED, never replayed.</p>" +
      "<h3>The releaseEnds gotcha</h3>" +
      "<p>Because an event context is hot for exactly one tick, a sustained Striker with <code>releaseEnds</code> on (the default) ends with reason <code>release</code> on the following tick. The Miss and Complete field presets turn it off so the field runs its full duration.</p>" +
      "<h3>The two presets</h3>" +
      "<div class=\"tbl-wrap\"><table><thead><tr><th></th><th>Sequence 1</th><th>Sequence 2</th></tr></thead><tbody>" +
      "<tr><td>Piercing + Miss</td><td>Single &rarr; Battery 80/30 &rarr; Seeking &rarr; Piercing (limit 5, speed 130, range 220) &rarr; Sharp 8</td><td>Miss &rarr; Battery 30/10 &rarr; Area (r 20, 360&deg;, 1 s, drain 8, releaseEnds off) &rarr; Plasma 16</td></tr>" +
      "<tr><td>Complete + Field</td><td>Repeater 90 &rarr; Battery 60/20 &rarr; Seeking &rarr; Ranged (range 90, 1 s, speed 130) &rarr; Sharp 8</td><td>Complete &rarr; Battery 50/15 &rarr; Area (r 20, 360&deg;, 1.2 s, drain 8, releaseEnds off) &rarr; Plasma 21</td></tr>" +
      "</tbody></table></div>",

    knobs: [
      ["Root Trigger", "Hit / Miss / Complete", "Which events start the next sequence", "seq.root.props.subclass"],
      ["Release ends strike", "on", "Must be off for a field in an event sequence to outlive its one-tick pulse", "releaseEnds"],
      ["Context limit", "256", "Execution contexts per weapon before events are dropped", "R:step"],
      ["Collider limit", "512", "Live colliders per weapon before requests are dropped", "R:startRequests"],
    ],

    related: [
      { id: "mws-graph", how: "Sequences are how the five module classes compose." },
      { id: "sequence-reservoir", how: "Every sequence funds itself; contexts share one tank." },
      { id: "strikers", how: "Each Striker shape has its own reasons to Complete." },
      { id: "mws-lineage", how: "Sequence composition is what replaced the Emitter." },
      { id: "hit-feedback", how: "Hit events are also what drive contact sparks and sounds." },
    ],

    questions: [
      "How should several events in one tick be encoded for one Trigger? The code spawns one context per event; the spec has not chosen.",
      "Should a non-event Trigger at a post-Striker root really accept both Hit and Complete, or should the graph require an explicit event Trigger there?",
      "Which sequence owns a module fed by two sequences, once multi-input joins exist? And are cycles (a sequence re-triggering itself) ever allowed?",
      "Deterministic payload order across branches is listed as open.",
    ],

    sparks: [
      "Sell reaction cartridges: a Trigger-Battery-Striker sub-sequence as one loot item that bolts onto any Striker's output.",
      "Allow cycles with a per-cycle budget and you get self-limiting fractal weapons: each generation is smaller because the shared tank runs dry.",
      "A tower defence where every tower is a sequence rooted in Proximity, and upgrades are follow-up sequences wired to its Hits.",
      "Score achievements on Complete reasons alone: <em>exhausted with five hits</em>, <em>missed on purpose</em>.",
    ],

    terms: [
      { term: "Sequence", def: "A graph subsection with its own reservoir, needing a Trigger, Battery and Striker. A Striker-to-Trigger edge starts the next one.", code: "G.compile, sequences[]" },
      { term: "Sequence boundary", def: "A Striker output wired directly to a Trigger. Events cross it; energy never does.", code: "seq.parent" },
      { term: "Hit event", def: "A first contact with a distinct target during a strike, with the running hit count.", code: "R:emit(s, \"hit\")" },
      { term: "Complete event", def: "The one final event of a strike, with its final hit count and end reason.", code: "R:finish, s.endReason" },
      { term: "Execution context", def: "One run of a sequence started by one event (or the root context fed by input), owning Trigger and aim state but sharing the sequence's reservoir.", code: "R:context, ctx" },
    ],

    sources: [
      "playground:shared/framework/mws/v2graph.lua:146",
      "playground:shared/framework/mws/v2runtime.lua:221",
      "playground:shared/framework/mws/v2runtime.lua:466",
      "playground:shared/framework/mws/triggers.lua:101",
      "playground:games/horde-survivor/weaponprototypes.lua:37",
      "playground:docs/MWS_Implementation.md",
    ],

    toy: {
      title: "One shot, a second sequence where it lands",
      hint: "switch the second sequence's root Trigger",
      caption: "Complete + Field numbers. Shots alternate lanes so every other one misses; Seeking is left out. A field needs 8 e stored and drains 8 e/s from sequence 2's own tank. Real events wait one tick before their context runs.",
      w: 384, h: 216,
      controls: [
        { type: "select", key: "root", label: "seq 2 root", value: "complete", options: [["hit", "Hit"], ["miss", "Miss"], ["complete", "Complete"], ["single", "Single (non-event)"]], reset: true },
        { type: "toggle", key: "release", label: "releaseEnds", value: false },
        { type: "range", key: "cap2", label: "seq 2 battery", min: 10, max: 100, value: 50, fmt: "{} e", reset: true },
      ],
      init(S, P) {
        S.E1 = 60; S.E2 = P.cap2; S.tick = 0; S.lane = 0; S.shots = []; S.fields = []; S.log = []; S.pending = []; S.skips = [];
      },
      update(S, P) {
        S.E1 = Math.min(60, S.E1 + 20 * STEP); S.E2 = Math.min(P.cap2, S.E2 + 15 * STEP);
        // last tick's events become contexts now; the root is hot on this first tick only
        for (const ev of S.pending) {
          if (S.E2 + 1e-8 >= 8) S.fields.push({ x: ev.x, y: ev.y, age: 0, ctxAge: 0 });
          else S.skips.push({ x: ev.x, y: ev.y, t: 0.6 });
        }
        S.pending = [];
        if (S.tick % 90 === 0 && S.E1 + 1e-8 >= 8) {
          S.E1 -= 8; const y = LANES[S.lane]; S.lane = 1 - S.lane;
          S.shots.push({ x: OX, y, d: 0 });
        }
        const emit = (kind, x, y, hits, reason) => {
          S.log.unshift(kind === "hit" ? "HIT  " + hits : "COMPLETE  " + hits + "  " + reason);
          if (S.log.length > 6) S.log.length = 6;
          if (accepts(P.root, kind, hits)) S.pending.push({ x, y });
        };
        for (const s of S.shots) {
          const step = Math.min(130 * STEP, 90 - s.d);
          s.x += step; s.d += step;
          if (s.y === DUMMY.y && s.x >= DUMMY.x - 9) { s.dead = true; s.x = DUMMY.x - 9; emit("hit", s.x, s.y, 1); emit("complete", s.x, s.y, 1, "HIT"); }
          else if (s.d >= 90) { s.dead = true; emit("complete", s.x, s.y, 0, "RANGE"); }
        }
        S.shots = S.shots.filter((s) => !s.dead);
        // fields: one shared drain on sequence 2
        let demand = 0;
        for (const f of S.fields) { f.dt = Math.min(STEP, Math.max(0, 1.2 - f.age)); demand += 8 * f.dt; }
        let frac = 1;
        if (demand > 0) { const spent = Math.min(S.E2, demand); S.E2 -= spent; frac = spent / demand; }
        for (const f of S.fields) {
          f.age += f.dt * frac;
          if (P.release && f.ctxAge >= 1) f.end = "RELEASE";
          else if (S.E2 <= 1e-8) f.end = "ENERGY";
          else if (f.age >= 1.2 - 1e-8) f.end = "DURATION";
          f.ctxAge++;
        }
        S.fields = S.fields.filter((f) => !f.end);
        for (const k of S.skips) k.t -= STEP;
        S.skips = S.skips.filter((k) => k.t > 0);
        S.tick++;
      },
      draw(g, S, P) {
        const C = g.C;
        g.clear();
        for (const y of LANES) g.line(OX, y, OX + 90, y, C.rule, 1, [2, 3]);
        g.line(OX + 90, LANES[1] - 6, OX + 90, LANES[1] + 6, C.ink3, 1);
        g.circle(OX, 108, 6, C.accent);
        g.circle(DUMMY.x, DUMMY.y, 7, C.enemy);
        for (const f of S.fields) { g.toneCircle(f.x, f.y, 20, 0.4, C.violet); g.circle(f.x, f.y, 20, C.violet, 1); }
        for (const k of S.skips) { g.line(k.x - 4, k.y - 4, k.x + 4, k.y + 4, C.enemy, 1.5); g.line(k.x + 4, k.y - 4, k.x - 4, k.y + 4, C.enemy, 1.5); }
        for (const s of S.shots) g.circle(s.x, s.y, 3, C.gold);
        // two reservoirs
        const tank = (x, E, cap, color, name) => {
          g.rect(x, 40, 12, 120, C.ink3, 1);
          g.rect(x + 1, 160 - E / cap * 120, 11, E / cap * 120, color);
          g.line(x - 3, 160 - 8 / cap * 120, x + 15, 160 - 8 / cap * 120, C.ink, 1);
          g.label(name, x + 6, 172, C.ink3, "center");
        };
        tank(190, S.E1, 60, C.gold, "SEQ 1"); tank(222, S.E2, P.cap2, C.violet, "SEQ 2");
        g.label("EVENTS", 254, 44, C.ink3);
        S.log.forEach((l, i) => g.label(l, 254, 58 + i * 12, i ? C.ink2 : C.ink));
        const lbl = { hit: "HIT", miss: "MISS", complete: "COMPLETE", single: "SINGLE" }[P.root];
        g.label("SEQ 2 ROOT: " + lbl + " > BAT > AREA > PLASMA", 10, 200, C.ink2);
      },
      readout(S) { return "seq 1  " + S.E1.toFixed(0) + " / 60 e     seq 2  " + S.E2.toFixed(0) + " e     fields " + S.fields.length; },
    },
  });
})();
