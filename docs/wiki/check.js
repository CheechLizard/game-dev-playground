#!/usr/bin/env node
/* Headless check for the atlas: `node docs/wiki/check.js [id...]`
 *
 * Loads the manifest and every construct file the way the browser does, then
 * for each construct checks its fields, its [[links]], and runs its toy for
 * ten simulated seconds against a drawing stub, with every control swept to
 * its extremes and a few pointer events. It cannot see the drawing, so look
 * at the page too; it does catch exceptions, NaN state and broken links.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const DIR = __dirname;
const only = process.argv.slice(2);
const registry = { manifest: null, byId: {} };
const sandbox = {
  Wiki: {
    manifest(m) { registry.manifest = m; },
    construct(c) { registry.byId[c.id] = c; },
  },
  console, Math, Date, JSON,
};
sandbox.window = sandbox;
vm.createContext(sandbox);
// Shared toy cores the pages expect as globals (see assets/).
for (const f of ["sand.js"]) vm.runInContext(fs.readFileSync(path.join(DIR, "assets", f), "utf8"), sandbox, { filename: f });
vm.runInContext(fs.readFileSync(path.join(DIR, "constructs/manifest.js"), "utf8"), sandbox, { filename: "manifest.js" });

let failures = 0;
const fail = (id, msg) => { failures++; console.log("  FAIL " + id + ": " + msg); };

const systems = registry.manifest.systems;
const ids = [];
for (const sy of systems) {
  if (!sy.id || !sy.name || !sy.color || !sy.overview || !(sy.groups || []).length) fail(sy.id || "?", "system needs id, name, color, overview and groups");
  for (const g of sy.groups || []) for (const id of g.constructs) {
    if (ids.includes(id)) fail(id, "listed twice in the manifest");
    ids.push(id);
  }
}
const systemIds = new Set(systems.map((sy) => sy.id));
for (const id of ids) {
  const file = path.join(DIR, "constructs", id + ".js");
  if (!fs.existsSync(file)) { fail(id, "listed in manifest but no file"); continue; }
  try { vm.runInContext(fs.readFileSync(file, "utf8"), sandbox, { filename: id + ".js" }); }
  catch (e) { fail(id, "does not load: " + e.message); }
  if (!registry.byId[id]) fail(id, "file does not register id " + id);
}
for (const f of fs.readdirSync(path.join(DIR, "constructs"))) {
  const id = f.replace(/\.js$/, "");
  if (f.endsWith(".js") && !f.startsWith("_") && id !== "manifest" && !ids.includes(id)) fail(id, "file exists but is not in the manifest");
}

// A drawing stub: every helper exists and does nothing, but numeric arguments are checked.
function stubGraphics() {
  const C = new Proxy({}, { get: () => "#888888" });
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ width: 10 })), set: (t, k, v) => { t[k] = v; return true; } });
  const g = { C, ctx, w: 384, h: 216, scale: 1 };
  return new Proxy(g, {
    get(t, k) {
      if (k in t) return t[k];
      return (...args) => {
        for (const a of args) if (typeof a === "number" && !Number.isFinite(a)) throw new Error("g." + String(k) + " got a non-finite number");
        return 10;
      };
    },
  });
}
function rng(seed) {
  let a = seed >>> 0 || 1;
  const r = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  r.range = (lo, hi) => lo + (hi - lo) * r(); r.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * r()); r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  return r;
}
const kit = { rng, clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)), lerp: (a, b, t) => a + (b - a) * t, dist: (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay), TAU: Math.PI * 2 };

function runToy(c, P) {
  const toy = c.toy, S = {};
  const k = Object.assign({ rand: rng(toy.seed || 7) }, kit);
  const g = stubGraphics();
  toy.init && toy.init(S, P, k);
  const w = toy.w || 384, h = toy.h || 216;
  for (let i = 0; i < 600; i++) {
    if (toy.update) toy.update(S, P, 1 / 60, k);
    if (toy.pointer && i % 97 === 0) {
      const x = (i * 37) % w, y = (i * 53) % h;
      toy.pointer({ type: "down", x, y, down: true }, S, P, k);
      toy.pointer({ type: "move", x: x + 5, y: y + 3, down: true }, S, P, k);
      toy.pointer({ type: "up", x: x + 5, y: y + 3, down: false }, S, P, k);
    }
    if (i % 60 === 0) { toy.draw(g, S, P, k); if (toy.readout) toy.readout(S, P); }
  }
  for (const b of (toy.controls || []).filter((x) => x.type === "button")) b.press(S, P, k);
  toy.draw(g, S, P, k);
  for (const [key, v] of Object.entries(S)) if (typeof v === "number" && !Number.isFinite(v)) throw new Error("state " + key + " is " + v);
}

const linkRe = /\[\[(@?[a-z0-9-]+)/g;
for (const id of ids) {
  const c = registry.byId[id];
  if (!c || (only.length && !only.includes(id))) continue;
  for (const f of ["name", "origin", "status", "summary", "intent", "how"]) if (!c[f]) fail(id, "missing " + f);
  if (c.family) fail(id, "has a family field; placement belongs in manifest.js");
  if (!["built", "partial", "spec", "superseded"].includes(c.status)) fail(id, "bad status " + c.status);
  if (!["playground", "shmuprouge", "both"].includes(c.origin)) fail(id, "bad origin " + c.origin);
  const text = JSON.stringify(c);
  for (const m of text.matchAll(linkRe)) if (m[1][0] === "@" ? !systemIds.has(m[1].slice(1)) : (!registry.byId[m[1]] && !ids.includes(m[1]))) console.log("  note " + id + ": links to [[" + m[1] + "]], which has no page yet");
  for (const r of c.related || []) { const rid = typeof r === "string" ? r : r.id; if (!ids.includes(rid)) console.log("  note " + id + ": related " + rid + " has no page yet"); }
  for (const s of c.shots || []) if (!fs.existsSync(path.join(DIR, s.src))) fail(id, "missing screenshot " + s.src);
  if (!c.toy) continue;
  if (typeof c.toy.draw !== "function") { fail(id, "toy has no draw"); continue; }
  const base = {};
  for (const ctl of c.toy.controls || []) if (ctl.key) base[ctl.key] = ctl.value;
  const variants = [Object.assign({}, base)];
  for (const ctl of c.toy.controls || []) {
    if (ctl.type === "range") { variants.push(Object.assign({}, base, { [ctl.key]: ctl.min })); variants.push(Object.assign({}, base, { [ctl.key]: ctl.max })); }
    if (ctl.type === "toggle") variants.push(Object.assign({}, base, { [ctl.key]: !ctl.value }));
    if (ctl.type === "select") for (const [v] of ctl.options) variants.push(Object.assign({}, base, { [ctl.key]: v }));
  }
  for (const P of variants) {
    try { runToy(c, P); }
    catch (e) { fail(id, "toy throws with " + JSON.stringify(P) + ": " + (e.stack || e).toString().split("\n").slice(0, 3).join(" | ")); break; }
  }
}
// System overviews link too.
for (const sy of systems) for (const m of JSON.stringify(sy).matchAll(linkRe)) {
  if (m[1][0] === "@" ? !systemIds.has(m[1].slice(1)) : !ids.includes(m[1])) fail(sy.id, "overview links to unknown [[" + m[1] + "]]");
}

// Notes: every folder must name a construct, a system, or _atlas.
const notesDir = path.join(DIR, "notes");
let noteCount = 0;
if (fs.existsSync(notesDir)) for (const d of fs.readdirSync(notesDir, { withFileTypes: true })) {
  if (!d.isDirectory()) continue;
  if (d.name !== "_atlas" && !ids.includes(d.name) && !systemIds.has(d.name)) fail(d.name, "notes folder for an unknown construct or system");
  for (const f of fs.readdirSync(path.join(notesDir, d.name))) {
    if (!/^\d{8}-\d{6}-[a-z0-9-]*\.md$/.test(f)) { fail(d.name, "unexpected file in notes: " + f); continue; }
    const t = fs.readFileSync(path.join(notesDir, d.name, f), "utf8");
    if (!/^---\n[\s\S]*?kind: (note|bug)[\s\S]*?status: (open|resolved)[\s\S]*?\n---\n/.test(t)) fail(d.name, f + " has no valid front matter");
    noteCount++;
  }
}

console.log((failures ? failures + " failure(s)" : "ok") + " — " + ids.length + " constructs in " + systems.length + " systems, " + noteCount + " notes");
process.exit(failures ? 1 : 0);
