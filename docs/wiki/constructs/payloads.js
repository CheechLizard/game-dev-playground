(function () {
  const STEP = 1 / 60, OX = 30, LA = 72, LB = 128, DX = 200, CYCLE = 6;
  const OPTS = [["sharp", "Sharp"], ["impact", "Impact"], ["plasma", "Plasma"], ["none", "none"]];
  const colour = (C, k) => ({ sharp: C.sky, impact: C.gold, plasma: C.violet, none: C.ink3 })[k];
  // Damage one Payload applies this tick, as the loop in R:simulate.
  function dmg(kind, first, sustained, D, dt) {
    if (kind === "none") return 0;
    if (sustained && kind === "plasma") return D * dt;
    return first ? D : 0;
  }

  Wiki.construct({
    id: "payloads",
    name: "Payload identities",
    family: "weapons",
    origin: "playground",
    status: "partial",
    statusNote: "Sharp, Impact and Plasma are built in the MWS v2 runtime with shared visual and sound identities. In code Sharp and Impact are mechanically identical; only their presentation differs. Burning, Corrosive, Freezing and Black Hole are spec only, with reserved colours.",
    summary: "A Payload is what a contact does: damage and its look. It never costs energy and never changes the strike's shape, so damage identity is independent of delivery and power.",
    tags: ["damage", "identity", "feedback", "status effects"],

    intent:
      "<p>Players learn a weapon's damage type by sight and sound: cyan slashes, gold bursts, violet rings. Keeping that identity in its own module means a sword, a beam and a mine can all be \"plasma\" and read the same, while a designer changes delivery without touching damage.</p>" +
      "<p>The other half is what a Payload does <em>not</em> do. It never debits a battery and never alters speed, reach or size. Adding a second Payload adds damage and colour; it never makes the gun fire slower.</p>",

    how:
      "<h3>The built Payloads</h3>" +
      "<div class=\"tbl-wrap\"><table><thead><tr><th>Subclass</th><th>On a projectile</th><th>On a sustained strike</th><th>Identity</th></tr></thead><tbody>" +
      "<tr><td>Sharp</td><td><code>damage &times; share</code> once per distinct target</td><td>Same: once per target per strike</td><td>Cyan, blade mark</td></tr>" +
      "<tr><td>Impact</td><td>Same as Sharp</td><td>Same as Sharp</td><td>Gold, burst</td></tr>" +
      "<tr><td>Plasma</td><td>Same as Sharp: per contact</td><td><code>damage &times; dt &times; share</code> every overlapping tick: damage per second for funded time</td><td>Violet, rings</td></tr>" +
      "</tbody></table></div>" +
      "<p><b>Sharp and Impact are the same in code.</b> The spec describes Sharp as \"once per distinct target\" and Impact as \"point damage with Impact presentation\"; the runtime applies both with one rule, and the only difference is the identity registry (<code>payloads.lua</code>). Impact's old speed &times; weight multiplier was deleted with the layered energy model ([[mws-lineage]]).</p>" +
      "<p>Damage is scaled by the collider's share, so a three-way split does a third per child ([[multi-ordering]]). For sustained Plasma, <code>dt</code> is the funded time, so a beam that only got half a tick's energy deals half a tick's damage ([[sustained-drain]]). The host applies damage through <code>host.damage(strike, target, damage, payload)</code> with no knockback in v2.</p>" +
      "<h3>Order and mixing</h3>" +
      "<p>Payloads are collected in path order below the Striker and applied in that order on each contact. Nothing reads another Payload's result yet, so today order changes only which colour band is drawn first; the spec keeps ordered activation so future status Payloads can depend on it. A strike with several Payloads keeps separate colour bands rather than averaging them. With no Payload a strike does no damage, stays grey, and still produces Hit and Complete events.</p>" +
      "<p>The <code>effect</code> property (<code>none</code>, <code>spark</code>, <code>burst</code>, <code>ring</code>, <code>shock</code>) plays once on the first damaging contact with each target. Presentation never spends energy or changes geometry ([[hit-feedback]]).</p>" +
      "<h3>Spec-only Payloads</h3>" +
      "<div class=\"tbl-wrap\"><table><thead><tr><th>Subclass</th><th>Intended behaviour</th></tr></thead><tbody>" +
      "<tr><td>Burning</td><td>Damage over time that sticks to a target and can spread</td></tr>" +
      "<tr><td>Corrosive</td><td>Damage over time that sticks to a target</td></tr>" +
      "<tr><td>Freezing</td><td>Stops movement and deals damage</td></tr>" +
      "<tr><td>Black Hole</td><td>An outer area pulls targets toward an inner event horizon where damage applies ([[black-holes]])</td></tr>" +
      "</tbody></table></div>" +
      "<p>The identity registry reserves Acid, Fire, Ice and Void colours for them; their mechanics are not implemented.</p>",

    knobs: [
      ["Subclass", "sharp", "Damage rule and identity", "node.props.subclass"],
      ["Damage", "8", "HP per contact, or HP per second for sustained Plasma", "damage (0-1000)"],
      ["Effect", "spark", "Visual on first damaging contact", "effect"],
    ],

    related: [
      { id: "strikers", how: "The Striker decides when contact happens; the Payload decides what it does." },
      { id: "hit-feedback", how: "Payload identity drives the colours, sparks and sounds of a hit." },
      { id: "black-holes", how: "The spec's Black Hole Payload owns its own pull shape." },
      { id: "sustained-drain", how: "Plasma damage follows funded active time." },
    ],

    questions: [
      "Should Sharp and Impact differ mechanically, as the spec's wording suggests, or is Impact only a presentation?",
      "Effect stacking, status duration and spread for Burning and Corrosive are undefined, as is the energy and lifetime of persistent effects.",
      "Who owns collision shape once Payloads like Black Hole have their own areas: the Striker, the Payload, or both?",
      "Should Payload order ever matter mechanically, for example Freezing before Impact to shatter?",
    ],

    sparks: [
      "Make Payload order a mechanic: Freezing then Impact shatters for a bonus, Impact then Freezing does not, and the module tray teaches the combo.",
      "Payload-free tracer rounds that only produce events: a cheap spotting shot whose Hit starts a heavy second sequence.",
      "A shop that sells damage identity separately from guns, so a player's colour scheme is also their build.",
      "Enemy armour types keyed on identity rather than numbers: gold bursts crack shells, violet rings melt shields.",
    ],

    terms: [
      { term: "Payload", def: "An ordered damage effect a Striker applies on contact. Never spends energy; without one a strike does no damage but still emits events.", code: "type = \"payload\"" },
      { term: "Plasma Payload", def: "Damage per contact on a projectile; damage per second of funded overlap on a sustained strike.", code: "subclass = \"plasma\"" },
      { term: "Sharp / Impact Payload", def: "Damage once per distinct target per strike. Mechanically identical in code; only the identity differs.", code: "subclass = \"sharp\" | \"impact\"" },
    ],

    sources: [
      "playground:shared/framework/mws/v2runtime.lua:446",
      "playground:shared/framework/mws/v2modules.lua:81",
      "playground:games/horde-survivor/payloads.lua",
      "playground:games/horde-survivor/arsenal.lua:256",
      "playground:docs/Modular_Weapon_System.md",
    ],

    toy: {
      title: "Same strikes, different Payloads",
      hint: "swap the Payloads and compare the plot",
      caption: "Top: a Stab beam held 2 s of every 3 on a dummy (drain 4 e/s). Bottom: a Ranged shot every 0.5 s (8 e each). The plot is damage dealt in the current 6 s window. The energy and hit counts do not move when you change Payloads.",
      w: 384, h: 216,
      controls: [
        { type: "select", key: "p1", label: "payload 1", value: "sharp", options: OPTS, reset: true },
        { type: "select", key: "p2", label: "payload 2", value: "none", options: OPTS, reset: true },
        { type: "range", key: "damage", label: "damage", min: 0, max: 40, value: 8, reset: true },
      ],
      init(S) { S.t = 0; S.beam = null; S.shots = []; S.dA = 0; S.dB = 0; S.pA = []; S.pB = []; S.eA = 0; S.eB = 0; S.hA = 0; S.hB = 0; S.fx = []; },
      update(S, P) {
        const pays = [P.p1, P.p2].filter((k) => k !== "none");
        S.t += STEP;
        const ph = S.t % 3;
        if (ph < 2 && !S.beam) S.beam = { age: 0, hit: false };
        if (ph >= 2 && S.beam) S.beam = null;
        if (S.beam) {
          S.beam.age += STEP; S.eA += 4 * STEP;
          if (OX + 180 * Math.min(1, S.beam.age / 0.08) >= DX - 7) {
            const first = !S.beam.hit;
            if (first) { S.beam.hit = true; S.hA++; }
            for (const k of pays) { const d = dmg(k, first, true, P.damage, STEP); S.dA += d; if (first && d > 0) S.fx.push({ x: DX, y: LA, k, t: 0.3 }); }
          }
        }
        if (Math.round(S.t * 60) % 30 === 1) { S.shots.push({ x: OX }); S.eB += 8; }
        for (const s of S.shots) {
          s.x += 150 * STEP;
          if (!s.done && s.x >= DX - 7) {
            s.done = true; S.hB++;
            for (const k of pays) { const d = dmg(k, true, false, P.damage, STEP); S.dB += d; if (d > 0) S.fx.push({ x: DX, y: LB, k, t: 0.3 }); }
          }
        }
        S.shots = S.shots.filter((s) => !s.done);
        for (const f of S.fx) f.t -= STEP;
        S.fx = S.fx.filter((f) => f.t > 0);
        if (Math.round(S.t * 60) % 4 === 0) { S.pA.push(S.dA); S.pB.push(S.dB); }
        if (S.pA.length > CYCLE * 15) { S.pA = []; S.pB = []; S.dA = 0; S.dB = 0; }
      },
      draw(g, S, P) {
        const C = g.C, pays = [P.p1, P.p2].filter((k) => k !== "none");
        const col = pays.length ? colour(C, pays[0]) : C.ink3, col2 = pays[1] ? colour(C, pays[1]) : col;
        g.clear();
        for (const y of [LA, LB]) { g.circle(OX, y, 5, C.accent); g.circle(DX, y, 7, C.enemy); }
        g.label("STAB", OX - 4, LA - 10, C.ink3); g.label("RANGED", OX - 4, LB - 10, C.ink3);
        if (S.beam) {
          const x = OX + 180 * Math.min(1, S.beam.age / 0.08);
          g.line(OX, LA - 1, Math.min(x, DX), LA - 1, col, 2); g.line(OX, LA + 1, Math.min(x, DX), LA + 1, col2, 2);
        }
        for (const s of S.shots) { g.circle(s.x, LB, 3, col); g.circle(s.x - 3, LB, 2, col2); }
        for (const f of S.fx) {
          const c = colour(C, f.k), r = 10 + (0.3 - f.t) * 40;
          if (f.k === "sharp") { g.line(f.x - 8, f.y + 8, f.x + 8, f.y - 8, c, 2); g.line(f.x - 4, f.y + 10, f.x + 10, f.y - 4, c, 1); }
          else if (f.k === "impact") for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.line(f.x + Math.cos(a) * 6, f.y + Math.sin(a) * 6, f.x + Math.cos(a) * r, f.y + Math.sin(a) * r, c, 1.5); }
          else g.circle(f.x, f.y, r, c, 1.5);
        }
        g.label("BEAM  hits " + S.hA + "  energy " + S.eA.toFixed(0) + " e", 222, LA + 3, C.ink2);
        g.label("GUN   hits " + S.hB + "  energy " + S.eB.toFixed(0) + " e", 222, LB + 3, C.ink2);
        // plot: damage dealt this window
        const max = Math.max(40, ...S.pA, ...S.pB);
        g.rect(30, 156, 346, 52, C.rule, 1);
        g.plot(30, 156, 346 * Math.min(1, S.pA.length / (CYCLE * 15)), 52, S.pA.map((v) => v / max), C.violet, 1.5);
        g.plot(30, 156, 346 * Math.min(1, S.pB.length / (CYCLE * 15)), 52, S.pB.map((v) => v / max), C.gold, 1.5);
        g.label("BEAM", 34, 166, C.violet); g.label("GUN", 34, 176, C.gold);
        g.label(Math.round(max) + " HP", 372, 166, C.ink3, "right");
      },
      readout(S) { return "damage this window   beam " + S.dA.toFixed(0) + "   gun " + S.dB.toFixed(0); },
    },
  });
})();
