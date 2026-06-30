#!/usr/bin/env bash
# ADR-039 POC — etcd snapshot + restore drill (QM-12 RTO/RPO). Run on node1 (the bootstrap server).
#
#   ./03-etcd-snapshot-restore.sh <k3s|rke2> save
#   ./03-etcd-snapshot-restore.sh <k3s|rke2> restore <snapshot-path>
#
# Refs: https://docs.k3s.io/datastore/backup-restore , https://docs.rke2.io/backup_restore
# NOTE: restore is a COORDINATED multi-node operation. This script performs the node1 cluster-reset
#       and then PRINTS the exact follow-up steps for node2/3 (not auto-SSH'd — topology-specific).
set -euo pipefail

DISTRO="${1:?usage: <k3s|rke2> save|restore [snapshot-path]}"
ACTION="${2:?usage: <k3s|rke2> save|restore [snapshot-path]}"

case "$DISTRO" in
  k3s)  BIN=k3s;  SVC=k3s;        SNAPDIR=/var/lib/rancher/k3s/server/db/snapshots ;;
  rke2) BIN=rke2; SVC=rke2-server; SNAPDIR=/var/lib/rancher/rke2/server/db/snapshots ;;
  *) echo "distro must be k3s or rke2"; exit 1 ;;
esac

if [[ "$ACTION" == "save" ]]; then
  # On-demand snapshot (both distros also take scheduled snapshots automatically).
  "$BIN" etcd-snapshot save --name poc-snap
  echo "=== snapshots in $SNAPDIR ==="; ls -1 "$SNAPDIR" 2>/dev/null | tail -5

elif [[ "$ACTION" == "restore" ]]; then
  SNAP="${3:?provide snapshot path (see $SNAPDIR)}"
  echo "⚠️  DESTRUCTIVE: restoring etcd from $SNAP on $(hostname). Other servers must be stopped first."
  systemctl stop "$SVC" || true
  # Reset the cluster from the snapshot on this (sole) bootstrap node.
  "$BIN" server --cluster-reset --cluster-reset-restore-path="$SNAP"
  systemctl start "$SVC"
  cat <<EOF
=== node1 restored. NOW on node2 and node3 (manual — VERIFY against $DISTRO restore docs): ===
  1. systemctl stop $SVC
  2. rm -rf /var/lib/rancher/$DISTRO/server/db   # wipe stale etcd member
  3. systemctl start $SVC                         # rejoin the reset cluster
Then on node1:  kubectl get nodes   (expect all 3 Ready again)
Measure wall-clock from failure→all-Ready and compare to QM-12 on-prem RTO/RPO.
EOF
else
  echo "action must be save or restore"; exit 1
fi
