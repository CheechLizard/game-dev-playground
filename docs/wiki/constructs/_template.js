/* Copy this file to constructs/<id>.js, add <id> to manifest.js, and fill it in.
 * Not listed in the manifest, so it never renders.
 *
 * Prose fields are HTML. [[other-id]] or [[other-id|label]] links another
 * construct; links to pages that do not exist yet render greyed out, which is
 * a fine way to mark something worth writing.
 *
 * Sources: "playground:<path>[:line]" links into this repo;
 * "shmuprouge:<path>" names a file in ShmupRouge/Love2D.
 */
Wiki.construct({
  id: "example-construct",
  name: "Example construct",
  family: "pressure",              // an id from manifest.js families
  origin: "playground",            // playground | shmuprouge | both
  status: "spec",                  // built | partial | spec | superseded
  statusNote: "",                  // optional: what is and is not built, in a line or two
  summary: "One sentence a designer can repeat from memory.",
  tags: ["timing"],

  intent: "<p>The player-facing problem or feeling it serves.</p>",
  how: "<p>Precise mechanics: rules, ordering, formulas, numbers.</p>",
  knobs: [
    // [name, default, what it changes, code identifier]
    ["Wave length", "15 s", "Time per wave", "run.waveSeconds"],
  ],
  related: [
    { id: "wave-clock", how: "Why the two belong together, in a phrase." },
  ],
  questions: ["Something still undecided."],
  sparks: ["A way to reuse or twist this in a new game."],
  terms: [{ term: "Term", def: "What it means.", code: "code.identifier" }],
  sources: ["playground:docs/glossary.md"],
  shots: [
    // { src: "img/<file>.png", caption: "...", cmd: "luajit tools/screenshot.lua ..." }
  ],

  toy: {
    title: "What the reader is playing with",
    hint: "click to do a thing",
    caption: "One line on what to notice.",
    w: 384, h: 216,
    controls: [{ type: "range", key: "speed", label: "speed", min: 10, max: 200, value: 60 }],
    init(S, P, kit) { S.x = 0; },
    update(S, P, dt) { S.x = (S.x + P.speed * dt) % 384; },
    draw(g, S) { g.clear(); g.circle(S.x, 108, 6, g.C.accent); },
    readout(S) { return "x " + S.x.toFixed(0); },
  },
});
