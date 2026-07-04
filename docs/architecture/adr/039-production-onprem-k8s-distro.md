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

**Tiered (product owner, 2026-06-30):**

- **Default production on-premise distribution: k3s** (CNCF-conformant, HA via embedded etcd —
  3-server quorum per §8.5, Apache-2.0 free, already used in dev). POC-validated — see
  `poc/onprem-k8s/results-2026-06-30.md`.
- **Regulated / sovereign tenants requiring CIS-benchmark or FIPS hardening: RKE2** (CIS-hardened +
  FIPS by default, Apache-2.0 free, strong air-gap install).

Cloud stays on **EKS**; dev uses **k3s** (single-node; k3d on macOS/Windows) — this ADR scopes only
the production on-prem distro. Application
artifacts (Helm charts, ArgoCD apps) are identical across EKS and either on-prem distro.

### Conditions (validation still owed before production go-live)

The macOS POC validated k3s HA + CNCF conformance + COS-Helm-chart acceptance, but **could not**
test on Linux: air-gap install, CIS/FIPS hardening, full etcd snapshot-restore; and **RKE2 was not
POC'd at all**. Therefore:

1. Before the first **on-prem k3s** production go-live: run a **Linux** drill for air-gap install +
   etcd snapshot-restore (QM-12) + CIS scan.
2. Before the first **RKE2** (regulated) production deployment: run the k3s-vs-RKE2 Linux POC
   (air-gap + CIS/FIPS + etcd snapshot-restore) to confirm RKE2 meets the rubric.

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

**Outcome (see Decision above):** **k3s** selected as the default, **RKE2** for CIS/FIPS-regulated
tenants — both free Apache-2.0, HA-capable, CNCF-conformant, air-gap-friendly (k3s carries in-house
familiarity; RKE2 adds CIS/FIPS hardening). **kubeadm / Talos / kubespray** were the compared
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
