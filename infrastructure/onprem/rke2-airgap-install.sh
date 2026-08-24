#!/usr/bin/env bash
# ADR-039 POC — air-gapped RKE2 install (rubric 3, RKE2 side). Companion to
# 05-k3s-airgap-install.sh; RKE2 uses a different mechanism (artifact path, not SKIP_DOWNLOAD).
#
#   PHASE 1 (on a CONNECTED machine):
#     K3S_VERSION unused here — pin RKE2_VERSION instead:
#     RKE2_VERSION="vX.Y.Z+rke2r1" ./06-rke2-airgap-install.sh fetch <dest-dir>
#
#   PHASE 2 (on the AIR-GAPPED host, as root):
#     sudo RKE2_VERSION="vX.Y.Z+rke2r1" ./06-rke2-airgap-install.sh install <artifact-dir> [--cis]
#
# Refs: https://docs.rke2.io/install/airgap (tarball / INSTALL_RKE2_ARTIFACT_PATH method — no
# private registry required).
set -euo pipefail

ARCH="${ARCH:-amd64}"
MODE="${1:?usage: fetch <dest-dir> | install <artifact-dir> [--cis]}"

case "$MODE" in
fetch)
  DEST="${2:?usage: fetch <dest-dir>}"
  : "${RKE2_VERSION:?pin RKE2_VERSION, e.g. v1.34.9+rke2r1 — do not guess; pick from rke2 releases}"
  mkdir -p "$DEST"
  BASE="https://github.com/rancher/rke2/releases/download/${RKE2_VERSION//+/%2B}"
  echo "fetching $RKE2_VERSION ($ARCH) -> $DEST"
  curl -fsSL -o "$DEST/rke2-images.linux-${ARCH}.tar.zst" "$BASE/rke2-images.linux-${ARCH}.tar.zst"
  curl -fsSL -o "$DEST/rke2.linux-${ARCH}.tar.gz"         "$BASE/rke2.linux-${ARCH}.tar.gz"
  curl -fsSL -o "$DEST/sha256sum-${ARCH}.txt"             "$BASE/sha256sum-${ARCH}.txt"
  curl -fsSL -o "$DEST/install.sh" https://get.rke2.io
  chmod +x "$DEST/install.sh"
  ( cd "$DEST" && grep -E "rke2-images.linux-${ARCH}.tar.zst|rke2.linux-${ARCH}.tar.gz" \
      "sha256sum-${ARCH}.txt" | sha256sum -c - )
  echo "staged + checksummed:"; ls -lh "$DEST"
  ;;

install)
  DIR="${2:?usage: install <artifact-dir> [--cis]}"; shift 2 || true
  : "${RKE2_VERSION:?pin RKE2_VERSION to the version the artifacts were fetched for}"
  [[ $EUID -eq 0 ]] || { echo "run as root" >&2; exit 1; }
  for f in "rke2-images.linux-${ARCH}.tar.zst" "rke2.linux-${ARCH}.tar.gz" "sha256sum-${ARCH}.txt" install.sh; do
    [[ -f "$DIR/$f" ]] || { echo "missing artifact: $DIR/$f (run the fetch phase first)" >&2; exit 1; }
  done

  CIS=0; [[ "${1:-}" == "--cis" ]] && CIS=1

  mkdir -p /etc/rancher/rke2
  {
    echo "write-kubeconfig-mode: \"0644\""
    (( CIS )) && echo "profile: cis"
  } > /etc/rancher/rke2/config.yaml

  if (( CIS )) && ! id etcd &>/dev/null; then
    useradd -r -c "etcd user" -s /sbin/nologin -M etcd || true
  fi

  # INSTALL_RKE2_ARTIFACT_PATH makes install.sh consume the local tarballs instead of downloading.
  # This is RKE2's air-gap switch — the k3s equivalent (INSTALL_K3S_SKIP_DOWNLOAD) does NOT apply.
  INSTALL_RKE2_ARTIFACT_PATH="$DIR" \
  INSTALL_RKE2_VERSION="$RKE2_VERSION" \
    "$DIR/install.sh"

  # Same CIS sysctl prerequisite as the networked installer — see 01-rke2-ha-install.sh.
  CIS_SYSCTL=/usr/local/share/rke2/rke2-cis-sysctl.conf
  if (( CIS )) && [[ -f "$CIS_SYSCTL" ]]; then
    cp "$CIS_SYSCTL" /etc/sysctl.d/60-rke2-cis.conf
    systemctl restart systemd-sysctl
    echo "applied CIS sysctl drop-in"
  fi

  systemctl enable --now rke2-server.service
  echo "=== air-gapped RKE2 install done. Verify with: ==="
  echo "  /var/lib/rancher/rke2/bin/kubectl --kubeconfig /etc/rancher/rke2/rke2.yaml get nodes"
  echo "  /var/lib/rancher/rke2/bin/crictl images   # from the tarball, not a registry"
  ;;

*)
  echo "mode must be 'fetch' or 'install'" >&2; exit 1 ;;
esac
