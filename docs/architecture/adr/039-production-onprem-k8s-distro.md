# ADR-039: Production on-premise Kubernetes distribution / installer

**Date:** 2026-06-30
**Status:** Accepted (2026-06-30)
**Deciders:** Product owner (interim Platform Lead)
**Tags:** infra

---

## Context

COS runs on Kubernetes in three contexts. Two are specified; one is **UNSPECIFIED**:

| Context                                   | K8s provisioning                                                                                                                                | Source                                                    |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Cloud (Shared SaaS / Dedicated Tenant)    | **AWS EKS** (managed control plane)                                                                                                             | `04-tech-stack` §4.7; `08-enterprise-deployment` §8.1–8.3 |
| Dev                                       | **k3s** (single-node; k3d on macOS/Windows)                                                                                                     | `context/00_master_construction_os.md` (dev deploy)       |
| **Production on-premise / Fully On-prem** | **UNSPECIFIED** — spec requires "Kubernetes worker nodes, 3-node HA cluster" + Helm + ArgoCD, but **does not name a distribution or installer** | `08-enterprise-deployment` §8.4–8.6                       |

For Fully On-premise / sovereign deployments there is no managed control plane (no EKS). Someone must
provision and operate the control plane (API server, etcd, scheduler, controller-manager) themselves.
The spec is silent on **which** Kubernetes distribution/installer to use for production on-prem — a
`grep` across `docs/specifications/`, `context.md`, and the master doc finds **no** mention of
kubeadm / RKE2 / k3s (for prod) / Talos / kubespray / OpenShift / Rancher. This ADR exists to close
that gap; the distribution is a genuine decision, not derivable from the existing spec.

### Constraints the choice must satisfy (from spec)

- **3-node HA control plane** with quorum (`§8.5`: "3-node minimum for quorum").
- **CNCF-conformant** so the existing platform runs unchanged: Helm charts, ArgoCD (GitOps), Argo
  Rollouts (canary, `§8`), cert-manager, Kong, Vault Agent, PgBouncer, EMQX, etc.
- **Air-gapped / offline install** capable — on-prem upgrades are delivered as "container image
  package (on-premise)" (`§8.6`), implying no guaranteed registry/internet egress.
- **etcd backup/restore** to meet the on-prem DR targets (`QM-12`, negotiated RTO/RPO).
- **Security hardening** (CIS Kubernetes benchmark; FIPS where a regulated customer requires it) per
  `§05` and `§8.7` (customer-provided WAF, enterprise CA / self-signed certs).
- Fits the operating-cost reality discussed for self-managed K8s (no managed control plane → the
  operator owns upgrades/patching/etcd) — favours operational simplicity.

## Decision

**SUPERSEDED 2026-07-20 — see "Revised decision" below.** The original tiering was:

- ~~Default production on-premise distribution: **k3s**~~
- ~~Regulated / sovereign tenants requiring CIS-benchmark or FIPS hardening: **RKE2**~~

### Revised decision (product owner, 2026-07-20, confirmed)

**RKE2 is the production on-premise Kubernetes distribution. Not a tier — the only one.**

- **Production on-premise (all customers): RKE2** with `profile: cis`, Apache-2.0, no licence cost.
  Validated end-to-end on Linux — HA, failover, air-gapped install, etcd restore, CIS triage, FIPS
  module, and a real `helm install` running. See `infrastructure/onprem/validation-2026-07-20.md`.
- **Dev: k3s** (single-node; k3d on macOS/Windows) — unchanged.
- **Cloud: EKS** (§8.1–8.3) — unchanged.

Why the tiering was dropped: COS has customers that require CIS/FIPS, so RKE2 must exist in the fleet
regardless. Once it does, running k3s in production as well buys little and costs a second hardening
procedure, upgrade path and runbook — and k3s cannot produce a CIS self-assessment at all (its
apiserver runs in-process, so scanners cannot read its configuration; hardening it moved the score by
zero checks).

