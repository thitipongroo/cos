#!/usr/bin/env bash
# ADR-039 POC — install a 3-server HA RKE2 cluster with the CIS profile on Linux.
# Run on node1 with ROLE=init, then node2 & node3 with ROLE=join.
#
#   node1:  sudo ROLE=init RKE2_VERSION="vX.Y.Z+rke2r1" CLUSTER_TOKEN="<choose-a-secret>" ./01-rke2-ha-install.sh
#   node2/3:sudo ROLE=join FIRST_SERVER=<node1-ip> CLUSTER_TOKEN="<same-secret>" RKE2_VERSION="..." ./01-rke2-ha-install.sh
#
# Refs: https://docs.rke2.io/install/ha . CIS hardening: https://docs.rke2.io/security/hardening_guide
set -euo pipefail

: "${ROLE:?set ROLE=init|join}"
: "${RKE2_VERSION:?pin RKE2_VERSION, e.g. v1.31.4+rke2r1 — do not guess; pick from rke2 releases}"
: "${CLUSTER_TOKEN:?set CLUSTER_TOKEN to a shared secret used by all 3 servers}"

# CIS profile prerequisites (RKE2 hardening guide) — VERIFY against the pinned version's docs:
#  - etcd user must exist; RKE2 applies a CIS sysctl drop-in. The installer + profile handle most,
#    but confirm host prep per the hardening guide for your version.
if ! id etcd &>/dev/null; then useradd -r -c "etcd user" -s /sbin/nologin -M etcd || true; fi

mkdir -p /etc/rancher/rke2
{
  echo "token: ${CLUSTER_TOKEN}"
  echo "profile: cis"          # VERIFY exact CIS profile string for your version (e.g. cis, cis-1.23)
  echo "write-kubeconfig-mode: \"0644\""
  if [[ "$ROLE" == "join" ]]; then
    : "${FIRST_SERVER:?set FIRST_SERVER=<node1-ip>}"
    echo "server: https://${FIRST_SERVER}:9345"
  fi
} > /etc/rancher/rke2/config.yaml

curl -sfL https://get.rke2.io | INSTALL_RKE2_VERSION="$RKE2_VERSION" sh -
systemctl enable --now rke2-server.service

echo "=== RKE2 server starting. kubectl: /var/lib/rancher/rke2/bin/kubectl ==="
echo "=== kubeconfig: /etc/rancher/rke2/rke2.yaml ==="
if [[ "$ROLE" == "init" ]]; then
  echo "FIRST_SERVER=$(hostname -I | awk '{print $1}')   (use this + the same CLUSTER_TOKEN on node2/3)"
fi

# Verify (on node1 once all 3 up):
#   export KUBECONFIG=/etc/rancher/rke2/rke2.yaml PATH=$PATH:/var/lib/rancher/rke2/bin
#   kubectl get nodes -o wide        # expect 3x control-plane,etcd Ready
