/* Construct Atlas — registry, loader and page renderers.
 *
 * Every construct is one file in constructs/, which calls Wiki.construct({...}).
 * constructs/manifest.js lists the families and the construct ids in reading
 * order. Nothing else holds construct data: the index, the sidebar, search,
 * backlinks and the glossary are all derived from those files, so adding a
 * construct is adding one file and one line in the manifest.
 *
 * Pages are plain HTML that load this script and call one renderer:
 *   Wiki.page("index" | "construct" | "glossary" | "workbench" | "about")
 * Scripts are loaded with <script> tags rather than fetch, so the wiki works
 * straight from the filesystem as well as from any static host.
 */
(function () {
  "use strict";

  const BASE = (function () {
    const s = document.currentScript && document.currentScript.src;
    return s ? s.replace(/assets\/wiki\.js.*$/, "") : "";
  })();

  const W = {
    families: [],
    order: [],
    byId: {},
    list: [],
  };

  // ------------------------------------------------------------ registry

  W.manifest = function (m) { W.families = m.families; W.order = m.constructs; };
  W.construct = function (c) {
    if (!c.id) throw new Error("construct without id");
    W.byId[c.id] = c;
  };
  W.family = (id) => W.families.find((f) => f.id === id) || { id, name: id, color: "--ink-3" };

  function loadScript(src) {
    return new Promise((ok) => {
      const s = document.createElement("script");
      s.src = src; s.onload = ok;
      s.onerror = () => { console.error("could not load " + src); ok(); };
      document.head.append(s);
    });
  }

  async function loadAll() {
    await loadScript(BASE + "constructs/manifest.js");
    await Promise.all(W.order.map((id) => loadScript(BASE + "constructs/" + id + ".js")));
    W.list = W.order.map((id) => W.byId[id]).filter(Boolean);
    const missing = W.order.filter((id) => !W.byId[id]);
    if (missing.length) console.warn("manifest names constructs with no file:", missing);
    buildBacklinks();
  }

  // -------------------------------------------------------------- helpers

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const href = (id) => "construct.html?c=" + encodeURIComponent(id);
  W.href = href;

  // [[id]] and [[id|label]] become links to that construct.
  function links(html) {
    return String(html || "").replace(/\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]/g, (m, id, label) => {
      const c = W.byId[id];
      if (!c) return '<span class="muted" title="no page yet">' + esc(label || id) + "</span>";
      return '<a href="' + href(id) + '" title="' + esc(c.summary) + '">' + (label || esc(c.name)) + "</a>";
    });
  }
  W.links = links;
  // Authored HTML reduced to inline text (no nested links), for cards and link tiles.
  function plain(html) {
    return String(html || "").replace(/\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]/g, (m, id, label) => label || (W.byId[id] ? W.byId[id].name : id))
      .replace(/<\/?a\b[^>]*>/g, "");
  }

  const STATUS = {
    built: ["built", "Built"],
    partial: ["partial", "Partly built"],
    spec: ["spec", "Spec only"],
    superseded: ["superseded", "Superseded"],
  };
  const ORIGIN = { playground: "game-dev-playground", shmuprouge: "ShmupRouge", both: "Both repos" };

  function statusChip(c) {
    const s = STATUS[c.status] || ["spec", c.status || "?"];
    return '<span class="chip ' + s[0] + '"><i></i>' + esc(s[1]) + "</span>";
  }
  function originChip(c) { return '<span class="chip origin">' + esc(ORIGIN[c.origin] || c.origin) + "</span>"; }
  function famColor(fid) { return "var(" + W.family(fid).color + ")"; }

  function sourceLink(src) {
    // "playground:path" links into this repo; "shmuprouge:path" names the sibling repo.
    const m = /^(playground|shmuprouge):(.+)$/.exec(src);
    if (!m) return "<code>" + esc(src) + "</code>";
    const [, repo, path] = m;
    if (repo === "playground") {
      const file = path.replace(/:\d+(-\d+)?$/, "");
      return '<a href="' + BASE + "../../" + esc(file) + '"><code>' + esc(path) + "</code></a>";
    }
    return "<code>ShmupRouge/Love2D/" + esc(path) + "</code>";
  }

  function buildBacklinks() {
    for (const c of W.list) c._back = new Set();
    for (const c of W.list) {
      const text = [c.intent, c.how, c.interactions, (c.sparks || []).join(" "), (c.questions || []).join(" ")].join(" ");
      const ids = new Set((c.related || []).map((r) => (typeof r === "string" ? r : r.id)));
      String(text).replace(/\[\[([a-z0-9-]+)/g, (m, id) => ids.add(id));
      for (const id of ids) if (W.byId[id] && id !== c.id) W.byId[id]._back.add(c.id);
    }
  }

  // Glossary: every construct's terms, plus the construct names themselves.
  W.terms = function () {
    const out = [];
    for (const c of W.list) {
      out.push({ term: c.name, def: c.summary, code: "", from: c, isConstruct: true });
      for (const t of c.terms || []) out.push({ term: t.term, def: t.def, code: t.code || "", from: c });
    }
    return out.sort((a, b) => a.term.localeCompare(b.term, undefined, { sensitivity: "base" }));
  };

  // ------------------------------------------------------------ halftone

  // The same 4x4 Bayer dither as shared/framework/ui.lua, drawn in the current
  // ink and handed to CSS as --tone-* background images.
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function toneURL(level, color, cell) {
    const c = document.createElement("canvas"); c.width = 4 * cell; c.height = 4 * cell;
    const x = c.getContext("2d"); x.fillStyle = color;
    for (let i = 0; i < 16; i++) if (BAYER[i] < level) x.fillRect((i % 4) * cell, ((i / 4) | 0) * cell, cell, cell);
    return 'url("' + c.toDataURL() + '")';
  }
  function applyTones() {
    const root = document.documentElement;
    const ink = getComputedStyle(root).getPropertyValue("--ink").trim();
    const rgb = hexToRgba(ink, 0.16);
    root.style.setProperty("--tone-inert", toneURL(4, rgb, 1));
    root.style.setProperty("--tone-raised", toneURL(8, rgb, 1));
    root.style.setProperty("--tone-hover", toneURL(12, rgb, 1));
  }
  function hexToRgba(hex, a) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (!m) return hex;
    return "rgba(" + parseInt(m[1], 16) + "," + parseInt(m[2], 16) + "," + parseInt(m[3], 16) + "," + a + ")";
  }

  // --------------------------------------------------------------- theme

  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem("atlas-theme"); } catch (e) { /* storage unavailable */ }
    if (saved) document.documentElement.dataset.theme = saved;
    applyTones();
    window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => { applyTones(); document.dispatchEvent(new Event("wiki:theme")); });
  }
  function toggleTheme() {
    const root = document.documentElement;
    const cur = root.dataset.theme || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    const next = cur === "light" ? "dark" : "light";
    root.dataset.theme = next;
    try { localStorage.setItem("atlas-theme", next); } catch (e) { /* storage unavailable */ }
    applyTones();
    document.dispatchEvent(new Event("wiki:theme"));
  }

  // --------------------------------------------------------------- shell

  function shell(activeId, activeTop) {
    const fams = W.families.map((f) => {
      const items = W.list.filter((c) => c.family === f.id);
      if (!items.length) return "";
      return '<div class="nav-fam"><h4><i style="background:var(' + f.color + ')"></i>' + esc(f.name) + "</h4><ul>" +
        items.map((c) => '<li><a href="' + href(c.id) + '"' + (c.id === activeId ? ' class="on"' : "") + ">" + esc(c.name) +
          (c.status === "spec" ? "<small>spec</small>" : "") + "</a></li>").join("") + "</ul></div>";
    }).join("");
    const top = [["index", "index.html", "Atlas"], ["workbench", "workbench.html", "Workbench"], ["principles", "principles.html", "Principles"], ["threads", "threads.html", "Open threads"], ["glossary", "glossary.html", "Glossary"], ["about", "about.html", "About"]]
      .map(([k, u, l]) => '<a href="' + u + '"' + (k === activeTop ? ' class="on"' : "") + ">" + l + "</a>").join("");
    const side = document.createElement("aside");
    side.className = "side";
    side.innerHTML =
      '<button class="menu-btn" type="button">menu</button>' +
      '<a class="brand" href="index.html"><b>CONSTRUCT ATLAS</b><span>mechanisms we have built &amp; imagined</span></a>' +
      '<input class="search" type="search" placeholder="Search constructs, terms…" aria-label="Search">' +
      '<nav class="nav-top">' + top + "</nav>" +
      '<div class="nav-fams">' + fams + '<button class="theme-btn" type="button">light / dark</button></div>';
    side.querySelector(".menu-btn").onclick = () => side.classList.toggle("open");
    side.querySelector(".theme-btn").onclick = toggleTheme;
    const search = side.querySelector(".search");
    search.addEventListener("keydown", (e) => {
      if (e.key === "Enter") location.href = "index.html?q=" + encodeURIComponent(search.value);
    });
    const main = document.createElement("main");
    const sh = document.createElement("div");
    sh.className = "shell";
    sh.append(side, main);
    document.body.prepend(sh);
    return { main, search };
  }

  // ----------------------------------------------------------- construct

  function section(title, body) { return body ? "<h2>" + esc(title) + "</h2>" + body : ""; }

  function renderConstruct(main) {
    const id = new URLSearchParams(location.search).get("c");
    const c = W.byId[id];
    if (!c) { main.innerHTML = "<h1>Not found</h1><p>No construct called <code>" + esc(id) + '</code>. <a href="index.html">Back to the atlas.</a></p>'; return; }
    document.title = c.name + " · Construct Atlas";
    const f = W.family(c.family);
    const sib = W.list.filter((x) => x.family === c.family);
    const i = sib.indexOf(c), prev = sib[i - 1], next = sib[i + 1];

    let h = '<div class="kicker"><a href="index.html#' + esc(f.id) + '" style="color:var(' + f.color + ')">' + esc(f.name) + "</a></div>";
    h += "<h1>" + esc(c.name) + "</h1>";
    h += '<p class="lede">' + links(c.summary) + "</p>";
    h += '<div class="meta-row">' + statusChip(c) + originChip(c) + (c.tags || []).map((t) => '<a class="chip origin" href="index.html?q=' + encodeURIComponent(t) + '">' + esc(t) + "</a>").join("") + "</div>";
    if (c.statusNote) h += '<div class="note' + (c.status === "built" ? " ok" : "") + '">' + links(c.statusNote) + "</div>";
    h += '<div id="toy-slot"></div>';
    h += '<div class="prose">';
    h += section("Why it exists", links(c.intent));
    h += section("How it works", links(c.how));
    h += "</div>";
    if (c.shots && c.shots.length) {
      h += c.shots.map((s) => '<figure class="shot"><img src="' + esc(s.src) + '" alt="' + esc(s.alt || s.caption) + '" loading="lazy"><figcaption>' + links(s.caption) +
        (s.cmd ? '<br><code>' + esc(s.cmd) + "</code>" : "") + "</figcaption></figure>").join("");
    }
    if (c.knobs && c.knobs.length) {
      h += section("Knobs", '<div class="tbl-wrap"><table><thead><tr><th>Knob</th><th>Default</th><th>What it changes</th><th>Code</th></tr></thead><tbody>' +
        c.knobs.map((k) => "<tr><td>" + links(k[0]) + "</td><td>" + links(k[1]) + "</td><td>" + links(k[2] || "") + "</td><td>" + (k[3] ? "<code>" + esc(k[3]) + "</code>" : "") + "</td></tr>").join("") +
        "</tbody></table></div>");
    }
    h += '<div class="prose">';
    if (c.interactions) h += section("Composes with", links(c.interactions));
    const rel = (c.related || []).map((r) => (typeof r === "string" ? { id: r } : r)).filter((r) => W.byId[r.id]);
    if (rel.length) {
      h += (c.interactions ? "" : "<h2>Composes with</h2>") + '<div class="links">' + rel.map((r) => {
        const o = W.byId[r.id];
        return '<a class="link-card" href="' + href(o.id) + '"><b>' + esc(o.name) + "</b><span>" + plain(o.summary) + "</span>" + (r.how ? "<em>" + plain(r.how) + "</em>" : "") + "</a>";
      }).join("") + "</div>";
    }
    if (c.questions && c.questions.length) h += section("Open questions", '<ul class="questions">' + c.questions.map((q) => "<li>" + links(q) + "</li>").join("") + "</ul>");
    if (c.sparks && c.sparks.length) h += section("Design sparks", '<ul class="sparks">' + c.sparks.map((q) => "<li>" + links(q) + "</li>").join("") + "</ul>");
    if (c.terms && c.terms.length) h += section("Terms", '<dl class="terms">' + c.terms.map((t) => "<dt>" + links(t.term) + "</dt><dd>" + links(t.def) + (t.code ? " <code>" + esc(t.code) + "</code>" : "") + "</dd>").join("") + "</dl>");
    if (c.sources && c.sources.length) h += section("Where it lives", '<ul class="sources">' + c.sources.map((s) => "<li>" + sourceLink(s) + "</li>").join("") + "</ul>");
    const back = [...(c._back || [])].filter((x) => !rel.some((r) => r.id === x));
    if (back.length) h += section("Mentioned by", '<p class="sources">' + back.map((b) => '<a href="' + href(b) + '">' + esc(W.byId[b].name) + "</a>").join(" · ") + "</p>");
    h += "</div><hr>";
    h += '<p class="sources">' + (prev ? '← <a href="' + href(prev.id) + '">' + esc(prev.name) + "</a>" : "") +
      (prev && next ? " &nbsp;·&nbsp; " : "") + (next ? '<a href="' + href(next.id) + '">' + esc(next.name) + "</a> →" : "") + "</p>";
    main.innerHTML = h;
    if (c.toy) Toy.mount(document.getElementById("toy-slot"), c.toy);
  }

  // --------------------------------------------------------------- index

  function cardHTML(c) {
    const f = W.family(c.family);
    const hay = [c.name, c.summary, (c.tags || []).join(" "), f.name, (c.terms || []).map((t) => t.term).join(" ")].join(" ").toLowerCase();
    return '<a class="card" style="--fam:var(' + f.color + ')" href="' + href(c.id) + '" data-hay="' + esc(hay) + '" data-status="' + esc(c.status) + '" data-origin="' + esc(c.origin) + '">' +
      (c.toy ? '<canvas class="thumb" data-id="' + esc(c.id) + '" style="width:100%;aspect-ratio:' + (c.toy.w || 384) + "/" + (c.toy.h || 216) + ';display:block;image-rendering:pixelated;background:var(--bg);border:1px solid var(--rule)"></canvas>' : "") +
      "<b>" + esc(c.name) + "</b><p>" + plain(c.summary) + '</p><div class="chips">' + statusChip(c) + originChip(c) + "</div></a>";
  }

  function renderIndex(main, search) {
    const counts = { built: 0, partial: 0, spec: 0 };
    for (const c of W.list) counts[c.status] = (counts[c.status] || 0) + 1;
    const toys = W.list.filter((c) => c.toy).length;
    let h = '<div class="hero"><canvas class="hero-canvas" id="hero"></canvas>';
    h += '<div class="kicker">game-dev-playground · ShmupRouge</div>';
    h += '<h1 class="big">Construct Atlas</h1>';
    h += '<p class="lede">The mechanisms we have built and imagined across our game explorations, pulled out of the games that hold them. Each page explains one construct, lets you play with it, and records where it lives, what is still open, and where it might go next.</p>';
    h += '<div class="stats"><div><b>' + W.list.length + "</b><span>constructs</span></div><div><b>" + toys + "</b><span>playable toys</span></div><div><b>" +
      (counts.built + counts.partial) + "</b><span>built or partly built</span></div><div><b>" + counts.spec + "</b><span>still on paper</span></div></div>";
    h += '<div class="filters">' +
      [["all", "All"], ["built", "Built"], ["partial", "Partly built"], ["spec", "Spec only"]].map(([k, l], i) => '<button class="btn' + (i ? "" : " on") + '" data-f="status" data-v="' + k + '">' + l + "</button>").join("") +
      '<span style="width:12px"></span>' +
      [["all", "Both repos"], ["playground", "Playground"], ["shmuprouge", "ShmupRouge"]].map(([k, l], i) => '<button class="btn' + (i ? "" : " on") + '" data-f="origin" data-v="' + k + '">' + l + "</button>").join("") +
      "</div></div>";
    for (const f of W.families) {
      const items = W.list.filter((c) => c.family === f.id);
      if (!items.length) continue;
      h += '<section class="fam-block" id="' + esc(f.id) + '" style="--fam:var(' + f.color + ')"><div class="fam-head"><h2>' + esc(f.name) + "</h2><p>" + esc(f.blurb || "") + '</p></div><div class="cards">' +
        items.map(cardHTML).join("") + "</div></section>";
    }
    main.innerHTML = h;

    const filt = { status: "all", origin: "all", q: "" };
    function apply() {
      const q = filt.q.toLowerCase().trim();
      for (const card of main.querySelectorAll(".card")) {
        const ok = (filt.status === "all" || card.dataset.status === filt.status) &&
          (filt.origin === "all" || card.dataset.origin === filt.origin || card.dataset.origin === "both") &&
          (!q || q.split(/\s+/).every((w) => card.dataset.hay.includes(w)));
        card.classList.toggle("hidden", !ok);
      }
      for (const b of main.querySelectorAll(".fam-block")) b.classList.toggle("hidden", !b.querySelector(".card:not(.hidden)"));
    }
    main.querySelectorAll(".filters .btn").forEach((b) => b.onclick = () => {
      filt[b.dataset.f] = b.dataset.v;
      main.querySelectorAll('.filters .btn[data-f="' + b.dataset.f + '"]').forEach((x) => x.classList.toggle("on", x === b));
      apply();
    });
    const q0 = new URLSearchParams(location.search).get("q");
    if (q0) { search.value = q0; filt.q = q0; apply(); }
    search.addEventListener("input", () => { filt.q = search.value; apply(); });

    // Thumbnails: a still frame of each toy, drawn once it scrolls into view.
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) {
        io.unobserve(e.target);
        const c = W.byId[e.target.dataset.id];
        Toy.thumbnail(e.target, c.toy);
      }
    }, { rootMargin: "200px" });
    main.querySelectorAll("canvas.thumb").forEach((cv) => io.observe(cv));
    document.addEventListener("wiki:theme", () => main.querySelectorAll("canvas.thumb").forEach((cv) => Toy.thumbnail(cv, W.byId[cv.dataset.id].toy)));
    if (window.AtlasHero) window.AtlasHero(document.getElementById("hero"));
  }

  // ------------------------------------------------------------ glossary

  function renderGlossary(main, search) {
    document.title = "Glossary · Construct Atlas";
    const terms = W.terms();
    let h = '<div class="kicker">Reference</div><h1>Glossary</h1><p class="lede">Every term the atlas defines, gathered from the construct pages. Construct names link to their page; other terms link to the construct that defines them. Edit a term on its construct page and it changes here.</p>';
    let letter = "";
    h += '<dl class="gl-list">';
    for (const t of terms) {
      const L = t.term[0].toUpperCase();
      if (L !== letter) { letter = L; h += '</dl><div class="gl-letter">' + esc(L) + '</div><dl class="gl-list">'; }
      const hay = (t.term + " " + t.def + " " + t.code).toLowerCase();
      h += '<div class="gl-item" data-hay="' + esc(hay) + '"><dt>' + (t.isConstruct ? '<a href="' + href(t.from.id) + '">' + esc(t.term) + "</a>" : esc(t.term)) +
        (t.isConstruct ? ' <a class="src">construct</a>' : ' <a class="src" href="' + href(t.from.id) + '">' + esc(t.from.name) + "</a>") + "</dt><dd>" + links(t.def) + (t.code ? " <code>" + esc(t.code) + "</code>" : "") + "</dd></div>";
    }
    h += "</dl>";
    main.innerHTML = '<div class="prose" style="max-width:820px">' + h + "</div>";
    search.placeholder = "Filter terms…";
    search.addEventListener("input", () => {
      const q = search.value.toLowerCase().trim();
      main.querySelectorAll(".gl-item").forEach((it) => it.classList.toggle("hidden", !!q && !it.dataset.hay.includes(q)));
    });
  }

  // -------------------------------------------------------- open threads

  // Every construct's open questions in one place, grouped by family, so the
  // next exploration can start from what is genuinely undecided.
  function renderThreads(main, search) {
    document.title = "Open threads \u00b7 Construct Atlas";
    let n = 0;
    let h = '<div class="kicker">Where to explore next</div><h1>Open threads</h1>';
    const total = W.list.reduce((a, c) => a + (c.questions || []).length, 0);
    h += '<p class="lede">' + total + " open questions, gathered from every construct page. Some are decisions the design never made, some are disagreements between a doc and its code, some are just unexplored. Edit them on their construct page and they change here.</p>";
    for (const f of W.families) {
      const items = W.list.filter((c) => c.family === f.id && c.questions && c.questions.length);
      if (!items.length) continue;
      h += '<section class="fam-block" style="--fam:var(' + f.color + ')"><div class="fam-head"><h2>' + esc(f.name) + "</h2></div>";
      for (const c of items) {
        h += '<div class="thread" data-hay="' + esc((c.name + " " + c.questions.join(" ")).toLowerCase()) + '"><h3><a href="' + href(c.id) + '">' + esc(c.name) + "</a> " + statusChip(c) + '</h3><ul class="questions">' +
          c.questions.map((q) => "<li>" + links(q) + "</li>").join("") + "</ul></div>";
        n += c.questions.length;
      }
      h += "</section>";
    }
    main.innerHTML = '<div class="prose" style="max-width:820px">' + h + "</div>";
    search.placeholder = "Filter threads\u2026";
    search.addEventListener("input", () => {
      const q = search.value.toLowerCase().trim();
      main.querySelectorAll(".thread").forEach((t) => t.classList.toggle("hidden", !!q && !t.dataset.hay.includes(q)));
      main.querySelectorAll(".fam-block").forEach((b) => b.classList.toggle("hidden", !b.querySelector(".thread:not(.hidden)")));
    });
  }

  // ----------------------------------------------------------- workbench

  function renderWorkbench(main) {
    document.title = "Workbench · Construct Atlas";
    const pool = W.list.filter((c) => c.sparks && c.sparks.length);
    const slots = [null, null, null];
    const locked = [false, false, false];
    const sparkIx = [0, 0, 0];
    let h = '<div class="kicker">Designing with the atlas</div><h1>Workbench</h1>';
    h += '<p class="lede">Draw three constructs from different families, lock the ones that interest you, and redraw the rest. The prompt underneath asks what game the three make together. Most draws are nonsense; the point is the one that is not.</p>';
    h += '<div class="filters"><button class="btn" id="wb-draw">draw unlocked</button><label class="toy-ctl"><input type="checkbox" id="wb-mix" checked> one per family</label></div>';
    h += '<div class="bench-grid" id="wb-grid"></div><div class="prompt-box" id="wb-prompt"></div>';
    h += '<div class="prose"><h2>How to use a draw</h2><ol>' +
      "<li>Read each construct's <em>why it exists</em>. Ask what feeling the three intents produce together, not what the mechanics add up to.</li>" +
      "<li>Pick the construct that would be the <em>verb</em> (what the player does every second), the one that is the <em>pressure</em> (what pushes back), and the one that is the <em>reason</em> (what the player is accumulating or protecting).</li>" +
      "<li>Open the toys side by side and look for a shared quantity: energy, distance, time, mass. A construct pairing that shares a quantity usually composes; one that does not usually just coexists.</li>" +
      "<li>Write it down as a new spark on the construct page it most changes. That is how the atlas grows.</li></ol></div>";
    main.innerHTML = h;
    const grid = main.querySelector("#wb-grid"), prompt = main.querySelector("#wb-prompt"), mix = main.querySelector("#wb-mix");

    function draw() {
      const usedFam = new Set(slots.filter((s, i) => s && locked[i]).map((s) => s.family));
      for (let i = 0; i < 3; i++) {
        if (locked[i] && slots[i]) continue;
        let cand = pool.filter((c) => !slots.includes(c) && (!mix.checked || !usedFam.has(c.family)));
        if (!cand.length) cand = pool;
        slots[i] = cand[Math.floor(Math.random() * cand.length)];
        sparkIx[i] = Math.floor(Math.random() * slots[i].sparks.length);
        usedFam.add(slots[i].family);
      }
      render();
    }
    function render() {
      grid.innerHTML = slots.map((c, i) => {
        const f = W.family(c.family);
        return '<div class="slot' + (locked[i] ? " locked" : "") + '" style="--fam:var(' + f.color + ')"><header><small style="color:var(' + f.color + ')">' + esc(f.name) + '</small><button class="btn' + (locked[i] ? " on" : "") + '" data-lock="' + i + '">' + (locked[i] ? "locked" : "lock") + "</button></header>" +
          '<h3><a href="' + href(c.id) + '">' + esc(c.name) + "</a></h3><p>" + plain(c.summary) + '</p><div class="spark">' + links(c.sparks[sparkIx[i]]) + "</div></div>";
      }).join("");
      grid.querySelectorAll("[data-lock]").forEach((b) => b.onclick = () => { const i = +b.dataset.lock; locked[i] = !locked[i]; render(); });
      const [a, b, c] = slots;
      prompt.innerHTML = "<b>The prompt</b>What game has <a href=\"" + href(a.id) + '">' + esc(a.name) + "</a> as its verb, <a href=\"" + href(b.id) + '">' + esc(b.name) +
        "</a> as the thing that pushes back, and <a href=\"" + href(c.id) + '">' + esc(c.name) + "</a> as the reason to keep going? Then swap the roles and ask again.";
    }
    main.querySelector("#wb-draw").onclick = draw;
    draw();
  }

  // --------------------------------------------------------------- entry

  W.page = async function (kind) {
    initTheme();
    await loadAll();
    const { main, search } = shell(kind === "construct" ? new URLSearchParams(location.search).get("c") : null, kind);
    if (kind === "construct") renderConstruct(main);
    else if (kind === "index") renderIndex(main, search);
    else if (kind === "glossary") renderGlossary(main, search);
    else if (kind === "workbench") renderWorkbench(main);
    else if (kind === "about" || kind === "principles") { const t = document.getElementById("about"); main.innerHTML = links(t.innerHTML); t.remove(); }
    else if (kind === "threads") renderThreads(main, search);
  };

  window.Wiki = W;
})();
