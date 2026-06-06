# ADR-008: Tenant Isolation — Shared DB + tenant_id + PostgreSQL RLS

**Date:** 2026-06-05
**Status:** Accepted
**Deciders:** Engineering Lead
**Tags:** data, architecture, security

---

## Context

The initial implementation adopted schema-per-tenant as the primary isolation mechanism for the MVP.
Under that model each tenant received a dedicated PostgreSQL schema (`acme_corp`, `riverside_const`, etc.)
and every query was routed through `TenantPrismaService`, which issued `SET LOCAL search_path = {tenant_code}`
inside a transaction before calling the ORM.

Two problems were identified during the Stage 1 BUILD phase:

1. **Inconsistency** — Finance, Files, and Notification modules were implemented as global named schemas
   (`finance`, `files`, `notifications`) with `tenant_id` column filtering, while Project, BOQ, Procurement,
   and Site-Ops used schema-per-tenant. The codebase had two patterns with no enforced rule distinguishing them.

2. **Misalignment with spec** — `docs/specifications/21-mvp-scope.md` explicitly states:
   _"Isolation model: Shared DB + tenant_id (SMB tier from the start)"_.
   Schema-per-tenant is the mid-market upgrade path, not the MVP baseline.

Additionally, the shared-DB + RLS model is the industry standard for SaaS at SMB scale
(Stripe, GitHub, Linear, PostHog) and provides two operational advantages over schema-per-tenant:

- Migrations run once against each named schema (not once per tenant)
- Cross-tenant analytics queries are possible without dynamic schema switching

## Decision

Adopt **Shared DB + tenant_id + PostgreSQL Row Level Security** as the single standard for all
domain modules. Schema-per-tenant remains a future upgrade path for tenants that move to the
mid-market tier.

### Schema convention

One named PostgreSQL schema per domain module (global, shared across tenants):

| Schema                | Owner module                                    |
| --------------------- | ----------------------------------------------- |
| `platform`            | Identity / Tenant (cross-tenant, no RLS needed) |
| `projects`            | Project Management                              |
| `boq`                 | Bill of Quantities                              |
| `procurement`         | Procurement                                     |
| `site_ops`            | Site Operations                                 |
| `finance`             | Finance                                         |
| `files`               | File Service                                    |
| `notifications`       | Notification Service                            |
| `equipment`           | Equipment Service                               |
| `workforce`           | Workforce Service                               |
| `ai`                  | AI Services                                     |
| `equipment_telemetry` | IoT Telemetry (TimescaleDB)                     |
| `workforce_telemetry` | Attendance / Biometric (TimescaleDB)            |

### Mandatory rules for every domain table

1. `tenant_id UUID NOT NULL` (exceptions: `platform` cross-tenant tables; `notification_templates.tenant_id` is nullable — null = system template)
2. All SQL must use schema-qualified names: `procurement.vendors`, `finance.project_budgets`
3. RLS must be enabled on every domain table:

```sql
ALTER TABLE {schema}.{table} ENABLE ROW LEVEL SECURITY;
ALTER TABLE {schema}.{table} FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON {schema}.{table}
  AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);
```

4. The application must issue `SET LOCAL app.current_tenant_id = '{tenant_id}'`
   inside a transaction before any query on that connection.
5. Application-layer `WHERE tenant_id = $1` is required as secondary defense-in-depth.

### What replaces TenantPrismaService

`TenantPrismaService` (schema-per-tenant routing via `SET LOCAL search_path`) is retired.
Modules that previously used it migrate to direct `PrismaClient` or raw SQL with schema-qualified
table names. The application middleware sets `app.current_tenant_id` for RLS enforcement.

PgBouncer remains mandatory (QM-18) for connection pool management. Transaction mode is still
required because `SET LOCAL app.current_tenant_id` is transaction-scoped.

## Rationale

**Why reverse the previous schema-per-tenant decision?**
The spec (`21-mvp-scope.md §21.5`) is unambiguous: MVP uses "Shared DB + tenant_id (SMB tier)".
The schema-per-tenant implementation was the mid-market pattern implemented ahead of schedule, creating inconsistency.
Aligning implementation with the spec reduces cognitive overhead and eliminates the two-pattern problem.

**Why RLS over application-only filtering?**
Application-layer `WHERE tenant_id = $1` is enforced by convention — a developer can forget it.
RLS is enforced by PostgreSQL unconditionally, even when queries are issued outside NestJS
(migrations, psql sessions, admin scripts). The two layers together provide defense-in-depth.

**Why not schema-per-tenant for the MVP?**
Schema-per-tenant requires running migrations for every tenant at onboarding and every schema change.
At hundreds of tenants this becomes a multi-hour operation. Shared DB + RLS runs migrations once.
Construction OS upgrades tenants to Dedicated DB when they move to the enterprise tier.

## Consequences

### Positive

- Single consistent pattern across all domain modules
- Aligns with `docs/specifications/21-mvp-scope.md` isolation model
- Migrations run once per schema change (not once per tenant)
- Cross-tenant analytics possible (required for AI reporting features)
- RLS enforced at DB level — cannot be bypassed by application bugs

### Negative

- `TenantPrismaService` must be retired — modules using it (projects, boq, procurement, site-ops) need migration updates and repository changes
- Existing migrations for those modules need companion migrations to move tables to named schemas with RLS
- RLS policies must be added to every new migration going forward

### Neutral

- PgBouncer remains required (QM-18); transaction mode still correct for `SET LOCAL`
- `platform` schema is unchanged (cross-tenant, no RLS, used by identity/tenant modules)
- `notification_templates` retains nullable `tenant_id` — system templates (tenant_id = null) are valid

## Migration path for existing modules

| Module        | Current state          | Target state             | Required action                   |
| ------------- | ---------------------- | ------------------------ | --------------------------------- |
| projects      | per-tenant schema      | `projects` global schema | new migration + update repository |
| boq           | per-tenant schema      | `boq` global schema      | new migration + update repository |
| procurement   | per-tenant schema      | `procurement` global     | new migration + update repository |
| site_ops      | per-tenant schema      | `site_ops` global        | new migration + update repository |
| finance       | `finance` global       | `finance` global         | add RLS policies only             |
| files         | `files` global         | `files` global           | add RLS policies only             |
| notifications | `notifications` global | `notifications` global   | add RLS policies only             |
| equipment     | not yet built          | `equipment` global       | build with standard from start    |
| workforce     | not yet built          | `workforce` global       | build with standard from start    |

## References

- `docs/specifications/07-multi-tenant-architecture.md §7.7` — PostgreSQL Schema Convention (authoritative)
- `docs/specifications/11-database-schema.md §11.0` — Schema Convention and Isolation Standard
- `docs/specifications/21-mvp-scope.md §21.5` — MVP isolation model
- ADR-015 — Database retry helper pattern (unchanged)
- QM-18 — PgBouncer connection pool management (unchanged)
