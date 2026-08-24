#!/usr/bin/env bash
# [AUTO] Architectural fitness function — loading states go through <LoadingState /> (Rule 40)
#
# Enforces the machine-checkable half of Rule 40: no screen may hand-roll a loading indicator when
# the specified component (§32.7 "Loading State"; ADR-055) exists. Canonical component:
#   apps/mobile/src/components/LoadingState.tsx   variants widget | list | ai | micro
#   apps/web/src/components/ui/LoadingState.tsx   variants widget | table | ai | micro
#
# WHY THIS EXISTS
#   On 2026-08-17 a sweep found 24 hand-rolled loading indicators that had accumulated AFTER
#   <LoadingState /> was specified: 22 raw <ActivityIndicator> in apps/mobile and 2 bare
#   `animate-pulse bg-gray-100` blocks in apps/web. Web's <LoadingState /> had ZERO production
#   consumers at that point — its only importer was the dev component-preview page, while ~35 list
#   pages rendered a plain "Loading…" line. Nothing compared the specified component against what
#   screens actually rendered. This script is that comparison.
#
# WHAT IT CANNOT SEE
#   Two of the four failure classes in that sweep are invisible to grep: a loading state rendered as
#   a line of text (`<p>{t('common.loading')}</p>`) and one rendered as a placeholder glyph
#   (`<span>…</span>`). Neither has a signature to match — they are ordinary markup. Rule 40(b) in
#   context/00_master_construction_os.md is the half that covers them, and it is why this script is
#   not the whole answer. Do not read a PASS here as "every loading state is conformant".
#
# Usage: ./scripts/ci/check-loading-state.sh
# Exit:  0 = no hand-rolled indicator found, 1 = at least one found

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
FAIL=0

echo "==> Loading-state fitness function (Rule 40)"
echo "    canonical: docs/specifications/32-implementation-specifications.md §32.7; ADR-055"
echo ""

# ── mobile ────────────────────────────────────────────────────────────────────────────────────────
# React Native's own spinner. There is no legitimate remaining use: <LoadingState variant="micro" />
# covers the inline/in-button case, and `tone` / `color` cover the two inks a host may need.
echo "--> apps/mobile: no raw <ActivityIndicator>"
MOBILE_HITS="$(grep -rn "ActivityIndicator" "$ROOT/apps/mobile/src" --include=*.tsx --include=*.ts || true)"
if [[ -n "$MOBILE_HITS" ]]; then
  echo "$MOBILE_HITS" | while IFS= read -r line; do
    echo "    ✗ ${line#"$ROOT/"}"
  done
  echo ""
  echo "    Use <LoadingState /> instead (§32.7; ADR-055):"
  echo "      inline / inside a button  → variant=\"micro\"  (tone=\"onPrimary\" on a filled CTA,"
  echo "                                                     color={accent} for a per-action accent)"
  echo "      a list or feed            → variant=\"list\""
  echo "      a card / tile / dashboard → variant=\"widget\""
  echo "      an AI job                 → variant=\"ai\""
  echo "    A region that reveals content when it settles goes in <LoadingBoundary>, not a ternary."
  FAIL=$((FAIL + 1))
fi

# ── web ───────────────────────────────────────────────────────────────────────────────────────────
# Tailwind's animation utilities are how a hand-rolled skeleton or spinner is written on web. They
# are allowed ONLY inside the component that IS the specified loading state, plus the pre-auth
# verification screen, which §32.7 "Exception 1" gives its own mockup
# (mockup/desktop/imp_001_authen/04_verification_loading_web) and its own motif.
echo "--> apps/web: no hand-rolled skeleton / spinner outside <LoadingState />"
WEB_ALLOW='apps/web/src/components/ui/LoadingState.tsx|apps/web/src/app/post-login/page.tsx'
WEB_HITS="$(grep -rnE "animate-(pulse|spin|ping)" "$ROOT/apps/web/src" --include=*.tsx --include=*.ts \
  | sed "s|^$ROOT/||" | grep -Ev "^($WEB_ALLOW):" || true)"
if [[ -n "$WEB_HITS" ]]; then
  echo "$WEB_HITS" | while IFS= read -r line; do
    echo "    ✗ $line"
  done
  echo ""
  echo "    Use <LoadingState /> instead (§32.7; ADR-055):"
  echo "      inline / inside a button  → variant=\"micro\""
  echo "      a data table              → variant=\"table\" columns={columns.length}"
  echo "      a card / tile / dashboard → variant=\"widget\""
  echo "      an AI job                 → variant=\"ai\""
  echo "    If this really is not a loading state, add the file to WEB_ALLOW with the reason."
  FAIL=$((FAIL + 1))
fi

echo ""
if [[ $FAIL -gt 0 ]]; then
  echo "FAILED — hand-rolled loading indicator(s) found; see Rule 40"
  exit 1
fi

echo "PASSED — every loading indicator goes through <LoadingState />"
echo "         (text-only and placeholder loading states are NOT machine-checkable — Rule 40(b))"
exit 0