**Host OS: Ubuntu 24.04, community RKE2 build** (product owner: no RHEL/SLES procurement). This is a
deliberate trade-off with a compliance consequence — see the FIPS operating-environment note under
Conditions before making any FIPS claim to a customer.

Application artifacts (Helm charts, ArgoCD apps) are identical across EKS and RKE2, **provided the
charts keep `seccompProfile: RuntimeDefault`** — without it RKE2's `restricted` PodSecurity rejects
every Pod while still admitting the Deployment, which fails silently.

### Conditions (validation still owed before production go-live)

Original conditions (2026-06-30) — the macOS POC validated k3s HA + CNCF conformance + COS-Helm-chart
acceptance, but could not test on Linux: air-gap install, CIS/FIPS hardening, full etcd
snapshot-restore; and RKE2 was not POC'd at all. Therefore:

1. Before the first **on-prem k3s** production go-live: run a **Linux** drill for air-gap install +
   etcd snapshot-restore (QM-12) + CIS scan.
2. Before the first **RKE2** (regulated) production deployment: run the k3s-vs-RKE2 Linux POC
   (air-gap + CIS/FIPS + etcd snapshot-restore) to confirm RKE2 meets the rubric.

#### Status after the Linux POC (2026-07-20) — `infrastructure/onprem/validation-2026-07-20.md`

Run on 3 × Ubuntu 24.04 VMs, k3s `v1.34.9+k3s1` / RKE2 `v1.34.9+rke2r1`. Nodes were **4 vCPU / 4 GB**
— below `§8.5` (16 vCPU / 64 GB), accepted by the product owner: functional outcomes are valid,
timing/capacity numbers are not production-representative.

- **Condition 1 (k3s): CLOSED.** Air-gap install verified with egress provably blocked; etcd
  snapshot-restore **RTO 90 s** vs the QM-12 30-min target, with point-in-time correctness proven;
  full HA drill passed (survived 1-of-3 loss, scaled while degraded, self-healed, rejoined).
  **Rubric 4 is unmeasurable for k3s, and this matters:** k3s has **no `profile: cis` switch** (the
  v1.34.9 binary exposes no `--profile` flag), so hardening was assembled by hand. It was applied and
  proven live — secrets encryption `Enabled`, a 21 MB audit log, and an apiserver that refused to boot
  until `EventRateLimit` was configured — **yet the CIS score did not change by a single check**.
  kube-bench reads process command lines and static pod manifests; k3s runs the apiserver in-process
  and exposes neither, so it reports false negatives (e.g. `NodeRestriction is set` → FAIL on a
  cluster where that plugin is provably loaded). k3s is not shown to be insecure — it is shown to be
  **unattestable** with current tooling.
- **Condition 2 (RKE2): CLOSED, with one residual gap.**
  - A **blocker was found and fixed the same day**: RKE2 `profile: cis` enforces PodSecurity
    `restricted`, and none of the 8 COS Helm charts set `seccompProfile` — Deployments were admitted
    but **zero Pods** were created. Adding `seccompProfile.type: RuntimeDefault` to each chart's
    pod-level `securityContext` resolved it; re-tested on the live CIS cluster, Pods are now created
    with the profile admitted and no `FailedCreate`.
  - RKE2's hardening is **evidenced by behaviour**: `profile: cis` genuinely enforces PodSecurity
    `restricted` cluster-wide (proven by Pods being rejected until the charts complied). It also
    scores `cis-1.12` **57 PASS / 18 FAIL** against k3s's 8/61 — but **do not quote that gap as a
    security comparison**; it largely reflects that RKE2 lays out kubeadm-style static pods kube-bench
    can read, while k3s does not. **FIPS needs no special build** — the stock binary reports
    `go1.25.11 X:boringcrypto`.
  - **Full 3-node node-loss drill passed:** node hard-stopped → `NotReady` in 30 s → API `/readyz`
    `ok` on 2/3 quorum → scaled up *while degraded* → self-healed in 302 s → rejoined immediately.
  - **A real `helm install` with a real image runs**: Pod `1/1`, 0 restarts, health endpoint `200`.
  - **Air-gapped install verified** with `profile: cis` and egress provably blocked (images loaded
    from `rke2-images.linux-amd64.tar.zst` via `INSTALL_RKE2_ARTIFACT_PATH`).
  - **etcd snapshot-restore verified** — recovered from a genuine etcd quorum loss in **277 s**
    (QM-12 target 30 min), point-in-time correctness proven.
  - **Residual gap:** RKE2's etcd restore was measured on a 2-node cluster (a node had been
    repurposed at that moment), and no real image **registry** pull path was exercised — images were
    side-loaded into containerd because the environment has no registry.
