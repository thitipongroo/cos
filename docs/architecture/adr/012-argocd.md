---
title: 'ADR-012 — ArgoCD for GitOps Continuous Delivery'
status: Accepted
last_updated: '2026-05-29'
authors:
  - thitipongroo
---

# ADR-012: ArgoCD for GitOps Continuous Delivery

> **Status:** Accepted
>
> **Date:** 2026-05-27
>
> **Supersedes:** —

---

## Context

`docs/00-specifications/04-tech-stack.md` section 4.9 mandates **ArgoCD** as the
CD (Continuous Delivery) tool for GitOps-based deployment to EKS.

The previous Phase 17 implementation used **GitHub Actions + kubectl/Helm** for
deployment — running `kubectl apply` or `helm upgrade` as a step inside the CI pipeline.
This approach was flagged as AWAITING_DECISION C-05.

Problems with GitHub Actions + kubectl:

1. **Configuration drift:** if someone runs `kubectl apply` manually, the cluster state
   diverges from git. GitHub Actions does not detect or correct this.
2. **Rollback complexity:** rolling back requires re-running a workflow with a previous
   image tag — slow during incidents.
3. **No deployment visibility:** no UI to see what version is deployed to each
   environment or whether a sync is in progress.
4. **Multi-tenant risk:** for a SaaS platform with multiple tenants sharing one cluster,
   undocumented manual changes are operationally dangerous.

---

## Decision

We will use **ArgoCD** for all CD operations per spec §4.9.

Responsibility split:

| Tool               | Responsibility                                                                          |
| ------------------ | --------------------------------------------------------------------------------------- |
| **GitHub Actions** | CI only: lint → type-check → unit tests → Docker build → Trivy scan → push image to ECR |
| **ArgoCD**         | CD only: detect new image tag in GitOps repo → sync to EKS (staging / production)       |

GitHub Actions no longer runs `kubectl` or `helm upgrade`. After pushing an image to
ECR, it commits the new image tag to a GitOps repository. ArgoCD detects the change
and syncs the cluster.

ArgoCD deployment:

- Installed in the `argocd` namespace on EKS
- One ArgoCD `Application` per deployable unit (see spec §32.2)
- `ApplicationSet` used for tenant namespace management
- Production promotion: manual sync gate in ArgoCD UI (replaces GitHub Actions manual
  approval step)
- Rollback: `argocd app rollback <app> <revision>` — instant, no new pipeline run required

---

## Rationale

- **Spec authority:** spec §4.9 names ArgoCD explicitly with GitOps pipeline described
  step-by-step.
- **Self-healing:** ArgoCD continuously reconciles cluster state with git. Manual
  `kubectl` changes are reverted automatically within 3 minutes — critical for
  multi-tenant SaaS operational safety.
- **Faster rollback:** `argocd app rollback` is instant (switch to previous git revision);
  GitHub Actions rollback requires pipeline execution (~5–10 min).
- **Deployment visibility:** ArgoCD web UI shows health of every pod, sync status,
  and deployment history per environment — accessible to the product owner.
- **Cost:** ArgoCD is open-source (Apache 2.0). No additional licensing cost.

---

## Consequences

### Positive

- Configuration drift impossible — ArgoCD self-heals within the sync interval (default 3 min)
- Rollback during incidents takes seconds, not minutes
- Deployment history visible in ArgoCD UI — full audit trail per environment
- GitHub Actions pipelines simplified (no kubectl, no helm upgrade)
- `helm rollback` command in Phase 19 checklist replaced with `argocd app rollback`

### Negative / Trade-offs

- ArgoCD server runs in the cluster (~256MB RAM pod + Redis for state)
- Team must learn ArgoCD concepts (Application, ApplicationSet, sync policy, health checks)
- GitOps repo (image tag commits) adds one extra step to the CI pipeline
- Local development is unaffected (docker-compose only; ArgoCD is cluster-only)

### Risks

- **ArgoCD sync loop** if image tag update commit triggers CI again — mitigation: GitOps
  repo is separate from application repo, or use `[skip ci]` in the commit message
- **ArgoCD RBAC misconfigured** could allow unauthorized promotion to production —
  mitigation: ArgoCD RBAC configured with `readonly` for developers, `sync` for
  deployment engineers, `admin` for platform team only

---

## Alternatives Considered

| Option                   | Reason Rejected                                                 |
| ------------------------ | --------------------------------------------------------------- |
| GitHub Actions + kubectl | No self-healing; no drift detection; conflicts with spec §4.9   |
| Flux CD                  | Also GitOps-native, but ArgoCD is explicitly named in spec §4.9 |
| Helm only (no GitOps)    | No drift detection; rollback requires pipeline re-run           |

---

## References

- `docs/00-specifications/04-tech-stack.md` §4.9 — ArgoCD mandate
- `docs/00-specifications/08-enterprise-deployment.md` §8.6 — Deployment packaging (Helm + ArgoCD)
- `docs/00-specifications/32-implementation-specifications.md` §32.2 — Deployable units

---

_Template source: `docs/01-architecture/adr/000-template.md`_
_Format: Based on Michael Nygard's ADR format_
