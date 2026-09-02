---
paths:
  - "docs/runbooks/**"
  - "infrastructure/monitoring/**"
---

# QM-17 — Incident Management

Indexed in: `context.md` §QUALITY MANDATES

- **Incident severity:**
  - P0: complete service outage OR data loss OR security breach — response within 15 minutes
  - P1: partial outage affecting > 10% of tenants OR SLO error budget burn > 10× — response within 30 minutes
  - P2: degraded performance, non-critical feature failure, SLO burn > 2× — response within 2 hours
  - P3: minor bug, cosmetic issue — response within next business day
- **On-call rotation** — defined in `docs/runbooks/on-call-rotation.md`; on-call engineer must have live access to Grafana, Alertmanager/Prometheus, Temporal console, and Kubernetes before going on-call
- **Incident response procedure:**
  1. Declare incident (open incident channel)
  2. Assign Incident Commander (IC) — first responder owns coordination until reassigned
  3. Mitigate (stop the bleeding) before investigating root cause
  4. Communicate to affected tenants within 30 minutes of P0/P1 declaration via status page
  5. Resolve and write blameless post-mortem within 5 business days for P0/P1
- **Status page** — required before Stage 2 go-live; auto-updates from Alertmanager/Prometheus alerts; managed via Atlassian Statuspage or equivalent
- **PagerDuty** (or equivalent) — required before Stage 2 go-live; escalation policy defined and tested in staging
- **Post-mortem** — blameless; must include: root cause, timeline, impact assessment, action items with owners and due dates; template in `docs/runbooks/postmortem-template.md`