- **New constraint on the shipping Kubernetes version.** kube-bench's newest benchmark is `cis-1.12`
  (K8s 1.32–1.34); distro-tailored profiles are older still. **Pinning a minor newer than 1.34 means
  no supported CIS self-assessment** — decisive for the regulated tenants RKE2 exists to serve.

Both conditions are now closed for the purposes of this ADR. Remaining before a **regulated-tenant**
go-live: verify the health-probe paths for `cos-file-service` and `cos-web` (their routes could not be
located, so they were left untouched), and exercise a real image-registry pull path.

#### CIS/FIPS demand is real, not hypothetical (product owner, 2026-07-20)

The product owner confirmed COS **has customers that require CIS/FIPS**. That removes the conditional
framing above: **RKE2 is mandatory for production on-premise, not a fallback tier.** k3s cannot serve
these customers at any effort level — not because it is less secure, but because its posture is not
machine-attestable (see Condition 1).

This turns two POC caveats into **blocking work before such a customer can be committed to**:

1. **RKE2 `profile: cis` scores 57 PASS / 18 FAIL — fully triaged, and the news is good.**
   See `infrastructure/onprem/cis-exception-register.md`: **0 genuine misconfigurations —
   17 false negatives and 1 needing a documented exception.**
   - Every one of the 17 was disproved against the host: etcd manifests are `600 root:root`, the etcd
     data dir is `700 etcd:etcd`, etcd client **and** peer TLS carry `cert-file`, `key-file` and
     `client-cert-auth: true`, the admin credential is `600 root:root`, and the kubelet's live
     `/configz` reports `anonymous.enabled=false`, `authorization.mode=Webhook`, a `clientCAFile` and
     `makeIPTablesUtilChains=true`.
   - **Root cause, proven:** kube-bench reads kubeadm paths and process command lines. RKE2 uses
     neither. CIS 1.1.13's own remediation text names `/etc/kubernetes/admin.conf`, which does not
     exist on RKE2 — and the check still reported FAIL after the real credential file was tightened,
     confirming the scanner never reads the live configuration.
   - The single open item is **4.2.10 `rotate-certificates`**: not set to `false`, simply not set —
     RKE2 pins the kubelet serving certificate explicitly and rotates it through its own lifecycle.
     The v1.34 kubelet default was **not** established here, so this should be confirmed with
     SUSE/Rancher rather than asserted.
   - Separately, a real weakness was found and fixed while investigating: the install script left
     `/etc/rancher/rke2/rke2.yaml` (admin credentials) world-readable at `0644`. Now `0600`. This did
     **not** move the CIS score, because kube-bench never inspects that file.
   - **A CIS self-assessment against the contracted benchmark still cannot be produced** — see the
     benchmark-version gap below.
