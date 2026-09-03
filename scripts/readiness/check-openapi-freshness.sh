#!/usr/bin/env bash
# [AUTO] Phase 19 — OpenAPI spec freshness check
# Verifies: each docs/api/{service}.openapi.yaml was committed no earlier than
#           its corresponding backend/src/modules/{service}/ source directory.
# Usage: ./scripts/readiness/check-openapi-freshness.sh
# Exit: 0 = all specs fresh, 1 = stale spec(s) detected

set -euo pipefail

# COUNTERS ARE ASSIGNED, NOT POST-INCREMENTED. `((PASS++))` evaluates to the value BEFORE the
# increment, so the first `((PASS++))` on a zero counter returns 0 — a non-zero exit status — and
# `set -e` killed the script there. Every readiness script in this directory had it, so each one
# stopped at whichever counter first moved off zero: this one reported ONE spec and exited 1, and
# verify-production-readiness.sh ran ONE of its 31 checks. That reads like a failing gate rather
# than a gate that never ran. `VAR=$((VAR + 1))` is an assignment and always exits 0.
#
# MODULE_MAP KEYS ARE SPEC NAMES, VALUES ARE DIRECTORY NAMES, and the two differ for exactly one
# entry: the spec is `file.openapi.yaml`, the module directory is `files/`. It was mapped to
# `file`, so this check reported "source dir not found — skipping" on every run since it was
# written and never once compared that spec against its module.
#
# VALUES ARE A SPACE-SEPARATED LIST OF REPO-RELATIVE PATHS, not one directory name under
# backend/src/modules (changed 2026-09-03, product-owner decision). The one-directory model could
# not express the two documents whose code does not live in the monolith, and it got both wrong:
#
#   file  — the 10 `/files/*` routes are served by services/file-service/src/routes/files.routes.ts.
#           backend/src/modules/files/ holds annotations, legal-hold and an HTTP client to that
#           service. The gate was comparing the document against code that does not implement it.
#   ai    — the 9 documented paths are served by three Python services (§14.3 AI APIs); the backend
#           module only forwards `ai/*` and `rag/*`. It was in no map at all.
#
# Nine further documents with a live backend module were simply absent, so just over half of
# docs/api/ was gated: analytics, crm, geo, graph, master-data, safety, sync, vendor and ai.

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
API_DIR="$ROOT/docs/api"
PASS=0
FAIL=0
SKIP=0

echo "==> OpenAPI spec freshness checks"

declare -A MODULE_MAP=(
  [analytics]="backend/src/modules/analytics"
  [auth]="backend/src/modules/identity"
  [boq]="backend/src/modules/boq"
  [credential]="services/credential-service/src"
  [crm]="backend/src/modules/crm"
  [equipment]="backend/src/modules/equipment"
  [finance]="backend/src/modules/finance"
  [geo]="backend/src/modules/geo"
  [graph]="backend/src/modules/graph"
  [master-data]="backend/src/modules/master-data"
  [notification]="backend/src/modules/notification"
  [platform]="backend/src/health.controller.ts backend/src/shared/feature-flags"
  [platform-webhooks]="backend/src/modules/platform-webhook"
  [procurement]="backend/src/modules/procurement"
  [project]="backend/src/modules/project"
  [safety]="backend/src/modules/safety"
  [site-ops]="backend/src/modules/site-ops"
  [sync]="backend/src/modules/sync"
  [tenant]="backend/src/modules/tenant"
  [vendor]="backend/src/modules/vendor-portal"
  [workforce]="backend/src/modules/workforce"
  [file]="backend/src/modules/files services/file-service/src"
  [ai]="backend/src/modules/ai-proxy services/ai-gateway services/ai-ocr-pipeline services/ai-embedding-worker services/ai-transcription-pipeline"
)

# digital-twin is deliberately NOT mapped. Its code exists (services/ai-gateway/digital_twin/), but
# §14.3 records the document as "Post-MVP — Phase 24 … not created before Phase 24 begins", so the
# committed file is a contract ahead of its phase rather than a description of shipped behaviour.
# Gating it would assert the opposite. Revisit when Phase 24 starts.

