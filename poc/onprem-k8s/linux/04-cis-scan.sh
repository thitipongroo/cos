#!/usr/bin/env bash
# ADR-039 POC — CIS Kubernetes benchmark scan via kube-bench (rubric item 4).
# Run on the control node with KUBECONFIG set. Confirms the cluster's CIS hardening posture
# (RKE2 `profile: cis` self-applies hardening; this scan verifies it. k3s is scanned the same way.)
#
#   ./04-cis-scan.sh <k3s|rke2>
#
# Refs: https://github.com/aquasecurity/kube-bench ; RKE2 hardening guide (CIS self-assessment).
set -euo pipefail

DISTRO="${1:?usage: <k3s|rke2>}"
# kube-bench benchmark target is version-specific. Pick the one matching your cluster's K8s version
# from kube-bench's supported targets (e.g. cis-1.9 / rke2-cis-1.x / k3s-cis-1.x). VERIFY before run.
BENCHMARK="${BENCHMARK:-cis}"     # override e.g. BENCHMARK=rke2-cis-1.9
KB_IMAGE="${KB_IMAGE:-aquasec/kube-bench:latest}"  # pin a digest/tag for reproducibility

echo "=== running kube-bench ($DISTRO, benchmark=$BENCHMARK) as a Job ==="
JOB="kube-bench-poc"
kubectl delete job "$JOB" --ignore-not-found >/dev/null 2>&1 || true

# Node-level checks need host mounts; this is the kube-bench-on-host Job shape (hostPID + hostPaths).
# VERIFY the mounts/target against kube-bench docs for your distro + version.
kubectl create -f - <<EOF
apiVersion: batch/v1
kind: Job
metadata:
  name: ${JOB}
spec:
  backoffLimit: 0
  template:
    spec:
      hostPID: true
      restartPolicy: Never
      containers:
        - name: kube-bench
          image: ${KB_IMAGE}
          command: ["kube-bench", "run", "--benchmark", "${BENCHMARK}"]
          volumeMounts:
            - { name: var-lib, mountPath: /var/lib, readOnly: true }
            - { name: etc, mountPath: /etc, readOnly: true }
      volumes:
        - { name: var-lib, hostPath: { path: /var/lib } }
        - { name: etc, hostPath: { path: /etc } }
EOF

kubectl wait --for=condition=complete --timeout=300s "job/${JOB}" || true
echo "=== kube-bench results (FAIL/WARN are the actionable items) ==="
kubectl logs "job/${JOB}" | tail -80
kubectl delete job "$JOB" --ignore-not-found >/dev/null 2>&1 || true

echo "=== record [PASS]/[FAIL]/[WARN] totals in results-template.md ==="
