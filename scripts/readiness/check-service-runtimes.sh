#!/usr/bin/env bash
# [AUTO] Architectural fitness function — service runtime declarations vs. the repository
#
# Verifies that every runtime named in a documentation table matches the build files actually
# present in services/<name>/. Canonical table: docs/specifications/32-implementation-specifications.md
# §32.2. Mirrors checked: context/00_master_construction_os.md §DEPLOYABLE UNITS,
# docs/specifications/33-digital-twin-iot.md §Service Assignment, root README.md.
#
# WHY THIS EXISTS
#   On 2026-08-07, commit 8857bb1 added a "BIM Import Worker | Go" row to §32.2 and to the master
#   doc. The directory has never contained a .go file — the value was inferred from the three
#   *-worker rows above it. 33-digital-twin-iot.md had said Python since 2026-05-29, but it was not
#   open in that commit. One fact, three hand-maintained copies, nothing comparing any of them to
#   the repo. This script is the comparison.
#
# Usage: ./scripts/readiness/check-service-runtimes.sh
# Exit:  0 = every declaration matches disk, 1 = at least one mismatch

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
CANON="$ROOT/docs/specifications/32-implementation-specifications.md"

# Mirrors keep their own Runtime columns — they are VERIFIED against the repository, not forbidden.
# Duplication is tolerated here precisely because this script makes it machine-checked: 00_master is
# the agent execution view and §33 is read on its own, and stripping runtimes out of either would
# push a reader to a second file for a one-word fact. What is NOT tolerated is a mirror disagreeing
# with disk — that is the 8857bb1 failure.
MIRRORS=(
  "$ROOT/context/00_master_construction_os.md"
  "$ROOT/docs/specifications/33-digital-twin-iot.md"
  "$ROOT/README.md"
)

FAIL=0
CHECKED=0

echo "==> Service runtime fitness function"
echo "    canonical: docs/specifications/32-implementation-specifications.md §32.2"
echo ""

# Detect a service's real runtime from the build file it ships.
# Order matters: a Go module is unambiguous; requirements.txt marks Python; package.json marks Node.
detect_runtime() {
  local dir="$1"
  if [[ -f "$dir/go.mod" ]]; then
    echo "Go"
  elif [[ -f "$dir/requirements.txt" ]]; then
    echo "Python"
  elif [[ -f "$dir/package.json" ]]; then
    echo "Node"
  else
    echo "UNKNOWN"
  fi
}

# Map a declared runtime string to the same vocabulary detect_runtime returns.
# The tables legitimately use framework names (FastAPI, Fastify, NestJS) — those still identify a
# language runtime, which is what is verifiable from disk.
normalize_declared() {
  local raw="$1"
  case "$raw" in
  *Go*) echo "Go" ;;
  *Python* | *FastAPI*) echo "Python" ;;
  *Node* | *Fastify* | *NestJS*) echo "Node" ;;
  *) echo "UNKNOWN" ;;
  esac
}

for SERVICE_DIR in "$ROOT"/services/*/; do
  SERVICE="$(basename "$SERVICE_DIR")"
  ACTUAL="$(detect_runtime "$SERVICE_DIR")"

  if [[ "$ACTUAL" == "UNKNOWN" ]]; then
    echo "  ✗ $SERVICE — no go.mod, requirements.txt or package.json; runtime undetectable"
    FAIL=$((FAIL + 1))
    continue
  fi

  # Canonical table row: "| BIM Import Worker (`services/bim-import-worker/`) | Python | ... |"
  ROW="$(grep -F "services/$SERVICE/" "$CANON" | grep -m1 '^|' || true)"
  if [[ -z "$ROW" ]]; then
    echo "  ✗ $SERVICE — not listed in the canonical §32.2 table (actual runtime: $ACTUAL)"
    FAIL=$((FAIL + 1))
    continue
  fi

  DECLARED_RAW="$(echo "$ROW" | awk -F'|' '{print $3}' | xargs)"
  DECLARED="$(normalize_declared "$DECLARED_RAW")"
  CHECKED=$((CHECKED + 1))

  if [[ "$DECLARED" != "$ACTUAL" ]]; then
    echo "  ✗ $SERVICE — §32.2 declares '$DECLARED_RAW' ($DECLARED); disk says $ACTUAL"
    FAIL=$((FAIL + 1))
  else
    echo "  ✓ $SERVICE — $ACTUAL"
  fi

  # Mirrors must not contradict the canonical value. A mirror that names a DIFFERENT runtime for
  # this service is the exact failure mode of 8857bb1.
  #
  # Only STRUCTURED rows declare a runtime:
  #   markdown table row   -> starts with '|'   (33-digital-twin-iot, README tables)
  #   ASCII box table row  -> starts with '│'   (00_master §DEPLOYABLE UNITS)
  #   README structure line -> '  <service>/   — <Runtime> ...'
  # Prose is NOT a declaration. Matching any line that merely mentions a service and a language
  # together produced a false positive on 00_master:4190 — a paragraph about OTel head-sampling
  # reading "(services/ai-gateway/otel.py) or Node (@cos/tracing)". A fitness function that cries
  # wolf gets switched off, so the match is deliberately narrow.
  DISPLAY="${SERVICE//-/ }"
  for MIRROR in "${MIRRORS[@]}"; do
    [[ -f "$MIRROR" ]] || continue
    ROWS="$(grep -E "^[|│]|^  $SERVICE/" "$MIRROR" | grep -iE "$SERVICE|$DISPLAY" || true)"
    [[ -n "$ROWS" ]] || continue

    WRONG=""
    for CANDIDATE in Go Python Node; do
      [[ "$CANDIDATE" == "$ACTUAL" ]] && continue
      if echo "$ROWS" | grep -qE "\b$CANDIDATE\b"; then
        WRONG="$CANDIDATE"
        break
      fi
    done
    if [[ -n "$WRONG" ]]; then
      echo "    ✗ mirror ${MIRROR#"$ROOT/"} names '$WRONG' for $SERVICE (actual: $ACTUAL)"
      FAIL=$((FAIL + 1))
    fi
  done
done

echo ""
if [[ $FAIL -gt 0 ]]; then
  echo "FAILED — $FAIL mismatch(es) across $CHECKED declared service(s)"
  echo "Fix docs/specifications/32-implementation-specifications.md §32.2 first, then propagate."
  exit 1
fi

echo "PASSED — $CHECKED service runtime declaration(s) match the repository"
exit 0
