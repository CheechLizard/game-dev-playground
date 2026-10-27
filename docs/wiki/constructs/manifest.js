/* The atlas's table of contents: game systems, in the order a player meets them,
 * each split into groups of constructs. This is the only place a construct's
 * position is recorded. A construct appears in the atlas only when it is listed
 * here and has a file constructs/<id>.js.
 *
 * `overview` is the system page's opening (HTML; [[id]] links work).
 * `loop` is the one-line statement of how the system's parts feed each other. */
Wiki.manifest({
  systems: [
    {
      id: "player", name: "Player & controls", color: "--ink",
      blurb: "How the player's body moves, aims, takes hits and gathers.",
      loop: "Input becomes motion; motion decides what touches you and what you can pick up; aim decides what your weapons hit.",
      overview:
        "<p>Everything else in a game is felt through this system. Two bodies were explored: the playground's top-down survivor, tuned to reach top speed almost instantly and stop within a few pixels, and ShmupRouge's ship, which lives in a box that starts the screen scrolling when you push against it.</p>" +
        "<p>The common thread is <em>legibility of contact</em>: one hit then a short invulnerability window rather than damage per second, pickups that come to you once you are close, and weapons that lead their targets so aim reads as intent rather than luck.</p>",
      groups: [
        { name: "Movement", constructs: ["player-movement", "ship-control"] },
        { name: "Aiming", constructs: ["aim-lead"] },
        { name: "Damage & pickups", constructs: ["contact-iframes", "pickup-magnet"] },
      ],
    },
    {
      id: "combat", name: "Combat & weapons", color: "--gold",
      blurb: "Weapons assembled from modules: when they fire, what it costs, which way, what shape, what effect.",
      loop: "A Trigger decides when, a Battery whether it can be afforded, Barrels which way, a Striker what shape, a Payload what it does; strike events can start the next sequence.",
      overview:
        "<p>Most of this system is the Modular Weapon System (MWS): weapons built from five module classes connected in a graph, so a shotgun, a beam and a cluster bomb are arrangements of the same parts rather than separate code. Start with [[mws-graph]] for the whole picture, then follow the groups below in order; they follow a signal through the graph.</p>" +
        "<p>The design bets worth knowing before you read on: intent is never queued (an unaffordable shot is skipped), order is meaningful (see [[multi-ordering]]), and every reaction (on hit, on miss, at end of flight) is just another sequence with its own battery. [[mws-lineage]] records how the system got here.</p>",
      groups: [
        { name: "Weapon assembly", constructs: ["mws-graph", "sequences", "mws-lineage"] },
        { name: "Firing & timing", constructs: ["trigger-chain", "delay-echo"] },
        { name: "Energy & cost", constructs: ["sequence-reservoir", "sustained-drain", "multi-ordering"] },
        { name: "Direction & targeting", constructs: ["barrels", "targeting-turn"] },
        { name: "Shape & damage", constructs: ["strikers", "payloads", "crits"] },
      ],
    },
    {
      id: "enemies", name: "Enemies & AI", color: "--violet",
      blurb: "Enemy behaviours, crowds, perception and companions.",
      loop: "Each behaviour targets one thing the player's movement does; crowds turn behaviours into terrain; perception decides who joins in.",
      overview:
        "<p>Both projects design enemies around what they force the player's movement to do, not around stats. The playground's four steering rules (chase, standoff, wind-up charge, orbit) each answer a player habit; ShmupRouge formalises the same idea as a roster of tactical goals against the ship's flight and mech modes ([[npc-roster]]).</p>" +
        "<p>The other recurring idea is fairness as a contract: arrive visibly, telegraph, never attack from off screen ([[fair-attack-contract]]). Spawning and how many enemies arrive live in the next system, [[@difficulty|Spawning &amp; difficulty]].</p>",
      groups: [
        { name: "Behaviours", constructs: ["enemy-behaviours", "kamikaze-dive", "fair-attack-contract", "voronoi-walkers"] },
        { name: "Crowds", constructs: ["crowd-separation"] },
        { name: "Perception", constructs: ["spatial-awareness"] },
        { name: "Roster design", constructs: ["npc-roster"] },
        { name: "Allies", constructs: ["drones"] },
      ],
    },
    {
      id: "difficulty", name: "Spawning & difficulty", color: "--enemy",
      blurb: "When enemies arrive, how many, how the player sees them coming, and how it all scales.",
      loop: "A clock sets the pace, pulses and waves turn pace into bodies, telegraphs make arrivals fair, and scaling decides whether the player's damage keeps up.",
      overview:
        "<p>The playground treats difficulty as a function of one integer: the wave index, advanced by a 15-second clock. Pulses spend a spawn budget, packs arrive together, and a closing ring warns before each body appears. ShmupRouge explored two alternatives: authored formation waves, and a spawner whose cooldowns only tick while you fly the way an enemy type hunts.</p>" +
        "<p>The lesson the playground learned the hard way is on [[kill-rate-race]]: every scaling knob is a term in one inequality between arriving HP and the player's damage. Read it before tuning anything here.</p>",
      groups: [
        { name: "Pacing", constructs: ["wave-clock", "spawn-pulse", "formation-waves", "encounter-spawner"] },
        { name: "Arrival", constructs: ["packs", "spawn-telegraph"] },
        { name: "Scaling", constructs: ["escalation-curve", "kill-rate-race", "combat-pressure"] },
      ],
    },
    {
      id: "progression", name: "Progression & economy", color: "--accent",
      blurb: "What the player earns, spends, carries and becomes over a run.",
      loop: "Kills and mining produce currencies; the shop and levels turn currencies into power; power raises the kill rate.",
      overview:
        "<p>The playground keeps every decision in one place: levels give fixed stat bundles, and all choice happens in a shop visited about 30 times a run. ShmupRouge's economy is physical: you break matter loose, scoop it before it hardens, and what you mined can be sorted, hauled in crates or traded for its effects.</p>" +
        "<p>ShmupRouge's docs describe two economies that do not agree (crates, purity and a store, against a harvest bar that opens a portal plus fuel). [[resource-economy]] lays them side by side.</p>",
      groups: [
        { name: "Levelling", constructs: ["lp-levelling"] },
        { name: "Shop & upgrades", constructs: ["shop-economy", "passive-stacking", "store-gambling", "celestial-upgrades"] },
        { name: "Resources", constructs: ["resource-economy", "harvest-bar", "crate-haul", "fuel", "effect-prescriptions"] },
      ],
    },
    {
      id: "structure", name: "Game structure & missions", color: "--orange",
      blurb: "The shape of a run or a level, what comes after what, and what the player is asked to do.",
      loop: "A level is a sequence of stages; missions are objective chains inside a stage; exits and consequences connect them.",
      overview:
        "<p>The playground's structure is a single timed run. ShmupRouge explored a richer shape: a wrap-around arena, corridors chosen by the direction you leave in, bosses that can follow you back, and missions written as data so tutorial beats like scanning, possession and build-and-defend need no special code.</p>" +
        "<p>Most of the run-shape ideas are still on paper; the mission system and its objective patterns are built and drive ShmupRouge's first level.</p>",
      groups: [
        { name: "Run shape", constructs: ["level-loop", "corridor-spine", "portal-stitching", "escaped-boss", "solar-system-arena"] },
        { name: "Missions & objectives", constructs: ["mission-system", "hold-to-scan", "possession-leash", "build-and-defend"] },
        { name: "Game states", constructs: ["play-contexts"] },
      ],
    },
    {
      id: "worldgen", name: "Levels & world generation", color: "--teal",
      blurb: "Producing levels, by algorithm and by hand, and keeping a large world in memory.",
      loop: "Templates and recipes generate zones; editors author what generation should not; streaming keeps only what is near the camera alive.",
      overview:
        "<p>ShmupRouge builds levels as stacks: zones placed in a level, each zone a stack of layers at parallax depths, each gameplay layer filled by a biome recipe. Asteroid fields are a Delaunay mesh whose dual also serves navigation. [[world-gen-stack]] is the map of how the layers relate.</p>" +
        "<p>Authoring tools (the zone editor, the planet tile map, the in-game tile editor) are mostly partial, and their output is not yet loaded by the game.</p>",
      groups: [
        { name: "Generation", constructs: ["world-gen-stack", "zone-layers", "asteroid-mesh", "parallax-zones"] },
        { name: "Authoring", constructs: ["zone-editor", "planet-tilemap", "autotiling"] },
        { name: "Streaming", constructs: ["chunk-streaming"] },
      ],
    },
    {
      id: "physics", name: "World simulation & physics", color: "--sky",
      blurb: "Worlds made of stuff that falls, hardens, crumbles, reacts and pulls.",
      loop: "Gravity fields decide which way is down; sand falls and settles; settled sand hardens into terrain; blasts turn terrain back into sand.",
      overview:
        "<p>ShmupRouge's central bet: the level is simulated matter. One falling-sand rule set, steered by a field of gravity vectors, gives floating dust in space, heaps on planets and spirals into black holes. Materials are data, so new matter is a JSON file.</p>" +
        "<p>The lifecycle from loose to hardened and back drives three other systems at once: what can be mined (loose only), what blocks sight (hardened only), and what a weapon can destroy.</p>",
      groups: [
        { name: "Matter", constructs: ["falling-sand", "material-properties", "reactivity-chemistry", "stability-and-debris", "destructible-terrain"] },
        { name: "Forces", constructs: ["flow-field-gravity", "black-holes"] },
      ],
    },
    {
      id: "feedback", name: "Feedback, UI & audio", color: "--rose",
      blurb: "Sight and sound that make events legible without slowing the game down.",
      loop: "Every event gets a bounded visual and sound; materials and motion leave readable traces; the interface stays out of the way.",
      overview:
        "<p>Feedback in both projects is bounded by design: capped lists, rate limits per target, coalesced sounds, cosmetic randomness on its own stream so it can never change the simulation. Everything is drawn from primitives and every sound is synthesised.</p>" +
        "<p>Worth knowing: some weapons in the playground produce no feedback at all, and they are also the weapons that measure weakest. See [[hit-feedback]].</p>",
      groups: [
        { name: "Combat feedback", constructs: ["hit-feedback"] },
        { name: "Visual effects", constructs: ["material-fx", "wake-turbulence"] },
        { name: "Audio", constructs: ["synth-sound"] },
        { name: "Interface", constructs: ["ui-design-language"] },
      ],
    },
    {
      id: "tools", name: "Tools & pipeline", color: "--ink-2",
      blurb: "Constructs for designers: making tuning, inspecting and balance testing fast.",
      loop: "Declare a tunable once; tune it live; look at one subject in isolation; replay and measure headless; capture what you see.",
      overview:
        "<p>Both projects converged on the same rule from opposite directions: every tunable is declared exactly once, and every editor control and saved file is generated from that declaration. The playground then adds rooms for looking at one thing ([[inspection-levels]]), a simulation that runs without a screen, a balance harness, and screenshots that are byte-reproducible.</p>" +
        "<p>These pages are the reason the rest of the atlas can quote real numbers. They are also where to look first when designing a new game's workflow.</p>",
      groups: [
        { name: "Tunables", constructs: ["schema-editor", "json-tunables", "diff-profiles"] },
        { name: "Inspecting", constructs: ["debug-layers", "inspection-levels", "live-inspection"] },
        { name: "Testing & balance", constructs: ["headless-sim", "balance-harness", "reproducible-capture"] },
      ],
    },
  ],
});
