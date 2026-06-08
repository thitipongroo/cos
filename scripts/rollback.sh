#!/usr/bin/env bash
# Construction OS — Helm rollback script
# Usage: ./scripts/rollback.sh <service> [revision]
# Example: ./scripts/rollback.sh cos-backend
# Example: ./scripts/rollback.sh cos-backend 3
#
# Rolls back a Helm release to the previous revision (or a specific one).
# Confirms success by checking that all pods in the release are Running.

set -euo pipefail

NAMESPACE="${NAMESPACE:-cos}"
SERVICE="${1:-}"
REVISION="${2:-0}"  # 0 = previous revision in Helm

if [[ -z "$SERVICE" ]]; then
  echo "Usage: $0 <service> [revision]" >&2
  echo "Available services: cos-backend cos-file-service cos-ai-gateway cos-analytics-worker cos-kg-ingestion-worker cos-ai-embedding-worker cos-ai-ocr-pipeline" >&2
  exit 1
fi

echo "==> Rolling back ${SERVICE} in namespace ${NAMESPACE}..."
helm history "${SERVICE}" -n "${NAMESPACE}" | tail -5

if [[ "$REVISION" -eq 0 ]]; then
  echo "==> Rolling back to previous revision..."
  helm rollback "${SERVICE}" -n "${NAMESPACE}" --wait --timeout 5m
else
  echo "==> Rolling back to revision ${REVISION}..."
  helm rollback "${SERVICE}" "${REVISION}" -n "${NAMESPACE}" --wait --timeout 5m
fi

echo "==> Rollback complete. Verifying pods..."
kubectl rollout status deployment "${SERVICE}" -n "${NAMESPACE}" --timeout=2m

echo ""
echo "==> Current pod status:"
kubectl get pods -n "${NAMESPACE}" -l "app.kubernetes.io/instance=${SERVICE}" -o wide

echo ""
CURRENT_REV=$(helm history "${SERVICE}" -n "${NAMESPACE}" --max 1 --output json | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['revision'])")
echo "==> Active revision: ${CURRENT_REV}"
echo "==> Rollback successful."
