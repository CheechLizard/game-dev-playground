#!/usr/bin/env python3
"""The atlas server: serves the repository and saves notes and bug reports.

    python3 docs/wiki/server.py            # http://localhost:8765/docs/wiki/
    python3 docs/wiki/server.py --port 9000

Static files are served from the repository root, so the atlas can reach the
pixel fonts in shared/assets and the source files its pages link to. Notes are
written as Markdown files under docs/wiki/notes/<construct>/, one file each, so
they are committed with the repository and readable without the server. See
docs/wiki/notes/README.md for the format.

Listens on 127.0.0.1 only. Writes are accepted only from pages this server
served (same Origin), and only into docs/wiki/notes/.
"""
import argparse
import datetime as dt
import functools
import http.server
import json
import pathlib
import re
import sys

WIKI = pathlib.Path(__file__).resolve().parent
ROOT = WIKI.parent.parent
NOTES = WIKI / "notes"
CONSTRUCTS = WIKI / "constructs"

KINDS = ("note", "bug")
STATUSES = ("open", "resolved")
ABOUTS = ("game", "wiki")
ID = re.compile(r"^[a-z0-9-]{1,64}$")
FILE = re.compile(r"^\d{8}-\d{6}-[a-z0-9-]{0,48}\.md$")
LIMITS = {"title": 200, "body": 20000, "quote": 2000, "section": 120}
# Notes may also be about a system page or the atlas as a whole.
GENERAL = "_atlas"


def system_ids():
    text = (CONSTRUCTS / "manifest.js").read_text(encoding="utf-8")
    return set(re.findall(r'^\s*id: "([a-z0-9-]+)"', text, re.M))


def valid_target(target):
    if target == GENERAL:
        return True
    if not ID.match(target):
        return False
    return (CONSTRUCTS / (target + ".js")).is_file() or target in system_ids()


def one_line(value):
    return " ".join(str(value).split())


def slug(text):
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s[:48].strip("-")


def render(note):
    head = ["---"]
    for key in ("kind", "status", "construct", "section", "about", "created", "updated"):
        if note.get(key):
            head.append(f"{key}: {one_line(note[key])}")
    head.append("---")
    out = "\n".join(head) + "\n\n# " + one_line(note["title"]) + "\n"
    if note.get("quote"):
        out += "\n" + "\n".join("> " + line for line in note["quote"].strip().splitlines()) + "\n"
    if note.get("body"):
        out += "\n" + note["body"].strip() + "\n"
    return out


def parse(path):
    text = path.read_text(encoding="utf-8")
    note = {"file": path.parent.name + "/" + path.name}
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    rest = text
    if m:
        for line in m.group(1).splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                note[k.strip()] = v.strip()
        rest = text[m.end():]
    lines = rest.strip("\n").splitlines()
    title, quote, body = "", [], []
    i = 0
    while i < len(lines) and not lines[i].strip():
        i += 1
    if i < len(lines) and lines[i].startswith("# "):
        title = lines[i][2:].strip()
        i += 1
    while i < len(lines) and not lines[i].strip():
        i += 1
    while i < len(lines) and lines[i].startswith(">"):
        quote.append(lines[i][1:].lstrip())
        i += 1
    body = "\n".join(lines[i:]).strip()
    note.update(title=title, quote="\n".join(quote), body=body)
    note.setdefault("construct", path.parent.name)
    note.setdefault("status", "open")
    note.setdefault("kind", "note")
    return note


def all_notes(target=None):
    if not NOTES.is_dir():
        return []
    dirs = [NOTES / target] if target else [d for d in NOTES.iterdir() if d.is_dir()]
    out = []
    for d in dirs:
        if d.is_dir():
            out += [parse(p) for p in sorted(d.glob("*.md"))]
    return sorted(out, key=lambda n: n.get("created", ""), reverse=True)


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        if self.path.startswith("/api/"):
            sys.stderr.write("%s %s\n" % (self.command, self.path))

    def send_json(self, code, payload):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def end_headers(self):
        # The atlas is edited while it is being read; never serve a stale page.
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def same_origin(self):
        origin = self.headers.get("Origin")
        host = self.headers.get("Host", "")
        return origin is not None and re.sub(r"^https?://", "", origin) == host

    def read_json(self):
        if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
            raise ValueError("expected application/json")
        n = int(self.headers.get("Content-Length") or 0)
        if n > 64 * 1024:
            raise ValueError("too large")
        return json.loads(self.rfile.read(n) or b"{}")

    def do_GET(self):
        if self.path == "/api/health":
            return self.send_json(200, {"ok": True})
        if self.path.startswith("/api/notes"):
            q = self.path.partition("?")[2]
            target = dict(p.split("=", 1) for p in q.split("&") if "=" in p).get("construct")
            if target and not (ID.match(target) or target == GENERAL):
                return self.send_json(400, {"error": "bad construct id"})
            return self.send_json(200, {"notes": all_notes(target)})
        return super().do_GET()

    def do_POST(self):
        if self.path != "/api/notes":
            return self.send_json(404, {"error": "not found"})
        if not self.same_origin():
            return self.send_json(403, {"error": "cross-origin write refused"})
        try:
            data = self.read_json()
        except ValueError as e:
            return self.send_json(400, {"error": str(e)})
        target = str(data.get("construct", ""))
        kind = data.get("kind")
        title = one_line(data.get("title", ""))
        if not valid_target(target):
            return self.send_json(400, {"error": "unknown construct"})
        if kind not in KINDS or not title:
            return self.send_json(400, {"error": "kind and title are required"})
        note = {"kind": kind, "status": "open", "construct": target, "title": title}
        for key, limit in LIMITS.items():
            if data.get(key):
                note[key] = str(data[key])[:limit]
        if kind == "bug":
            note["about"] = data.get("about") if data.get("about") in ABOUTS else "game"
        now = dt.datetime.now().replace(microsecond=0)
        note["created"] = now.isoformat()
        folder = NOTES / target
        folder.mkdir(parents=True, exist_ok=True)
        name = now.strftime("%Y%m%d-%H%M%S") + "-" + slug(title) + ".md"
        path = folder / name
        n = 2
        while path.exists():
            path = folder / (now.strftime("%Y%m%d-%H%M%S") + "-" + slug(title)[:44] + f"-{n}.md")
            n += 1
        path.write_text(render(note), encoding="utf-8")
        return self.send_json(201, {"note": parse(path)})

    def do_PATCH(self):
        m = re.match(r"^/api/notes/([a-z0-9_-]+)/([^/]+)$", self.path)
        if not m:
            return self.send_json(404, {"error": "not found"})
        if not self.same_origin():
            return self.send_json(403, {"error": "cross-origin write refused"})
        target, name = m.groups()
        if not (ID.match(target) or target == GENERAL) or not FILE.match(name):
            return self.send_json(400, {"error": "bad note path"})
        path = NOTES / target / name
        if not path.is_file():
            return self.send_json(404, {"error": "no such note"})
        try:
            data = self.read_json()
        except ValueError as e:
            return self.send_json(400, {"error": str(e)})
        if data.get("status") not in STATUSES:
            return self.send_json(400, {"error": "status must be open or resolved"})
        note = parse(path)
        note["status"] = data["status"]
        note["updated"] = dt.datetime.now().replace(microsecond=0).isoformat()
        path.write_text(render(note), encoding="utf-8")
        return self.send_json(200, {"note": parse(path)})


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--port", type=int, default=8765)
    args = ap.parse_args()
    handler = functools.partial(Handler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    print(f"Construct Atlas: http://localhost:{args.port}/docs/wiki/   (notes in {NOTES.relative_to(ROOT)})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
