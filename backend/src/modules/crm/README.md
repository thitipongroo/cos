# crm

NestJS module for leads, opportunities and contacts (basic CRM, MVP scope).

## Purpose

Retrofitted CRM capability per ADR-029 — no dedicated phase. Owns the `crm` schema
(`crm.leads`, `crm.opportunities`, `crm.contacts`). The **Customer** entity is not duplicated here:
it lives in `finance.customers`, and opportunity conversion writes there. Source: `00_master`
§Phase 10 Generate (Web App — CRM module); `14-api-architecture` CRM section.

## Public API

```text
POST  /api/v1/crm/leads                                — create lead
GET   /api/v1/crm/leads                                — list leads
POST  /api/v1/crm/opportunities                        — create opportunity
GET   /api/v1/crm/opportunities                        — list opportunities
PATCH /api/v1/crm/opportunities/:opportunityId/convert — convert to customer (writes finance.customers)
POST  /api/v1/crm/contacts                             — create contact
GET   /api/v1/crm/contacts                             — list contacts
GET   /api/v1/crm/customers                            — list customers (read-through to finance)
```

RBAC: read = `EXECUTIVE` + `CRM_SALES_MANAGER`; write = `CRM_SALES_MANAGER` (+ `TENANT_ADMIN`).

## Dependencies

- `@cos/rbac` — `CosRole`, `@Roles` / `@RequirePermissions` decorators
- `@cos/types` — shared enums and DTO types
- `@cos/validation` — class-validator decorators on request DTOs
- `@cos/logger` — structured logging
- `TenantPrismaService` — tenant-scoped database access (RLS enforced)

## Configuration

No module-specific environment variables. Database access uses the shared `DATABASE_URL`
(PgBouncer, transaction mode).

## Usage

```typescript
// Create a lead
POST /api/v1/crm/leads
{ "lead_name": "ACME Tower", "contact_name": "…", "contact_email": "…" }

// Convert a won opportunity into a customer record in finance.customers
PATCH /api/v1/crm/opportunities/<opportunityId>/convert
```

## Notes

- OpenAPI spec: `docs/api/crm.openapi.yaml`.
- ADR-029 overrode the `21-mvp-scope` §21.6 "UI excluded" note — basic CRM UI is in MVP.
- Inbound CRM→COS project creation (Salesforce / HubSpot / Pipedrive webhooks) is a **Phase 3**
  concern (`CRMIntegration` strategy stub), not part of this module.
- Test design: `docs/architecture/test-design/phase-10-mobile-offline-engine.md` §35.10.10 (Web app scope).