2. **FIPS 140-3 — certificates verified 2026-07-20; the host OS is the problem.**
   The contract names **140-3**. RKE2 does have live 140-3 coverage:
   - **NIST CMVP #4735** — *BoringCrypto*, Google LLC, FIPS **140-3** Level 1, **Active**,
     validated 2024-07-23, sunset 2029-07-22.
   - **NIST CMVP #4968** — *SUSE Rancher Kubernetes Cryptographic Library* v2.0, FIPS **140-3**
     Level 1, **Active**, validated 2025-02-20 (updated 2026-05-05), sunset 2029-07-22.
   - A **Corsec attestation letter dated 2025-05-15** states *"Rancher Government Solutions RKE2
     **1.33+** … is utilizing the Google BoringCrypto module … validated against FIPS 140-3 Level 1
     … certificate #4735."* Our pinned **v1.34.9 is within `1.33+`**.

   **Two gaps remain, and both are blocking:**
   - **The host OS is outside both validated boundaries.** Neither certificate lists **Ubuntu** among
     its tested operating environments. #4968 covers RHEL 7.6/7.9/8.8/9.0, SLE Micro 5.3 and
     SLES 15SP4/15SP5; #4735 covers Android, Debian 5.17.11 on GCP, and Google Prodimage. The entire
     POC ran on **Ubuntu 24.04**. Running on an untested OE is at best *vendor-affirmed*, which many
     auditors reject. **Rebuild on RHEL or SLES/SLE Micro before presenting any FIPS evidence.**
   - **The attestation names "Rancher Government Solutions RKE2", not the community build.** Whether
     the community binary from `get.rke2.io` (what this POC installed, and which does report
     `go1.25.11 X:boringcrypto`) is covered by that letter **could not be determined from public
     documentation** — it must be confirmed with SUSE/Rancher directly.
   - Also note: the FIPS documentation states only the **Canal** CNI is rebuilt for FIPS. RKE2's
     default is Canal, which this POC used, so that constraint is already satisfied.

   **Decision (product owner, 2026-07-20): stay on Ubuntu with community RKE2 — no RHEL/SLES
   procurement.** The consequence must be stated plainly wherever FIPS is claimed:

   - CMVP **permits** porting a validated software module to an untested operational environment, and
     the certificate remains valid. But CMVP "makes no statement as to the correct operation of the
     module … in an operational environment not listed on the validation", and a module is considered
     compliant only when run on a **tested or Vendor-Affirmed** OE.
   - Ubuntu 24.04 is **neither tested nor known to be vendor-affirmed** for #4735 or #4968. This
     deployment is therefore **user-ported**: the cryptography is the validated BoringCrypto module,
     but the platform combination carries no CMVP or vendor statement.
   - **Do not represent this to a customer as "FIPS 140-3 validated".** The defensible claim is:
     *"uses the FIPS 140-3 validated BoringCrypto module (CMVP #4735), operated on a user-ported
     operating environment not listed on the certificate."* Whether that satisfies the contract is
     the customer's auditor's call, and it should be raised with them **before** signing.
   - Two questions to SUSE/Rancher would materially improve this position and cost nothing:
     (a) is Ubuntu 24.04 a vendor-affirmed OE for these certificates? (b) does the Corsec attestation
     for "Rancher Government Solutions RKE2 1.33+" extend to the community `get.rke2.io` build?

3. **The contracted CIS benchmark version cannot be assessed with the tooling used.** The customer
   asked for the **latest** CIS Kubernetes Benchmark. CIS currently publishes **v2.0.1**, which
   supports Kubernetes **v1.34 and v1.35** — so the pinned 1.34.9 is *compatible with what was asked
   for*. The obstacle is the scanner: **kube-bench tops out at `cis-1.12`** and has no v2.0 target at
   all. Everything measured in this POC is therefore **v1.12, not v2.0.1**. Closing this needs either
   a manual assessment against v2.0.1 or tooling that supports it (CIS ships automated assessment
   content to SecureSuite members; its Kubernetes coverage was **not** verified here).

### Candidates (all CNCF-conformant; license noted)

