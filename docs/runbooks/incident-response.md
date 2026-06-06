# Incident Response Runbook

**STUB** — detailed procedures to be defined before Stage 1→2 transition (production launch).

## Severity Levels

| Severity | Definition | Response SLA |
| --- | --- | --- |
| P1 — Critical | Platform down; data loss risk; security breach | 15 minutes to first response |
| P2 — High | Core feature unavailable for ≥ 10% of users | 30 minutes to first response |
| P3 — Medium | Degraded performance; non-critical feature down | 2 hours to first response |
| P4 — Low | Minor issue; workaround available | Next business day |

## Response Steps

### P1 / P2 Incidents

1. **Acknowledge** — on-call engineer acknowledges PagerDuty alert within SLA
2. **Triage** — identify affected service, error type, and blast radius
3. **Communicate** — post to incident Slack channel; update status page
4. **Contain** — rollback if deployment-related (see [rollback.md](rollback.md));
   isolate affected tenant if tenant-scoped
5. **Resolve** — apply fix or rollback; verify metrics return to baseline
6. **Document** — file incident report within 24 hours; root-cause analysis within 72 hours

### Security Incidents

If a security breach is suspected:

1. Immediately notify thitipongroo (product owner) and legal team
2. Preserve all logs — do not rotate or delete
3. Revoke suspected credentials (JWT signing keys, API keys) — see `05-security-compliance` §5.2
4. Conduct forensic review before restoring service

## Escalation

| Condition | Escalate to |
| --- | --- |
| Data loss confirmed | thitipongroo + legal |
| Tenant data breach suspected | thitipongroo + legal + affected TENANT_ADMIN |
| Platform unavailable > 1 hour | thitipongroo |
