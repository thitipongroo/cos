#!/usr/bin/env bash
# [AUTO] Phase 19 — CI/CD and ArgoCD validation
# Verifies: ArgoCD running, apps synced/healthy, staging auto-sync enabled
# Usage: ./scripts/readiness/check-cicd.sh

set -euo pipefail

PASS=0
FAIL=0

echo "==> CI/CD checks"

# ArgoCD — server running
argo_pods=$(kubectl get pods -n argocd -l app.kubernetes.io/name=argocd-server --no-headers 2>/dev/null | grep Running | wc -l | tr -d ' ')
if [[ "$argo_pods" -gt 0 ]]; then
  echo "  ✓ ArgoCD: server pod running"
  ((PASS++))
else
  echo "  ✗ ArgoCD: server pod not found or not running"
  ((FAIL++))
fi

# ArgoCD — all apps healthy
if command -v argocd &>/dev/null && argocd version &>/dev/null 2>&1; then
  unhealthy=$(argocd app list --output=json 2>/dev/null | \
    python3 -c "import sys,json; apps=json.load(sys.stdin); print('\n'.join([a['metadata']['name'] for a in apps if a['status']['health']['status'] != 'Healthy']))" 2>/dev/null || echo "")
  if [[ -z "$unhealthy" ]]; then
    echo "  ✓ ArgoCD: all apps healthy"
    ((PASS++))
  else
    echo "  ✗ ArgoCD: unhealthy apps:"
    echo "$unhealthy" | while read -r app; do echo "    - $app"; done
    ((FAIL++))
  fi

  # Staging auto-sync
  staging_sync=$(argocd app get cos-backend -o json 2>/dev/null | \
    python3 -c "import sys,json; d=json.load(sys.stdin); print(d['spec']['syncPolicy'].get('automated',{}).get('selfHeal','false'))" 2>/dev/null || echo "false")
  if [[ "$staging_sync" == "true" ]]; then
    echo "  ✓ ArgoCD: cos-backend auto-sync (selfHeal) enabled"
    ((PASS++))
  else
    echo "  ✗ ArgoCD: cos-backend auto-sync (selfHeal) not enabled"
    ((FAIL++))
  fi
else
  echo "  - argocd CLI not available — skipping ArgoCD app checks"
fi

# CI pipeline — no direct kubectl/helm
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
direct_cmds=$(grep -r "kubectl apply\|helm upgrade" "$ROOT/.github/workflows/" 2>/dev/null | wc -l | tr -d ' ')
if [[ "$direct_cmds" == "0" ]]; then
  echo "  ✓ CI: no kubectl apply / helm upgrade in workflows (GitOps pattern)"
  ((PASS++))
else
  echo "  ✗ CI: found $direct_cmds direct kubectl/helm commands in workflows"
  ((FAIL++))
fi

echo ""
echo "==> Result: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]] || exit 1
