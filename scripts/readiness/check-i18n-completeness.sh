#!/usr/bin/env bash
# [AUTO] Phase 19 — i18n completeness check
# Verifies: no untranslated keys in th.json vs en.json (QM-3)
# Usage: ./scripts/readiness/check-i18n-completeness.sh
# Exit: 0 = complete, 1 = missing translations

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
EN_FILE="$ROOT/apps/web/src/i18n/en.json"
TH_FILE="$ROOT/apps/web/src/i18n/th.json"
PASS=0
FAIL=0

echo "==> i18n completeness check (QM-3)"

if [[ ! -f "$EN_FILE" ]]; then
  echo "  ✗ en.json not found at $EN_FILE"
  exit 1
fi

if [[ ! -f "$TH_FILE" ]]; then
  echo "  ✗ th.json not found at $TH_FILE"
  exit 1
fi

if ! command -v python3 &>/dev/null; then
  echo "  - python3 not available — cannot compare JSON keys; skipping"
  exit 0
fi

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

with open(sys.argv[1]) as f:
    en = json.load(f)
with open(sys.argv[2]) as f:
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
)

exit_code=$?
echo "$result" | while IFS= read -r line; do echo "  $line"; done

echo ""
if [[ $exit_code -eq 0 ]]; then
  echo "  ✓ th.json is complete — all en.json keys have Thai translations"
  ((PASS++))
  echo ""
  echo "==> Result: 1 passed, 0 failed"
else
  echo "  ✗ th.json is missing translations (see above)"
  echo ""
  echo "==> Result: 0 passed, 1 failed"
  exit 1
fi
