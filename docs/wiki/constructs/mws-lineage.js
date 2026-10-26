(function () {
  // A small fixed graph: TRG -> (BAT?) -> BRL (2 ports, routing all) -> A: STK -> PAY, B: STK -> PAY.
  // Legacy numbers: BATTERY 60 e/s; mws.cost barrel 2, striker 8, payload 4; burst window 2 s.
  const COST = 2 + 2 * (8 + 4);
  function legacy(pos) {
    if (pos === "trunk") return { trg: 60, brl: 60, a: 30, b: 30, note: "TRIGGER POOL 60 E/S, CAP " + Math.max(COST, 120) + " E: " + (60 / COST).toFixed(1) + " STRIKES/S" };
    const r = { trg: 0, brl: 0, a: pos === "a" ? 60 : 0, b: pos === "b" ? 60 : 0 };
    r.note = "TRIGGER RAIL 0: ONE STRIKE FROM ITS STARTING POOL, THEN STALLS";
    return r;
  }

  Wiki.construct({
    id: "mws-lineage",
    name: "MWS lineage: from Emitter to sequences",
    family: "weapons",
    origin: "both",
    status: "superseded",
    statusNote: "Two models here are history and one is still running. The legacy graph runtime is what the survival game and its shop weapons use today; only the F8 bench's eight prototypes run v2. The Emitter is gone from v2, and the first v2 energy model was deleted in commit <code>55260f5</code>.",
    summary: "The weapon system has been rebuilt twice: a ShmupRouge spec of seven modules with path-local energy, a playground build of it that still powers the survival game, and a v2 that retired the Emitter for sequence composition and then threw out its own first, layered energy model.",
    tags: ["history", "energy", "emitter", "legacy"],

    intent:
      "<p>Three vocabularies use the same words for different rules. \"Rail\" in the legacy code is energy per second divided at every branch; in v2 it is one tank per sequence. \"Miss\" was an event; now it is a filter on Complete. A designer reading old graphs, old docs or the survival game's weapons needs to know which model they are looking at, and why the newer one changed it.</p>" +
      "<p>The reasons are design lessons in their own right: special execution paths that nothing can react to, and costs players cannot see, both got removed.</p>",

    how:
      "<h3>v1.1: the ShmupRouge specification</h3>" +
      "<p>The original spec built every weapon from seven module types: BATTERY (energy per second), TRIGGER (starts strikes from input or conditions), REPEATER (held fire into cadence), BARREL (aim, spread, range, and the only module with several outputs), STRIKER (simulates the strike), PAYLOAD (damage and effects) and EMITTER (fire-and-forget particles). Four events flowed through the graph: Start, Stop, Hit and Miss. Strikes lived in one of three domains (weapon, inflight, post-strike), each with a parent supplying position, which made recursion natural: a projectile could carry its own Repeater.</p>" +
      "<p>Energy was <em>path-local</em>: batteries added energy per second along a path and divided at Barrel branches. Only TRIGGER and REPEATER spent, paying a <em>strike cost</em> precomputed from everything downstream, follow-ups included, and an unsustainable build was meant to be rejected. Modules held no state. One rule survived to v2 almost unchanged: <code>strike_aim</code> defaulted to random, overridden by a Barrel.</p>" +
      "<h3>The playground's legacy build (still running)</h3>" +
      "<p>The playground implemented v1.1 for an auto-firing horde game (commit <code>8f0ed35</code>), and recorded its departures: Barrel <code>routing</code> (<code>round_robin</code> or <code>all</code>, since round-robin alone cannot make a shotgun), <code>aimMode</code> (<code>nearest</code>, <code>heading</code>, <code>random</code>, <code>fixed</code>, since these weapons aim themselves), and the <b>segment</b> rule. A segment runs up to and including the next Barrel; every battery powers its whole segment, above as well as below, and the rail halves at each two-way branch. Pools sit on Triggers and Repeaters, capped at <code>max(cost, rail &times; 2 s)</code> (<code>mws.energyBuffer</code>, the burst window). Each module type has one schema cost (<code>mws.cost.*</code>: barrel 2, striker 8, payload 4, emitter 3). A chain Trigger reacts only to a Start raised by a Payload (<code>fromPayload</code>), so a cluster bomb does not detonate in the barrel. Post-strike contexts are free, treated as prepaid. <code>arsenal.instance</code> sends any graph without <code>version = 2</code> here.</p>" +
      "<h3>Retiring the Emitter</h3>" +
      "<p>The Emitter was a terminal module that threw untracked particles (acid, water and sand in ShmupRouge's material simulation). It produced no Hit or Miss, so nothing downstream could react to it, and it had its own fire-and-forget execution path. On 20 September 2026 (commit <code>2840f37</code>) v2 retired it: its uses are expressed as sequences. A cluster bomb is Ranged &rarr; Complete &rarr; Battery &rarr; Area, using the normal strike lifecycle and its own battery (the <em>Complete + Field</em> preset). See [[sequences]].</p>" +
      "<h3>What v2 changed</h3>" +
      "<div class=\"tbl-wrap\"><table><thead><tr><th>Legacy</th><th>v2</th></tr></thead><tbody>" +
      "<tr><td>Seven generic module types</td><td>Five classes with configurable subclasses</td></tr>" +
      "<tr><td>REPEATER is its own module</td><td>Repeater is a Trigger subclass</td></tr>" +
      "<tr><td>Emitter with a fire-and-forget path</td><td>Sequence composition</td></tr>" +
      "<tr><td>Single-parent forest; Barrel branches</td><td>Target: multi-input Barrels and multi-output Strikers (still single-parent in code)</td></tr>" +
      "<tr><td>Branch-local segments; energy divided at branches</td><td>One additive reservoir per sequence, placement-independent</td></tr>" +
      "<tr><td>Trigger pays a precomputed downstream cost</td><td>The Striker checks its own start requirement</td></tr>" +
      "<tr><td>Downstream contexts treated as paid</td><td>Every sequence funds itself</td></tr>" +
      "<tr><td>Chains driven by Payload events</td><td>Striker events drive later sequences, Payload or not</td></tr>" +
      "<tr><td>Start / Stop / Hit / Miss and player-specific conditions</td><td>Input bitstream, Hit events, one Complete, Miss as a zero-hit filter</td></tr>" +
      "<tr><td>Striker looks up one Payload</td><td>Ordered list of Payloads</td></tr>" +
      "</tbody></table></div>" +
      "<h3>The deleted layered energy model</h3>" +
      "<p>The first v2 runtime priced everything physically. The start requirement was <code>startupCost + sizeCost &times; radius&sup2; &times; weight</code>; continuing work cost <code>draw &times; dt + distanceCost &times; distance &times; weight</code> (actual travel for projectiles, arc distance for Orbit); Sharp requested energy once per target; Plasma spent energy per second <em>per overlapping target per tick</em>; Impact scaled damage by <code>weight &times; max(0.1, speed/100)</code>; and damage was funded energy times an efficiency. A projectile could run out of energy mid-flight, which needed a special audio rule to silence the launch sound of shots that exhausted before they were heard.</p>" +
      "<p>On 27 September 2026 (commit <code>55260f5</code>, \"agreed after live debugging\" in the spec) it was replaced by two rules: projectiles pay shot energy once ([[sequence-reservoir]]), sustained strikes need a start charge and drain per second ([[sustained-drain]]). The spec now states that size, speed, reach, target count and damage do not secretly change either payment. Saved graphs convert on load: <code>startupCost</code> becomes <code>startEnergy</code>, <code>draw</code> becomes <code>drainRate</code> for sustained Strikers, Payload damage becomes old <code>energy &times; efficiency</code>.</p>",

    knobs: [
      ["Legacy battery", "60 e/s", "Rail supplied to its segment", "energyPerSecond"],
      ["Legacy module cost", "barrel 2, striker 8, payload 4, emitter 3", "Summed into each Trigger's strike cost", "mws.cost.<type>"],
      ["Burst window", "2 s", "Legacy pool cap as seconds of rail", "mws.energyBuffer"],
    ],

    related: [
      { id: "mws-graph", how: "The v2 model this history leads to." },
      { id: "sequences", how: "What replaced the Emitter and the chain trigger." },
      { id: "sequence-reservoir", how: "What replaced segments and rails." },
      { id: "payloads", how: "Impact lost its speed and weight multiplier with the old model." },
    ],

    questions: [
      "When does the survival game move to v2, and what happens to the shop weapons' balance when segment rails become reservoirs?",
      "Is there still a place for a fire-and-forget material emitter in a game with a particle simulation, as a Payload rather than a module class?",
      "v1.1 rejected unsustainable builds at construction; v2 lets them skip. Should an editor still warn when demand exceeds refill?",
    ],

    sparks: [
      "Use the legacy segment rule on purpose in a puzzle game: battery placement relative to branches is the puzzle.",
      "Bring back the burst window as a feel: a weapon that opens with a two-second volley, then settles to what its battery sustains.",
      "Run old and new models side by side as two factions' tech: one with hidden physical costs, one with price tags.",
    ],

    terms: [
      { term: "Emitter (retired)", def: "A v1 terminal module that threw untracked particles. v2 has no Emitter and no fire-and-forget path; its uses are sequences.", code: "dispatch.emitter (legacy)" },
      { term: "Segment (legacy MWS)", def: "A stretch of graph with no branch in it, the unit energy is measured over. A battery powers its whole segment, above it as well as below.", code: "segment in graph.lua" },
      { term: "Strike cost", def: "Legacy: what one strike started at a node costs, every module below it precomputed.", code: "strikeCost, mws.cost.<type>" },
      { term: "Chain trigger", def: "Legacy: a TRIGGER with an on_hit, on_miss, on_start or on_stop condition, reacting only to a Start raised by a Payload.", code: "event.fromPayload" },
      { term: "Burst window", def: "Legacy: how many seconds of rail a Trigger or Repeater pool may bank.", code: "mws.energyBuffer" },
    ],

    sources: [
      "shmuprouge:docs/entities/Modular_Weapon_System.md",
      "playground:shared/framework/mws/graph.lua:289",
      "playground:shared/framework/mws/runtime.lua:216",
      "playground:games/horde-survivor/arsenal.lua:244",
      "playground:docs/Modular_Weapon_System.md",
      "playground:docs/MWS_Implementation.md",
      "playground:docs/glossary.md",
    ],

    toy: {
      title: "Where does one battery's power go?",
      hint: "move the battery",
      caption: "One graph, two rule sets. Legacy: TRIGGER > BARREL (two ports, routing all) > two STRIKER > PAYLOAD branches, one 60 e/s battery, strike cost " + COST + " e. v2: the same shape with a Multi 2 before two Ranged Strikers and a 60 e / 20 e/s battery.",
      static: true,
      w: 384, h: 216,
      controls: [
        { type: "select", key: "pos", label: "battery", value: "trunk", options: [["trunk", "before the Barrel"], ["a", "on branch A"], ["b", "on branch B"]] },
      ],
      init() {},
      draw(g, S, P) {
        const C = g.C, L = legacy(P.pos);
        g.clear();
        const box = (x, y, t, n) => {
          g.rect(x, y, 40, 14, C.ink2, 1);
          g.label(t, x + 20, y + 10, C.ink, "center");
          if (n != null) g.label(n, x + 20, y + 23, n === "0" ? C.enemy : C.ink2, "center");
        };
        const graph = (y0, title, rails) => {
          g.label(title, 8, y0, C.ink3);
          const y = y0 + 10;
          box(8, y + 15, "TRG", rails[0]); box(78, y + 15, "BRL", rails[1]);
          g.line(48, y + 22, 78, y + 22, C.ink3, 1);
          g.line(118, y + 22, 140, y + 7, C.ink3, 1); g.line(118, y + 22, 140, y + 37, C.ink3, 1);
          box(140, y, "STK A", rails[2]); box(140, y + 30, "STK B", rails[3]);
          box(200, y, "PAY", null); box(200, y + 30, "PAY", null);
          g.line(180, y + 7, 200, y + 7, C.ink3, 1); g.line(180, y + 37, 200, y + 37, C.ink3, 1);
          const bx = P.pos === "trunk" ? 51 : 117, by = P.pos === "trunk" ? y + 18 : P.pos === "a" ? y + 3 : y + 33;
          g.rect(bx, by, 22, 8, C.gold); g.label("BAT", bx + 11, by + 7, C.bg, "center");
        };
        graph(34, "LEGACY: RAIL IN E/S AT EACH NODE", [L.trg + "", L.brl + "", L.a + "", L.b + ""]);
        g.label(L.note, 8, 110, P.pos === "trunk" ? C.ink2 : C.enemy);
        graph(124, "V2: ONE RESERVOIR (C/R) FOR THE SEQUENCE", ["60/20", "60/20", "60/20", "60/20"]);
        g.label("VOLLEY 16 E, REFILL 20 E/S, WHEREVER THE BATTERY SITS", 8, 206, C.ink2);
      },
    },
  });
})();
