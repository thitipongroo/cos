#!/usr/bin/env bash
# Every OpenAPI document must be structurally valid, under `recommended-strict` (redocly.yaml).
#
# WHY THIS EXISTS. On 2026-08-24 a validity pass found 155 problems across the committed documents
# while `check-openapi-freshness.sh` — the only OpenAPI gate at the time — reported them all fresh.
# Freshness answers "was this touched after its code"; it says nothing about whether the file means
# what it appears to mean. The 155 included:
#
#   102 × `nullable: true`  — OpenAPI 3.0 syntax in files declaring 3.1, where the keyword was
#                             REMOVED. A 3.1 validator does not warn; it treats it as unknown and
#                             the field as NON-nullable, so a generated client rejects a null the
#                             API really sends.
#    30 × dangling $ref     — site-ops.openapi.yaml had its shared `responses` block nested under
#                             `paths:` instead of `components:`, so `#/components/responses/…`
#                             resolved to nothing. Every reference in the file, since it was written.
#    38 × no security       — finance.openapi.yaml declared no securitySchemes at all: nothing in it
#                             said the API needs a token.
#    16 × missing description on a response, which is a REQUIRED field.
#
# WARNINGS ARE FAILURES here (product-owner decision, 2026-08-24). `recommended-strict` promotes the
# recommended ruleset to error severity, so redocly's own exit status carries the verdict and this
# script does not have to parse output to decide.
#
# THE ONE EXCEPTION, and it is one file wide: digital-twin.openapi.yaml is linted with
# `no-unused-components` skipped. Its `StateSource` enum is unused in that document and real
# everywhere else — `digital_twin.twin_states.source` and `twin.state.updated.v1` both have it —
# because Phase 24 has no backend module yet (§14.3: "not created before Phase 24 begins").
# Deleting vocabulary out of a contract that has not shipped is not a fix.
#
# Two rules are OFF in redocly.yaml rather than satisfied — `info-license` and `no-ambiguous-paths`.
# The reasoning is recorded there, next to the switch.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

echo "==> OpenAPI document validity (redocly, recommended-strict)"

mapfile -t ALL < <(ls docs/api/*.openapi.yaml)
if [[ ${#ALL[@]} -eq 0 ]]; then
  echo "  ✗ no OpenAPI documents found under docs/api/ — the glob is wrong, not the repository"
  exit 1
fi

# PER-FILE EXCEPTIONS. Each entry is one document and the one rule it is excused from, with the
# reason recorded beside it. Nothing else is skipped, and the list is deliberately awkward to grow.
#
#   digital-twin  no-unused-components
#     `StateSource` is unused in that document and real everywhere else — see the header above.
#
#   credential    operation-4xx-response
#     `GET /health` on credential-service genuinely returns no 4xx. `isPublicPath` exempts exactly
#     this route from auth, so no 401 is reachable, and it is registered BEFORE the rate limiter so
#     no 429 is either — deliberately, because a throttled liveness probe fails a healthy container
#     under exactly the load that makes it matter. Every other route in that document carries a 429.
#     The only ways to satisfy the rule here are to invent a status the service never sends or to
#     delete a route that exists; redocly.yaml states the principle: a gate that is passed by
#     inventing is worse than no gate.
declare -A SKIP_RULE=(
  [digital-twin]="no-unused-components"
  [credential]="operation-4xx-response"
)

STRICT=()
for f in "${ALL[@]}"; do
  base="$(basename "$f" .openapi.yaml)"
  [[ -v "SKIP_RULE[$base]" ]] || STRICT+=("$f")
done

FAILED=0

# Everything except the excepted files, with no rule skipped.
if ! npx --no-install redocly lint "${STRICT[@]}"; then
  FAILED=1
fi

# Each excepted file on its own, with its single documented skip.
for base in "${!SKIP_RULE[@]}"; do
  doc="docs/api/${base}.openapi.yaml"
  if [[ ! -f "$doc" ]]; then
    echo "  ✗ $doc is excused from ${SKIP_RULE[$base]} but does not exist — stale exception"
    FAILED=1
    continue
  fi
  if ! npx --no-install redocly lint "$doc" --skip-rule "${SKIP_RULE[$base]}"; then
    FAILED=1
  fi
done

if [[ $FAILED -ne 0 ]]; then
  echo ""
  echo "  ✗ at least one document is invalid. Warnings count as failures here — see redocly.yaml"
  echo "    for the two rules that are deliberately off and why."
  exit 1
fi

echo "  ✓ ${#ALL[@]} documents valid, warnings included"
