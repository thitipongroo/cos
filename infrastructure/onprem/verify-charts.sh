#!/usr/bin/env bash
# ADR-039 POC — CNCF conformance + COS Helm-chart acceptance on the live cluster (distro-agnostic).
# Mirrors the macOS POC's chart checks; run on the control node with KUBECONFIG set + this repo present.
#
#   k3s:  export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
#   rke2: export KUBECONFIG=/etc/rancher/rke2/rke2.yaml PATH=$PATH:/var/lib/rancher/rke2/bin
#   ./02-cos-conformance.sh
set -euo pipefail

REPO_ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
HELM_DIR="$REPO_ROOT/infrastructure/helm"
command -v kubectl >/dev/null || { echo "kubectl not found"; exit 1; }
command -v helm    >/dev/null || { echo "helm not found"; exit 1; }

echo "=== 1. nodes (expect 3x control-plane,etcd Ready) ==="
kubectl get nodes -o wide

echo "=== 2. scheduling: deploy nginx across nodes ==="
kubectl create deployment poc-nginx --image=nginx:alpine --replicas=3 2>/dev/null || true
kubectl rollout status deployment/poc-nginx --timeout=120s
kubectl get pods -o wide -l app=poc-nginx

echo "=== 3. helm install conformance (minimal chart) ==="
TMP_CHART="$(mktemp -d)/poc"; helm create "$TMP_CHART" >/dev/null
helm install poc-app "$TMP_CHART" --wait --timeout 120s | grep -i status || true
helm uninstall poc-app >/dev/null 2>&1 || true

echo "=== 4. COS Helm charts: lint + server-side dry-run against the live API (no images needed) ==="
fail=0
for chart in "$HELM_DIR"/*/; do
  name="$(basename "$chart")"
  echo "--- $name ---"
  helm lint "$chart" | tail -1 || fail=1
  # Capture BOTH streams: a Deployment that violates PodSecurity is still "created" on a server
  # dry-run — PSS is enforced at *Pod* admission, so the only signal here is a warning on stderr.
  # Treating exit 0 as PASS reported all 8 charts green on RKE2 `profile: cis` while no pod could
  # ever start (missing seccompProfile). Fail on the warning too.
  out="$(helm template "$name" "$chart" 2>/dev/null | kubectl apply --dry-run=server -f - 2>&1)"; rc=$?
  if [[ $rc -ne 0 ]]; then
    echo "  ❌ server dry-run FAILED for $name"; echo "$out" | tail -3 | sed 's/^/       /'; fail=1
  elif grep -qi "violate PodSecurity" <<<"$out"; then
    echo "  ❌ $name admitted as a Deployment but its PODS would be REJECTED by PodSecurity:"
    grep -oiE "must set [^)]*" <<<"$out" | sort -u | sed 's/^/       /'
    fail=1
  else
    echo "  ✅ accepted by API server (dry-run, no PodSecurity violation)"
  fi
done

kubectl delete deployment poc-nginx >/dev/null 2>&1 || true
echo "=== conformance result: $([ $fail -eq 0 ] && echo PASS || echo FAIL) ==="
exit $fail
