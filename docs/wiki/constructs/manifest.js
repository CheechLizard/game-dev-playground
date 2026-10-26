/* Families, then constructs in reading order. A construct appears in the atlas
 * only when it is listed here and has a file constructs/<id>.js. */
Wiki.manifest({
  families: [
    { id: "weapons", name: "Weapon construction", color: "--gold", blurb: "Building weapon behaviour from small connected modules: when, how much, which way, what shape, what effect." },
    { id: "pressure", name: "Pressure & pacing", color: "--enemy", blurb: "How the game decides how hard to push, when, and how the player gets to see it coming." },
    { id: "agents", name: "Enemies & agents", color: "--violet", blurb: "Behaviours that act on the player's movement, and the crowds, companions and hazards that carry them." },
    { id: "economy", name: "Economy & progression", color: "--accent", blurb: "What the player earns, spends, carries and becomes over a run." },
    { id: "body", name: "Ship & body", color: "--ink", blurb: "The player's body in the world: how it moves, takes hits, aims and gathers." },
    { id: "feel", name: "Feedback & feel", color: "--rose", blurb: "Sight and sound that make an event legible without slowing the game down." },
    { id: "world", name: "Matter & physics", color: "--sky", blurb: "Worlds made of stuff that falls, crumbles, hardens, reacts and pulls." },
    { id: "structure", name: "Run & mission structure", color: "--orange", blurb: "The shape of a run or a level: what comes after what, and what a player is asked to do." },
    { id: "generation", name: "Generation & authoring", color: "--teal", blurb: "Producing worlds, by algorithm and by hand, and storing them." },
    { id: "tooling", name: "Design tooling", color: "--ink-2", blurb: "Constructs for designers: making exploration, tuning and checking fast." },
  ],
  constructs: [
    // weapons
    "mws-graph", "trigger-chain", "delay-echo", "sequence-reservoir", "sustained-drain", "barrels",
    "targeting-turn", "multi-ordering", "strikers", "payloads", "sequences", "mws-lineage",
    // pressure
    "wave-clock", "spawn-pulse", "packs", "spawn-telegraph", "escalation-curve", "kill-rate-race",
    "combat-pressure", "formation-waves", "encounter-spawner",
    // agents
    "enemy-behaviours", "crowd-separation", "kamikaze-dive", "fair-attack-contract", "npc-roster",
    "spatial-awareness", "voronoi-walkers", "drones", "black-holes",
    // economy
    "lp-levelling", "shop-economy", "passive-stacking", "resource-economy", "harvest-bar", "crate-haul",
    "fuel", "celestial-upgrades", "store-gambling", "effect-prescriptions",
    // body
    "player-movement", "ship-control", "contact-iframes", "aim-lead", "pickup-magnet", "crits",
    // feel
    "hit-feedback", "synth-sound", "material-fx", "wake-turbulence",
    // world
    "falling-sand", "material-properties", "reactivity-chemistry", "stability-and-debris",
    "destructible-terrain", "flow-field-gravity", "asteroid-mesh",
    // structure
    "level-loop", "corridor-spine", "portal-stitching", "escaped-boss", "solar-system-arena",
    "mission-system", "hold-to-scan", "possession-leash", "build-and-defend", "play-contexts",
    // generation
    "world-gen-stack", "zone-layers", "zone-editor", "planet-tilemap", "parallax-zones", "autotiling",
    "chunk-streaming",
    // tooling
    "schema-editor", "json-tunables", "diff-profiles", "debug-layers", "inspection-levels", "headless-sim",
    "balance-harness", "reproducible-capture", "live-inspection", "ui-design-language",
  ],
});
