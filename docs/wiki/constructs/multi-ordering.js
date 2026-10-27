Wiki.construct({
  id: "multi-ordering",
  name: "Volley or split: Multi ordering",
  origin: "playground",
  status: "built",
  statusNote: "Built in the MWS v2 runtime and playable in the F8 bench through the <em>Full volley</em> and <em>Split strike</em> presets. The survival game's weapons still use the legacy model.",
  summary: "The same Multi barrel means two different weapons depending on which side of the Striker it sits: before it, N full-price shots; after it, one paid shot split N ways.",
  tags: ["energy", "composition", "shotgun", "order matters"],

  intent:
    "<p>A shotgun should be a choice, not a stat bump. With every part of a weapon built from modules, the cheapest way to make <em>order</em> meaningful is to let one module mean two things. Put the Multi barrel upstream of the [[strikers|Striker]] and you get a heavy volley: three real bullets, each at full damage, each paid for. Put it downstream and you get a fan of three thirds of one bullet: the same cost as a single shot, a third of the damage per pellet, and visibly dimmer.</p>" +
    "<p>The rule makes the trade honest. Nothing is free: a split conserves the strike's power, and a volley pays for every pellet up front.</p>",

  how:
    "<h3>Multi before the Striker: a full volley</h3>" +
    "<p>The Multi fans the incoming direction into <code>count</code> lanes evenly spaced across <code>spread</code>. Every Striker reached under it offers its own strike request, and all of those requests are gathered into one atomic purchase. The [[sequence-reservoir|reservoir]] either holds the whole sum or the whole volley is skipped: never two pellets of three.</p>" +
    "<p>Each strike is independent afterwards: its own collider, its own [[sequences|Hit and Complete events]].</p>" +
    "<h3>Multi after the Striker: a split strike</h3>" +
    "<p>The Striker is paid once. The Multi below it splits that single strike into <code>count</code> child colliders, each carrying a <b>share</b> of <code>1/count</code>. Nested splits divide again, so a split of a split gives shares like &frac12;, &frac16;, &frac16;, &frac16;. The share scales damage, sustained drain, and brightness (<code>sqrt(share)</code>, so a third-share pellet draws at about 58%). Speed, range, size and duration are unchanged.</p>" +
    "<p>The children are one logical strike: hits accumulate into one count, and one Complete event fires when the last child ends. A child that ends early does not donate its share to the survivors.</p>" +
    "<h3>The bench presets, side by side</h3>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th></th><th>Full volley</th><th>Split strike</th></tr></thead><tbody>" +
    "<tr><td>Chain</td><td>Repeater 30 &rarr; Battery &rarr; <b>Multi &times;3</b> &rarr; Ranged &rarr; Sharp 12</td><td>Repeater 30 &rarr; Battery &rarr; Ranged &rarr; <b>Multi &times;3</b> &rarr; Sharp 12</td></tr>" +
    "<tr><td>Cost per trigger</td><td>3 &times; 8 = 24 e</td><td>8 e</td></tr>" +
    "<tr><td>Damage per pellet</td><td>12</td><td>4</td></tr>" +
    "<tr><td>Demand vs refill</td><td>48 e/s against 18 e/s: frequent whole-volley skips</td><td>16 e/s against 18 e/s: never skips</td></tr>" +
    "</tbody></table></div>",

  knobs: [
    ["Count", "3", "Lanes in a volley, or children in a split", "count (2-8)"],
    ["Spread", "30° (presets use 60°)", "Angle the lanes are spaced across", "spread"],
    ["Shot energy", "8 e", "Price of one Ranged or Piercing strike", "startEnergy"],
    ["Battery", "60 e, 20 e/s (presets 36 e, 18 e/s)", "Capacity and refill of the sequence's reservoir", "capacity, fillRate"],
  ],

  related: [
    { id: "sequence-reservoir", how: "Pays for the volley atomically; the battery tick moves from 24 to 8 when you reorder." },
    { id: "strikers", how: "The Striker is the pivot the Multi is placed against." },
    { id: "barrels", how: "Multi is one of the barrel subclasses." },
    { id: "sustained-drain", how: "Shares scale a beam's drain as well as its damage." },
  ],

  questions: [
    "Is a split's range and speed really unchanged? The spec calls \"no independent division penalties\" an initial tuning choice, not a physical model.",
    "Which sequence owns a split whose children land in different event chains? Waits on multi-input joins, which the graph does not support yet.",
  ],

  sparks: [
    "Fractal splitters: a split of a split of a split, where each generation is visibly dimmer, so the player reads the weapon's whole tree from the screen.",
    "A <em>focus</em> item that re-merges shares when two children overlap a target, rewarding aim with a cheap weapon.",
    "Treat share as a general resource: a split field that covers three times the area at a third of the damage per second.",
    "Make volley size the risky upgrade: more pellets means more stalls on a small battery, so the shop sells cadence and power as opposites.",
  ],

  terms: [
    { term: "Full volley", def: "N independent strikes requested under a Multi placed before a Striker, funded as one atomic purchase.", code: "ctx.volley, R:withVolley" },
    { term: "Split strike", def: "One paid strike divided into child colliders by a Multi placed after its Striker.", code: "R:plans" },
    { term: "Share", def: "The fraction of a split strike a child carries. Scales damage, drain and brightness.", code: "plan.share" },
  ],

  sources: [
    "playground:docs/Modular_Weapon_System.md",
    "playground:docs/MWS_Implementation.md",
    "playground:shared/framework/mws/v2runtime.lua:175",
    "playground:shared/framework/mws/v2energy.lua:14",
    "playground:games/horde-survivor/weaponprototypes.lua",
  ],

  toy: {
    title: "Same parts, different order",
    hint: "flip the order, then shrink the battery",
    caption: "Pellet brightness is sqrt(share). The tank's tick marks the start requirement: what must be stored before the trigger can buy anything. A simplified re-implementation of the v2 rules; dummies regenerate.",
    w: 384, h: 216,
    controls: [
      { type: "select", key: "order", label: "Multi", value: "before", options: [["before", "before Striker (volley)"], ["after", "after Striker (split)"]] },
      { type: "range", key: "count", label: "count", min: 2, max: 8, value: 3 },
      { type: "range", key: "cap", label: "battery", min: 10, max: 120, value: 36, fmt: "{} e" },
      { type: "range", key: "rate", label: "refill", min: 2, max: 60, value: 18, fmt: "{} e/s" },
    ],
    init(S) {
      S.E = 36; S.t = 0; S.cd = 0; S.shots = []; S.fired = 0; S.skipped = 0; S.dmg = 0; S.dmgLog = []; S.flash = 0;
      S.dummies = [];
      for (let i = 0; i < 7; i++) S.dummies.push({ x: 318, y: 30 + i * 26, hp: 60, hit: 0 });
    },
    update(S, P, dt) {
      const COST = 8, DAMAGE = 12, PERIOD = 0.5, SPEED = 130;
      S.t += dt;
      S.E = Math.min(P.cap, S.E + P.rate * dt);
      S.cd -= dt;
      if (S.cd <= 0) {
        S.cd += PERIOD;
        const need = P.order === "before" ? COST * P.count : COST;
        if (S.E + 1e-8 >= need) {
          S.E -= need; S.fired++;
          const share = P.order === "before" ? 1 : 1 / P.count;
          const spread = 60 * Math.PI / 180;
          for (let i = 0; i < P.count; i++) {
            const a = (i / (P.count - 1) - 0.5) * spread;
            S.shots.push({ x: 40, y: 108, vx: Math.cos(a) * SPEED, vy: Math.sin(a) * SPEED, share, dmg: DAMAGE * share, life: 2.2 });
          }
        } else { S.skipped++; S.flash = 0.25; }
      }
      S.flash = Math.max(0, S.flash - dt);
      for (const s of S.shots) {
        s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
        for (const d of S.dummies) if (s.life > 0 && Math.hypot(d.x - s.x, d.y - s.y) < 9) {
          s.life = 0; d.hit = 0.12; d.hp -= s.dmg; S.dmgLog.push([S.t, s.dmg]);
          if (d.hp <= 0) d.hp = 60;
        }
      }
      S.shots = S.shots.filter((s) => s.life > 0 && s.x < 400);
      for (const d of S.dummies) d.hit = Math.max(0, d.hit - dt);
      while (S.dmgLog.length && S.dmgLog[0][0] < S.t - 4) S.dmgLog.shift();
    },
    draw(g, S, P) {
      const C = g.C;
      g.clear();
      // battery tank with the start-requirement tick
      const tx = 10, ty = 40, th = 136, tw = 14;
      g.rect(tx, ty, tw, th, C.ink3, 1);
      const frac = S.E / P.cap;
      g.tone(tx + 1, ty + 1, tw - 1, th - 1, 0.12, C.accent);
      g.rect(tx + 1, ty + th - frac * th, tw - 1, frac * th, C.accent);
      const need = P.order === "before" ? 8 * P.count : 8;
      const ny = ty + th - Math.min(1, need / P.cap) * th;
      g.line(tx - 3, ny, tx + tw + 3, ny, need > P.cap ? C.enemy : C.ink, 1);
      g.label(need + "e", tx + tw + 5, ny + 3, need > P.cap ? C.enemy : C.ink);
      g.label("E", tx + 4, ty + th + 12, C.ink3);
      // gun
      g.circle(40, 108, 6, C.ink);
      if (S.flash > 0) g.text("SKIP", 52, 98, { color: C.enemy });
      // shots
      for (const s of S.shots) {
        const b = Math.sqrt(s.share);
        g.ctx.globalAlpha = b;
        g.circle(s.x, s.y, 3.5, C.gold);
        g.ctx.globalAlpha = 1;
      }
      // dummies
      for (const d of S.dummies) {
        g.circle(d.x, d.y, 8, d.hit > 0 ? C.ink : C.enemy);
        g.meter(d.x + 12, d.y - 2, 30, 4, d.hp / 60, C.enemy);
      }
    },
    readout(S, P) {
      const dps = S.dmgLog.reduce((a, d) => a + d[1], 0) / Math.min(4, Math.max(0.5, S.t));
      const need = P.order === "before" ? 8 * P.count : 8;
      const share = P.order === "before" ? "1" : "1/" + P.count;
      return "cost " + need + " e   share " + share + "   dmg/pellet " + (P.order === "before" ? 12 : (12 / P.count).toFixed(1)) +
        "\nfired " + S.fired + "   skipped " + S.skipped + "   dps " + dps.toFixed(1);
    },
  },
});
