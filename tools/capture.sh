#!/usr/bin/env bash
# Take a screenshot of the game without a human at the keyboard.
#
#   tools/capture.sh hud.png --at 8 --seed 7
#   tools/capture.sh editor.png --editor Debug
#   tools/capture.sh zoo.png --mode zoo --press next --press next
#
# The first argument is the output; a bare name lands in captures/. Everything
# after it is passed to the game -- see shared/framework/capture.lua for the
# flags. Runs from the repo root because profiles and captures are written
# relative to the working directory.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

if [ $# -lt 1 ] || [ "${1#--}" != "$1" ]; then
  echo "usage: tools/capture.sh <out.png> [flags...]" >&2
  exit 2
fi

out="$1"; shift
case "$out" in
  *.png) ;;
  *) out="$out.png" ;;
esac
case "$out" in
  */*) ;;
  *) out="captures/$out" ;;
esac

for a in "$@"; do
  if [ "$a" = "--hold" ]; then
    echo "--hold keeps the window open, so it is for running the game yourself:" >&2
    echo "  love . --capture $out --hold" >&2
    exit 2
  fi
done

timeout="${CAPTURE_TIMEOUT:-60}"

rm -f "$out"

# LÖVE has no headless mode, so a run that never reaches its frame would hang
# an unattended agent. Kill it rather than block.
love . --capture "$out" "$@" &
pid=$!
( sleep "$timeout"; kill -9 "$pid" 2>/dev/null ) &
watchdog=$!
set +e
wait "$pid"
status=$?
set -e
kill "$watchdog" 2>/dev/null || true

if [ ! -f "$out" ]; then
  echo "capture failed: no $out (love exited $status)" >&2
  exit 1
fi
echo "$root/$out"
