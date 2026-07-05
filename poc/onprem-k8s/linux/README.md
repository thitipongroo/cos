# On-prem K8s POC — Linux (k3s vs RKE2)

Pre-drafted scripts to complete the **ADR-039 validation conditions** that the macOS POC could not
cover (`poc/onprem-k8s/results-2026-06-30.md`). **DRAFT — not yet run** (needs Linux hosts).

Closes the rubric items left open on macOS: **air-gap install, CIS/FIPS hardening, etcd
snapshot-restore**, plus a real **k3s vs RKE2** head-to-head on Linux.

## Prerequisites

- **3 Linux hosts/VMs** (e.g. Ubuntu 22.04/24.04 LTS), reachable to each other, for a 3-node HA
  control plane (etcd quorum, per `08-enterprise-deployment` §8.5). Min ~`§8.5` sizing.
- Run as root/sudo. Open ports between nodes per the distro docs (k3s: 6443, 2379-2380, 8472/51820;
  RKE2: 9345, 6443, 2379-2380, 8472 …) — **VERIFY exact ports against the chosen version's docs.**
- `kubectl` + `helm` on the control node (both installers drop a kubeconfig — see scripts).
- This repo checked out on the control node (for COS Helm charts).

## ⚠️ Pin versions before running (do NOT guess)

Set the version to the one you intend to ship — these scripts default to the env var, not a
hardcoded version:

```bash
export K3S_VERSION="vX.Y.Z+k3s1"     # pick from https://github.com/k3s-io/k3s/releases
export RKE2_VERSION="vX.Y.Z+rke2r1"  # pick from https://github.com/rancher/rke2/releases
```

## Run order

| Step | Script                                                | Where                  | Validates (ADR-039 / rubric)                  |
| ---- | ----------------------------------------------------- | ---------------------- | --------------------------------------------- |
| 1    | `01-k3s-ha-install.sh` **or** `01-rke2-ha-install.sh` | node1 then node2/3     | HA control plane (rubric 2)                   |
| 2    | `02-cos-conformance.sh`                               | control node           | CNCF conformance + COS Helm charts (rubric 1) |
| 3    | `03-etcd-snapshot-restore.sh <k3s\|rke2>`             | node1                  | etcd backup/restore — QM-12 (rubric 5)        |
| 4    | `04-cis-scan.sh <k3s\|rke2>`                          | any node               | CIS hardening (rubric 4)                      |
| —    | air-gap                                               | see `## Air-gap` below | offline install (rubric 3)                    |

Run the whole sequence once per distro (k3s, then RKE2) on a clean set of nodes, record both in
`results-template.md`, then supersede ADR-039 conditions / confirm RKE2 for regulated tenants.

## Air-gap (outline — VERIFY per release)

Both distros support air-gap via a pre-downloaded image tarball + binary placed before install:

- **k3s:** download `k3s` binary + `k3s-airgap-images-<arch>.tar.zst` from the release; put images in
  `/var/lib/rancher/k3s/agent/images/`; install with `INSTALL_K3S_SKIP_DOWNLOAD=true`.
- **RKE2:** download the release artifacts + `rke2-images.linux-<arch>.tar.zst`; place under
  `/var/lib/rancher/rke2/agent/images/`; run the air-gap `install.sh` with `INSTALL_RKE2_ARTIFACT_PATH`.
- COS images: load the COS service images into a **local registry** (Harbor / `registry:2`) reachable
  by the cluster, OR `ctr images import` per node. (On-prem image delivery = "container image
  package", `08-enterprise-deployment` §8.6.)

Exact artifact names/URLs are version-specific — **pull them from the pinned release page; do not
assume.** This section is an outline, not a turnkey script.

## FIPS (RKE2, regulated tenants only)

RKE2 offers FIPS-140 validated builds — requires the **FIPS-specific RKE2 build/channel**, not the
default binary. Out of scope of these baseline scripts; **verify the FIPS build + procedure against
current RKE2 docs** before a FIPS-required deployment.

## Honesty notes

- These scripts are drafted from established k3s/RKE2 procedures. Lines marked `# VERIFY` are
  version-sensitive (CIS profile string, ports, artifact names) — confirm against the pinned
  release's docs before running. Nothing here has been executed (no Linux host available in the
  drafting environment).
