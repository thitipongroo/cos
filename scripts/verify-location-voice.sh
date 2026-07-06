#!/usr/bin/env bash
# Combined verification suite for the Voice-transcription (STT) + Geo-location feature work.
# Runs every automated suite the feature touches, across all three runtimes, and prints one tally.
#
#   1. Python  — ai-transcription-pipeline (STT provider + WER)
#   2. Python  — ai-gateway (transcribe route + metering)
#   3. Jest    — backend geo + site-ops/workforce/safety (coord wiring)
#   4. Playwright — web component-port harness (VoiceInput + LocationDisplay ports)
#
# Prereqs for step 4: Postgres up (for the web app is not required, but harmless) and a free :3001.
# Usage:  bash scripts/verify-location-voice.sh
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
declare -a NAMES RESULTS

run() { # name, command...
  local name="$1"; shift
  echo "──────────────────────────────────────────────────────────────"
  echo "▶ $name"
  echo "──────────────────────────────────────────────────────────────"
  if "$@"; then NAMES+=("$name"); RESULTS+=("PASS"); else NAMES+=("$name"); RESULTS+=("FAIL"); fi
}

py_suite() { # dir
  local dir="$1"
  ( cd "$ROOT/$dir" \
      && python3 -m venv .venv \
      && . .venv/bin/activate \
      && pip install -q -r requirements-dev.txt \
      && pytest -q )
  local rc=$?
  rm -rf "$ROOT/$dir/.venv" "$ROOT/$dir"/**/__pycache__ "$ROOT/$dir/.pytest_cache" \
         "$ROOT/$dir/eval/__pycache__" 2>/dev/null
  return $rc
}

jest_backend() {
  ( cd "$ROOT/backend" \
      && node_modules/.bin/jest --silent "src/modules/(geo|site-ops|workforce|safety)/__tests__" 2>&1 \
      | grep -vE 'ts-jest\[config\]' )
  return "${PIPESTATUS[0]}"
}

web_e2e() {
  local log="$ROOT/scripts/.web-dev.log"
  ( cd "$ROOT/apps/web" && node_modules/.bin/next dev -p 3001 >"$log" 2>&1 & echo $! >"$ROOT/scripts/.web.pid" )
  # wait until the preview route answers
  local up=""
  for _ in $(seq 1 40); do
    if [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/dev/component-preview 2>/dev/null)" = "200" ]; then up=1; break; fi
    sleep 2
  done
  local rc=1
  if [ -n "$up" ]; then
    ( cd "$ROOT" && BASE_URL=http://localhost:3001 COMPONENT_PREVIEW_URL=/dev/component-preview \
        npx playwright test component-port -g "ImageWithFallback|LoadingState|\(web\)" \
        --config tests/e2e/playwright.config.ts --workers=1 --reporter=line )
    rc=$?
  else
    echo "web dev server did not come up on :3001"
  fi
  kill "$(cat "$ROOT/scripts/.web.pid" 2>/dev/null)" 2>/dev/null
  rm -f "$ROOT/scripts/.web.pid" "$log"
  return $rc
}

run "Python · ai-transcription-pipeline" py_suite services/ai-transcription-pipeline
run "Python · ai-gateway"               py_suite services/ai-gateway
run "Jest · backend geo/site-ops/workforce/safety" jest_backend
run "Playwright · web component-port"   web_e2e

echo ""
echo "════════════════════ SUMMARY ════════════════════"
fail=0
for i in "${!NAMES[@]}"; do
  printf "  %-4s  %s\n" "${RESULTS[$i]}" "${NAMES[$i]}"
  [ "${RESULTS[$i]}" = "FAIL" ] && fail=1
done
echo "═════════════════════════════════════════════════"
[ "$fail" = 0 ] && echo "ALL SUITES PASSED" || echo "SOME SUITES FAILED"
exit "$fail"
