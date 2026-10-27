Wiki.construct({
  id: "encounter-spawner",
  name: "Mode-gated encounter spawner",
  origin: "shmuprouge",
  status: "built",
  statusNote: "Built. Only one type is registered: the [[kamikaze-dive|Kamikaze]], gated on scrolling. The stopped-mode types in the [[npc-roster|roster]] (Cordon, Encircler) are spec only.",
  summary: "Each NPC type registers the movement mode it hunts; its cooldown only ticks while the player is in that mode, and when it expires a group spawns unless the type is at its cap.",
  tags: ["spawning", "cooldown", "movement mode", "registry"],

  intent:
    "<p>The open-space design gives each enemy a tactical goal against how the player is flying, not just a damage number. The spawner is what makes that true at the population level: kamikazes only come for you while you are cruising, so whether you scroll or stop is itself a choice about which threats you invite.</p>" +
    "<p>It is also deliberately small. A type adds itself with one <code>registerType</code> call at require time, and the system knows nothing about what it spawns.</p>",

  how:
    "<h3>Registration</h3>" +
    "<p><code>NpcEncounterSystem.registerType(name, {mode, jsonKey, factoryPath, spawn, countActive})</code>. <code>mode</code> is <code>\"scrolling\"</code> or <code>\"stopped\"</code>; <code>jsonKey</code> names the type's own data file, which must carry <code>spawnCooldown</code> and <code>spawnMaxActive</code>. <code>kamikaze_encounters.lua</code> is the only caller.</p>" +
    "<h3>Each frame</h3>" +
    "<ol>" +
    "<li>Read the player's arcade state (see [[ship-control]]): <code>isScrolling</code> gives the mode.</li>" +
    "<li>For every type whose <code>mode</code> matches, subtract <code>dt</code> from its cooldown. Types whose mode does not match are untouched: the timer pauses, it does not reset.</li>" +
    "<li>At zero: if <code>countActive() &ge; spawnMaxActive</code>, set the cooldown to 1 s and try again then. Otherwise reset to <code>spawnCooldown</code> and call the type's <code>spawn</code>.</li>" +
    "</ol>" +
    "<p>Cooldowns start full, so the first group arrives one whole cooldown (5 s) after the player first starts scrolling. Every value is re-read through <code>Loader.get</code> each time, so the editor can retune it live.</p>" +
    "<h3>The Kamikaze's spawn</h3>" +
    "<p><code>spawn</code> finds <code>spawnGroupSize</code> (4) open pace slots centre-first, computes each slot's pace target, places the kamikaze <code>arrivalDistance</code> beyond it along the heading, and gives member <i>i</i> a dive delay of <code>paceTime + (i&minus;1)&middot;diveStagger</code>: 1.0, 1.6, 2.2, 2.8 s. The slot and dive rules are on [[kamikaze-dive]].</p>",

  knobs: [
    ["Spawn cooldown", "5 s", "Seconds of matching-mode time between groups", "Kamikaze.json spawn.spawnCooldown"],
    ["Group size", "4", "Members per spawn", "spawn.spawnGroupSize"],
    ["Max active", "99", "Cap on live members; at the cap the type retries every 1 s", "spawn.spawnMaxActive"],
    ["Retry", "1 s", "Cooldown after a capped attempt", "npc_encounter_system.lua (hard-coded)"],
  ],

  related: [
    { id: "kamikaze-dive", how: "The one registered type and what it does once spawned." },
    { id: "npc-roster", how: "The goal roster that says which types should hunt which mode." },
    { id: "ship-control", how: "Arcade scrolling and stopped states are the mode this gates on." },
    { id: "formation-waves", how: "The scripted alternative: authored beats instead of cooldowns." },
    { id: "combat-pressure", how: "Its multipliers would scale the cooldown directly; none are wired." },
  ],

  questions: [
    "Mode is binary. Should time spent in a mode raise pressure (stand still too long and the Cordons come)?",
    "There is no escalation and no shared budget across types; two registered types would each spawn at full rate.",
    "Should a paused cooldown keep its progress, as now, or reset when the player changes mode?",
  ],

  sparks: [
    "Mode-gated ecologies: different predators for hovering, cruising and boosting, so the player's stance picks the fauna.",
    "Show the cooldown as a visible charge on the HUD and let players bait a group by flicking into the mode just long enough.",
    "Register by biome as well as mode, so the same spawner populates every zone from data.",
  ],

  terms: [
    { term: "Encounter type", def: "A self-registered NPC spawner with a required player mode.", code: "NpcEncounterSystem.registerType" },
    { term: "Player mode", def: "Scrolling or stopped, read from the arcade movement state.", code: "\"scrolling\" / \"stopped\"" },
    { term: "Spawn cooldown", def: "Per-type timer that ticks only in the matching mode.", code: "spawnCooldown" },
    { term: "Max active", def: "Per-type live cap; a capped attempt retries in 1 s.", code: "spawnMaxActive" },
  ],

  sources: [
    "shmuprouge:game/systems/ai/npc_encounter_system.lua",
    "shmuprouge:game/entities/kamikaze_encounters.lua",
    "shmuprouge:shared/data/entities/Kamikaze.json",
    "shmuprouge:docs/entities/npcs/NPC_OpenSpace_Specification_v0_3.md",
  ],

  toy: {
    title: "Two lanes, one mode",
    hint: "click the stage to switch scrolling / stopped",
    caption: "The Kamikaze lane is the real type. The Cordon lane is hypothetical: it shows what a second, stopped-mode registration would do, using the same rules. Each member lives about 4 s (arrive, pace, dive). The strip at the bottom is the last 20 s.",
    w: 384, h: 216,
    controls: [
      { type: "range", key: "cool", label: "cooldown", min: 1, max: 30, value: 5, fmt: "{} s" },
      { type: "range", key: "group", label: "group", min: 1, max: 8, value: 4 },
      { type: "range", key: "cap", label: "max active", min: 1, max: 99, value: 99 },
      { type: "button", label: "switch mode", press(S) { S.scrolling = !S.scrolling; } },
    ],
    init(S, P) {
      S.scrolling = true; S.t = 0; S.log = [];
      S.lanes = [{ name: "KAMIKAZE", mode: true, cd: P.cool, live: [], note: "" }, { name: "CORDON (HYPOTHETICAL)", mode: false, cd: P.cool, live: [], note: "" }];
    },
    pointer(e, S) { if (e.type === "down") S.scrolling = !S.scrolling; },
    update(S, P, dt) {
      S.t += dt;
      S.log.push([S.t, S.scrolling ? 1 : 0, 0]);
      for (let li = 0; li < 2; li++) {
        const L = S.lanes[li];
        for (const m of L.live) m.life -= dt;
        L.live = L.live.filter((m) => m.life > 0);
        if (L.mode !== S.scrolling) { L.note = "paused"; continue; }
        L.cd -= dt;
        L.note = "ticking";
        if (L.cd > 0) continue;
        if (L.live.length >= P.cap) { L.cd = 1; L.note = "at cap: retry 1 s"; S.log.push([S.t, -1, li + 1, "r"]); continue; }
        L.cd = P.cool;
        for (let i = 0; i < P.group; i++) L.live.push({ life: 2.5 + i * 0.6 });
        S.log.push([S.t, -1, li + 1, "s"]);
      }
      while (S.log.length && S.log[0][0] < S.t - 20) S.log.shift();
    },
    draw(g, S, P) {
      const C = g.C;
      g.clear();
      // ship and mode
      const sx = 330, sy = 18;
      g.poly([[sx + 8, sy], [sx - 6, sy - 6], [sx - 6, sy + 6]], C.ink);
      if (S.scrolling) for (let i = 0; i < 4; i++) g.line(sx - 14 - i * 9, sy - 4 + i * 3 % 8, sx - 20 - i * 9, sy - 4 + i * 3 % 8, C.ink3, 1);
      g.text(S.scrolling ? "SCROLLING" : "STOPPED", sx - 30, sy + 22, { color: S.scrolling ? C.accent : C.violet, align: "right" });
      for (let li = 0; li < 2; li++) {
        const L = S.lanes[li], y = 62 + li * 56, on = L.mode === S.scrolling;
        const col = li === 0 ? C.gold : C.violet;
        g.label(L.name + "  needs " + (L.mode ? "scrolling" : "stopped"), 12, y, on ? C.ink : C.ink3);
        g.meter(12, y + 6, 220, 8, Math.max(0, L.cd) / Math.max(P.cool, 1), on ? col : C.ink3, on ? 0.25 : 0.1);
        g.label(L.note.toUpperCase(), 240, y + 14, on ? C.ink2 : C.ink3);
        const n = Math.min(L.live.length, 60);
        for (let i = 0; i < n; i++) g.rect(12 + (i % 30) * 7, y + 20 + Math.floor(i / 30) * 7, 5, 5, col);
        g.label(L.live.length + " / " + P.cap + " ALIVE", 240, y + 26, C.ink3);
      }
      // timeline
      const x0 = 12, w = 360, y0 = 186;
      for (const e of S.log) {
        const x = x0 + (e[0] - (S.t - 20)) / 20 * w;
        if (e[1] >= 0) g.rect(x, y0, w / 1200 + 0.5, 6, e[1] ? C.rule : C.bg);
        else g.rect(x - 1, y0 - 10 + e[2] * 6 - 6, 2, e[3] === "s" ? 8 : 4, e[3] === "s" ? (e[2] === 1 ? C.gold : C.violet) : C.enemy);
      }
      g.rect(x0, y0, w, 6, C.ink3, 1);
      g.label("SCROLLING TIME SHADED   TICKS = SPAWNS, RED = CAPPED RETRY", x0, y0 + 18, C.ink3);
    },
    readout(S) {
      return "kamikaze cd " + Math.max(0, S.lanes[0].cd).toFixed(1) + " s\ncordon cd " + Math.max(0, S.lanes[1].cd).toFixed(1) + " s";
    },
  },
});
