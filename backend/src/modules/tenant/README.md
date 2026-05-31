# tenant

NestJS module for tenant provisioning and multi-tenant schema isolation.

## Purpose

Implements the schema-per-tenant isolation model (ADR-008). Each tenant gets one PostgreSQL schema (`{tenant_code}`, e.g. `acme_corp`). All requests are routed to the correct schema via `TenantMiddleware`, which sets `SET LOCAL search_path = {tenant_code}` inside a PgBouncer transaction.

Also handles Keycloak realm provisioning when a new tenant is created.

## Public API

```
POST /api/v1/admin/tenants          — provision new tenant (SYSTEM_ADMIN only)
GET  /api/v1/admin/tenants          — list tenants (SYSTEM_ADMIN only)
PATCH /api/v1/admin/tenants/:id     — update tenant metadata
POST /api/v1/admin/tenants/:id/deactivate — deactivate tenant
```

Middleware (applied globally): `TenantMiddleware` — extracts `tenantId` from JWT, sets `search_path`.

## Dependencies

- `@cos/database` — `TenantPrismaService` pattern for schema-pinned transactions
- `@cos/rbac` — `SYSTEM_ADMIN` guard for admin endpoints
- `@cos/logger` — structured logging
- Keycloak — realm creation on tenant provisioning
- PgBouncer (transaction mode) — required; `SET LOCAL` is transaction-scoped

## Configuration

| Variable                       | Description                                            |
| ------------------------------ | ------------------------------------------------------ |
| `DATABASE_URL`                 | Points to PgBouncer, NOT PostgreSQL port 5432 directly |
| `KEYCLOAK_ADMIN_URL`           | Keycloak admin API base URL                            |
| `KEYCLOAK_ADMIN_CLIENT_SECRET` | Injected via AWS SM / Vault                            |

## Usage

All downstream modules use `TenantPrismaService` instead of raw `PrismaClient`:

```typescript
// In any module's service:
constructor(private readonly db: TenantPrismaService) {}

async findProjects(tenantId: string) {
  return this.db.run(tenantId, (prisma) => prisma.project.findMany());
}
```

Provisioning flow:

1. `POST /api/v1/admin/tenants` → creates PostgreSQL schema + runs migrations + creates Keycloak realm
2. Emits `tenant.created` Kafka event

## Notes

- Schema naming: `{tenant_code}` (e.g. `acme_corp`) — NOT `tenant_{id}`
- `identity` module tables live in schema `platform` (cross-tenant system tables)
- `TenantMiddleware` enforces tenant context on every request — developers cannot bypass via ORM base class
- See ADR-008 for the full schema-per-tenant design rationale
