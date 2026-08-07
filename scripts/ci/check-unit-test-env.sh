#!/usr/bin/env bash
# Guard: every ConfigService.getOrThrow() key in backend/src must be supplied to the Unit Tests job.
#
# WHY THIS EXISTS
#   `AppModule › resolves every provider in every module` builds the whole injector, so every module
#   FACTORY runs. A factory calling cfg.getOrThrow('X') aborts the whole suite when X is unset, with
#   no database or broker involved. Locally the repo-root .env supplies these, so the failure only
#   ever appears in CI — which is where nobody is looking when they add the call.
#
#   This broke CI three times in a row, one key at a time: APP_DATABASE_URL (2026-08-07), then
#   REDIS_URL, then NEO4J_URI. The third one was missed by a hand-written grep that only matched a
#   single-line `getOrThrow<string>('KEY')`; graph.module.ts wraps its arguments across lines, so
#   NEO4J_URI / NEO4J_USERNAME / NEO4J_PASSWORD were invisible to it and the list looked complete
#   when it was not. Enumerating by eye does not converge — hence a check.
#
# Usage: ./scripts/ci/check-unit-test-env.sh
# Exit:  0 = every getOrThrow key is present in the workflow's unit-tests env, 1 = at least one is not

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
WORKFLOW="$ROOT/.github/workflows/ci.yml"

# Multiline-safe: -z reads the file as one record so the pattern can span newlines. This is exactly
# what the hand-written version got wrong.
KEYS="$(grep -rzoP "getOrThrow(<[^>]*>)?\(\s*'[A-Z0-9_]+'" "$ROOT/backend/src" --include=*.ts 2>/dev/null |
  tr '\0' '\n' | grep -oE "'[A-Z0-9_]+'" | tr -d "'" | sort -u)"

# The unit-tests job's env block: from `unit-tests:` to the first `steps:` after it.
ENV_BLOCK="$(awk '/^  unit-tests:/{f=1} f&&/^    steps:/{exit} f' "$WORKFLOW")"

MISSING=()
CHECKED=0
echo "==> Unit Tests env covers every getOrThrow key"
echo ""

for KEY in $KEYS; do
  CHECKED=$((CHECKED + 1))
  if echo "$ENV_BLOCK" | grep -qE "^\s+$KEY:"; then
    echo "  ✓ $KEY"
  else
    echo "  ✗ $KEY — read by a module factory but not set in the unit-tests job"
    MISSING+=("$KEY")
  fi
done

echo ""
if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "FAILED — ${#MISSING[@]} key(s) missing from the unit-tests env in .github/workflows/ci.yml:"
  for KEY in "${MISSING[@]}"; do echo "    $KEY: <dummy value — nothing connects in unit tests>"; done
  echo ""
  echo "Add them under the unit-tests job's env: block. Values are dummies; mirror .env.example shapes."
  exit 1
fi

echo "PASSED — all $CHECKED getOrThrow key(s) are supplied"
exit 0
