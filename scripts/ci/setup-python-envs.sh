#!/usr/bin/env bash
# Build one virtualenv per Python service, matching what ci.yml's `python-tests` job installs.
#
# WHY THIS EXISTS. `verify-before-push.sh` used to run `python -m pytest` against whatever
# interpreter was on PATH. On a developer machine that is the system Python, with whatever versions
# of whatever packages happen to be installed there — and on 2026-09-04 that was starlette 1.0.1
# while every `services/*/requirements.txt` pins 1.3.1. Four of the five suites died at collection:
#
#     AttributeError: module 'starlette.exceptions' has no attribute 'StarletteDeprecationWarning'
#
# The `filterwarnings` line naming that class is CORRECT for the pinned 1.3.1. Nothing in the
# repository was wrong; the environment the gate measured was not the environment CI measures. A
# gate reporting FAIL for a reason CI does not have is the same defect as one reporting PASS for a
# reason CI does not have — both teach people to stop reading its output.
#
# WHAT IT MIRRORS, step for step, from .github/workflows/ci.yml § python-tests:
#   actions/setup-python  python-version: '3.12'   -> PYTHON_BIN below
#   python -m pip install --upgrade pip
#   requirements-dev.txt if present, else requirements.txt   (dev already `-r requirements.txt`)
#   pip install pytest pytest-asyncio
# The service list is that job's `matrix.service`. When the matrix changes, change SERVICES here in
# the same commit or this stops mirroring it.
#
# Usage:
#   bash scripts/ci/setup-python-envs.sh              # all services, skip ones already built
#   bash scripts/ci/setup-python-envs.sh --recreate   # delete and rebuild every venv
#
# The venvs land in services/<name>/.venv, which .gitignore:91 already covers.

set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
cd "$ROOT"

# ci.yml pins 3.12. Using the machine's default `python3` instead would reintroduce exactly the
# divergence this script exists to close, so the version is named and its absence is fatal.
PYTHON_BIN="python3.12"

SERVICES=(
  ai-gateway
  ai-embedding-worker
  ai-ocr-pipeline
  ai-transcription-pipeline
  bim-import-worker
)

RECREATE=0
[[ "${1:-}" == "--recreate" ]] && RECREATE=1

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "✗ $PYTHON_BIN is not on PATH."
  echo "  ci.yml § python-tests pins python-version: '3.12'; building these venvs on another minor"
  echo "  version would not be the environment CI measures."
  echo "  macOS:  brew install python@3.12"
  exit 1
fi

echo "==> Python service venvs — mirroring ci.yml § python-tests ($($PYTHON_BIN --version))"

FAILED=()
for svc in "${SERVICES[@]}"; do
  dir="services/$svc"
  venv="$dir/.venv"

  if [[ ! -d "$dir" ]]; then
    echo "  ✗ $svc — services/$svc does not exist; the SERVICES list no longer matches the repository"
    FAILED+=("$svc")
    continue
  fi

  if [[ $RECREATE -eq 1 ]]; then
    rm -rf "$venv"
  elif [[ -x "$venv/bin/python" ]]; then
    echo "  - $svc — venv already present (--recreate to rebuild)"
    continue
  fi

  echo "  ▶ $svc"
  if ! (
    set -e
    "$PYTHON_BIN" -m venv "$venv"
    "$venv/bin/python" -m pip install --quiet --upgrade pip
    # requirements-dev.txt already `-r requirements.txt`; not every service ships one.
    if [[ -f "$dir/requirements-dev.txt" ]]; then
      (cd "$dir" && .venv/bin/python -m pip install --quiet -r requirements-dev.txt)
    else
      (cd "$dir" && .venv/bin/python -m pip install --quiet -r requirements.txt)
    fi
    "$venv/bin/python" -m pip install --quiet pytest pytest-asyncio
  ); then
    echo "  ✗ $svc — install failed"
    FAILED+=("$svc")
    continue
  fi
  echo "  ✓ $svc"
done

echo ""
if [[ ${#FAILED[@]} -gt 0 ]]; then
  echo "==> ${#FAILED[@]} service(s) failed: ${FAILED[*]}"
  exit 1
fi
echo "==> ${#SERVICES[@]} venv(s) ready. bash scripts/ci/verify-before-push.sh will now use them."
