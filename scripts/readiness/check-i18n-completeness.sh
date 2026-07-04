#!/usr/bin/env bash
# [AUTO] Phase 19 — i18n completeness check
# Verifies: no untranslated keys in th.json vs en.json (QM-3) for web AND mobile
# Usage: ./scripts/readiness/check-i18n-completeness.sh
# Exit: 0 = complete, 1 = missing translations

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
APPS=("web" "mobile")
PASS=0
FAIL=0

echo "==> i18n completeness check (QM-3)"

if ! command -v python3 &>/dev/null; then
  echo "  - python3 not available — cannot compare JSON keys; skipping"
  exit 0
fi

for APP in "${APPS[@]}"; do
  EN_FILE="$ROOT/apps/$APP/src/i18n/en.json"
  TH_FILE="$ROOT/apps/$APP/src/i18n/th.json"

  echo ""
  echo "  [$APP]"

  if [[ ! -f "$EN_FILE" ]]; then
    echo "  ✗ en.json not found at $EN_FILE"
    exit 1
  fi

  if [[ ! -f "$TH_FILE" ]]; then
    echo "  ✗ th.json not found at $TH_FILE"
    exit 1
  fi

  exit_code=0
  result=$(python3 - "$EN_FILE" "$TH_FILE" <<'PYEOF'
import sys, json

def flatten(obj, prefix=''):
    keys = []
    for k, v in obj.items():
        full_key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            keys.extend(flatten(v, full_key))
        else:
            keys.append(full_key)
    return keys

# encoding='utf-8' is required: th.json contains Thai text and Windows defaults to cp1252
with open(sys.argv[1], encoding='utf-8') as f:
    en = json.load(f)
with open(sys.argv[2], encoding='utf-8') as f:
    th = json.load(f)

en_keys = set(flatten(en))
th_keys = set(flatten(th))

missing = sorted(en_keys - th_keys)
extra = sorted(th_keys - en_keys)

print(f"EN keys:      {len(en_keys)}")
print(f"TH keys:      {len(th_keys)}")
print(f"Missing in TH: {len(missing)}")
print(f"Extra in TH:   {len(extra)}")

if missing:
    print("\nMissing translations (en key not in th.json):")
    for k in missing[:20]:
        print(f"  - {k}")
    if len(missing) > 20:
        print(f"  ... and {len(missing) - 20} more")

if extra:
    print("\nExtra keys in th.json (not in en.json — stale?):")
    for k in extra[:10]:
        print(f"  - {k}")

sys.exit(1 if missing else 0)
PYEOF
  ) || exit_code=$?

  echo "$result" | while IFS= read -r line; do echo "  $line"; done

  if [[ $exit_code -eq 0 ]]; then
    echo "  ✓ $APP th.json is complete — all en.json keys have Thai translations"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $APP th.json is missing translations (see above)"
    FAIL=$((FAIL + 1))
  fi
done

echo ""
echo "==> Result: $PASS passed, $FAIL failed"
if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