| Distro / installer      | License / cost                                | Notes                                                                                                                                  |
| ----------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **RKE2** (SUSE/Rancher) | Apache-2.0 (free); optional paid SUSE support | CIS-hardened + FIPS by default, strong air-gap tooling, embedded-etcd HA — common in gov/regulated on-prem                             |
| **k3s**                 | Apache-2.0 (free); optional paid SUSE support | Lightweight, embedded-etcd HA, air-gap support; **already used in COS dev** (in-house familiarity)                                     |
| **kubeadm** (upstream)  | free (vanilla)                                | Max flexibility, official; most manual ops (you wire HA/etcd/upgrades yourself)                                                        |
| **Talos Linux**         | free (MPL-2.0); optional paid support         | Immutable, API-managed OS; very secure; steeper learning curve (no SSH)                                                                |
| **kubespray**           | free (Apache-2.0)                             | Ansible-based vanilla K8s; flexible; ops via Ansible playbooks                                                                         |
| **OpenShift** (Red Hat) | **commercial (paid subscription)**            | Enterprise support + opinionated platform; conflicts with the OSS-preference baseline but valid if a customer mandates Red Hat support |

### Evaluation rubric (apply before committing — rank each candidate)

1. CNCF conformance — Helm/ArgoCD/Argo Rollouts/cert-manager/Kong run unchanged
2. HA control plane (3-node, etcd topology) — meets `§8.5`
3. Air-gapped / offline install + upgrade — meets `§8.6` image-package model
4. Security hardening out of the box (CIS / FIPS) — meets `§05`, `§8.7`
5. etcd backup/restore + upgrade ergonomics — meets `QM-12`
6. Operational simplicity vs the on-prem operator's team capacity
7. Licensing/support model (free OSS preferred; paid support optional)
8. In-house familiarity (k3s already used in dev)

**Outcome (see Decision above):** originally **k3s** as default with **RKE2** for CIS/FIPS-regulated
tenants; **revised 2026-07-20 to RKE2 for all production on-premise clusters** once the Linux POC
showed k3s cannot be CIS-attested and real CIS/FIPS customers exist. Both are free Apache-2.0,
HA-capable, CNCF-conformant and air-gap-friendly. **kubeadm / Talos / kubespray** were the compared
baselines. The macOS POC validated k3s (HA + COS-Helm acceptance); RKE2 and the remaining rubric
items (air-gap, CIS/FIPS, etcd snapshot-restore) are validated on Linux per the **Conditions** above
before the relevant production go-live.

### Decision trigger & owner

- **Trigger:** first signed Fully-On-premise / sovereign engagement, or before the first on-prem
  Stage-1→2 readiness check, whichever comes first.
- **Owner:** product owner (interim Platform Lead).
- **Action:** run the POC above, score candidates on the rubric, then supersede this ADR with an
  `Accepted` decision and update `08-enterprise-deployment` §8.5–8.6 + `04-tech-stack` §4.4 to name
  the chosen distro.

## Consequences

### Positive

- Closes the UNSPECIFIED gap with an explicit, evidence-based decision path instead of an ad-hoc
  per-engagement choice.
- Keeps cloud (EKS) and dev (k3s) unchanged — scope limited to production on-prem.

### Negative

- Self-managed control plane means the on-prem operator owns etcd backup, HA, upgrades, and patching
  (the ops burden EKS otherwise absorbs) — must be staffed (see the self-host TCO discussion).
- A second distro in the estate (EKS in cloud + chosen distro on-prem) adds operational surface;
  CNCF conformance keeps the app layer identical but cluster-ops runbooks differ per environment.

### Neutral

- Application artifacts (Helm charts, ArgoCD apps) are unchanged across EKS and any conformant
  on-prem distro — only the cluster provisioning/ops layer differs.

## References

- `08-enterprise-deployment` §8.4 Fully On-premise, §8.5 On-premise Minimum Hardware, §8.6 Deployment Packaging
- `04-tech-stack` §4.4 Infrastructure (Kubernetes), §4.7 Cloud (EKS), §4.9 CI/CD (ArgoCD/Helm)
- `context/00_master_construction_os.md` — dev deploy (k3s)
- `QM-12` Disaster Recovery (on-prem RTO/RPO); `§05` / `§8.7` security
