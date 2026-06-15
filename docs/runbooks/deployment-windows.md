# Construction OS — Production Deployment Windows

> **Purpose:** Define approved windows for production deployments. Source: QM-16.
> All production deployments (except emergency hotfixes) must occur within these windows.
>
> **Emergency hotfixes** (P0 / P1 incident response) are exempt from window restrictions but
> require explicit product owner approval on record before proceeding.

---

## Approved deployment windows

All times are in **ICT (UTC+7)** — Thailand timezone, the primary operational timezone.

### Regular windows (weekly)

| Day | Window (ICT) | Window (UTC) | Notes |
|-----|-------------|-------------|-------|
| Tuesday | 22:00 – 00:00 | 15:00 – 17:00 UTC | Low site-ops traffic (evening after field hours) |
| Thursday | 22:00 – 00:00 | 15:00 – 17:00 UTC | Low site-ops traffic (evening after field hours) |
| Saturday | 10:00 – 14:00 | 03:00 – 07:00 UTC | Weekend — lowest usage; extended window |

### Blackout periods (no deployments)

| Period | Reason |
|--------|--------|
| Thai public holidays | High field crew activity; no deployment support available |
| Monday 06:00–18:00 ICT | Peak weekly construction planning meetings |
| Last business day of month | Finance close; high finance module usage |
| During active P0 / P1 incident | Freeze all non-incident deployments until resolved |
| During DR drill | Per QM-12 DR drill procedure |

### Pre-major release window

For major releases (blue-green deployment required per QM-16), use the **Saturday** window only,
minimum 4-hour window. Notify all tenants 48 hours in advance via in-platform notification.

---

## Deployment approval process

1. **T-48h**: Engineer creates deployment ticket; links to deployment runbook for this release
2. **T-24h**: Engineering lead reviews: CI green, staging verified, rollback script ready
3. **T-1h**: On-call engineer confirms monitoring dashboards are live (Grafana, Alertmanager)
4. **T-0**: Deployment begins within approved window
5. **T+10min**: Automated health gate check — if error rate > 1%, pipeline rolls back automatically (QM-16)
6. **T+30min** (canary): Canary must hold 30 min at 5% traffic before full rollout (QM-16)
7. **T+60min**: Full rollout complete; engineer confirms SLO dashboards nominal

---

## Emergency hotfix procedure

When a P0 or P1 incident requires an out-of-window deployment:

1. Incident Commander (IC) declares the hotfix need in the incident channel
2. Product owner approves via explicit message (Slack / written record) — no verbal approvals
3. IC documents: reason for out-of-window, product owner approval reference, rollback plan
4. Engineering lead and IC monitor deployment end-to-end
5. Post-mortem includes review of whether the hotfix could have been avoided

Approval record must be committed to `docs/runbooks/releases/{YYYY-MM-DD}-hotfix-{ticket}.md`
within 24 hours of the deployment.

---

## Deployment runbooks by release type

| Release type | Runbook location | Window required |
|-------------|-----------------|----------------|
| Standard rolling update | `docs/runbooks/deployment.md` | Tue / Thu / Sat window |
| Major version (blue-green) | `docs/runbooks/releases/` | Saturday window only |
| Database migration | `docs/runbooks/deployment.md` §database | Tue / Thu / Sat window |
| Emergency hotfix | `docs/runbooks/incident-response.md` §hotfix | Any time — product owner approval required |
| Stage transition | `docs/runbooks/production-readiness.md` | Product owner scheduled — Saturday window |

---

## History

| Date (ICT) | Release | Type | Outcome | Notes |
|------------|---------|------|---------|-------|
| _(no production deployments yet — Stage 1 BUILD)_ | | | | |

---

## Review schedule

| Trigger | Action |
|---------|--------|
| Thai public holidays update (annually, October) | Update blackout period list for the following year |
| Stage 1 → Stage 2 | Confirm tenant count supports longer notification lead times |
| After any deployment incident | Review whether window or process contributed; update if needed |
