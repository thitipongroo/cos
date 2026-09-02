#!/usr/bin/env bash
# Every file in .claude/rules/ declares where it is indexed, in the line
#   Indexed in: `<file>` §<section>
# This script proves that index file exists, contains that section, and contains a
# row pointing back at the rule file.
#
# Why it exists: on 2026-09-02 the Quality Mandates, the path-triggered Rules and
# the master's four cross-cutting specifications moved OUT of context.md and
# context/00_master_construction_os.md into .claude/rules/, so they load when a file
# they govern is edited rather than on every session. That only works while the
# index still points at them. An unreferenced rule file is invisible to anyone
# reading the index, and a dangling index row sends a reader to nothing.
#
# WHAT THIS DOES NOT DO: it does not read the rule text. It cannot tell whether the
# numbers inside still agree with docs/specifications/. That is Rule 37's job, and
# Rule 37 names .claude/rules/ among its grep targets for exactly this reason.
#
# Usage: bash scripts/ci/check-claude-rules-mirror.sh

set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
RULES="$ROOT/.claude/rules"

FAIL=0
CHECKED=0
UNINDEXED=()

echo "==> .claude/rules index check"
echo ""

if [[ ! -d "$RULES" ]]; then
  echo "    $RULES does not exist — nothing to check"
  exit 0
fi

fail() {
  printf '  \033[31mFAIL\033[0m  %s\n        %s\n' "$1" "$2"
  FAIL=$((FAIL + 1))
}

shopt -s nullglob
for f in "$RULES"/*.md; do
  base="$(basename "$f")"
  rel="${f#"$ROOT/"}"

  line=$(grep -m1 '^Indexed in: ' "$f" 2>/dev/null || true)
  if [[ -z "$line" ]]; then
    # A rule written here in the first place, rather than moved here, has no index
    # row to check. Report it so it is visible; do not fail on it.
    UNINDEXED+=("$rel")
    continue
  fi

  index_file=$(printf '%s' "$line" | sed -n 's/^Indexed in: `\([^`]*\)`.*/\1/p')
  section=$(printf '%s' "$line" | sed -n 's/^Indexed in: `[^`]*` §\(.*\)$/\1/p')

  if [[ -z "$index_file" || -z "$section" ]]; then
    fail "$rel" "cannot parse: $line"
    continue
  fi

  CHECKED=$((CHECKED + 1))

  if [[ ! -f "$ROOT/$index_file" ]]; then
    fail "$rel" "index file does not exist: $index_file"
    continue
  fi

  if ! grep -qF -- "$section" "$ROOT/$index_file"; then
    fail "$rel" "section not found in $index_file: $section"
    continue
  fi

  # The index must actually point back here, by path.
  if ! grep -qF -- ".claude/rules/$base" "$ROOT/$index_file"; then
    fail "$rel" "$index_file has no row pointing to .claude/rules/$base"
    continue
  fi

  printf '  \033[32mPASS\033[0m  %-38s indexed in %s §%s\n' "$base" "$index_file" "$section"
done
shopt -u nullglob

# The phase files are the other half of the same move. Prove the map covers them.
PHASES="$ROOT/context/phases"
INDEX="$ROOT/.claude/skills/phase-index/SKILL.md"
echo ""
if [[ -d "$PHASES" && -f "$INDEX" ]]; then
  n=0
  for p in "$PHASES"/*.md; do
    n=$((n + 1))
    if ! grep -qF -- "$(basename "$p")" "$INDEX"; then
      fail "context/phases/$(basename "$p")" "not listed in .claude/skills/phase-index/SKILL.md"
    fi
  done
  printf '  %d phase file(s) checked against the phase index\n' "$n"
else
  echo "  context/phases/ or the phase index is missing — skipped"
fi

if [[ ${#UNINDEXED[@]} -gt 0 ]]; then
  echo ""
  echo "    Written here rather than moved here (no 'Indexed in:' line) — not an error:"
  for u in "${UNINDEXED[@]}"; do echo "      $u"; done
fi

echo ""
printf '  %d indexed rule file(s) checked · %d failure(s)\n' "$CHECKED" "$FAIL"

if [[ $FAIL -gt 0 ]]; then
  echo ""
  echo "  Either the index row was dropped — restore it — or the file was renamed,"
  echo "  in which case fix the row and the 'Indexed in:' line together. A rule nobody"
  echo "  can find from the index is a rule that will be missed."
  exit 1
fi
exit 0
