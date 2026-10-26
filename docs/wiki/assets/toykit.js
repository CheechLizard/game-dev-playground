/* Toykit — the shared harness every construct's interactive illustration runs in.
 *
 * A toy is a plain object on its construct (see constructs/_template.js):
 *
 *   toy: {
 *     title, caption,                  // shown above / below the stage
 *     w: 384, h: 216,                  // logical size; drawing uses these units
 *     controls: [                      // become the bar under the stage
 *       { type: "range",  key, label, min, max, step, value, fmt, reset },
 *       { type: "toggle", key, label, value, reset },
 *       { type: "select", key, label, options: [[value, label]...], value, reset },
 *       { type: "button", label, press(S, P, kit) },
 *     ],
 *     init(S, P, kit),                 // fill the state object S (P = control values)
 *     update(S, P, dt, kit),           // fixed step, dt = 1/60
 *     draw(g, S, P, kit),              // g = drawing helpers below
 *     pointer(e, S, P, kit),           // e = { type: down|move|up, x, y, down }
 *     readout(S, P) -> string,         // overlay text, top-left of the stage
 *     change(key, S, P, kit),          // a control changed (when not `reset`)
 *   }
 *
 * A control with `reset: true` re-runs init when it changes. The simulation is
 * fixed-step so a toy behaves the same on every machine, and it pauses while
 * scrolled out of view.
 */
