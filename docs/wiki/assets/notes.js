/* Notes and bug reports, written from the page and saved as Markdown files in
 * the repository by docs/wiki/server.py (one file per note, under
 * docs/wiki/notes/<construct>/). Select text on any construct or system page to
 * quote it in a note, or use the buttons in its "Notes & bugs" section.
 *
 * Without the server (opened from disk, or served by a plain static server)
 * notes cannot be read or written, and the page says how to start it.
 */
(function () {
  "use strict";

  const API = "/api/notes";
  const GENERAL = "_atlas";
  let health = null;
  let cache = null;

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // Note bodies are plain text with `code` spans and line breaks; nothing else is interpreted.
  const fmt = (s) => esc(s).replace(/`([^`\n]+)`/g, "<code>$1</code>").replace(/\n/g, "<br>");

  function online() {
    if (!health) {
      health = location.protocol.startsWith("http")
        ? fetch("/api/health", { cache: "no-store" }).then((r) => r.ok).catch(() => false)
        : Promise.resolve(false);
    }
    return health;
  }
  async function load(force) {
    if (!(await online())) return [];
    if (!cache || force) cache = fetch(API, { cache: "no-store" }).then((r) => r.json()).then((j) => j.notes || []).catch(() => []);
    return cache;
  }
  async function send(method, url, body) {
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || r.statusText);
    cache = null;
    return j.note;
  }

  const OFFLINE =
    '<div class="note warn"><p>Notes and bug reports are saved by the atlas server, which is not running behind this page. From the repository root:</p>' +
    "<pre><code>python3 docs/wiki/server.py</code></pre><p>then open <code>http://localhost:8765/docs/wiki/</code>. Existing notes are Markdown files in <code>docs/wiki/notes/</code> and can be read without it.</p></div>";

  function targetName(id) {
    if (id === GENERAL) return "The atlas";
    const c = Wiki.byId[id];
    if (c) return c.name;
    const s = (Wiki.systems || []).find((x) => x.id === id);
    return s ? s.name : id;
  }
  function targetHref(id) {
    if (id === GENERAL) return "notes.html";
    return Wiki.byId[id] ? Wiki.href(id) : Wiki.sysHref(id);
  }

  // ----------------------------------------------------------- one note

  function itemHTML(n, showTarget) {
    const kind = n.kind === "bug" ? '<span class="chip bug"><i></i>bug' + (n.about ? " · " + esc(n.about) : "") + "</span>" : '<span class="chip notekind"><i></i>note</span>';
    const status = '<span class="chip ' + (n.status === "resolved" ? "superseded" : "origin") + '">' + esc(n.status) + "</span>";
    const when = (n.created || "").replace("T", " ").slice(0, 16);
    let h = '<article class="nt' + (n.status === "resolved" ? " done" : "") + '" data-kind="' + esc(n.kind) + '" data-status="' + esc(n.status) + '" data-about="' + esc(n.about || "") + '" data-hay="' +
      esc((n.title + " " + n.body + " " + n.quote + " " + targetName(n.construct)).toLowerCase()) + '">';
    h += '<header>' + kind + status + "<b>" + esc(n.title) + "</b></header>";
    h += '<div class="nt-meta">' + (showTarget ? '<a href="' + targetHref(n.construct) + '">' + esc(targetName(n.construct)) + "</a> · " : "") +
      (n.section ? esc(n.section) + " · " : "") + esc(when) + ' · <code>notes/' + esc(n.file) + "</code></div>";
    if (n.quote) h += "<blockquote>" + fmt(n.quote) + "</blockquote>";
    if (n.body) h += "<p>" + fmt(n.body) + "</p>";
    h += '<button class="btn nt-toggle" type="button" data-file="' + esc(n.file) + '" data-next="' + (n.status === "resolved" ? "open" : "resolved") + '">' +
      (n.status === "resolved" ? "reopen" : "resolve") + "</button></article>";
    return h;
  }

  function wireToggles(root, refresh) {
    root.querySelectorAll(".nt-toggle").forEach((b) => b.onclick = async () => {
      b.disabled = true;
      try { await send("PATCH", API + "/" + b.dataset.file, { status: b.dataset.next }); await refresh(); }
      catch (e) { b.disabled = false; alert("Could not update the note: " + e.message); }
    });
  }

  // ----------------------------------------------------------- composer

  let dialog;
  function composer() {
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.className = "composer";
    dialog.innerHTML =
      '<form method="dialog">' +
      '<div class="cmp-head"><b class="cmp-title">New note</b><span class="cmp-target"></span></div>' +
      '<div class="cmp-kinds"><label><input type="radio" name="kind" value="note"> Note</label><label><input type="radio" name="kind" value="bug"> Bug</label>' +
      '<span class="cmp-about">in <label><input type="radio" name="about" value="game" checked> the game</label><label><input type="radio" name="about" value="wiki"> the wiki</label></span></div>' +
      '<label class="cmp-field"><span>Title</span><input name="title" required maxlength="200" autocomplete="off"></label>' +
      '<label class="cmp-field cmp-quote"><span>Quoted from the page</span><textarea name="quote" rows="3" maxlength="2000"></textarea></label>' +
      '<label class="cmp-field"><span>Details</span><textarea name="body" rows="6" maxlength="20000" placeholder="What you noticed, what you expected, an idea to try…"></textarea></label>' +
      '<div class="cmp-foot"><span class="cmp-where"></span><span class="cmp-err"></span><button class="btn" value="cancel" type="submit" formnovalidate>cancel</button><button class="btn on" value="save" type="submit">save</button></div>' +
      "</form>";
    document.body.append(dialog);
    const f = dialog.querySelector("form");
    const syncKind = () => {
      const bug = f.kind.value === "bug";
      dialog.querySelector(".cmp-about").style.visibility = bug ? "visible" : "hidden";
      dialog.querySelector(".cmp-title").textContent = bug ? "Log a bug" : "New note";
    };
    f.querySelectorAll('[name="kind"]').forEach((r) => r.onchange = syncKind);
    dialog._sync = syncKind;
    return dialog;
  }

  function compose(opts) {
    const d = composer(), f = d.querySelector("form");
    f.reset();
    f.kind.value = opts.kind || "note";
    f.quote.value = opts.quote || "";
    d.querySelector(".cmp-quote").style.display = opts.quote ? "" : "none";
    d.querySelector(".cmp-target").textContent = targetName(opts.target) + (opts.section ? " › " + opts.section : "");
    d.querySelector(".cmp-where").textContent = "saves to docs/wiki/notes/" + opts.target + "/";
    d.querySelector(".cmp-err").textContent = "";
    d._sync();
    d.onclose = null;
    f.onsubmit = async (ev) => {
      if (ev.submitter && ev.submitter.value === "cancel") return;
      ev.preventDefault();
      try {
        await send("POST", API, {
          construct: opts.target, kind: f.kind.value, about: f.about.value, title: f.title.value,
          quote: f.quote.value, body: f.body.value, section: opts.section || "",
        });
        d.close();
        if (opts.done) opts.done();
      } catch (e) { d.querySelector(".cmp-err").textContent = "Not saved: " + e.message; }
    };
    d.showModal();
    setTimeout(() => f.title.focus(), 0);
  }

  // ------------------------------------------------- quote from the page

  // The heading a selection sits under, so a note records where it came from.
  function sectionOf(node, root) {
    let el = node.nodeType === 1 ? node : node.parentElement;
    if (el && el.closest(".toy")) return "Toy";
    while (el && el !== root) {
      let sib = el;
      while ((sib = sib.previousElementSibling)) {
        if (/^H[1-3]$/.test(sib.tagName)) return sib.textContent.trim();
        const inner = sib.querySelectorAll ? sib.querySelectorAll("h2, h3") : [];
        if (inner.length) return inner[inner.length - 1].textContent.trim();
      }
      el = el.parentElement;
    }
    return "";
  }

  function selectionTool(root, target, refresh) {
    const tip = document.createElement("div");
    tip.className = "sel-tip";
    tip.innerHTML = '<button type="button" data-k="note">+ note</button><button type="button" data-k="bug">+ bug</button>';
    document.body.append(tip);
    let pending = null;
    const hide = () => { tip.style.display = "none"; };
    hide();
    document.addEventListener("selectionchange", () => {
      const sel = getSelection();
      const text = sel && sel.toString().trim();
      if (!text || sel.rangeCount === 0 || !root.contains(sel.anchorNode) || (sel.anchorNode.parentElement && sel.anchorNode.parentElement.closest(".notes-box, input, textarea"))) { hide(); return; }
      const r = sel.getRangeAt(0).getBoundingClientRect();
      pending = { quote: text.slice(0, 2000), section: sectionOf(sel.anchorNode, root) };
      tip.style.display = "flex";
      tip.style.left = Math.max(8, Math.min(innerWidth - 150, r.left + r.width / 2 - 60 + scrollX)) + "px";
      tip.style.top = (r.top + scrollY - 40) + "px";
    });
    tip.addEventListener("mousedown", (e) => e.preventDefault());
    tip.querySelectorAll("button").forEach((b) => b.onclick = () => {
      if (!pending) return;
      hide();
      compose({ target, kind: b.dataset.k, quote: pending.quote, section: pending.section, done: refresh });
    });
  }

  // ------------------------------------------- a page's notes section

  async function mountConstruct(slot, c, root) {
    if (!slot) return;
    const box = document.createElement("section");
    box.className = "notes-box";
    slot.append(box);
    const up = await online();
    async function refresh() {
      const notes = (await load(true)).filter((n) => n.construct === c.id);
      const open = notes.filter((n) => n.status !== "resolved");
      const bugs = open.filter((n) => n.kind === "bug").length;
      let h = '<h2 id="notes">Notes &amp; bugs' + (open.length ? ' <small class="muted">' + open.length + " open" + (bugs ? ", " + bugs + " bug" + (bugs > 1 ? "s" : "") : "") + "</small>" : "") + "</h2>";
      if (!up) { box.innerHTML = h + OFFLINE; return; }
      h += '<p class="muted nt-help">Select any text on this page to quote it in a note or bug. Each one is saved as a Markdown file in <code>docs/wiki/notes/' + esc(c.id) + "/</code>.</p>";
      h += '<div class="filters"><button class="btn" type="button" data-k="note">+ note</button><button class="btn" type="button" data-k="bug">+ bug</button></div>';
      const sorted = open.concat(notes.filter((n) => n.status === "resolved"));
      h += sorted.length ? '<div class="nt-list">' + sorted.map((n) => itemHTML(n, false)).join("") + "</div>" : '<p class="muted">Nothing yet.</p>';
      box.innerHTML = h;
      box.querySelectorAll(".filters [data-k]").forEach((b) => b.onclick = () => compose({ target: c.id, kind: b.dataset.k, done: refresh }));
      wireToggles(box, refresh);
    }
    await refresh();
    if (up) selectionTool(root, c.id, refresh);
  }

  // Small "2 bugs" marks on construct cards.
  async function decorate(root) {
    const notes = await load();
    if (!notes.length) return;
    const open = {};
    for (const n of notes) if (n.status !== "resolved") {
      const o = open[n.construct] || (open[n.construct] = { note: 0, bug: 0 });
      o[n.kind === "bug" ? "bug" : "note"]++;
    }
    root.querySelectorAll("a.card").forEach((a) => {
      const id = new URL(a.href).searchParams.get("c"), o = open[id];
      if (!o) return;
      const chips = a.querySelector(".chips");
      if (o.bug) chips.insertAdjacentHTML("beforeend", '<span class="chip bug"><i></i>' + o.bug + " bug" + (o.bug > 1 ? "s" : "") + "</span>");
      if (o.note) chips.insertAdjacentHTML("beforeend", '<span class="chip notekind"><i></i>' + o.note + " note" + (o.note > 1 ? "s" : "") + "</span>");
    });
  }

  // -------------------------------------------------- the notes page

  async function renderAll(main, search) {
    document.title = "Notes & bugs · Construct Atlas";
    const up = await online();
    let h = '<div class="kicker">Working on the atlas</div><h1>Notes &amp; bugs</h1>';
    h += '<p class="lede">Everything written from the atlas pages: notes on ideas, and bugs in the game or in the wiki itself. Each is a Markdown file in <code>docs/wiki/notes/</code>, committed with the repository, so it can be read, fixed and resolved by anyone working in the repo, Claude included.</p>';
    if (!up) { main.innerHTML = '<div class="prose">' + h + OFFLINE + "</div>"; return; }
    h += '<div class="filters" id="nf">' +
      [["kind", "all", "All"], ["kind", "bug", "Bugs"], ["kind", "note", "Notes"]].map(([f, v, l]) => '<button class="btn' + (v === "all" ? " on" : "") + '" data-f="' + f + '" data-v="' + v + '">' + l + "</button>").join("") +
      '<span style="width:12px"></span>' +
      [["status", "open", "Open"], ["status", "resolved", "Resolved"], ["status", "all", "Any status"]].map(([f, v, l]) => '<button class="btn' + (v === "open" ? " on" : "") + '" data-f="' + f + '" data-v="' + v + '">' + l + "</button>").join("") +
      '<span style="width:12px"></span>' +
      [["about", "all", "Game & wiki"], ["about", "game", "Game bugs"], ["about", "wiki", "Wiki bugs"]].map(([f, v, l]) => '<button class="btn' + (v === "all" ? " on" : "") + '" data-f="' + f + '" data-v="' + v + '">' + l + "</button>").join("") +
      '<span style="width:12px"></span><button class="btn" type="button" id="general">+ note on the atlas</button></div><div id="nl"></div>';
    main.innerHTML = '<div class="prose" style="max-width:860px">' + h + "</div>";
    const filt = { kind: "all", status: "open", about: "all", q: "" };
    async function refresh() {
      const notes = await load(true);
      const list = main.querySelector("#nl");
      list.innerHTML = notes.length ? '<div class="nt-list">' + notes.map((n) => itemHTML(n, true)).join("") + "</div>" : '<p class="muted">No notes yet. Select text on any construct page to start one.</p>';
      wireToggles(list, refresh);
      apply();
    }
    function apply() {
      const q = filt.q.toLowerCase().trim();
      main.querySelectorAll(".nt").forEach((n) => {
        const ok = (filt.kind === "all" || n.dataset.kind === filt.kind) && (filt.status === "all" || n.dataset.status === filt.status) &&
          (filt.about === "all" || n.dataset.about === filt.about) && (!q || n.dataset.hay.includes(q));
        n.classList.toggle("hidden", !ok);
      });
    }
    main.querySelectorAll("#nf [data-f]").forEach((b) => b.onclick = () => {
      filt[b.dataset.f] = b.dataset.v;
      main.querySelectorAll('#nf [data-f="' + b.dataset.f + '"]').forEach((x) => x.classList.toggle("on", x === b));
      apply();
    });
    main.querySelector("#general").onclick = () => compose({ target: GENERAL, kind: "note", done: refresh });
    search.placeholder = "Filter notes…";
    search.addEventListener("input", () => { filt.q = search.value; apply(); });
    await refresh();
  }

  window.AtlasNotes = { mountConstruct, decorate, renderAll, compose };
})();
