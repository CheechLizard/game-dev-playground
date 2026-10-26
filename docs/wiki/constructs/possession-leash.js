// Toy constants: 1 stage px = 8 wu. State durations mirror game/ui/possession.lua.
var PSL_WU = 8, PSL_AX = 232, PSL_AY = 112;
var PSL_STATES = [["awakening", 0], ["explosion", 2.5], ["blackout", 0.8], ["respawn", 0.5], ["dialogue", 3], ["complete", 0]];
function pslInit(S) {
  S.st = 0; S.t = 0; S.x = PSL_AX + 30; S.y = PSL_AY + 6; S.vx = 0; S.vy = 0; S.ptr = null; S.parts = []; S.possessed = false; S.dist = 0; S.inten = 0; S.watch = 0; S.done = 0;
}

Wiki.construct({
  id: "possession-leash",
  name: "Possession leash",
  family: "structure",
  origin: "shmuprouge",
  status: "built",
  statusNote: "Built as the tutorial's possession cinematic. The tutorial doc says the player only watches; the code keeps the ship under control and makes the death a distance leash.",
  summary: "After the scan the artifact wakes and the ship stays flyable, but lightning grows with distance; reach the death distance and the ship explodes, blacks out and respawns at the artifact, bound to it for the rest of the run.",
  tags: ["tutorial", "narrative", "respawn", "tether", "scripted death"],

  intent:
    "<p>A roguelike that respawns you needs a reason you come back. ShmupRouge's reason is the artifact: it possesses the pilot, and every death returns you to it. The possession beat has to deliver that fiction and teach it at once. Its lesson is that you cannot get away, and the way it teaches it is that fleeing is what kills you.</p>" +
    "<p>Letting the player keep control turns a cutscene into a discovery. The lightning visibly strains as you pull away; most players will test it, and the death they cause is the one the story needed.</p>",

  how:
    "<h3>States</h3>" +
    "<p><code>Possession:update</code> in <code>game/ui/possession.lua</code> runs a fixed chain:</p>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>State</th><th>Length</th><th>What happens</th></tr></thead><tbody>" +
    "<tr><td>awakening</td><td>until the leash snaps</td><td><code>lightningIntensity = min(1, dist / deathDistance)</code>; at <code>dist &ge; deathDistance</code> go to explosion</td></tr>" +
    "<tr><td>explosion</td><td>2.5 s (<code>EXPLOSION_HOLD</code>)</td><td>the processor sets HP to 0, disables control, spawns the player's death debris</td></tr>" +
    "<tr><td>blackout</td><td>0.3 s fade + 0.5 s hold</td><td>screen to black</td></tr>" +
    "<tr><td>respawn</td><td>0.5 s fade out</td><td><code>set_possessed</code>: teleport to the artifact, full HP, <code>isPossessed = true</code> (ship recolour), artifact gravity on</td></tr>" +
    "<tr><td>dialogue1, dialogue2</td><td>player-dismissed, then 10 s</td><td>the artifact speaks; weapons enabled</td></tr>" +
    "<tr><td>complete</td><td></td><td>context back to Gameplay; checkpoint set to <code>\"retrieve\"</code></td></tr>" +
    "</tbody></table></div>" +
    "<h3>Why the death does not end the game</h3>" +
    "<p>The objective is <code>type: \"cinematic\"</code>. On start the possession switches the [[play-contexts|game context]] to <code>Cinematic</code>; the death handler only opens Game Over when the context is <code>Gameplay</code>, so this death is free. The update dispatcher still runs the full game loop in Cinematic, which is why the ship can still be flown.</p>" +
    "<p>Distance is a plain <code>Vec2.length</code> of the world-position delta, not the wrapped delta that [[hold-to-scan]] uses, so near the arena seam the leash could read the long way round.</p>" +
    "<h3>What the doc says instead</h3>" +
    "<p><code>docs/tutorial/Tutorial.md</code>, Objective 3: &quot;This is not interactive. The player watches.&quot; Lightning flows along the tether, the ship explodes, the player respawns at the artifact. The code keeps every beat of that sequence and adds the leash in front of it.</p>",

  knobs: [
    ["Death distance", "800 wu", "Leash length: where intensity reaches 1 and the ship dies", "Objectives.json tutorial.possession.deathDistance"],
    ["Proximity radius", "200 wu", "Possession proximity config", "tutorial.possession.proximityRadius"],
    ["Explosion hold", "2.5 s", "Time between death and blackout", "EXPLOSION_HOLD"],
    ["Blackout", "0.3 s fade, 0.5 s hold", "Screen-black beat", "BLACKOUT_FADE_IN, BLACKOUT_HOLD"],
    ["Respawn fade", "0.5 s", "Fade back in at the artifact", "RESPAWN_FADE_OUT"],
    ["Possessed colour", "[0.4, 0.7, 1.0]", "Ship tint after possession", "Artifact.json possession.shipColor"],
  ],

  related: [
    { id: "mission-system", how: "The cinematic objective type and the checkpoint it sets." },
    { id: "play-contexts", how: "The Cinematic context is what makes the scripted death not count." },
    { id: "hold-to-scan", how: "The beat right before; the tether drawn there is the one the lightning follows." },
    { id: "flow-field-gravity", how: "Respawn switches on the artifact's own gravity pull." },
  ],

  questions: [
    "Should the leash use the wrapped delta like the scan does? Today a ship near the arena seam measures the long way round.",
    "Is the player meant to discover the leash or be told? Nothing on screen says the lightning is a distance meter.",
    "If the player never flies away, the awakening state never ends. Is there meant to be a timer fallback, as in the doc's non-interactive version?",
  ],

  sparks: [
    "A tethered hero for a whole game: a leash to a respawn anchor, with its length as the upgrade that opens the map.",
    "Inevitable deaths as teaching beats: the first death is scripted and free, so the player learns the respawn without losing anything.",
    "Strain as a meter: the lightning's thickness is a readable distance gauge, reusable for any range limit (a drone's control link, a grapple).",
    "Invert it: a leash that kills you for getting too close, around a boss that must be fought at range.",
  ],

  terms: [
    { term: "Possession", def: "The tutorial cinematic that binds the pilot to the artifact.", code: "game/ui/possession.lua Possession" },
    { term: "Death distance", def: "The leash length; reaching it triggers the scripted death.", code: "tutorial.possession.deathDistance" },
    { term: "Lightning intensity", def: "dist / deathDistance clamped to 1; drives the tether lightning.", code: "lightningIntensity" },
    { term: "Possessed", def: "Player flag set at respawn; recolours the ship.", code: "player.isPossessed" },
    { term: "Respawn anchor", def: "The artifact: where every later death returns you.", code: "Actions.set_possessed" },
  ],

  sources: [
    "shmuprouge:game/ui/possession.lua",
    "shmuprouge:game/objectives/processor.lua",
    "shmuprouge:game/objectives/actions.lua",
    "shmuprouge:core/init.lua",
    "shmuprouge:docs/tutorial/Tutorial.md",
    "shmuprouge:shared/data/progression/Objectives.json",
  ],

  toy: {
    title: "You cannot get away",
    hint: "hold to steer; let go and it flees",
    caption: "1 px = 8 wu; the dashed circle is the death distance. The dialogue beats are shortened to 3 s. 'Doc' mode is the Tutorial.md version: no control, the lightning creeps along the tether on a timer.",
    w: 384, h: 216,
    controls: [
      { type: "select", key: "mode", label: "version", value: "code", reset: true, options: [["code", "code: distance leash"], ["doc", "doc: player watches"]] },
      { type: "range", key: "dd", label: "death distance", min: 200, max: 1500, step: 50, value: 800, fmt: "{} wu" },
      { type: "button", label: "replay", press(S) { pslInit(S); } },
    ],
    init(S) { pslInit(S); },
    pointer(e, S) { S.ptr = e.down ? { x: e.x, y: e.y } : null; },
    update(S, P, dt, kit) {
      S.t += dt;
      const name = PSL_STATES[S.st][0], len = PSL_STATES[S.st][1];
      const flying = name === "awakening" || name === "dialogue" || name === "complete";
      if (flying && !(P.mode === "doc" && name === "awakening")) {
        let ax = 0, ay = 0;
        if (S.ptr) { ax = (S.ptr.x - S.x) * 3 - S.vx * 2; ay = (S.ptr.y - S.y) * 3 - S.vy * 2; }
        else if (!S.possessed) { const a = Math.atan2(S.y - PSL_AY, S.x - PSL_AX) + 0.6; ax = Math.cos(a) * 40 - S.vx * 0.5; ay = Math.sin(a) * 40 - S.vy * 0.5; }
        else { ax = (PSL_AX - S.x) * 0.6 - S.vx; ay = (PSL_AY - S.y) * 0.6 - S.vy; }
        S.vx += ax * dt; S.vy += ay * dt;
        S.x = kit.clamp(S.x + S.vx * dt, 2, 382); S.y = kit.clamp(S.y + S.vy * dt, 2, 214);
      }
      S.dist = Math.hypot(S.x - PSL_AX, S.y - PSL_AY) * PSL_WU;
      if (name === "awakening") {
        if (P.mode === "code") { S.inten = Math.min(1, S.dist / P.dd); if (S.dist >= P.dd) this.go(S, kit); }
        else { S.watch += dt; S.inten = Math.min(1, S.watch / 4); if (S.watch >= 4) this.go(S, kit); }
      } else if (len > 0 && S.t >= len) {
        if (name === "blackout") { S.x = PSL_AX + 14; S.y = PSL_AY; S.vx = S.vy = 0; S.possessed = true; }
        this.go(S, kit);
      }
      if (name === "explosion") S.inten = 1;
      if (name === "respawn") S.inten = 1 - Math.min(1, S.t / 0.5);
      if (name === "complete") { S.done += dt; if (S.done > 4) pslInit(S); }
      for (const p of S.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.98; p.vy *= 0.98; p.l -= dt; }
      S.parts = S.parts.filter((p) => p.l > 0);
    },
    go(S, kit) {
      S.st++; S.t = 0; if (PSL_STATES[S.st][0] === "dialogue") S.inten = 0;
      if (PSL_STATES[S.st][0] === "explosion") for (let i = 0; i < 40; i++) { const a = kit.rand.range(0, 6.283), v = kit.rand.range(20, 90); S.parts.push({ x: S.x, y: S.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, l: kit.rand.range(1, 2.5) }); }
    },
    draw(g, S, P, kit) {
      const C = g.C; g.clear();
      const name = PSL_STATES[S.st][0];
      g.circle(PSL_AX, PSL_AY, P.dd / PSL_WU, C.enemy, 1);
      g.toneCircle(PSL_AX, PSL_AY, 10, 0.5, C.violet); g.circle(PSL_AX, PSL_AY, 6, C.violet);
      const alive = name === "awakening" || name === "dialogue" || name === "complete" || name === "respawn";
      if (S.inten > 0.01 && (name === "awakening" || name === "explosion")) {
        const tx = name === "explosion" ? S.parts.length ? S.parts[0].x : S.x : S.x, ty = name === "explosion" && S.parts.length ? S.parts[0].y : S.y;
        const reach = P.mode === "doc" && name === "awakening" ? S.inten : 1;
        const pts = [[PSL_AX, PSL_AY]], n = 9, dx = tx - PSL_AX, dy = ty - PSL_AY, L = Math.hypot(dx, dy) || 1;
        for (let i = 1; i <= n; i++) {
          const f = (i / n) * reach, j = i === n && reach >= 1 ? 0 : Math.sin(S.t * 37 + i * 2.3) * 7 * S.inten;
          pts.push([PSL_AX + dx * f - dy / L * j, PSL_AY + dy * f + dx / L * j]);
        }
        g.ctx.globalAlpha = 0.35 + 0.65 * S.inten; g.poly(pts, C.sky, 1 + 3 * S.inten, false); g.ctx.globalAlpha = 1;
      }
      if (alive) g.poly([[S.x, S.y - 5], [S.x + 4, S.y + 4], [S.x - 4, S.y + 4]], S.possessed ? C.sky : C.ink);
      for (const p of S.parts) g.rect(p.x, p.y, 2, 2, p.l > 1 ? C.gold : C.ink3);
      if (name === "dialogue") g.text("\"YOU HAVE BEEN CONSUMED, HUMAN.\"", PSL_AX, 30, { color: C.violet, align: "center" });
      if (name === "blackout" || name === "respawn") {
        g.ctx.globalAlpha = name === "blackout" ? Math.min(1, S.t / 0.3) : 1 - Math.min(1, S.t / 0.5);
        g.rect(0, 0, 384, 216, "#000"); g.ctx.globalAlpha = 1;
      }
      // state strip
      PSL_STATES.forEach((s, i) => {
        const x = 6 + i * 63, on = i === S.st;
        if (on) g.tone(x, 196, 60, 14, 0.35, C.accent);
        g.rect(x, 196, 60, 14, on ? C.accent : C.rule, 1);
        g.label(s[0], x + 30, 206, on ? C.ink : C.ink3, "center");
      });
    },
    readout(S, P) {
      return PSL_STATES[S.st][0] + "  dist " + Math.round(S.dist) + "/" + P.dd + " wu\nlightning " + S.inten.toFixed(2) + (S.possessed ? "  possessed" : "");
    },
  },
});
