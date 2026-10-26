(function () {
  const TIER = { trash: 0.5, common: 1, rare: 1.5, legendary: 2, celestial: 3 };
  // Slots a movable battery can sit in: three places in sequence 1, one in sequence 2.
  const SLOTS = [{ x: 73, y: 56, seq: 1 }, { x: 157, y: 56, seq: 1 }, { x: 241, y: 56, seq: 1 }, { x: 157, y: 108, seq: 2 }];
  const T1 = [["TRG", 16], ["BRL", 100], ["STK", 184], ["PAY", 268]];
  const T2 = [["HIT", 100], ["STK", 184], ["PAY", 268]];
  function totals(S, P) {
    const s = TIER[P.tier], out = { 1: { C: 0, R: 0 }, 2: { C: 30, R: 10 } };
    for (const b of S.bats) { const q = out[SLOTS[b].seq]; q.C += 60 * s; q.R += 20 * s; }
    return out;
  }

  Wiki.construct({
    id: "sequence-reservoir",
    name: "Sequence reservoir and shot payment",
    family: "weapons",
    origin: "playground",
    status: "built",
    statusNote: "Reservoirs, tiers, atomic admission and shot payment are built in the MWS v2 runtime (F8 bench). Only one Battery subclass exists in code, <code>infinite</code>, and it behaves as an ordinary finite reservoir. Instant, Ammo, Constant and Timer batteries, and what Infinite should really mean, are spec only. Initial charge and tier numbers are provisional.",
    summary: "Every Battery in a sequence pours into one shared tank, wherever it sits; a projectile pays its whole price once, up front, and an unaffordable shot is skipped rather than queued.",
    tags: ["energy", "battery", "economy", "skip"],

    intent:
      "<p>Battery placement should never be a trap. If moving a part around a weapon secretly changed its power, players would learn to distrust the editor. So inside a sequence, position does not matter at all: capacity and refill are sums. What does matter is <em>which</em> sequence a battery belongs to, because each sequence funds its own work and nothing crosses the boundary.</p>" +
      "<p>For projectiles the price is one readable number. Each bullet costs its shot energy when it leaves, and that covers its entire flight and every hit. A fired shot never fizzles mid-air when the tank runs dry.</p>",

    how:
      "<h3>One reservoir per sequence</h3>" +
      "<p>When the graph compiles, every Battery reached while walking a sequence adds to that sequence's totals, scaled by its tier:</p>" +
      "<pre>capacity += capacity_b &times; tierScale\nrate     += fillRate_b &times; tierScale\ninitial  += capacity_b &times; tierScale &times; initialCharge</pre>" +
      "<p><code>tierScale</code> is trash 0.5, common 1, rare 1.5, legendary 2, celestial 3, applied to both capacity and refill. Before, after or beside the Barrel, it makes no difference. Every tick, before anything fires, every reservoir refills: <code>E = min(C, E + R &times; dt)</code>. Only Strikers spend. Event contexts of the same sequence ([[sequences]]) share its one reservoir. Edits and <em>Reset test</em> in the bench set <code>E</code> back to its initial charge (full by default).</p>" +
      "<p>A sequence with no Battery is an error, in the code's words: <em>Sequence 2 requires a Battery</em>.</p>" +
      "<h3>Atomic admission</h3>" +
      "<p><code>Energy.start(seq, requests)</code> sums the start requirement of everything requested together. If <code>E + 1e-8</code> is below that sum, the whole request is skipped: nothing is spent, no strike is created, no Hit or Complete is emitted, and <code>stats.skipped</code> counts it. Otherwise projectile payments are deducted together. Requests are admitted in stable graph and port order within a tick. A Multi before the Striker makes one request of its whole volley ([[multi-ordering]]).</p>" +
      "<h3>Two prices</h3>" +
      "<div class=\"tbl-wrap\"><table><thead><tr><th>Striker</th><th>At start</th><th>While active</th></tr></thead><tbody>" +
      "<tr><td>Ranged, Piercing</td><td><b>Shot energy</b> (<code>startEnergy</code>, default 8) is checked and deducted</td><td>Nothing: travel and every hit are prepaid</td></tr>" +
      "<tr><td>Stab, Sweep, Area, Orbit</td><td><b>Start charge</b> must be stored but is not deducted</td><td>Drains <code>drainRate</code> e/s; see [[sustained-drain]]</td></tr>" +
      "</tbody></table></div>" +
      "<p>Nothing else costs energy: no travel, size, weight, target count or payload charge. Those were deleted in commit <code>55260f5</code> ([[mws-lineage]]).</p>" +
      "<h3>Skip, never queue</h3>" +
      "<p>A hot Trigger with too little stored energy loses that opportunity. If it stays hot, it fires on the first tick refill reaches the threshold, without a new press. If it goes cold, refilling alone fires nothing. Demand above refill therefore shows up as a steady rhythm of skips, which is the battery acting as a fire-rate limiter.</p>" +
      "<h3>The battery charge indicator</h3>" +
      "<p>Each Battery tile fills to its sequence's <code>E / C</code>; every Battery on one rail shows the same pool. Ticks mark each distinct start requirement in the sequence: one shot, one start charge, or a whole volley under a pre-Striker Multi (a post-Striker Multi counts once). A conditional route shows its largest configured volley. A requirement above capacity draws an upward chevron and compiles with the warning <em>Required charge for strike / full volley exceeds sequence capacity</em>; such a strike can never start.</p>" +
      "<h3>Battery subclasses (spec only)</h3>" +
      "<p>The spec keeps five intended battery feels, all still to be fitted into the reservoir model. None is in the palette except Infinite, which in code is just the generic reservoir.</p>" +
      "<div class=\"tbl-wrap\"><table><thead><tr><th>Subclass</th><th>Intended use</th><th>Open detail</th></tr></thead><tbody>" +
      "<tr><td>Instant</td><td>Single-use consumable, for bombs</td><td>Initial charge, fill, when it is consumed</td></tr>" +
      "<tr><td>Infinite</td><td>Infinite ammunition</td><td>Replenishment; does not mean infinite capacity or throughput</td></tr>" +
      "<tr><td>Ammo</td><td>A finite number of discrete shots</td><td>What counts as a shot with several Strikers</td></tr>" +
      "<tr><td>Constant</td><td>Constant e/s, limited by capacity</td><td>Whether there is also a lifetime fuel budget</td></tr>" +
      "<tr><td>Timer</td><td>Power for a fixed, unpausable window after activation</td><td>Whether the window gates refill, discharge or both</td></tr>" +
      "</tbody></table></div>",

    knobs: [
      ["Base capacity", "60 e", "Tank size this battery adds to its sequence", "capacity (0-500)"],
      ["Base refill", "20 e/s", "Refill this battery adds", "fillRate (0-200)"],
      ["Initial charge", "1.0", "Fraction of capacity stored at start and on reset", "initialCharge"],
      ["Tier", "common", "Multiplies capacity and refill by 0.5 / 1 / 1.5 / 2 / 3", "tier, M.tierScale"],
      ["Shot energy", "8 e", "Whole price of one Ranged or Piercing strike", "startEnergy"],
    ],

    related: [
      { id: "sustained-drain", how: "The other price: start charge plus drain per second." },
      { id: "multi-ordering", how: "A volley is one atomic purchase; a split pays once." },
      { id: "sequences", how: "Each sequence owns one reservoir; event contexts share it." },
      { id: "resource-economy", how: "The same refill-and-threshold shape as a player resource." },
    ],

    questions: [
      "What should Instant, Ammo, Constant and Timer batteries do inside the reservoir model, and what does Infinite mean if not the current finite tank?",
      "Discrete or continuous charging? The code refills continuously each tick.",
      "Spending order and fairness when many sequences or contexts contend: today the first in graph order wins within a tick.",
      "Initial charge: batteries start full in the prototype; the spec leaves it open.",
    ],

    sparks: [
      "Make batteries physical pickups that clip into any sequence; the only decision is which reaction they power, never where in the chain they go.",
      "A co-op variant that deliberately breaks the no-transfer rule: squadmates share one rail, so one player's beam starves another's shotgun.",
      "Print the shot energy on every weapon in a shop, and let the player read fire rate as refill divided by price.",
      "Overflow as a resource: refill that arrives when the tank is full spills into a separate meter that powers a special.",
    ],

    terms: [
      { term: "Sequence rail", def: "The one shared energy reservoir of a sequence. Every Battery in it adds, regardless of position or branch; nothing crosses a sequence boundary.", code: "seq.capacity, seq.rate, seq.energy" },
      { term: "Battery tier", def: "Trash, common, rare, legendary or celestial; scales both capacity and fill rate (0.5 / 1 / 1.5 / 2 / 3 in the prototype).", code: "M.tierScale" },
      { term: "Admission", def: "Checking a whole request's start requirement against stored energy, then paying projectiles together or skipping it all.", code: "Energy.start" },
      { term: "Shot energy", def: "One complete payment for a Ranged or Piercing projectile, covering its flight and every hit.", code: "startEnergy" },
      { term: "Battery charge indicator", def: "A Battery tile's fill (E / C of its sequence) plus a tick at each distinct start requirement, with a chevron when one exceeds capacity.", code: "info.startRequirements" },
    ],

    sources: [
      "playground:shared/framework/mws/v2energy.lua",
      "playground:shared/framework/mws/v2graph.lua:152",
      "playground:shared/framework/mws/v2graph.lua:89",
      "playground:shared/framework/mws/v2runtime.lua:265",
      "playground:shared/framework/mws/v2modules.lua:31",
      "playground:docs/Modular_Weapon_System.md",
    ],

    toy: {
      title: "Move a battery; the tank does not care",
      hint: "click a battery chip to move it to the next slot",
      caption: "Batteries are 60 e / 20 e/s each before tier. Sequence 2 (Hit, Area field, start 8, drain 8 e/s) has its own fixed 30 / 10 battery. Moving a chip within sequence 1 changes nothing; moving it into sequence 2 moves its power there. The bench would also refill on every edit.",
      w: 384, h: 216,
      controls: [
        { type: "range", key: "n", label: "batteries", min: 0, max: 4, value: 1, reset: true },
        { type: "select", key: "tier", label: "tier", value: "common", options: Object.keys(TIER).map((k) => [k, k]) },
        { type: "range", key: "cost", label: "shot energy", min: 1, max: 80, value: 8, fmt: "{} e" },
        { type: "range", key: "period", label: "Repeater", min: 2, max: 30, value: 6, fmt: "{} ticks" },
        { type: "toggle", key: "hold", label: "hold fire", value: true },
      ],
      init(S, P) {
        S.bats = []; for (let i = 0; i < P.n; i++) S.bats.push(i % 3);
        const t = totals(S, P); S.E1 = t[1].C; S.E2 = t[2].C;
        S.phase = 0; S.opps = []; S.shots = []; S.fields = []; S.fired = 0; S.skipped = 0; S.hit = 0;
      },
      pointer(e, S) {
        if (e.type !== "down") return;
        const seen = {};
        S.bats.forEach((b, i) => {
          const k = seen[b] = (seen[b] || 0) + 1, x = SLOTS[b].x, y = SLOTS[b].y - (k - 1) * 9;
          if (Math.abs(e.x - x) < 14 && Math.abs(e.y - y) < 5 && !seen.done) { S.bats[i] = (b + 1) % SLOTS.length; seen.done = true; }
        });
      },
      update(S, P, dt) {
        const t = totals(S, P), STEP = 1 / 60;
        S.E1 = Math.min(t[1].C, S.E1 + t[1].R * STEP); S.E2 = Math.min(t[2].C, S.E2 + t[2].R * STEP);
        // Repeater: immediate pulse, then every `period` ticks while held
        let hot = 0;
        if (!P.hold) S.phase = 0; else { hot = S.phase < 1 ? 1 : 0; S.phase = (S.phase + 1) % P.period; }
        if (hot && t[1].C > 0) {
          if (S.E1 + 1e-8 >= P.cost) { S.E1 -= P.cost; S.fired++; S.opps.push(1); S.shots.push({ x: 40 }); }
          else { S.skipped++; S.opps.push(0); }
          if (S.opps.length > 52) S.opps.shift();
        }
        for (const s of S.shots) {
          s.x += 150 * dt;
          if (s.x >= 296 && !s.done) {
            s.done = true; S.hit++;
            if (S.E2 + 1e-8 >= 8) S.fields.push({ age: 0 }); // Hit -> Area: start charge required, not spent
          }
        }
        S.shots = S.shots.filter((s) => !s.done);
        // sustained fields on sequence 2 share one drain
        const alive = S.fields.filter((f) => f.age < 1);
        const demand = 8 * alive.length * dt;
        const frac = demand > 0 ? Math.min(S.E2, demand) / demand : 1;
        S.E2 = Math.max(0, S.E2 - Math.min(S.E2, demand));
        for (const f of alive) { f.age += dt * frac; if (S.E2 <= 1e-8) f.age = 9; }
        S.fields = alive;
      },
      draw(g, S, P) {
        const C = g.C, t = totals(S, P);
        g.clear();
        g.label("SEQUENCE 1", 16, 38, C.ink3); g.label("SEQUENCE 2", 100, 92, C.ink3);
        g.line(16, 56, 290, 56, C.rule, 1); g.line(100, 108, 290, 108, C.rule, 1);
        g.line(200, 60, 200, 100, C.rule, 1, [2, 2]);
        for (const [n, x] of T1) { g.rect(x, 48, 30, 16, C.bg); g.rect(x, 48, 30, 16, C.ink2, 1); g.label(n, x + 15, 59, C.ink, "center"); }
        for (const [n, x] of T2) { g.rect(x, 100, 30, 16, C.bg); g.rect(x, 100, 30, 16, C.ink2, 1); g.label(n, x + 15, 111, C.ink, "center"); }
        g.rect(227, 104, 28, 8, C.violet); g.label("30/10", 241, 126, C.ink3, "center");
        const seen = {};
        for (const b of S.bats) {
          const k = seen[b] = (seen[b] || 0) + 1, x = SLOTS[b].x, y = SLOTS[b].y - (k - 1) * 9;
          g.rect(x - 14, y - 4, 28, 8, C.gold); g.label("BAT", x, y + 3, C.bg, "center");
        }
        if (t[1].C === 0) g.label("SEQUENCE 1 REQUIRES A BATTERY", 16, 80, C.enemy);
        // tanks
        const tank = (x, E, cap, need, label) => {
          g.rect(x, 40, 14, 100, C.ink3, 1);
          const f = cap > 0 ? E / cap : 0;
          g.rect(x + 1, 140 - f * 100, 13, f * 100, label === "1" ? C.gold : C.violet);
          if (cap > 0) {
            const over = need > cap, ny = 140 - Math.min(1, need / cap) * 100;
            g.line(x - 3, ny, x + 17, ny, over ? C.enemy : C.ink, 1);
            if (over) g.poly([[x + 3, 46], [x + 7, 41], [x + 11, 46]], C.enemy, 1, false);
          }
          g.label("E" + label, x + 7, 150, C.ink3, "center");
          g.label(Math.round(cap) + "", x + 7, 160, C.ink3, "center");
        };
        tank(320, S.E1, t[1].C, P.cost, "1"); tank(352, S.E2, t[2].C, 8, "2");
        // lane: bullets already paid keep flying; dummy at the end
        g.line(30, 176, 300, 176, C.rule, 1);
        g.circle(30, 176, 5, C.accent);
        g.circle(302, 176, 6, C.enemy);
        for (const s of S.shots) g.circle(s.x, 176, 2.5, C.gold);
        for (const f of S.fields) g.toneCircle(302, 176, 20, 0.35, C.violet);
        // opportunity strip: filled = fired, red = skipped
        g.label("OPPORTUNITIES", 30, 196, C.ink3);
        S.opps.forEach((o, i) => { const x = 30 + i * 5; if (o) g.rect(x, 200, 4, 8, C.gold); else { g.line(x, 200, x + 4, 208, C.enemy, 1); g.line(x + 4, 200, x, 208, C.enemy, 1); } });
      },
      readout(S, P) {
        const t = totals(S, P);
        return "seq 1  C " + t[1].C + "  R " + t[1].R + " e/s  E " + S.E1.toFixed(1) + "      seq 2  C " + t[2].C + "  E " + S.E2.toFixed(1) +
          "\nfired " + S.fired + "   skipped " + S.skipped + "   demand " + (P.cost * 60 / P.period).toFixed(0) + " e/s";
      },
    },
  });
})();
