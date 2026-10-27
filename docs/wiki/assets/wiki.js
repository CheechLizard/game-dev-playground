/* Construct Atlas — registry, loader and page renderers.
 *
 * Every construct is one file in constructs/, which calls Wiki.construct({...}).
 * constructs/manifest.js is the table of contents: game systems, each split
 * into groups of construct ids. Nothing else holds construct data or placement:
 * the index, system pages, sidebar, search, backlinks and the glossary are all
 * derived from those files, so adding a construct is adding one file and one id
 * in the manifest. (Inside the renderer a construct's system is `c.family`.)
 *
 * Pages are plain HTML that load this script and call one renderer:
 *   Wiki.page("index" | "system" | "construct" | "glossary" | "workbench" |
 *             "threads" | "notes" | "about" | "principles")
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
    systems: [],
    families: [],
    order: [],
    place: {},
    byId: {},
    list: [],
  };

  // ------------------------------------------------------------ registry

  W.manifest = function (m) {
    W.systems = W.families = m.systems;
    W.order = []; W.place = {};
    for (const s of m.systems) for (const g of s.groups) for (const id of g.constructs) {
      W.order.push(id);
      W.place[id] = { system: s.id, group: g.name };
    }
  };
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
    for (const c of W.list) { c.family = W.place[c.id].system; c.group = W.place[c.id].group; }
    const missing = W.order.filter((id) => !W.byId[id]);
    if (missing.length) console.warn("manifest names constructs with no file:", missing);
    buildBacklinks();
  }

  // -------------------------------------------------------------- helpers

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const href = (id) => "construct.html?c=" + encodeURIComponent(id);
  const sysHref = (id) => "system.html?s=" + encodeURIComponent(id);
  W.href = href; W.sysHref = sysHref; W.esc = esc;

  // [[id]] and [[id|label]] become links to that construct; [[@system|label]] to a system page.
  function links(html) {
    return String(html || "").replace(/\[\[(@?[a-z0-9-]+)(?:\|([^\]]+))?\]\]/g, (m, id, label) => {
      if (id[0] === "@") {
        const sy = W.family(id.slice(1));
        return '<a href="' + sysHref(sy.id) + '">' + (label || esc(sy.name)) + "</a>";
      }
      const c = W.byId[id];
      if (!c) return '<span class="muted" title="no page yet">' + esc(label || id) + "</span>";
      return '<a href="' + href(id) + '" title="' + esc(c.summary) + '">' + (label || esc(c.name)) + "</a>";
    });
  }
  W.links = links; W.plain = plain;
  // Authored HTML reduced to inline text (no nested links), for cards and link tiles.
  function plain(html) {
    return String(html || "").replace(/\[\[(@?[a-z0-9-]+)(?:\|([^\]]+))?\]\]/g, (m, id, label) => label || (W.byId[id] ? W.byId[id].name : W.family(id.slice(1)).name))
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

  // Sidebar: every system, with the current one opened out into its groups.
  function shell(activeId, activeTop, activeSystem) {
    const openSys = activeId && W.byId[activeId] ? W.byId[activeId].family : activeSystem;
    const fams = W.systems.map((sy) => {
      const n = W.list.filter((c) => c.family === sy.id).length;
      if (!n) return "";
      const open = sy.id === openSys;
      const groups = !open ? "" : sy.groups.map((g) => {
        const items = g.constructs.map((id) => W.byId[id]).filter(Boolean);
        return "<h5>" + esc(g.name) + "</h5><ul>" + items.map((c) => '<li><a href="' + href(c.id) + '"' + (c.id === activeId ? ' class="on"' : "") + ">" + esc(c.name) +
          (c.status === "spec" ? "<small>spec</small>" : "") + "</a></li>").join("") + "</ul>";
      }).join("");
      return '<div class="nav-fam' + (open ? " open" : "") + '"><a class="nav-sys' + (open && !activeId ? " on" : "") + '" href="' + sysHref(sy.id) + '"><i style="background:var(' + sy.color + ')"></i><span>' + esc(sy.name) + "</span><small>" + n + "</small></a>" + groups + "</div>";
    }).join("");
    const top = [["index", "index.html", "Atlas"], ["workbench", "workbench.html", "Workbench"], ["notes", "notes.html", "Notes & bugs"], ["threads", "threads.html", "Open threads"], ["principles", "principles.html", "Principles"], ["glossary", "glossary.html", "Glossary"], ["about", "about.html", "About"]]
      .map(([k, u, l]) => '<a href="' + u + '"' + (k === activeTop ? ' class="on"' : "") + ">" + l + "</a>").join("");
    const side = document.createElement("aside");
    side.className = "side";
    side.innerHTML =
      '<button class="menu-btn" type="button">menu</button>' +
      '<a class="brand" href="index.html"><b>CONSTRUCT ATLAS</b><span>mechanisms we have built &amp; imagined</span></a>' +
      '<input class="search" type="search" placeholder="Search constructs, terms…" aria-label="Search">' +
      '<nav class="nav-top">' + top + "</nav>" +
      '<div class="nav-fams"><h4>Systems</h4>' + fams + '<button class="theme-btn" type="button">light / dark</button></div>';
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

    let h = '<div class="kicker"><a href="' + sysHref(f.id) + '" style="color:var(' + f.color + ')">' + esc(f.name) + "</a><span>\u203a</span><span>" + esc(c.group) + "</span></div>";
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
    h += '<div id="notes-slot"></div>';
    h += "</div><hr>";
    h += '<p class="sources">' + (prev ? '← <a href="' + href(prev.id) + '">' + esc(prev.name) + "</a>" : "") +
      (prev && next ? " &nbsp;·&nbsp; " : "") + (next ? '<a href="' + href(next.id) + '">' + esc(next.name) + "</a> →" : "") + "</p>";
    main.innerHTML = h;
    if (c.toy) Toy.mount(document.getElementById("toy-slot"), c.toy);
    if (window.AtlasNotes) AtlasNotes.mountConstruct(document.getElementById("notes-slot"), c, main);
  }

  // --------------------------------------------------------------- index

  function cardHTML(c) {
    const f = W.family(c.family);
    const hay = [c.name, c.summary, (c.tags || []).join(" "), f.name, (c.terms || []).map((t) => t.term).join(" ")].join(" ").toLowerCase();
    return '<a class="card" style="--fam:var(' + f.color + ')" href="' + href(c.id) + '" data-hay="' + esc(hay) + '" data-status="' + esc(c.status) + '" data-origin="' + esc(c.origin) + '">' +
      (c.toy ? '<canvas class="thumb" data-id="' + esc(c.id) + '" style="width:100%;aspect-ratio:' + (c.toy.w || 384) + "/" + (c.toy.h || 216) + ';display:block;image-rendering:pixelated;background:var(--bg);border:1px solid var(--rule)"></canvas>' : "") +
      "<b>" + esc(c.name) + "</b><p>" + plain(c.summary) + '</p><div class="chips">' + statusChip(c) + originChip(c) + "</div></a>";
  }

  function groupsHTML(sy) {
    return sy.groups.map((g) => {
      const items = g.constructs.map((id) => W.byId[id]).filter(Boolean);
      if (!items.length) return "";
      return '<div class="grp-block"><h3 class="grp">' + esc(g.name) + '</h3><div class="cards">' + items.map(cardHTML).join("") + "</div></div>";
    }).join("");
  }

  // Thumbnails: a still frame of each toy, drawn once it scrolls into view.
  function thumbs(root) {
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) {
        io.unobserve(e.target);
        Toy.thumbnail(e.target, W.byId[e.target.dataset.id].toy);
      }
    }, { rootMargin: "200px" });
    root.querySelectorAll("canvas.thumb").forEach((cv) => io.observe(cv));
    document.addEventListener("wiki:theme", () => root.querySelectorAll("canvas.thumb").forEach((cv) => Toy.thumbnail(cv, W.byId[cv.dataset.id].toy)));
  }

  // -------------------------------------------------------------- system

  function renderSystem(main) {
    const sy = W.systems.find((x) => x.id === new URLSearchParams(location.search).get("s"));
    if (!sy) { main.innerHTML = '<h1>Not found</h1><p><a href="index.html">Back to the atlas.</a></p>'; return; }
    document.title = sy.name + " \u00b7 Construct Atlas";
    const items = W.list.filter((c) => c.family === sy.id);
    const counts = {};
    for (const c of items) counts[c.status] = (counts[c.status] || 0) + 1;
    const qs = items.reduce((a, c) => a + (c.questions || []).length, 0);
    let h = '<div class="kicker" style="color:var(' + sy.color + ')">System</div><h1>' + esc(sy.name) + "</h1>";
    h += '<p class="lede">' + esc(sy.blurb) + "</p>";
    h += '<div class="meta-row">' + ["built", "partial", "spec", "superseded"].filter((k) => counts[k]).map((k) => statusChip({ status: k }).replace("</span>", " " + counts[k] + "</span>")).join("") +
      '<a class="chip origin" href="threads.html#' + esc(sy.id) + '">' + qs + " open questions</a></div>";
    h += '<div class="prose">' + links(sy.overview || "") + "</div>";
    if (sy.loop) h += '<div class="loop" style="--fam:var(' + sy.color + ')"><b>How the parts feed each other</b>' + links(sy.loop) + "</div>";
    h += '<section class="fam-block" style="--fam:var(' + sy.color + ')">' + groupsHTML(sy) + "</section>";
    const i = W.systems.indexOf(sy), prev = W.systems[i - 1], next = W.systems[i + 1];
    h += '<hr><p class="sources">' + (prev ? '\u2190 <a href="' + sysHref(prev.id) + '">' + esc(prev.name) + "</a>" : "") + (prev && next ? " &nbsp;\u00b7&nbsp; " : "") +
      (next ? '<a href="' + sysHref(next.id) + '">' + esc(next.name) + "</a> \u2192" : "") + "</p>";
    h += '<div class="prose"><div id="notes-slot"></div></div>';
    main.innerHTML = h;
    thumbs(main);
    if (window.AtlasNotes) {
      AtlasNotes.mountConstruct(document.getElementById("notes-slot"), { id: sy.id, name: sy.name }, main);
      AtlasNotes.decorate(main);
    }
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
    h += '<div class="sys-tiles">' + W.systems.map((sy) => {
      const n = W.list.filter((c) => c.family === sy.id).length;
      return '<a class="sys-tile" style="--fam:var(' + sy.color + ')" href="' + sysHref(sy.id) + '"><b>' + esc(sy.name) + "</b><span>" + esc(sy.blurb) + "</span><small>" + n + " constructs \u00b7 " + sy.groups.map((g) => esc(g.name)).join(", ") + "</small></a>";
    }).join("") + "</div>";
    for (const sy of W.systems) {
      if (!W.list.some((c) => c.family === sy.id)) continue;
      h += '<section class="fam-block" id="' + esc(sy.id) + '" style="--fam:var(' + sy.color + ')"><div class="fam-head"><h2><a href="' + sysHref(sy.id) + '">' + esc(sy.name) + "</a></h2><p>" + esc(sy.blurb || "") + "</p></div>" +
        groupsHTML(sy) + "</section>";
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
      for (const b of main.querySelectorAll(".grp-block")) b.classList.toggle("hidden", !b.querySelector(".card:not(.hidden)"));
      for (const b of main.querySelectorAll(".fam-block")) b.classList.toggle("hidden", !b.querySelector(".card:not(.hidden)"));
      main.querySelector(".sys-tiles").classList.toggle("hidden", !!q || filt.status !== "all" || filt.origin !== "all");
    }
    main.querySelectorAll(".filters .btn").forEach((b) => b.onclick = () => {
      filt[b.dataset.f] = b.dataset.v;
      main.querySelectorAll('.filters .btn[data-f="' + b.dataset.f + '"]').forEach((x) => x.classList.toggle("on", x === b));
      apply();
    });
    const q0 = new URLSearchParams(location.search).get("q");
    if (q0) { search.value = q0; filt.q = q0; apply(); }
    search.addEventListener("input", () => { filt.q = search.value; apply(); });

    thumbs(main);
    if (window.AtlasNotes) AtlasNotes.decorate(main);
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
      h += '<section class="fam-block" id="' + esc(f.id) + '" style="--fam:var(' + f.color + ')"><div class="fam-head"><h2><a href="' + sysHref(f.id) + '">' + esc(f.name) + "</a></h2></div>";
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
    h += '<p class="lede">Draw three constructs from different systems, lock the ones that interest you, and redraw the rest. The prompt underneath asks what game the three make together. Most draws are nonsense; the point is the one that is not.</p>';
    h += '<div class="filters"><button class="btn" id="wb-draw">draw unlocked</button><label class="toy-ctl"><input type="checkbox" id="wb-mix" checked> one per system</label></div>';
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
    const qp = new URLSearchParams(location.search);
    const { main, search } = shell(kind === "construct" ? qp.get("c") : null, kind, kind === "system" ? qp.get("s") : null);
    if (kind === "construct") renderConstruct(main);
    else if (kind === "index") renderIndex(main, search);
    else if (kind === "system") renderSystem(main);
    else if (kind === "notes") { if (window.AtlasNotes) AtlasNotes.renderAll(main, search); }
    else if (kind === "glossary") renderGlossary(main, search);
    else if (kind === "workbench") renderWorkbench(main);
    else if (kind === "about" || kind === "principles") { const t = document.getElementById("about"); main.innerHTML = links(t.innerHTML); t.remove(); }
    else if (kind === "threads") renderThreads(main, search);
  };

  window.Wiki = W;
})();
