#!/usr/bin/env bash
# kill-stale-dev.sh — remove dev processes left over from previous `make dev` runs.
#
# Why: `turbo run dev` runs every dev task as a `persistent: true` child (tsc --watch,
# next dev, nest start --watch, ts-node). When turbo exits abnormally — which it does
# whenever ONE persistent task crashes — it does not always reap these children. They
# orphan (reparent to launchd/init) and survive. Across repeated failed runs they
# accumulate: duplicate `tsc --watch` processes then fight over the same dist/ and
# *.tsbuildinfo, stale servers hold ports, and the next `make dev` collapses with a
# confusing cascade of `[ELIFECYCLE] Command failed` across multiple task boxes.
#
# This kills those leftovers BEFORE a new run. It is scoped strictly to processes whose
# command line references THIS repo's package dirs, so dev servers from other projects
# (or other repos also using turbo) are never touched.
#
# Written for bash 3.2 (macOS default) — no mapfile / associative arrays.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
self=$$

cyan() { printf '\033[36m%s\033[0m\n' "$1"; }

# Dev runners launched by turbo all carry this repo's path in their argv (the node
# binary path lives under <repo>/<workspace-dir>/.../node_modules/...). Anchor on the
# repo path + workspace dir so the match cannot escape this repo.
pattern="${REPO_ROOT}/(apps|packages|services|backend)/.*(tsc|next|nest|ts-node|/main)"

# Collect matching PIDs (excluding this script). Space/newline separated string —
# intentionally left unquoted on use so it word-splits into individual PIDs.
list_pids() { pgrep -f "$pattern" 2>/dev/null | grep -vx "$self" | tr '\n' ' '; }

pids="$(list_pids)"
if [ -z "${pids// /}" ]; then
  exit 0
fi

count="$(echo "$pids" | wc -w | tr -d ' ')"
cyan "Cleaning ${count} stale dev process(es) from a previous run…"

# TERM first for a chance to flush, then KILL any stragglers.
kill -TERM $pids 2>/dev/null || true
sleep 1
survivors="$(list_pids)"
if [ -n "${survivors// /}" ]; then
  kill -KILL $survivors 2>/dev/null || true
fi
exit 0
