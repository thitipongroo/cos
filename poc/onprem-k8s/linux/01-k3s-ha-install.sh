#!/usr/bin/env bash
# ADR-039 POC — install a 3-server HA k3s cluster (embedded etcd) on Linux.
# Run on node1 with ROLE=init, then on node2 & node3 with ROLE=join.
#
#   node1:  sudo ROLE=init K3S_VERSION="vX.Y.Z+k3s1" ./01-k3s-ha-install.sh
#           # then copy the printed node-token + node1 IP
#   node2/3:sudo ROLE=join FIRST_SERVER=<node1-ip> K3S_TOKEN=<token> K3S_VERSION="vX.Y.Z+k3s1" ./01-k3s-ha-install.sh
#
# Refs: https://docs.k3s.io/datastore/ha-embedded . Official installer: https://get.k3s.io
set -euo pipefail

: "${ROLE:?set ROLE=init|join}"
: "${K3S_VERSION:?pin K3S_VERSION, e.g. v1.31.4+k3s1 — do not guess; pick from k3s releases}"

if [[ "$ROLE" == "init" ]]; then
  # First server bootstraps the etcd cluster.
  curl -sfL https://get.k3s.io | INSTALL_K3S_VERSION="$K3S_VERSION" sh -s - server --cluster-init
  echo "=== k3s init server up. Share these with the other 2 nodes: ==="
  echo "FIRST_SERVER=$(hostname -I | awk '{print $1}')"
  echo "K3S_TOKEN=$(sudo cat /var/lib/rancher/k3s/server/node-token)"
  echo "kubeconfig: /etc/rancher/k3s/k3s.yaml"
elif [[ "$ROLE" == "join" ]]; then
  : "${FIRST_SERVER:?set FIRST_SERVER=<node1-ip>}"
  : "${K3S_TOKEN:?set K3S_TOKEN=<token from node1>}"
  curl -sfL https://get.k3s.io | INSTALL_K3S_VERSION="$K3S_VERSION" K3S_TOKEN="$K3S_TOKEN" \
    sh -s - server --server "https://${FIRST_SERVER}:6443"
  echo "=== joined as additional server. On node1 run: kubectl get nodes ==="
else
  echo "ROLE must be 'init' or 'join'"; exit 1
fi

# Verify (run on node1 after all 3 are up):
#   export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
#   kubectl get nodes -o wide            # expect 3x control-plane,etcd Ready
