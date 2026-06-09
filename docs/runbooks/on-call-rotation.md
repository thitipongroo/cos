# On-Call Rotation Runbook

**Source:** QM-17 — Incident Management  
**Required before:** Stage 2 go-live

---

## Incident Severity Levels

| Severity | Definition                                                               | Response Target   |
| -------- | ------------------------------------------------------------------------ | ----------------- |
| **P0**   | Complete service outage OR data loss OR security breach                  | 15 minutes        |
| **P1**   | Partial outage affecting > 10% of tenants OR SLO error budget burn > 10× | 30 minutes        |
| **P2**   | Degraded performance, non-critical feature failure, SLO burn > 2×        | 2 hours           |
| **P3**   | Minor bug, cosmetic issue                                                | Next business day |

---

## Pre-On-Call Checklist

Before going on-call, the engineer must have **live access** to all of the following:

- [ ] **Grafana** — dashboards loading, SLO dashboard reachable
- [ ] **Alertmanager / Prometheus** — alert rules visible, can silence/resolve alerts
- [ ] **Temporal console** — can view workflow history and worker health
- [ ] **Kubernetes** — `kubectl get pods -n cos` returns healthy pods
- [ ] **PagerDuty** — escalation policy verified, test page received on personal device
- [ ] **Status page** — admin access confirmed (Atlassian Statuspage or equivalent)
- [ ] **Slack / incident channel** — can create and pin messages

---

## Rotation Schedule

| Week                  | Primary On-Call | Secondary (Backup) |
| --------------------- | --------------- | ------------------ |
| (fill before Stage 2) | —               | —                  |

**Rotation cadence:** Weekly, hand-off every Monday 09:00 ICT  
**Overlap window:** Outgoing + incoming on-call overlap for 30 minutes on hand-off day

---

## Incident Response Procedure

1. **Declare** — open incident channel `#incident-YYYY-MM-DD-<slug>` in Slack
2. **Assign IC** — first responder is Incident Commander until explicitly reassigned
3. **Mitigate** — stop the bleeding before investigating root cause
4. **Communicate** — notify affected tenants within 30 minutes of P0/P1 via status page
5. **Resolve** — write blameless post-mortem within 5 business days for P0/P1 (see `postmortem-template.md`)

---

## PagerDuty Escalation Policy

```
Layer 1: Primary on-call — page immediately on P0/P1 alert
         Timeout: 10 minutes → escalate to Layer 2

Layer 2: Secondary on-call (backup)
         Timeout: 10 minutes → escalate to Layer 3

Layer 3: Engineering Lead / Product Owner
         No timeout — final escalation
```

**Policy must be tested in staging** before Stage 2 go-live (fire a test alert, confirm all layers receive pages).

---

## Escalation Contacts

| Role             | Name                  | PagerDuty handle |
| ---------------- | --------------------- | ---------------- |
| Engineering Lead | (fill before Stage 2) | —                |
| Product Owner    | (fill before Stage 2) | —                |

---

## Key URLs (fill before Stage 2)

| Tool         | URL                                     |
| ------------ | --------------------------------------- |
| Grafana      | `https://grafana.<domain>`              |
| Alertmanager | `https://alertmanager.<domain>`         |
| Temporal UI  | `https://temporal.<domain>`             |
| Argo CD      | `https://argocd.<domain>`               |
| Status page  | `https://status.<domain>`               |
| PagerDuty    | `https://construction-os.pagerduty.com` |
