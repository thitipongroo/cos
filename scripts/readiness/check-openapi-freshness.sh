#!/usr/bin/env bash
# [AUTO] Phase 19 — OpenAPI spec freshness check
# Verifies: each docs/api/{service}.openapi.yaml was committed no earlier than the files that DEFINE
#           its API — controllers, DTOs, route modules (see CONTRACT FILES below).
# Usage: ./scripts/readiness/check-openapi-freshness.sh
#        OPENAPI_FRESHNESS_REV=<rev> …   reads that revision's history instead of HEAD (default HEAD) —
#                                        how the gate itself is checked against a past state. The
#                                        file-existence checks still read the working tree.
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
REV="${OPENAPI_FRESHNESS_REV:-HEAD}"
if ! git -C "$ROOT" rev-parse --verify -q "$REV^{commit}" >/dev/null; then
  echo "OPENAPI_FRESHNESS_REV is not a commit: $REV" >&2
  exit 1
fi
API_DIR="$ROOT/docs/api"
PASS=0
FAIL=0

echo "==> OpenAPI spec freshness checks"

# NOT AN ASSOCIATIVE ARRAY, and that is the point. `declare -A` is bash 4; `#!/usr/bin/env bash`
# resolves to /bin/bash 3.2.57 on macOS, where `verify-before-push.sh` runs this before a push.
# The gate died on this very line there — "analytics: unbound variable" — so it reported FAIL on
# every local push while passing in CI, which is the "gate that lies" failure one shell down.
#
# FORMAT: one entry per line, "<spec name> <space-separated repo-relative source paths>". The name
# is everything up to the FIRST space; the alignment padding that follows is absorbed by `read -ra`
# word splitting, so it costs nothing. Twenty-five entries: the twenty-three of the associative array
# this replaced on 2026-09-04, unchanged, plus central-prices and platform-settings (2026-09-15, R17).
# Iteration is now in source order rather than
# `${!MODULE_MAP[@]}`'s undefined order, so the output is stable run to run.
MODULE_MAP_ENTRIES=(
  "analytics         backend/src/modules/analytics backend/src/modules/analytics/analytics.request.ts"
  "auth              backend/src/modules/identity"
  "boq               backend/src/modules/boq"
  "central-prices    backend/src/modules/central-prices backend/src/modules/central-prices/central-price-rows.ts backend/src/modules/central-prices/central-price-upload.ts"
  "credential        services/credential-service/src services/credential-service/src/main.ts"
  "crm               backend/src/modules/crm"
  "equipment         backend/src/modules/equipment"
  "finance           backend/src/modules/finance"
  "geo               backend/src/modules/geo"
  "graph             backend/src/modules/graph"
  "master-data       backend/src/modules/master-data"
  "notification      backend/src/modules/notification"
  "platform          backend/src/health.controller.ts backend/src/shared/feature-flags"
  "platform-settings backend/src/modules/platform-settings"
  "platform-webhooks backend/src/modules/platform-webhook"
  "procurement       backend/src/modules/procurement backend/src/modules/procurement/vendor-classification.ts"
  "project           backend/src/modules/project backend/src/modules/tasks"
  "safety            backend/src/modules/safety"
  "site-ops          backend/src/modules/site-ops"
  "sync              backend/src/modules/sync"
  "tenant            backend/src/modules/tenant"
  "vendor            backend/src/modules/vendor-portal"
  "workforce         backend/src/modules/workforce"
  "file              backend/src/modules/files services/file-service/src services/file-service/src/main.ts"
  "ai                backend/src/modules/ai-proxy services/ai-gateway services/ai-ocr-pipeline services/ai-embedding-worker services/ai-transcription-pipeline services/ai-gateway/intent/parse.py services/ai-gateway/usage.py"
)

