Wiki.construct({
  id: "contact-iframes",
  name: "One hit, then i-frames",
  origin: "playground",
  status: "built",
  statusNote: "Built as a default, not a decision: HANDOFF lists the contact model under questions never answered. The god-mode blink is a known fault.",
  summary: "Touching an enemy or shot deals one hit, reduced by flat armor to a minimum of 1, then the player is invulnerable for 0.5 s and blinks; a crowd hurts no faster than a single enemy.",
  tags: ["damage", "invulnerability", "crowds", "feedback"],

  intent:
    "<p>Contact damage has to read. With one hit and a short invulnerable window, every touch is an event the player sees (a flash, a shake, a blink) rather than a drain they notice too late. It also caps how fast a crowd can kill: being surrounded by twenty grunts costs the same per second as touching one, so the horde's threat comes from per-hit damage climbing with the [[escalation-curve|wave]] and from being pinned, not from the head count.</p>" +
    "<p>HANDOFF records the alternative explicitly: \"one hit + 0.5s i-frames, not continuous DPS\", defaulted and left as a dial.</p>",

  how:
    "<h3>The hit</h3>" +
    "<p>Every frame each enemy within <code>enemy.radius + player.radius</code> calls <code>run:damagePlayer(e.damage, name)</code>; enemy shots do the same. <code>damagePlayer</code> returns at once if the player is <code>invulnerable</code>, has <code>iframe &gt; 0</code>, or the run is not in play. Otherwise:</p>" +
    "<ul>" +
    "<li>damage taken is <code>max(1, amount &minus; armor)</code> (armor 0 by default);</li>" +
    "<li><code>iframe = player.iframes</code> = 0.5 s;</li>" +
    "<li>the player's hit flash is set to twice <code>render.hitFlash</code> (0.16 s);</li>" +
    "<li>screen shake rises by 2.5 to a cap of 6 and decays at 12 per second;</li>" +
    "<li>the source's name is added to <code>damageTakenBy</code>, which feeds the end-of-run \"What hurt you\" list, and becomes <code>killedBy</code> on death.</li>" +
    "</ul>" +
    "<h3>The blink</h3>" +
    "<p>The renderer hides the player on alternate 1/20 s slots while <code>iframe &gt; 0</code>. The sandbox levels need permanent invulnerability, which has its own standing flag (<code>player.invulnerable</code>) so it does not blink: the code comment says \"a standing state should not blink, there is no news in it\".</p>" +
    "<p>God mode was left behind by that fix. <code>debug.godMode</code> works by pumping <code>iframe = max(iframe, 0.1)</code> every frame from <code>game.lua</code>, so a god-mode player blinks for the whole run, including in every capture made with it.</p>" +
    "<h3>What a crowd costs</h3>" +
    "<p>The maximum damage rate is one hit per 0.5 s regardless of how many enemies touch. A Grunt hits for 8 at wave 1, so standing in a crowd costs 16 HP/s whether it is one Grunt or thirty. A per-enemy cooldown model, the toy's comparison, scales linearly with the crowd.</p>",

  knobs: [
    ["Invulnerability", "0.5 s", "Window after a hit", "player.iframes"],
    ["Armor", "0", "Flat reduction, minimum 1 damage", "player.armor"],
    ["Max HP", "100", "Base health (plus levels and Plating)", "player.maxHp"],
    ["Hit flash", "0.08 s (player 2×)", "Flash length", "render.hitFlash"],
    ["Screen shake", "1×", "Shake scale", "render.screenShake"],
    ["Grunt contact damage", "8", "Per hit at wave 1", "enemy.grunt.damage"],
  ],

  related: [
    { id: "player-movement", how: "Movement is the only defence the contact model leaves." },
    { id: "escalation-curve", how: "Per-hit damage, not crowd size, is what climbs." },
    { id: "enemy-behaviours", how: "Chargers and shooters turn single hits into the threat." },
    { id: "fair-attack-contract", how: "ShmupRouge's rules for making each hit readable before it lands." },
  ],

  questions: [
    "One hit plus i-frames, or continuous DPS where a crowd matters? Never decided.",
    "Should god mode use the standing invulnerable flag so it stops blinking?",
  ],

  sparks: [
    "I-frames that scale with the damage just taken, so a big hit buys a long escape.",
    "A graze reward: touching enemies during i-frames pays LP or charge, so the window is a resource, not just relief.",
    "Contact as DPS with percentage armor, making crowd size the core threat and area weapons essential.",
  ],

  terms: [
    { term: "I-frames", def: "Post-hit invulnerability window; the player blinks through it.", code: "player.iframe, player.iframes" },
    { term: "Invulnerable", def: "Standing invulnerability for sandbox levels; does not blink.", code: "player.invulnerable" },
    { term: "What hurt you", def: "End-of-run damage taken per source.", code: "stats.damageTakenBy" },
  ],

  sources: [
    "playground:games/horde-survivor/run.lua:687",
    "playground:games/horde-survivor/run.lua:861",
    "playground:games/horde-survivor/run.lua:112",
    "playground:games/horde-survivor/render.lua:426",
    "playground:games/horde-survivor/game.lua:370",
    "playground:HANDOFF.md:153",
  ],

  shots: [
    { src: "img/death.png", caption: "A stationary player killed by Grunts at 0:33, with the run summary's damage taken by source.", cmd: "luajit tools/screenshot.lua death.png --seed 7 --at 145 --set run.wavesPerShop=10" },
  ],

  toy: {
    title: "Twenty grunts, one hit at a time",
    hint: "drag the player · switch the model",
    caption: "Exact damage rule, 20 Hz blink and 0.5 s window. Simplified: Grunts chase at the schema speed of 30 px/s (the autosaved default profile plays them at 65.7) with a crude separation push; HP refills on death. The trace is HP over the last 10 s.",
    w: 384, h: 216,
    controls: [
      { type: "select", key: "model", label: "contact", value: "iframes", options: [["iframes", "one hit + i-frames (game)"], ["each", "per-enemy cooldown"]] },
      { type: "range", key: "n", label: "grunts", min: 1, max: 30, value: 12, reset: true },
      { type: "range", key: "iframes", label: "i-frames", min: 0, max: 2, step: 0.05, value: 0.5, fmt: "{} s" },
      { type: "range", key: "dmg", label: "damage", min: 1, max: 40, value: 8 },
      { type: "toggle", key: "god", label: "god mode pump", value: false },
    ],
    init(S, P, kit) {
      Object.assign(S, { px: 250, py: 110, hp: 100, iframe: 0, t: 0, shake: 0, flash: 0, trace: [], deaths: 0, log: [] });
      S.es = [];
      for (let i = 0; i < P.n; i++) { const a = kit.rand() * kit.TAU, r = 60 + kit.rand() * 60; S.es.push({ x: 250 + Math.cos(a) * r, y: 110 + Math.sin(a) * r * 0.7, cd: 0 }); }
    },
    update(S, P, dt) {
      S.t += dt;
      if (P.god) S.iframe = Math.max(S.iframe, 0.1);
      const hit = (amt) => {
        S.hp -= Math.max(1, amt); S.flash = 0.16; S.shake = Math.min(6, S.shake + 2.5); S.log.push([S.t, Math.max(1, amt)]);
        if (S.hp <= 0) { S.hp = 100; S.deaths++; }
      };
      for (const e of S.es) {
        const dx = S.px - e.x, dy = S.py - e.y, d = Math.hypot(dx, dy) || 1;
        e.x += dx / d * 30 * dt; e.y += dy / d * 30 * dt;
        for (const o of S.es) if (o !== e) { const ox = e.x - o.x, oy = e.y - o.y, od = Math.hypot(ox, oy); if (od > 0 && od < 8) { e.x += ox / od * (8 - od) * 0.5; e.y += oy / od * (8 - od) * 0.5; } }
        e.cd = Math.max(0, e.cd - dt);
        if (Math.hypot(S.px - e.x, S.py - e.y) < 8) {
          if (P.model === "iframes") { if (S.iframe <= 0) { hit(P.dmg); S.iframe = P.iframes; } }
          else if (e.cd <= 0 && !P.god) { hit(P.dmg); e.cd = Math.max(0.05, P.iframes); }
        }
      }
      S.iframe = Math.max(0, S.iframe - dt); S.flash = Math.max(0, S.flash - dt); S.shake = Math.max(0, S.shake - 12 * dt);
      S.trace.push(S.hp / 100); if (S.trace.length > 600) S.trace.shift();
      while (S.log.length && S.log[0][0] < S.t - 3) S.log.shift();
    },
    pointer(e, S) { if (e.down) { S.px = Math.max(140, Math.min(378, e.x)); S.py = Math.max(36, Math.min(176, e.y)); } },
    draw(g, S, P) {
      const C = g.C; g.clear();
      const sx = (S.t * 97 % 1 - 0.5) * S.shake, sy = (S.t * 61 % 1 - 0.5) * S.shake;
      g.ctx.save(); g.ctx.translate(sx, sy);
      for (const e of S.es) g.circle(e.x, e.y, 4, C.enemy);
      const visible = S.iframe <= 0 || Math.floor(S.t * 20) % 2 === 0;
      if (visible) g.circle(S.px, S.py, 4, S.flash > 0 ? C.gold : C.ink);
      if (S.iframe > 0) g.arc(S.px, S.py, 8, -Math.PI / 2, -Math.PI / 2 + kit_frac(S.iframe, P.iframes) * Math.PI * 2, C.ink3, 1);
      g.ctx.restore();
      // HP trace panel
      g.rect(8, 40, 124, 120, C.rule, 1);
      g.tone(9, 41, 123, 119, 0.06, C.ink3);
      g.plot(9, 41, 123, 118, S.trace, C.accent, 1);
      g.label("HP, LAST 10 S", 10, 172, C.ink3);
      g.meter(8, 180, 124, 5, S.hp / 100, C.accent);
      g.label("DEATHS " + S.deaths, 10, 200, S.deaths ? C.enemy : C.ink3);
      if (P.god) g.label("GOD MODE: BLINKS FOREVER", 140, 208, C.violet);
      function kit_frac(a, b) { return b > 0 ? Math.min(1, a / b) : 0; }
    },
    readout(S) {
      const rate = S.log.reduce((a, l) => a + l[1], 0) / Math.min(3, Math.max(0.5, S.t));
      return "hp loss " + rate.toFixed(1) + " hp/s\niframe " + S.iframe.toFixed(2) + " s";
    },
  },
});
