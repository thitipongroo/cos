#!/usr/bin/env bash
# [AUTO] Phase 19 — Security validation
# Verifies: TLS 1.3, no plaintext secrets, sealed-secrets only
# Usage: INGRESS_HOST=api.construction-os.io ./scripts/readiness/check-security.sh

set -euo pipefail

INGRESS_HOST="${INGRESS_HOST:-api.construction-os.io}"
NS="${NAMESPACE:-cos}"
PASS=0
FAIL=0

echo "==> Security checks"

# TLS — minimum TLS 1.2 (goal: 1.3)
if command -v nmap &>/dev/null && [[ -n "$INGRESS_HOST" ]]; then
  tls13=$(nmap --script ssl-enum-ciphers -p 443 "$INGRESS_HOST" 2>/dev/null | grep "TLSv1.3" || echo "")
  if [[ -n "$tls13" ]]; then
    echo "  ✓ TLS 1.3 enabled on $INGRESS_HOST"
    ((PASS++))
  else
    echo "  ✗ TLS 1.3 not detected on $INGRESS_HOST"
    ((FAIL++))
  fi
else
  echo "  - TLS check: nmap not installed or INGRESS_HOST not set — skipping"
fi

# Sealed Secrets — no raw secrets of type Opaque without sealed annotation
raw_opaque=$(kubectl get secrets -A -o json 2>/dev/null | python3 -c "
import sys, json
items = json.load(sys.stdin)['items']
unprotected = [
    f\"{i['metadata']['namespace']}/{i['metadata']['name']}\"
    for i in items
    if i['type'] == 'Opaque'
    and 'sealedsecrets.bitnami.com/cluster-wide' not in i.get('metadata', {}).get('annotations', {})
    and not i['metadata']['name'].startswith('sh.helm.')
]
print(len(unprotected))
for n in unprotected[:5]:
    print(f'  - {n}')
" 2>/dev/null || echo "ERR")

if [[ "$raw_opaque" == "0" ]]; then
  echo "  ✓ All Opaque secrets are managed by sealed-secrets"
  ((PASS++))
else
  echo "  ✗ Raw Opaque secrets found (not sealed):"
  echo "$raw_opaque"
  ((FAIL++))
fi

# ArgoCD — check CI workflow has no kubectl apply / helm upgrade
kubectl_in_ci=$(grep -r "kubectl apply\|helm upgrade" "$(git rev-parse --show-toplevel 2>/dev/null || echo .)/.github/workflows/" 2>/dev/null | wc -l | tr -d ' ')
if [[ "$kubectl_in_ci" == "0" ]]; then
  echo "  ✓ CI workflow does not contain kubectl apply / helm upgrade (GitOps pattern correct)"
  ((PASS++))
else
  echo "  ✗ CI workflow contains $kubectl_in_ci direct kubectl/helm commands (should use ArgoCD)"
  ((FAIL++))
fi

echo ""
echo "==> Result: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]] || exit 1
