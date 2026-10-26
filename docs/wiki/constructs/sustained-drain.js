(function () {
  const STEP = 1 / 60, OX = 44, OY = 84, RANGE = 180, EXTEND = 0.08, DUR = 12;
  // Lanes per mode: angle offset and share. "two" is Multi x2 before the Stab (a volley of
  // two full beams); "split" is Stab -> Multi x2 (one beam, two half-share children).
  const MODES = {
    one: { lanes: [[0, 1]], groups: 1 },
    two: { lanes: [[-0.2, 1], [0.2, 1]], groups: 2 },
    split: { lanes: [[-0.2, 0.5], [0.2, 0.5]], groups: 1 },
  };

  Wiki.construct({
    id: "sustained-drain",
    name: "Sustained drain and sputter",
    family: "weapons",
    origin: "playground",
    status: "built",
    statusNote: "Built in the MWS v2 runtime (commits <code>3709383</code> and <code>55260f5</code>) and playable through the <em>Beam exhaustion</em> bench preset. Hit counting for beams and fields, and Striker concurrency and release rules, are still open in the spec; the code's choices are described below.",
    summary: "A beam, sweep, field or orbit needs its start charge in the tank to ignite but spends nothing to start; it then drains per second until the tank hits zero, and a still-held trigger relights it once refill reaches the start charge again.",
    tags: ["energy", "beam", "sustained", "rhythm"],

    intent:
      "<p>A beam on a battery it cannot sustain should sputter: burn, die, relight, burn. The rhythm is information. A better battery visibly lengthens the bursts and shortens the gaps, so the player can read the weapon's economy off the screen without a number.</p>" +
      "<p>Separating the threshold to start from the cost of running also avoids a mean edge case: a beam that has just qualified never vanishes because ignition took its last few units. Setting drain to zero gives a sustained strike that is free once it qualifies.</p>",

    how:
      "<h3>Start charge is a threshold</h3>" +
      "<p>For Stab, Sweep, Area and Orbit, <code>startEnergy</code> is labelled <b>Start charge</b>. <code>Energy.start</code> counts it toward the required total but does not deduct it. The strike stays alive below that level; only a new strike has to reach it again. In a volley the required total is the sum of every start charge (and shot energy) in it.</p>" +
      "<h3>Drain each tick</h3>" +
      "<p>After triggers are walked, the runtime gathers every live sustained group on a sequence. For each it takes the tick window <code>dt_g = min(1/60, remaining duration)</code> and adds <code>drainRate &times; (sum of alive child shares) &times; dt_g</code> to that sequence's demand. Then <code>Energy.drain</code> spends <code>min(E, demand)</code> and returns the fraction funded. Every sustained group on the sequence then advances <code>dt_g &times; fraction</code>, so when the tank cannot cover the tick, all of them get the same fraction of time and damage. Order cannot let one beam take another's last energy. The final duration tick pays only for the time actually left.</p>" +
      "<h3>Ending and restarting</h3>" +
      "<p>When the reservoir reaches zero (<code>E &le; 1e-8</code>) with a non-zero drain, every sustained group on it completes with reason <code>energy</code>. It is a real Complete event with that strike's hit count ([[sequences]]). If the trigger is still hot, a <em>new</em> strike starts on the first tick stored energy reaches the start charge: fresh lifetime, fresh hit count, and a beam that re-extends from its origin over <code>extendTime</code>. Other ends: <code>duration</code>, and <code>release</code> when <code>releaseEnds</code> is on and the route had no hot tick this tick.</p>" +
      "<h3>How long a burst lasts</h3>" +
      "<p>With stored charge <code>E0</code>, total active drain <code>D</code> and refill <code>R &lt; D</code>, a burst lasts about <code>E0 / (D &minus; R)</code>. If <code>D &le; R</code> energy alone never ends it. The spec's example: start 5, stored 5, drain 10, no refill, 0.5 s.</p>" +
      "<div class=\"tbl-wrap\"><table><thead><tr><th>Beam exhaustion preset</th><th>Value</th></tr></thead><tbody>" +
      "<tr><td>Chain</td><td>Toggle &rarr; Battery 40 e / 10 e/s &rarr; Seeking &rarr; Stab (start 5, drain 35, range 180, radius 2, 12 s) &rarr; Plasma 30 DPS</td></tr>" +
      "<tr><td>First burst, from full</td><td>40 / (35 &minus; 10) = 1.6 s</td></tr>" +
      "<tr><td>Gap</td><td>0 &rarr; 5 at 10 e/s = 0.5 s</td></tr>" +
      "<tr><td>Later bursts</td><td>5 / 25 = 0.2 s</td></tr>" +
      "</tbody></table></div>" +
      "<h3>Sharing between sustained strikes</h3>" +
      "<p>Two beams from a Multi <em>before</em> the Stab are two full strikes: they need 2 &times; start charge together and drain 2 &times; the rate, so bursts are shorter. A Multi <em>after</em> the Stab splits one beam: one start charge, one drain (the two half shares add to 1), half the damage per child ([[multi-ordering]]).</p>" +
      "<h3>The releaseEnds gotcha</h3>" +
      "<p><code>releaseEnds</code> defaults to on. In an event sequence the root Trigger is hot only on the context's first tick, so an Area or Stab started there would end with reason <code>release</code> one tick later. The bench's field presets set it off; see [[sequences]].</p>",

    knobs: [
      ["Start charge", "8 e (preset 5)", "Stored energy needed to ignite; not deducted", "startEnergy"],
      ["Energy per second", "4 e/s (preset 35)", "Drain while active, times the strike's share", "drainRate (0-200)"],
      ["Max duration", "3 s (preset 12)", "Ends the strike with reason duration", "duration"],
      ["Release ends strike", "on", "End when the route goes cold", "releaseEnds"],
      ["Extend time", "0.08 s", "Beam growth after every start, restarts included", "extendTime"],
      ["Battery", "60 e, 20 e/s (preset 40, 10)", "Burst length and gap", "capacity, fillRate"],
    ],

    related: [
      { id: "sequence-reservoir", how: "Supplies the tank, the refill, and the projectile's other kind of price." },
      { id: "strikers", how: "Stab, Sweep, Area and Orbit are the sustained shapes." },
      { id: "multi-ordering", how: "Volley doubles the drain; split shares one drain." },
      { id: "targeting-turn", how: "A live beam swings to follow its aim while it drains." },
    ],

    questions: [
      "How should a beam or field count hits: contacts, distinct targets, or damage ticks? The code counts distinct targets per collider.",
      "Striker cadence and concurrency beyond one sustained strike per route, and the release and cancellation rules, are open spec work.",
      "Is equal-fraction sharing the right fairness rule once several sequences or contexts drain the same tank?",
    ],

    sparks: [
      "A flamethrower whose sputter rhythm is the skill read: veterans feather the trigger to keep bursts long instead of letting it exhaust.",
      "Two beams on one rail as a deliberate trade: the player chooses between one beam that holds and two that stutter.",
      "Swap the tank for heat: drain fills an overheat bar instead, and exhaustion becomes a forced cooldown with the same arithmetic.",
      "A boss whose shield is a sustained strike on a visible tank; damaging its battery shortens the shield's bursts.",
    ],

    terms: [
      { term: "Start charge", def: "Minimum stored energy to begin a Stab, Sweep, Area or Orbit strike. Starting does not deduct it.", code: "startEnergy" },
      { term: "Energy per second", def: "The drain a sustained strike pays while active, scaled by its share.", code: "drainRate" },
      { term: "Exhaustion", def: "A sustained strike ending because its sequence reached zero charge; completes with reason energy. A restart is a new strike.", code: "finishGroup(group, \"energy\")" },
      { term: "Release ends strike", def: "Ends a sustained strike when its route has no hot tick; on by default.", code: "releaseEnds" },
    ],

    sources: [
      "playground:shared/framework/mws/v2energy.lua:27",
      "playground:shared/framework/mws/v2runtime.lua:495",
      "playground:shared/framework/mws/v2runtime.lua:484",
      "playground:games/horde-survivor/weaponprototypes.lua:30",
      "playground:docs/Modular_Weapon_System.md",
    ],

    toy: {
      title: "A beam on a battery it cannot sustain",
      hint: "change the battery, then add a second beam",
      caption: "Beam exhaustion preset numbers. Seeking and damage are left out: the beam points at one dummy. The plot is stored energy over the last 6 s; the dashed line is the start requirement.",
      w: 384, h: 216,
      controls: [
        { type: "range", key: "C", label: "capacity", min: 5, max: 200, value: 40, fmt: "{} e", reset: true },
        { type: "range", key: "R", label: "refill", min: 0, max: 80, value: 10, fmt: "{} e/s" },
        { type: "range", key: "start", label: "start charge", min: 1, max: 60, value: 5, fmt: "{} e" },
        { type: "range", key: "drain", label: "drain", min: 0, max: 100, value: 35, fmt: "{} e/s" },
        { type: "select", key: "mode", label: "beams", value: "one", options: [["one", "one Stab"], ["two", "Multi ×2 → Stab (volley)"], ["split", "Stab → Multi ×2 (split)"]], reset: true },
        { type: "toggle", key: "hot", label: "Toggle on", value: true },
      ],
      init(S, P) {
        S.E = P.C; S.groups = []; S.plot = []; S.k = 0; S.log = []; S.burst = 0; S.t = 0;
      },
      update(S, P) {
        const M = MODES[P.mode];
        S.t += STEP;
        S.E = Math.min(P.C, S.E + P.R * STEP);
        // walk: a hot route with no live strike requests one (a volley asks for all lanes at once)
        if (P.hot && !S.groups.length) {
          const need = P.start * M.groups;
          if (S.E + 1e-8 >= need) for (let i = 0; i < M.groups; i++) S.groups.push({ age: 0, share: 1 });
        }
        if (!P.hot && S.groups.length) { S.log.unshift("COMPLETE  RELEASE  " + S.groups[0].age.toFixed(2) + "S"); S.groups = []; }
        // drain: one demand for the sequence, one shared fraction
        let demand = 0;
        for (const g of S.groups) { g.dt = Math.min(STEP, Math.max(0, DUR - g.age)); demand += P.drain * g.share * g.dt; }
        let frac = 1;
        if (demand > 0) { const spent = Math.min(S.E, demand); S.E = Math.max(0, S.E - spent); frac = spent / demand; }
        for (const g of S.groups) g.age += g.dt * (P.drain > 0 ? frac : 1);
        if (S.groups.length) {
          const g = S.groups[0];
          let why = null;
          if (P.drain > 0 && S.E <= 1e-8) why = "ENERGY"; else if (g.age + 1e-8 >= DUR) why = "DURATION";
          if (why) { S.log.unshift("COMPLETE  " + why + "  " + g.age.toFixed(2) + "S"); S.groups = []; }
        }
        if (S.log.length > 5) S.log.length = 5;
        if (++S.k % 2 === 0) { S.plot.push(S.E / P.C); if (S.plot.length > 180) S.plot.shift(); }
      },
      draw(g, S, P) {
        const C = g.C, M = MODES[P.mode], need = P.start * M.groups;
        g.clear();
        // tank with the start-requirement tick
        g.rect(10, 36, 14, 100, C.ink3, 1);
        const f = S.E / P.C;
        g.rect(11, 136 - f * 100, 13, f * 100, C.violet);
        const ny = 136 - Math.min(1, need / P.C) * 100;
        g.line(7, ny, 27, ny, need > P.C ? C.enemy : C.ink, 1);
        g.label("E", 17, 146, C.ink3, "center");
        // beams
        g.circle(OX, OY, 6, C.accent);
        g.circle(OX + 150, OY, 7, C.enemy);
        if (S.groups.length) {
          const age = S.groups[0].age, reach = RANGE * Math.min(1, age / EXTEND);
          for (const [a, share] of M.lanes) {
            const x = OX + Math.cos(a) * reach, y = OY + Math.sin(a) * reach;
            g.ctx.globalAlpha = Math.sqrt(share);
            g.line(OX, OY, x, y, C.violet, 3); g.line(OX, OY, x, y, C.ink, 1);
            g.ctx.globalAlpha = 1;
          }
        }
        S.log.forEach((l, i) => g.label(l, 250, 50 + i * 12, i ? C.ink3 : C.ink));
        // plot of E over time
        g.rect(40, 152, 336, 56, C.rule, 1);
        g.line(40, 208 - Math.min(1, need / P.C) * 56, 376, 208 - Math.min(1, need / P.C) * 56, C.ink3, 1, [3, 3]);
        g.plot(40, 152, 336, 56, S.plot.length > 1 ? S.plot : [f, f], C.violet, 1.5);
        g.label("6 S", 372, 148, C.ink3, "right");
      },
      readout(S, P) {
        const M = MODES[P.mode], D = P.drain * (P.mode === "two" ? 2 : 1), need = P.start * M.groups;
        const est = (e) => (D > P.R ? (e / (D - P.R)).toFixed(2) + " s" : "sustained");
        return "drain " + D + " e/s  refill " + P.R + " e/s   start needs " + need + " e" +
          "\nburst from full " + est(P.C) + "   from start " + est(need) + "   gap " + (P.R > 0 ? (need / P.R).toFixed(2) + " s" : "never");
      },
    },
  });
})();
