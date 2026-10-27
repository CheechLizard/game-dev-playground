# Atlas notes and bugs

Notes and bug reports written from the Construct Atlas pages. The atlas server
(`python3 docs/wiki/server.py`) writes them here; each is one Markdown file, so
they are committed with the repository and can be read without the server.

```
notes/<target>/<YYYYMMDD-HHMMSS>-<slug>.md
```

`<target>` is a construct id (`constructs/<id>.js`), a system id from
`constructs/manifest.js`, or `_atlas` for a note on the atlas as a whole.

```markdown
---
kind: bug            # note | bug
status: open         # open | resolved
construct: crowd-separation
section: How it works   # the heading the quoted text sat under
about: game          # bugs only: game (the playground or ShmupRouge code) | wiki (the atlas itself)
created: 2026-10-26T10:22:01
updated: 2026-10-27T09:01:44   # when the status last changed
---

# One-line title

> The text quoted from the page, if any.

Details, as written.
```

## Working from them

- An open `bug` with `about: game` is a defect report against the game code the
  construct page describes; its page's "Where it lives" section names the files.
- An open `bug` with `about: wiki` is a defect in the atlas page itself.
- A `note` is an idea, question or observation. Promote a lasting one into the
  construct page (a spark, an open question, a correction) and resolve the note.
- Resolve a note from the page, or by changing `status: open` to
  `status: resolved` in its file. Keep resolved notes: they are the history.
