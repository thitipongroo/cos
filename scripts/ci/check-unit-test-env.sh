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

# Multiline-safe: `perl -0777` slurps each file whole so the pattern can span newlines. This is
# exactly what the hand-written version got wrong.
#
# WHY PERL AND NOT `grep -rzoP`. `-P` is a GNU grep extension. On macOS `grep` is BSD grep 2.6.0
# and rejects it outright ("invalid option -- P", exit 2), so under `set -e` this script died on
# this line and printed NOTHING before doing so — a FAIL with no message, on every local run of
# `verify-before-push.sh`. Perl is present on macOS (5.34.1) and on ubuntu-latest, ships the same
# PCRE syntax, and needs no `tr`/`grep -oE` post-processing because it can capture the key
# directly. `\x27` is the single quote: writing it that way keeps the program single-quotable in
# shell, with no nested-quote escaping to get wrong.
#
# It still fails loudly if perl is absent: `set -o pipefail` propagates xargs' 127 into the
# assignment and `set -e` stops there, rather than leaving KEYS empty and passing vacuously.
KEYS="$(find "$ROOT/backend/src" -name '*.ts' -print0 |
  xargs -0 perl -0777 -ne 'while (/getOrThrow(?:<[^>]*>)?\(\s*\x27([A-Z0-9_]+)\x27/g) { print "$1\n" }' |
  sort -u)"

# VACUOUS PASS GUARD. An extractor that silently matches nothing yields an empty KEYS, and the loop
# below then prints "PASSED — all 0 getOrThrow key(s) are supplied" and exits 0. That is the same
# SHAPE of failure as the hand-written grep this check replaced: it looked complete precisely
# because it found nothing to complain about. It is not hypothetical for this file either — the
# `grep -rzoP` that stood here until 2026-09-04 was one `set -e` away from it on any machine
# without GNU grep.
#
# The guard deliberately hardcodes NO expected count: a number would go stale the next time a
# module gains or loses a call, and a stale gate gets relaxed rather than fixed. It asks the one
# question that stays true — does anything call getOrThrow at all? If something does and the
# extractor returned nothing, the extractor is broken, not the tree. If genuinely nothing calls it,
# an empty set is the correct answer and this stays quiet.
#
# `|| true` because `grep -rl` exits 1 on no match and `set -o pipefail` would otherwise turn the
# legitimate zero-caller case into a crash.
CALLERS="$( { grep -rl 'getOrThrow' "$ROOT/backend/src" --include=*.ts 2>/dev/null || true; } | wc -l | tr -d ' ')"
if [[ -z "$KEYS" && "$CALLERS" != "0" ]]; then
  echo "==> Unit Tests env covers every getOrThrow key"
  echo ""
  echo "  ✗ $CALLERS file(s) under backend/src call getOrThrow, but the extractor returned no key."
  echo "    A broken extractor, not a clean tree. Left alone this check would report"
  echo "    'PASSED — all 0 getOrThrow key(s) are supplied' and gate nothing at all."
  echo "    Fix the perl pattern above before trusting any result from this script."
  exit 1
fi

# The unit-tests job's env block: from `unit-tests:` to the first `steps:` after it.
ENV_BLOCK="$(awk '/^  unit-tests:/{f=1} f&&/^    steps:/{exit} f' "$WORKFLOW")"

# A key may instead be set by the spec that needs it. That is not a loophole — for a variable read
# as `process.env['X'] ?? 'default'` it is the ONLY correct place: istanbul counts `a ?? b` per
# operand, so setting such a key job-wide short-circuits the fallback and drops branch coverage
# below the QM-1 100% gate. REDIS_URL is set in app.module.spec.ts for exactly this reason.
#
# `|| true` on the first grep, and it is not cosmetic. `grep` exits 1 when it matches nothing, and
# with `set -o pipefail` that status reaches the assignment, where `set -e` kills the script — with
# NO output, because nothing has been printed yet. So the day the last `process.env['X'] =` line
# leaves the spec files, this gate stops reporting "REDIS_URL is set nowhere" and starts exiting 1
# in silence instead: a real finding replaced by an unexplained crash, in the one check written to
# stop exactly that. An empty SPEC_SET is the correct value for "no spec sets any key" and the loop
# below already handles it. Found 2026-09-04 while testing the vacuous-pass guard above against a
# tree with no spec files.
SPEC_SET="$( { grep -rhoE "process\.env\['[A-Z0-9_]+'\]\s*=" "$ROOT/backend/src" --include=*.spec.ts 2>/dev/null || true; } |
  grep -oE "'[A-Z0-9_]+'" | tr -d "'" | sort -u || true)"

MISSING=()
CHECKED=0
echo "==> Unit Tests env covers every getOrThrow key"
echo ""

for KEY in $KEYS; do
  CHECKED=$((CHECKED + 1))
  if echo "$ENV_BLOCK" | grep -qE "^\s+$KEY:"; then
    echo "  ✓ $KEY — workflow job env"
  elif echo "$SPEC_SET" | grep -qxF "$KEY"; then
    echo "  ✓ $KEY — set by the spec that needs it"
  else
    echo "  ✗ $KEY — read by a module factory, but set neither in the unit-tests job nor in a spec"
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