for spec_name in "${!MODULE_MAP[@]}"; do
  read -ra source_paths <<<"${MODULE_MAP[$spec_name]}"
  spec_file="$API_DIR/${spec_name}.openapi.yaml"

  if [[ ! -f "$spec_file" ]]; then
    echo "  ✗ $spec_name.openapi.yaml — file missing"
    FAIL=$((FAIL + 1))
    continue
  fi

  # A mapping may name several paths; every one of them must exist, because a path that has been
  # moved or renamed silently narrows what the gate compares instead of failing.
  missing_path=""
  for sp in "${source_paths[@]}"; do
    [[ -e "$ROOT/$sp" ]] || missing_path="$sp"
  done

  if [[ -n "$missing_path" ]]; then
    echo "  ✗ $spec_name → $missing_path (mapped source path does not exist)"
    FAIL=$((FAIL + 1))
    continue
  fi

  spec_ts=$(git -C "$ROOT" log -1 --format="%ct" -- "$spec_file" 2>/dev/null || echo "0")

  # SOURCE means the code the document describes — not everything that happens to sit beside it.
  #
  # This used to be the whole module directory, so a `__tests__/` edit, a README or a fixture made
  # every document for that module stale, and the only way to clear it was to edit a document
  # nobody had a reason to change. It fired three times in a row on 2026-08-31, most clearly on
  # procurement for a change to approval-thresholds.workflow.spec.ts and nothing else.
  #
  # Excluding them cannot hide an API change: a new route means a controller edit, and a changed
  # payload means a DTO edit. Both are still in scope.
  #
  # The Python services carry their tests as `tests/` and `test_*.py` rather than `__tests__/` and
  # `*.spec.ts`, so the exclusion list names both conventions. `.venv/` needs no exclusion — it is
  # untracked, and git log only ever sees what is committed.
  #
  # TEST CONFIGURATION counts as test, not source. `pytest.ini`, `.coveragerc` and `conftest.py`
  # decide how a suite runs; none of them can change a route or a payload. This was missed when the
  # Python services were added to MODULE_MAP on 2026-09-03, and it fired the same day: adding one
  # `filterwarnings` line to four `pytest.ini` files — a fix for an anyio deprecation that had
  # nothing to do with the API — marked `ai.openapi.yaml` stale and blocked the push. Exactly the
  # failure the `*.spec.ts` exclusion above was written for, one language later.
  pathspec=()
  for sp in "${source_paths[@]}"; do
    pathspec+=("$sp")
    # A mapping may name a single file (see [platform]); the ** excludes below are meaningless
    # against one and git rejects nothing, but skipping them keeps the pathspec honest.
    if [[ -d "$ROOT/$sp" ]]; then
      pathspec+=(
        ":(exclude)$sp/**/__tests__/**"
        ":(exclude)$sp/**/*.spec.ts"
        ":(exclude)$sp/**/*.md"
        ":(exclude)$sp/**/tests/**"
        ":(exclude)$sp/**/test_*.py"
        ":(exclude)$sp/**/__pycache__/**"
        # BOTH forms, and the reason is not obvious: a pathspec's `**/` needs a literal slash on
        # each side, so `<dir>/**/pytest.ini` matches `<dir>/sub/pytest.ini` and NOT
        # `<dir>/pytest.ini`. Every one of these files lives at the service root, so the `**/` form
        # alone excluded nothing — the gate stayed red after the first attempt at this fix.
        ":(exclude)$sp/pytest.ini"
        ":(exclude)$sp/**/pytest.ini"
        ":(exclude)$sp/conftest.py"
        ":(exclude)$sp/**/conftest.py"
        ":(exclude)$sp/.coveragerc"
        ":(exclude)$sp/**/.coveragerc"
        ":(exclude)$sp/jest.config.js"
        ":(exclude)$sp/jest.integration.config.js"
        ":(exclude)$sp/jest.workflows.config.js"
      )
    fi
  done

  src_ts=$(git -C "$ROOT" log -1 --format="%ct" -- "${pathspec[@]}" 2>/dev/null || echo "0")

  if [[ "$spec_ts" == "0" && "$src_ts" == "0" ]]; then
    echo "  - $spec_name — no git history found (skipping)"
    SKIP=$((SKIP + 1))
    continue
  fi

  if [[ "$src_ts" -gt "$spec_ts" ]]; then
    # GNU date takes `-d @<epoch>`; BSD/macOS date takes `-r <epoch>`. Git Bash ships GNU date, where
    # `-r` means "read the mtime of this FILE" — given an epoch it fails, and the `|| echo` fallback
    # printed the raw seconds. Every STALE line on Windows read "spec last updated 1787563479".
    spec_date=$(date -d "@$spec_ts" '+%Y-%m-%d' 2>/dev/null || date -r "$spec_ts" '+%Y-%m-%d' 2>/dev/null || echo "$spec_ts")
    src_date=$(date -d "@$src_ts" '+%Y-%m-%d' 2>/dev/null || date -r "$src_ts" '+%Y-%m-%d' 2>/dev/null || echo "$src_ts")
    echo "  ✗ $spec_name — spec last updated $spec_date, source last updated $src_date (STALE)"
    FAIL=$((FAIL + 1))
  else
    echo "  ✓ $spec_name — spec is current"
    PASS=$((PASS + 1))
  fi
done

# Check that all spec files in docs/api/ are present
existing_specs=$(find "$API_DIR" -name "*.openapi.yaml" 2>/dev/null | wc -l | tr -d ' ')
echo ""
echo "  Spec files in docs/api/: $existing_specs"

echo ""
echo "==> Result: $PASS passed, $FAIL failed, $SKIP skipped"
[[ "$FAIL" -eq 0 ]] || exit 1