# SINGLE FILES IN A MAPPING (2026-11-15) are contract files the patterns below cannot name generally:
# the Fastify services' main.ts (they mount the routes and the prefix — a `**/main.ts` glob would also take
# file-service's workers/main.ts, which serves nothing), and helpers whose values ARE documented payload:
# ai-gateway intent/parse.py (the /ai/intent enum) and usage.py (alertLevel), procurement's
# vendor-classification.ts (the `category` query enum), central-prices' CSV columns and upload body,
# analytics.request.ts (the dateRange query all three analytics controllers share). `tasks` serves the
# /tasks and /projects/{id}/tasks routes project.openapi.yaml documents; it was in no mapping at all.
#
# digital-twin is deliberately NOT mapped. Its code exists (services/ai-gateway/digital_twin/), but
# §14.3 records the document as "Post-MVP — Phase 24 … not created before Phase 24 begins", so the
# committed file is a contract ahead of its phase rather than a description of shipped behaviour.
# Gating it would assert the opposite. Revisit when Phase 24 starts.

for entry in "${MODULE_MAP_ENTRIES[@]}"; do
  spec_name="${entry%% *}"
  read -ra source_paths <<<"${entry#* }"
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

  spec_ts=$(git -C "$ROOT" log -1 --format="%ct" "$REV" -- "$spec_file" 2>/dev/null || echo "0")
  [[ -n "$spec_ts" ]] || spec_ts=0

  # CONTRACT FILES ONLY (fix/openapi-freshness-contract, 2026-11-15, product-owner decision).
  #
  # This used to be the whole module minus tests, READMEs and test config (the exclusion history is in
  # git: a test edit, a README rewrap, a pytest.ini line each turned it red in turn). Even so, ANY
  # service, repository or helper edit made the document "stale": on 2026-11-15 twelve of twenty-five
  # were red and not one for an API change — so a real one would have been invisible among them, and
  # the only way to clear the gate was to edit documents nobody had a reason to change.
  #
  # What defines an API here: a route is declared in a controller (`*.controller.ts`) or a route
  # module (`routes/**` in the Fastify services; `main.py` / `router.py` in the Python ones), and a
  # payload in a DTO (`dto/**`, `*.dto.ts`). Those are the files compared, plus the single files named in
  # the map. NOT seen: shared shapes in packages/@cos/types (response types several controllers re-export),
  # a Pydantic model outside a route module, other helper constants a controller imports, and behaviour
  # that changes behind an unchanged controller — the cost of a gate that can stay green.
  #
  # `:(glob)` magic: `**/` there matches zero or more directories, so `<dir>/**/x` covers `<dir>/x`
  # too (plain pathspecs needed a second form for every pattern). Test files inside those patterns
  # stay excluded.
  pathspec=()
  for sp in "${source_paths[@]}"; do
    if [[ -d "$ROOT/$sp" ]]; then
      pathspec+=(
        ":(glob)$sp/**/*.controller.ts"
        ":(glob)$sp/**/dto/**"
        ":(glob)$sp/**/*.dto.ts"
        ":(glob)$sp/**/routes/**"
        ":(glob)$sp/**/main.py"
        ":(glob)$sp/**/router.py"
        ":(exclude,glob)$sp/**/__tests__/**"
        ":(exclude,glob)$sp/**/*.spec.ts"
        ":(exclude,glob)$sp/**/tests/**"
        # digital-twin's /api/v1/twin router is ungated on purpose (below the map); its include_router
        # line in ai-gateway main.py still is.
        ":(exclude,glob)$sp/**/digital_twin/**"
      )
    else
      # A mapping may name a single file (see [platform]); it is a contract file by being named.
      pathspec+=("$sp")
    fi
  done

  src_ts=$(git -C "$ROOT" log -1 --format="%ct" "$REV" -- "${pathspec[@]}" 2>/dev/null || echo "0")
  [[ -n "$src_ts" ]] || src_ts=0

  # A mapping whose paths no commit ever touched a contract file under would compare against nothing
  # and pass forever.
  if [[ "$src_ts" == "0" ]]; then
    echo "  ✗ $spec_name — no contract file (controller, DTO, route module) under its mapped paths"
    FAIL=$((FAIL + 1))
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
echo "==> Result: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]] || exit 1
