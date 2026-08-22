# safety

NestJS module for safety incidents, work permits, safety checklists and compliance view.

## Purpose

Implements the MVP safety scope (`21-mvp-scope` §21.2): incident reports, safety checklists, work
permits and the permit-approval workflow. Split out of site-ops under ADR-027 so the safety surface
is explicit. Source: `00_master` §Phase 6 Safety APIs; `15-event-driven-workflow` §15.5.

## Public API

```text
POST  /api/v1/safety/incidents                          — report incident (Site Engineer, Safety Officer)
GET   /api/v1/safety/incidents                          — list incidents (project/status/severity)
PATCH /api/v1/safety/incidents/:incidentId/acknowledge  — acknowledge incident (Safety Officer)

POST  /api/v1/safety/permits                            — create permit request (PENDING)
GET   /api/v1/safety/permits                            — list permits (project/status)
PATCH /api/v1/safety/permits/:permitId/approve          — approve permit (→ ACTIVE)
PATCH /api/v1/safety/permits/:permitId/reject           — reject permit (→ REVOKED)

GET   /api/v1/safety/checklists                         — list safety checklists
POST  /api/v1/safety/checklists                         — submit completed checklist
GET   /api/v1/safety/compliance                         — compliance summary
```

## Dependencies

- `@cos/rbac` — `SAFETY_OFFICER`, `SITE_ENGINEER`, `PROJECT_MANAGER` guards
- `@cos/types` — shared enums (severity, permit status)
- `@cos/logger` — structured logging
- `TenantPrismaService` — tenant-scoped access (RLS enforced)
- Notification module (via Kafka) — incident escalation

## Configuration

No module-specific environment variables. Uses the shared `DATABASE_URL` (PgBouncer) and
`KAFKA_BROKERS`.

## Usage

```typescript
// Report an incident
POST /api/v1/safety/incidents
{ "project_id": "<uuid>", "severity": "HIGH", "description": "…" }

// Permit approval chain (§15.5): initiator → SAFETY_OFFICER approves → PM final
PATCH /api/v1/safety/permits/<permitId>/approve
```

## Notes

- **Critical safety notifications cannot be disabled or quieted** — they override quiet hours and
  user preferences (`19-notification-architecture` §19.6).
- An unacknowledged safety incident escalates to the PM after **30 minutes** (§19.3).
- Offline conflict strategy for `safety_checklists` is **SERVER_WINS** — the client version is
  rejected unconditionally with `CONFLICT_REJECTED` (QM-9). Safety data is authoritative.
- A task cannot complete while a linked HIGH/CRITICAL incident is open (Phase 6 gate #5) or while a
  linked permit is `EXPIRED`/`REVOKED` (gate #4).
- OpenAPI spec: `docs/api/safety.openapi.yaml`.
- Test design: `docs/specifications/35-test-design.md` §35.10.6.
