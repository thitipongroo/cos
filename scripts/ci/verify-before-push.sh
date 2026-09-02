#!/usr/bin/env bash
# Run what CI runs, before the push, in CI's own order — cheapest and most likely
# to fail first. Every command here is copied from .github/workflows/ci.yml; when
# a job changes there, change it here in the same commit or this gate starts lying.
#
# It did lie, and this is what it cost. On 2026-09-03 the Lint job here reported PASS on nine steps
# while CI's Lint job has fifteen: markdownlint, yamllint, sqlfluff, ruff, terraform fmt and
# terraform validate had no local counterpart at all, and `prisma generate` ran from the repo root
# while ci.yml runs it with `working-directory: backend`. The push went out green and CI came back
# red with 241 markdownlint errors across 74 files. All seven are mirrored now.
#
# The rule that keeps this honest: a step CI runs is either mirrored here, or named in the
# "not covered" list printed at the end. There is no third category, and "it would probably pass"
# is not one either.
#
# Usage:
#   bash scripts/ci/verify-before-push.sh            # everything that needs no Docker
#   bash scripts/ci/verify-before-push.sh --full     # plus the Docker-backed suites
#
# Exit code is what matters: 0 means the CI jobs mirrored here would pass.
# It does not mean CI will be green — the jobs listed under "not covered" below
# still run there and are not run here.

set -uo pipefail

FULL=0
[[ "${1:-}" == "--full" ]] && FULL=1

PASS=(); FAIL=(); SKIP=()

run() {
  local label="$1"; shift
  printf '\n\033[1m▶ %s\033[0m\n    $ %s\n' "$label" "$*"
  if "$@"; then PASS+=("$label"); else FAIL+=("$label"); fi
}

# A CI step's `working-directory:` is part of the command, not decoration around it. Running the
# same command from the repo root is a DIFFERENT command, and it silently was for `prisma generate`:
# ci.yml runs it with `working-directory: backend`, this script ran it from the root, and prisma is
# installed in backend/node_modules/.bin only — so the step failed here on every run while passing in
# CI. A gate that fails for a reason CI does not have gets read as noise, and then so does the rest
# of its output. Use this for any step ci.yml gives a working-directory.
run_in() {
  local dir="$1" label="$2"; shift 2
  printf '\n\033[1m▶ %s\033[0m\n    $ (cd %s && %s)\n' "$label" "$dir" "$*"
  if (cd "$dir" && "$@"); then PASS+=("$label"); else FAIL+=("$label"); fi
}

need_docker() {
  if docker info >/dev/null 2>&1; then return 0; fi
  return 1
}

# A step only counts if the tool is here. Skipping loudly is honest; silently passing because a
# binary is missing is the failure this whole script exists to prevent.
have() { command -v "$1" >/dev/null 2>&1; }
run_if() {
  local tool="$1" label="$2"; shift 2
  if have "$tool"; then run "$label" "$@"; else SKIP+=("$label — $tool not installed"); fi
}

# ── Lint job ────────────────────────────────────────────────────────────────
run "Lint — eslint"                pnpm run lint
run "Lint — prettier"              pnpm run format:check
run "Lint — markdownlint"          bash ./scripts/ci/check-markdown-changed.sh
run_if yamllint  "Lint — yamllint"  yamllint .
run_if sqlfluff  "Lint — sqlfluff"  sqlfluff lint .
run_if ruff      "Lint — ruff"      ruff check services mlops
run_if terraform "Lint — terraform fmt" terraform fmt -check -recursive infrastructure/terraform
run_if terraform "Lint — terraform validate" bash -c '
  set -e
  for dir in infrastructure/terraform/aws infrastructure/terraform/cloudflare; do
    echo "── $dir"
    terraform -chdir="$dir" init -backend=false -input=false -no-color
    terraform -chdir="$dir" validate -no-color
  done'
run "Lint — jscpd duplication"     pnpm exec jscpd backend/src packages apps/web/src services libs apps/mobile/src
run "Lint — service runtimes"      bash ./scripts/readiness/check-service-runtimes.sh
run "Lint — openapi freshness"     bash ./scripts/readiness/check-openapi-freshness.sh
run "Lint — openapi rules"         pnpm run lint:openapi
run "Lint — openapi route coverage" pnpm run lint:routes
run "Lint — unit test env"         bash ./scripts/ci/check-unit-test-env.sh
run "Lint — loading state"         bash ./scripts/ci/check-loading-state.sh

# ── Type check job ──────────────────────────────────────────────────────────
run_in backend "Type check — prisma generate" pnpm exec prisma generate
run "Type check"                   pnpm run type-check

# ── Build job (ADR-033: tsc --noEmit is not a build) ────────────────────────
run "Build"                        pnpm run build

# ── Test jobs that need no Docker ───────────────────────────────────────────
run "Unit tests (100/100)"         pnpm run test:cov
run "Contract tests (Pact)"        pnpm run test:contract
run "Architecture tests"           pnpm run test:architecture
run "Conformance tests"            pnpm run test:conformance

# ── Docker-backed jobs ──────────────────────────────────────────────────────
if [[ $FULL -eq 1 ]]; then
  if need_docker; then
    run "Integration (Testcontainers)" pnpm run test:integration
    # CI runs this one with working-directory: backend — the config lives there,
    # and the base jest.config ignores test/, so it must go through this config.
    run "Multi-tenant isolation"       bash -c "cd backend && pnpm exec jest --config jest.integration.config.js --testPathPatterns='tenant-isolation' --runInBand"
    run "Python — ai-gateway"          bash -c "cd services/ai-gateway && python -m pytest -q"
  else
    SKIP+=("Integration (Testcontainers) — Docker not running")
    SKIP+=("Multi-tenant isolation — Docker not running")
    SKIP+=("Python — ai-gateway — Docker not running")
  fi
else
  SKIP+=("Integration (Testcontainers) — pass --full")
  SKIP+=("Multi-tenant isolation — pass --full")
  SKIP+=("Python — ai-gateway — pass --full")
fi

# ── Report ──────────────────────────────────────────────────────────────────
printf '\n\033[1m── Result ──\033[0m\n'
for p in "${PASS[@]:-}"; do [[ -n "$p" ]] && printf '  \033[32mPASS\033[0m  %s\n' "$p"; done
for s in "${SKIP[@]:-}"; do [[ -n "$s" ]] && printf '  \033[33mSKIP\033[0m  %s\n' "$s"; done
for f in "${FAIL[@]:-}"; do [[ -n "$f" ]] && printf '  \033[31mFAIL\033[0m  %s\n' "$f"; done

printf '\n  %d passed · %d failed · %d skipped\n' "${#PASS[@]}" "${#FAIL[@]}" "${#SKIP[@]}"

cat <<'NOTE'

  Not covered here — these run in CI and nowhere else:
    mobile-tests · go-tests · mlops-tests · build-docker · dependency-audit
    secret-scan · security-scan · e2e-tests · mobile-e2e-tests
    CodeQL · Semgrep · Lighthouse · mutation-tests · load-tests
  A green run below is not a promise that CI is green. It is a promise that the
  jobs listed above were actually executed and passed on this working tree.
NOTE

if [[ ${#FAIL[@]} -gt 0 ]]; then
  printf '\n\033[31mDo not push.\033[0m %d job(s) that CI runs are failing here.\n\n' "${#FAIL[@]}"
  exit 1
fi
if [[ ${#SKIP[@]} -gt 0 ]]; then
  printf '\n\033[33mPassed what was run.\033[0m %d job(s) were skipped — say so rather than reporting a clean check.\n\n' "${#SKIP[@]}"
fi
exit 0