(function () {
  "use strict";

  const STEP = 1 / 60;
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function readColors() {
    const C = {};
    for (const k of ["bg", "panel", "ink", "ink-2", "ink-3", "rule", "enemy", "accent", "gold", "sky", "violet", "rose", "orange", "teal"]) {
      C[k.replace("-", "")] = cssVar("--" + k);
    }
    C.fg = C.ink; C.dim = C.ink3;
    return C;
  }

  // Seeded generator (mulberry32), so a toy's "random" is the same every load.
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    const r = function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.range = (lo, hi) => lo + (hi - lo) * r();
    r.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * r());
    r.pick = (arr) => arr[Math.floor(r() * arr.length)];
    return r;
  }

  const kitBase = {
    rng,
    clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
    lerp: (a, b, t) => a + (b - a) * t,
    dist: (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay),
    TAU: Math.PI * 2,
  };

  // ---------------------------------------------------------------- drawing

  function makeGraphics(canvas, w, h, scale) {
    const ctx = canvas.getContext("2d");
    const patterns = new Map();
    const g = { ctx, w, h, C: readColors(), scale };

    g.refresh = function () { g.C = readColors(); patterns.clear(); };
    g.begin = function () {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.lineCap = "round"; ctx.lineJoin = "round";
    };
    g.clear = function (color) { ctx.fillStyle = color || g.C.bg; ctx.fillRect(0, 0, w, h); };

    // An ordered-dither fill at `density` 0..1, one dither cell per logical pixel.
    g.tonePattern = function (density, color) {
      const level = Math.round(Math.max(0, Math.min(1, density)) * 16);
      const key = level + "|" + color;
      if (patterns.has(key)) return patterns.get(key);
      const c = document.createElement("canvas"); c.width = 4; c.height = 4;
      const x = c.getContext("2d"); x.fillStyle = color;
      for (let i = 0; i < 16; i++) if (BAYER[i] < level) x.fillRect(i % 4, (i / 4) | 0, 1, 1);
      const p = ctx.createPattern(c, "repeat");
      patterns.set(key, p);
      return p;
    };
    g.tone = function (x, y, ww, hh, density, color) {
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      const p = g.tonePattern(density, color || g.C.ink);
      const cell = Math.max(1, Math.round(scale));
      p.setTransform(new DOMMatrix().scale(cell));
      ctx.fillStyle = p;
      ctx.fillRect(Math.round(x * scale), Math.round(y * scale), Math.round(ww * scale), Math.round(hh * scale));
      ctx.restore();
    };
    g.toneCircle = function (x, y, r, density, color) {
      ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
      g.tone(x - r, y - r, r * 2, r * 2, density, color); ctx.restore();
    };
    g.rect = function (x, y, ww, hh, color, stroke) {
      if (stroke) { ctx.strokeStyle = color; ctx.lineWidth = stroke; ctx.strokeRect(x + 0.5 / scale, y + 0.5 / scale, ww, hh); }
      else { ctx.fillStyle = color; ctx.fillRect(x, y, ww, hh); }
    };
    g.circle = function (x, y, r, color, stroke) {
      ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
      if (stroke) { ctx.strokeStyle = color; ctx.lineWidth = stroke; ctx.stroke(); }
      else { ctx.fillStyle = color; ctx.fill(); }
    };
    g.arc = function (x, y, r, a0, a1, color, width) {
      ctx.beginPath(); ctx.arc(x, y, r, a0, a1); ctx.strokeStyle = color; ctx.lineWidth = width || 1; ctx.stroke();
    };
    g.wedge = function (x, y, r, a0, a1, color) {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, a0, a1); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
    };
    g.line = function (x1, y1, x2, y2, color, width, dash) {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      ctx.strokeStyle = color; ctx.lineWidth = width || 1;
      if (dash) ctx.setLineDash(dash);
      ctx.stroke(); if (dash) ctx.setLineDash([]);
    };
    g.poly = function (pts, color, stroke, close) {
      if (!pts.length) return;
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      if (close !== false && !stroke) ctx.closePath();
      if (close && stroke) ctx.closePath();
      if (stroke) { ctx.strokeStyle = color; ctx.lineWidth = stroke; ctx.stroke(); }
      else { ctx.fillStyle = color; ctx.fill(); }
    };
    g.arrow = function (x1, y1, x2, y2, color, width, head) {
      width = width || 1; head = head || 4 + width;
      const a = Math.atan2(y2 - y1, x2 - x1);
      g.line(x1, y1, x2 - Math.cos(a) * head * 0.6, y2 - Math.sin(a) * head * 0.6, color, width);
      ctx.beginPath(); ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - Math.cos(a - 0.45) * head, y2 - Math.sin(a - 0.45) * head);
      ctx.lineTo(x2 - Math.cos(a + 0.45) * head, y2 - Math.sin(a + 0.45) * head);
      ctx.closePath(); ctx.fillStyle = color; ctx.fill();
    };
    // Text in the playground's pixel face. size snaps to Pixy's 8px design step.
    g.text = function (str, x, y, opt) {
      opt = opt || {};
      const size = opt.size || 8;
      ctx.font = (opt.font === "body" ? size + "px " + cssVar("--font-body") : size + "px Pixy, monospace");
      ctx.fillStyle = opt.color || g.C.ink;
      ctx.textAlign = opt.align || "left";
      ctx.textBaseline = opt.base || "alphabetic";
      ctx.fillText(String(str), x, y);
      return ctx.measureText(String(str)).width;
    };
    g.label = function (str, x, y, color, align) { return g.text(str, x, y, { color: color || g.C.ink2, align: align, size: 8 }); };
    // Horizontal meter: a dithered track with a solid fill.
    g.meter = function (x, y, ww, hh, frac, color, track) {
      g.tone(x, y, ww, hh, track == null ? 0.25 : track, color);
      g.rect(x, y, ww * Math.max(0, Math.min(1, frac)), hh, color);
    };
    // A polyline graph of samples ys (0..1) into a box.
    g.plot = function (x, y, ww, hh, ys, color, width) {
      if (ys.length < 2) return;
      ctx.beginPath();
      for (let i = 0; i < ys.length; i++) {
        const px = x + (i / (ys.length - 1)) * ww, py = y + hh - Math.max(0, Math.min(1, ys[i])) * hh;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.strokeStyle = color; ctx.lineWidth = width || 1; ctx.stroke();
    };
    return g;
  }

  // ---------------------------------------------------------------- mounting

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function defaults(spec) {
    const P = {};
    for (const c of spec.controls || []) if (c.key) P[c.key] = c.value;
    return P;
  }

  function fmtValue(c, v) {
    if (c.fmt) return typeof c.fmt === "function" ? c.fmt(v) : c.fmt.replace("{}", v);
    if (c.type === "toggle") return v ? "on" : "off";
    return String(v);
  }

  function mount(host, spec) {
    const w = spec.w || 384, h = spec.h || 216;
    const box = el("section", "toy");
    const head = el("div", "toy-head");
    head.append(el("b", null, spec.title || "Toy"));
    if (spec.hint) { const h = el("span"); h.innerHTML = spec.hint; head.append(h); }
    const stage = el("div", "toy-stage");
    const canvas = el("canvas");
    const readout = el("div", "toy-readout");
    stage.append(canvas, readout);
    const bar = el("div", "toy-bar");
    box.append(head, stage, bar);
    if (spec.caption) { const cap = el("div", "toy-caption"); cap.innerHTML = spec.caption; box.append(cap); }
    host.append(box);

    const kit = Object.assign({}, kitBase);
    let P = defaults(spec), S = {};
    let g, scale = 1, running = true, visible = false, speed = 1, acc = 0, last = 0, failed = false;

    function fail(err) {
      failed = true;
      stage.innerHTML = "";
      stage.append(el("div", "toy-error", "This toy hit an error:\n" + (err && err.stack || err)));
      console.error(err);
    }

    function size() {
      const cssW = stage.clientWidth || w;
      scale = (cssW / w) * (window.devicePixelRatio || 1);
      canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
      g = makeGraphics(canvas, w, h, scale);
    }
    function reset() {
      S = {}; kit.rand = rng(spec.seed || 7);
      try { spec.init && spec.init(S, P, kit); } catch (e) { fail(e); }
    }
    function step() { try { spec.update && spec.update(S, P, STEP, kit); } catch (e) { fail(e); } }
    function draw() {
      if (failed) return;
      try {
        g.begin(); spec.draw(g, S, P, kit);
        readout.textContent = spec.readout ? spec.readout(S, P) : "";
      } catch (e) { fail(e); }
    }

    // Controls
    for (const c of spec.controls || []) {
      if (c.type === "button") {
        const b = el("button", "btn", c.label);
        b.type = "button";
        b.onclick = () => { try { c.press(S, P, kit); } catch (e) { fail(e); } if (!running) draw(); };
        bar.append(b); continue;
      }
      const wrap = el("label", "toy-ctl");
      wrap.append(el("span", null, c.label));
      let input;
      const out = el("output");
      if (c.type === "range") {
        input = el("input"); input.type = "range";
        input.min = c.min; input.max = c.max; input.step = c.step || 1; input.value = c.value;
        input.oninput = () => commit(Number(input.value));
      } else if (c.type === "toggle") {
        input = el("input"); input.type = "checkbox"; input.checked = !!c.value;
        input.onchange = () => commit(input.checked);
      } else if (c.type === "select") {
        input = el("select");
        for (const [v, l] of c.options) { const o = el("option", null, l); o.value = v; input.append(o); }
        input.value = c.value;
        input.onchange = () => commit(input.value);
      }
      function commit(v) {
        P[c.key] = v; out.textContent = c.type === "select" ? "" : fmtValue(c, v);
        if (c.reset) reset(); else if (spec.change) { try { spec.change(c.key, S, P, kit); } catch (e) { fail(e); } }
        if (!running) draw();
      }
      out.textContent = c.type === "select" ? "" : fmtValue(c, c.value);
      wrap.append(input); if (c.type !== "select") wrap.append(out);
      bar.append(wrap);
    }

    // Transport
    const tr = el("div", "toy-transport");
    const bPlay = el("button", "btn", "pause"); bPlay.type = "button";
    const bStep = el("button", "btn", "step"); bStep.type = "button";
    const bSpeed = el("button", "btn", "1x"); bSpeed.type = "button";
    const bReset = el("button", "btn", "reset"); bReset.type = "button";
    bPlay.onclick = () => { running = !running; bPlay.textContent = running ? "pause" : "play"; };
    bStep.onclick = () => { running = false; bPlay.textContent = "play"; step(); draw(); };
    bSpeed.onclick = () => { speed = speed === 1 ? 4 : speed === 4 ? 0.25 : 1; bSpeed.textContent = speed === 0.25 ? "¼x" : speed + "x"; };
    bReset.onclick = () => { reset(); draw(); };
    if (spec.static) tr.append(bReset); else tr.append(bPlay, bStep, bSpeed, bReset);
    bar.append(tr);

    // Pointer, in logical coordinates
    function pt(ev, type) {
      const r = canvas.getBoundingClientRect();
      return { type, x: (ev.clientX - r.left) / r.width * w, y: (ev.clientY - r.top) / r.height * h, down: ev.buttons > 0 || type === "down", shift: ev.shiftKey };
    }
    if (spec.pointer) {
      canvas.addEventListener("pointerdown", (ev) => { canvas.setPointerCapture(ev.pointerId); spec.pointer(pt(ev, "down"), S, P, kit); if (!running) draw(); });
      canvas.addEventListener("pointermove", (ev) => { spec.pointer(pt(ev, "move"), S, P, kit); if (!running) draw(); });
      canvas.addEventListener("pointerup", (ev) => { spec.pointer(pt(ev, "up"), S, P, kit); if (!running) draw(); });
    } else canvas.style.cursor = "default";

    function frame(t) {
      requestAnimationFrame(frame);
      if (failed || !visible || document.hidden) { last = t; return; }
      const dt = Math.min(0.1, (t - last) / 1000 || 0); last = t;
      if (running && !spec.static) {
        acc += dt * speed;
        let n = 0;
        while (acc >= STEP && n < 20) { step(); acc -= STEP; n++; }
        if (n === 20) acc = 0;
      }
      draw();
    }

    size(); reset(); draw();
    new ResizeObserver(() => { size(); draw(); }).observe(stage);
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; }).observe(stage);
    document.addEventListener("wiki:theme", () => { g.refresh(); draw(); });
    requestAnimationFrame(frame);
    return { box, reset };
  }

  // A still frame of a toy for the index: init, run `steps` fixed steps, draw once.
  function thumbnail(canvas, spec, steps) {
    const w = spec.w || 384, h = spec.h || 216;
    const scale = (canvas.clientWidth || 192) / w * (window.devicePixelRatio || 1);
    canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
    const g = makeGraphics(canvas, w, h, scale);
    const kit = Object.assign({ rand: rng(spec.seed || 7) }, kitBase);
    const P = defaults(spec), S = {};
    try {
      spec.init && spec.init(S, P, kit);
      const n = steps == null ? (spec.thumbSteps == null ? 150 : spec.thumbSteps) : steps;
      for (let i = 0; i < n; i++) spec.update && spec.update(S, P, STEP, kit);
      g.begin(); spec.draw(g, S, P, kit);
    } catch (e) { console.warn("thumbnail failed", e); }
  }

  window.Toy = { mount, thumbnail, rng, graphics: makeGraphics, kit: kitBase };
})();
