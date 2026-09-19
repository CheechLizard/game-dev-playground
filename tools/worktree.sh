#!/usr/bin/env bash
# Create a git worktree for <branch> as a sibling of this repo.
#
# Worktrees must not live inside the repo: `love .` treats the whole directory
# tree as the game source, so a nested checkout would get scanned and packaged.
set -euo pipefail

branch="${1:-}"
if [ -z "$branch" ]; then
  echo "usage: tools/worktree.sh <branch>" >&2
  exit 2
fi

root="$(git rev-parse --show-toplevel)"
slug="$(printf '%s' "$branch" | tr '/' '-')"
dest="$(dirname "$root")/$(basename "$root")-worktrees/$slug"

if [ -e "$dest" ]; then
  echo "already exists: $dest" >&2
  exit 1
fi

mkdir -p "$(dirname "$dest")"

if git show-ref --verify --quiet "refs/heads/$branch"; then
  git worktree add "$dest" "$branch"
else
  git worktree add -b "$branch" "$dest" main
fi

echo "$dest"
