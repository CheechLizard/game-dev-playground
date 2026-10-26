Wiki.construct({
  id: "crate-haul",
  name: "Crate haul: loot you have to tow home",
  family: "economy",
  origin: "shmuprouge",
  status: "spec",
  statusNote: "Spec only, in Game_Overview.md. No crate code exists (every 'crate' match in the code is a terrain crater), and the Solar System docs' version of the loop does not mention crates.",
  summary: "Pure harvest stripes compress into crates that trail behind the ship; each one slows you, a hit knocks it loose, and a dropped crate stays where it fell for the rest of the run.",
  tags: ["risk/reward", "towing", "backtracking", "persistence"],

  intent:
    "<p>Most loot is safe the moment you touch it. Crates make loot physical and vulnerable on the way home. You leave the arena towing everything you mined, and the corridor becomes a choice made under fire: protect the full haul and fly slow, or shed crates to survive and leave them behind.</p>" +
    "<p>Because dropped crates never despawn, losing one is a debt, not a loss. Once you are stronger you can come back for it, which gives backtracking a concrete reason.</p>",

  how:
    "<h3>The rules (Game_Overview.md, Crate Mechanics)</h3>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>Aspect</th><th>Behaviour</th></tr></thead><tbody>" +
    "<tr><td>Creation</td><td>A pure [[harvest-bar]] stripe compresses and ejects as a crate</td></tr>" +
    "<tr><td>Towing</td><td>Crates chain behind the ship, visible in the world</td></tr>" +
    "<tr><td>Drag</td><td>More crates, slower movement</td></tr>" +
    "<tr><td>Damage</td><td>Crates take no damage, but drop when hit</td></tr>" +
    "<tr><td>Persistence</td><td>Dropped crates never despawn</td></tr>" +
    "<tr><td>Retrieval</td><td>Backtrack any time to collect them</td></tr>" +
    "</tbody></table></div>" +
    "<h3>Where it sits in the loop</h3>" +
    "<p>Arena: mine, fill the bar, collect crates; a full bar means nothing is left to do. Corridor: the gauntlet, where crates make you slow and a target. Boss. Store: cash in crates and buy upgrades, then return to earlier areas for what you dropped ([[level-loop]]).</p>" +
    "<p>No numbers are given: drag per crate, chain spacing, whether a hit drops the struck crate or everything behind it, and how crates convert to store currency are all undefined.</p>" +
    "<h3>The competing model</h3>" +
    "<p>In <code>Solar_System_Arena.md</code> a full bar <em>activates the portal</em> and the store converts harvested materials to credits. There are no crates, and [[fuel]] supplies the pressure instead. The two loops share the harvest bar and nothing downstream of it; see [[resource-economy]].</p>",

  knobs: [
    ["Drag per crate", "TBD", "Speed lost per towed crate (spec: more crates = slower)", "none"],
    ["Chain spacing", "TBD", "Gap between towed crates", "none"],
    ["Drop rule", "drop when hit", "Which crate detaches on a hit", "none"],
    ["Despawn", "never", "Dropped crates persist for the run", "none"],
  ],

  related: [
    { id: "harvest-bar", how: "Pure stripes are the crate source." },
    { id: "level-loop", how: "The corridor gauntlet and backtracking that give crates their stakes." },
    { id: "store-gambling", how: "Where crates are cashed in." },
    { id: "resource-economy", how: "Crates belong to one of two competing economy models." },
  ],

  questions: [
    "Do crates exist at all? The Solar System docs replace this chain (crates, store) with a bar that opens a portal and a fuel clock.",
    "Does a hit drop only the struck crate, or snap the chain and lose every crate behind it?",
    "Is drag linear per crate, and is there a floor speed, so a long chain is slow but never stuck?",
    "Are crates worth a fixed amount, or do they carry the material and multiplier of the stripe that made them?",
  ],

  sparks: [
    "Crates as armour: a swinging chain can body-block bullets meant for the ship, so drag buys protection.",
    "Thief enemies that aim for the last crate rather than the ship.",
    "Beacons in the corridor where you can bank part of the chain, turning the gauntlet into a series of partial saves.",
    "Persistent drops across runs: a crate lost in run 4 is still there in run 5, a ghost of the player's own past.",
  ],

  terms: [
    { term: "Crate", def: "Spec: a compressed pure stripe, towed behind the ship as physical loot." },
    { term: "Tow chain", def: "The line of crates trailing the ship." },
    { term: "Drag", def: "Speed lost per towed crate." },
    { term: "Drop-on-hit", def: "Crates take no damage but detach when struck." },
    { term: "Persistent drop", def: "A detached crate that stays in the world until retrieved." },
  ],

  sources: [
    "shmuprouge:docs/Game_Overview.md",
    "shmuprouge:docs/levels/solar_system/Solar_System_Arena.md",
    "shmuprouge:docs/levels/Levels_Overview.md",
  ],

  toy: {
    title: "Haul or survive",
    hint: "move the pointer up and down to steer; add crates, then try to keep them",
    caption: "Every number here is invented, since the spec gives none: speed = base x (1 - drag x crates), floored at 25%, and a hit drops the struck crate. Dropped crates keep their world position, so backtracking brings them back on screen.",
    w: 384, h: 216,
    controls: [
      { type: "button", label: "add crate", press(S) { if (S.chain.length < 12) S.chain.push({ x: S.sx - 20, y: S.sy }); } },
      { type: "range", key: "drag", label: "drag", min: 0, max: 12, value: 6, fmt: "{}%/crate" },
      { type: "range", key: "fire", label: "fire", min: 0, max: 10, value: 4, fmt: "{}/s" },
      { type: "toggle", key: "back", label: "backtrack", value: false },
    ],
    init(S) {
      S.sx = 90; S.sy = 108; S.ty = 108; S.dist = 0; S.chain = []; S.dropped = []; S.bullets = []; S.cd = 0; S.lost = 0; S.got = 0; S.hits = 0;
      for (let i = 0; i < 4; i++) S.chain.push({ x: 70 - i * 16, y: 108 });
    },
    pointer(e, S) { S.ty = Math.max(30, Math.min(206, e.y)); },
    update(S, P, dt, kit) {
      const n = S.chain.length, speed = 120 * Math.max(0.25, 1 - P.drag / 100 * n);
      const dir = P.back ? -1 : 1;
      S.dist += dir * speed * dt;
      S.sy += (S.ty - S.sy) * Math.min(1, dt * 6 * Math.max(0.3, speed / 120));
      // chain follows the ship like a rope
      let lx = S.sx - 10 * dir, ly = S.sy;
      for (const c of S.chain) {
        const dx = c.x - lx, dy = c.y - ly, d = Math.hypot(dx, dy) || 1;
        if (d > 15) { c.x = lx + dx / d * 15; c.y = ly + dy / d * 15; }
        lx = c.x; ly = c.y;
      }
      // enemy fire comes from the right edge toward the ship's line
      S.cd -= dt;
      if (P.fire > 0 && S.cd <= 0) {
        S.cd = 1 / P.fire;
        const y = S.sy + kit.rand.range(-50, 50);
        S.bullets.push({ x: 390, y, vx: -170 - speed * dir, vy: 0 });
      }
      for (const b of S.bullets) {
        b.x += b.vx * dt;
        for (let i = 0; i < S.chain.length; i++) {
          const c = S.chain[i];
          if (Math.hypot(c.x - b.x, c.y - b.y) < 7) {
            b.dead = true; S.dropped.push({ wx: S.dist + (c.x - S.sx), y: c.y }); S.chain.splice(i, 1); S.lost++; break;
          }
        }
        if (!b.dead && Math.hypot(S.sx - b.x, S.sy - b.y) < 6) { b.dead = true; S.hits++; }
      }
      S.bullets = S.bullets.filter((b) => !b.dead && b.x > -10);
      // ship touching a dropped crate picks it back up
      for (const d of S.dropped) {
        const x = S.sx + (d.wx - S.dist);
        if (Math.hypot(x - S.sx, d.y - S.sy) < 14 && S.chain.length < 12) { d.got = true; S.chain.push({ x, y: d.y }); S.got++; }
      }
      S.dropped = S.dropped.filter((d) => !d.got);
    },
    draw(g, S, P) {
      const C = g.C; g.clear();
      // scrolling stars show speed
      for (let i = 0; i < 40; i++) {
        const x = ((i * 97 - S.dist * (0.4 + (i % 3) * 0.2)) % 384 + 384) % 384;
        g.rect(x, 34 + (i * 53) % 180, 1, 1, C.ink3);
      }
      for (const d of S.dropped) {
        const x = S.sx + (d.wx - S.dist);
        if (x > -10 && x < 394) { g.rect(x - 5, d.y - 5, 10, 10, C.gold, 1); g.tone(x - 4, d.y - 4, 9, 9, 0.4, C.gold); }
      }
      let px = S.sx, py = S.sy;
      for (const c of S.chain) { g.line(px, py, c.x, c.y, C.ink3, 1); px = c.x; py = c.y; }
      for (const c of S.chain) g.rect(c.x - 5, c.y - 5, 10, 10, C.gold);
      const f = P.back ? -1 : 1;
      g.poly([[S.sx + 8 * f, S.sy], [S.sx - 6 * f, S.sy - 6], [S.sx - 6 * f, S.sy + 6]], C.accent);
      for (const b of S.bullets) g.rect(b.x - 4, b.y - 1.5, 8, 3, C.enemy);
      const n = S.chain.length, sp = Math.max(0.25, 1 - P.drag / 100 * n);
      g.label("SPEED", 260, 14, C.ink2); g.meter(296, 9, 80, 5, sp, C.accent);
    },
    readout(S, P) {
      const sp = Math.max(0.25, 1 - P.drag / 100 * S.chain.length);
      return "towing " + S.chain.length + "   speed " + Math.round(sp * 100) + "%\ndropped " + S.lost + "   recovered " + S.got;
    },
  },
});
