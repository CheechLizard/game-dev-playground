(function () {
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const TONE = [["inert", 0.12], ["raised", 0.25], ["hover", 0.5], ["heavy", 0.75]];
  const Z = 0.5;                                   // stage px per screen px in the mock
  const MY = 92;                                   // mock top

  // ui.halftone: level = round(d*16), pixel on iff BAYER[i] < level. `ax, ay`
  // is the pattern's anchor: 0,0 is the screen; the rect's corner is the bug.
  function dither(g, x, y, w, h, d, cell, color, ax, ay) {
    const level = Math.round(Math.max(0, Math.min(1, d)) * 16);
    if (level <= 0) return;
    const ctx = g.ctx; ctx.fillStyle = color;
    for (let cy = Math.floor((y - ay) / cell); (cy * cell + ay) < y + h; cy++) {
      for (let cx = Math.floor((x - ax) / cell); (cx * cell + ax) < x + w; cx++) {
        const i = ((cy % 4) + 4) % 4 * 4 + ((cx % 4) + 4) % 4;
        if (BAYER[i] >= level) continue;
        const px = Math.max(x, cx * cell + ax), py = Math.max(y, cy * cell + ay);
        const pw = Math.min(x + w, cx * cell + ax + cell) - px, ph = Math.min(y + h, cy * cell + ay + cell) - py;
        if (pw > 0 && ph > 0) ctx.fillRect(px, py, pw, ph);
      }
    }
  }

  Wiki.construct({
    id: "ui-design-language",
    name: "One bit plus an accent: the UI design language",
    origin: "playground",
    status: "built",
    statusNote: "Built for the editor, placards and the bench. The HUD, shop and zoo status bar still use the game palette and alpha greys rather than the UI theme.",
    summary: "The tooling UI uses three colours (ground, foreground, accent), makes every in-between tone an ordered dither of the foreground, and spaces everything in multiples of a 4 px unit that scales with text size.",
    tags: ["ui", "dither", "spacing", "typography", "pixel art"],

    intent:
      "<p>Designers spend hours in the editor, so it has to stay legible as it grows new states without turning into a second palette to maintain. The editor once had \"thirteen hardcoded colours\", which commit <code>0762d1f</code> calls \"a second list of tunables, which is the one thing the schema rule forbids\". The fix was to have none: three colour settings, and tone carried by dither density.</p>" +
      "<p>One spacing unit makes every surface share a rhythm, and scaling the unit with text size keeps that rhythm at 2&times; and 3&times; instead of letting text grow inside fixed gaps.</p>",

    how:
      "<h3>Colours</h3>" +
      "<p>Three schema settings on the UI page: <code>ui.background</code> (0, 0, 0), <code>ui.foreground</code> (1, 1, 1), <code>ui.accent</code> (0.361, 0.831, 0.639). <code>ui.theme</code> is a cache rebuilt from them each frame. \"No greys: de-emphasis comes from layout and density, never from colour\": the theme's <code>dim</code> is the foreground itself. Selection is a solid accent row with dark text; hover is a light halftone plus an outline. A disabled cell is screen-doored with a 0.5 halftone of the <em>background</em> instead of greying its text.</p>" +
      "<h3>Halftone tones</h3>" +
      "<p><code>ui.halftone(x, y, w, h, density)</code> sets level = <code>round(density &times; 16)</code> and lights a pixel when the 4&times;4 Bayer entry under it is below the level:</p>" +
      "<pre>0  8  2 10\n12  4 14  6\n3 11  1  9\n15  7 13  5</pre>" +
      "<div class=\"tbl-wrap\"><table><thead><tr><th>Tone</th><th>Density</th><th>Pixels lit of 16</th><th>Used for</th></tr></thead><tbody>" +
      "<tr><td><code>inert</code></td><td>0.12</td><td>2</td><td>Hovered toggle rows, slider wells</td></tr>" +
      "<tr><td><code>raised</code></td><td>0.25</td><td>4</td><td>Hovered buttons and dropdowns (with an outline), toggle tracks</td></tr>" +
      "<tr><td><code>hover</code></td><td>0.5</td><td>8</td><td>Defined; no widget reads it yet</td></tr>" +
      "<tr><td><code>heavy</code></td><td>0.75</td><td>12</td><td>Defined; no widget reads it yet</td></tr>" +
      "</tbody></table></div>" +
      "<p>The pattern is anchored to the <em>screen</em>, not the rect (<code>quad:setViewport((x/s)%4, (y/s)%4, ...)</code>), so two fills of one density that meet read as one surface with no seam. The cell scales with the unit, or the weave dissolves into noise at 2&times; and 3&times;. The code comment says nothing dithers behind a label, because glyphs and halftone are the same white; in practice a hovered button keeps its <code>raised</code> fill under the caption. Corners are square: \"rounding does not survive a one-bit dither\".</p>" +
      "<h3>The 4 px unit</h3>" +
      "<p><code>ui.unit = ui.BASE_UNIT (4) &times; ui.fontScale</code>. Every offset is a multiple: row gap 1u, pad 2u, gap 2u, section gap 4u, line height 4u, row height 5u (4, 8, 8, 16, 16, 20 px at 1&times;). \"Nothing here uses a raw pixel.\" <code>ui.fontScale</code> is an int 1-3, so pixel glyphs are never resampled.</p>" +
      "<h3>Font roles</h3>" +
      "<p>Code asks for a role, not a size: <code>title</code> 32, <code>heading</code> 24, <code>body</code> 16, <code>small</code> 16 (raised from 8, which read as \"squinting material\"), all times <code>ui.fontScale</code>. Titles and headings use the display family (Press Start 2P by default), the rest the text family (Pixy). <code>fonts.get</code> snaps every size to a multiple of the family's design size, 8 px, with nearest filtering.</p>" +
      "<h3>Two conventions that go with it</h3>" +
      "<ul><li><b>No help text on the play surface</b>: \"reading the same sentence every run forever\". Keys live in the README; the editor keeps its own legend; placards hide help.</li>" +
      "<li><b>No image files</b>: all art, including weapon and passive icons, is drawn from primitives, so everything stays palette-driven and capturable.</li></ul>",

    knobs: [
      ["Background / foreground / accent", "black / white / (0.36, 0.83, 0.64)", "The only three UI colours", "ui.background, ui.foreground, ui.accent"],
      ["Text size", "1x (1-3)", "Scales fonts and the spacing unit together", "ui.fontScale"],
      ["Tones", ".12 / .25 / .5 / .75", "Dither densities for inert, raised, hover, heavy", "ui.tone"],
      ["Base unit", "4 px", "Every UI offset is a multiple", "ui.BASE_UNIT"],
      ["Heading / body font", "arcade / pixel", "Display and text families", "ui.displayFont, ui.textFont"],
    ],

    related: [
      { id: "schema-editor", how: "Theme colours and text size are schema settings; the editor is the main surface this styles." },
      { id: "inspection-levels", how: "Placards draw with the same widgets and no help text." },
      { id: "reproducible-capture", how: "Spacing and scale bugs are the kind only a capture can see." },
      { id: "hit-feedback", how: "The play surface follows the same no-text rule with a different palette." },
    ],

    questions: [
      "Should the HUD and shop move onto the three-colour theme, or is a separate game palette the right split between tool and game?",
      "Is a fourth tone needed between hover and heavy, or does density plus outline cover every state?",
    ],

    sparks: [
      "Dither as an in-world material: fog of war and shadow as density, in the same Bayer pattern as the UI.",
      "Player-chosen palettes for free: three settings re-theme the whole interface, including for colour-blind play.",
      "An accessibility mode where density is the only state channel, so every state survives a monochrome display.",
      "A strategy game whose map overlays are dithered tones of one ink, stacked without colour collisions.",
    ],

    terms: [
      { term: "Halftone", def: "Ordered 4×4 Bayer dither of the foreground standing in for a grey.", code: "ui.halftone" },
      { term: "Tone", def: "A named dither density.", code: "ui.tone" },
      { term: "Unit", def: "The 4 px spacing step, times text size.", code: "ui.unit, ui.BASE_UNIT" },
      { term: "Font role", def: "A size and family chosen by purpose, snapped to the design size.", code: "fonts.role, fonts.sizeOf" },
    ],

    sources: [
      "playground:shared/framework/ui.lua:15",
      "playground:shared/framework/ui.lua:62",
      "playground:shared/framework/ui.lua:71",
      "playground:shared/framework/ui.lua:186",
      "playground:shared/framework/fonts.lua:61",
      "playground:games/horde-survivor/hud.lua:6",
      "playground:CLAUDE.md",
    ],

    toy: {
      title: "Tone ramp and unit rhythm",
      hint: "switch the scale; hover and click the rows",
      caption: "Top: the four tones with the exact Bayer rule, and two touching fills, anchored to the screen or to each rect. Bottom: an editor panel laid out only in units, drawn at half size so 3x fits. Simplified: the toy's pixel font stands in for Pixy.",
      w: 384, h: 216, static: true,
      controls: [
        { type: "select", key: "scale", label: "ui.fontScale", value: "1", options: [["1", "1x"], ["2", "2x"], ["3", "3x"]] },
        { type: "toggle", key: "grid", label: "unit grid", value: false },
        { type: "toggle", key: "rect", label: "anchor to rect", value: false },
      ],
      init(S) { S.hover = -1; S.sel = 0; S.vals = [15, false, 1]; },
      pointer(e, S, P) {
        const s = Number(P.scale), u = 4 * s * Z, x0 = 4, y0 = MY + 2 * u;
        const i = Math.floor((e.y - y0) / (5 * u));
        S.hover = e.x > x0 && e.x < x0 + 60 * u && i >= 0 && i < 3 ? i : -1;
        if (e.type === "down" && S.hover >= 0) S.sel = S.hover;
      },
      draw(g, S, P) {
        const C = g.C, s = Number(P.scale), u = 4 * s * Z, cell = s * Z;
        g.clear();
        // ramp
        TONE.forEach(([name, d], i) => {
          const x = 140 + i * 46;
          dither(g, x, 12, 40, 30, d, 1, C.ink, 0, 0);
          g.rect(x, 12, 40, 30, C.rule, 1);
          g.label(name.toUpperCase(), x, 52, C.ink2);
          g.label(Math.round(d * 16) + "/16", x, 62, C.ink3);
        });
        // seam demo: two touching fills at 0.5
        g.label(P.rect ? "RECT-ANCHORED" : "SCREEN-ANCHORED", 4, 52, P.rect ? C.enemy : C.accent);
        dither(g, 4, 58, 45, 22, 0.5, 1, C.ink, P.rect ? 4 : 0, P.rect ? 58 : 0);
        dither(g, 49, 58, 45, 22, 0.5, 1, C.ink, P.rect ? 50 : 0, P.rect ? 60 : 0);
        g.line(4, 84, 94, 84, C.rule);
        // mock editor panel, every offset in units
        const x0 = 4, W = 60 * u, top = MY;
        if (P.grid) {
          for (let x = x0; x <= x0 + W + 0.1; x += u) g.line(x, top, x, 214, C.rule, 0.4);
          for (let y = top; y <= 214; y += u) g.line(x0, y, x0 + W, y, C.rule, 0.4);
        }
        g.rect(x0, top, W, 2 * u + 3 * 5 * u + 2 * u, C.ink, 1);
        const rows = [["Wave length", "slider"], ["Stop spawning", "toggle"], ["Text size", "stepper"]];
        rows.forEach(([label, kind], i) => {
          const y = top + 2 * u + i * 5 * u, sel = i === S.sel, hov = i === S.hover && !sel;
          if (sel) g.rect(x0 + 1, y, W - 2, 5 * u, C.accent);
          else if (hov) { dither(g, x0 + 1, y, W - 2, 5 * u, 0.25, cell, C.ink, 0, 0); g.rect(x0 + 1, y, W - 2, 5 * u, C.ink, 1); }
          const tc = sel ? C.bg : C.ink, ty = y + 3.5 * u;
          g.text(label, x0 + 2 * u, ty, { size: 8 * s, color: tc });
          const wx = x0 + 32 * u, ww = 16 * u;
          if (kind === "slider") {
            if (!sel) dither(g, wx, y + 1.5 * u, ww, 2 * u, 0.25, cell, C.ink, 0, 0);
            g.rect(wx, y + 1.5 * u, ww * 0.25, 2 * u, sel ? C.bg : C.accent);
            g.text("15 s", wx + ww + 2 * u, ty, { size: 8 * s, color: tc });
          } else if (kind === "toggle") g.rect(wx, y + 1 * u, 3 * u, 3 * u, tc, 1);
          else g.text("-  " + s + "x  +", wx, ty, { size: 8 * s, color: tc });
        });
      },
      readout(S, P) {
        const s = Number(P.scale);
        return "unit " + 4 * s + " px  row " + 20 * s + "  pad " + 8 * s + "\nbody " + 16 * s + " px  title " + 32 * s + " px";
      },
    },
  });
})();
