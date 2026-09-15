# tenant

NestJS module for tenant provisioning and multi-tenant isolation.

## Purpose

Implements shared-DB tenant isolation (ADR-008: tenant_id column + PostgreSQL RLS).
All domain tables carry a `tenant_id UUID` column. RLS policies enforce isolation at the
PostgreSQL layer — no per-tenant schema is created.

All requests are routed via `TenantMiddleware`, which extracts `tenantId` from the JWT
and sets `SET LOCAL app.current_tenant_id = '{tenant_id}'` at the start of every
transaction. PostgreSQL RLS enforces that queries only touch rows belonging to that tenant.

Also handles Keycloak realm provisioning when a new tenant is created.

## Public API

```text
POST /api/v1/admin/tenants          — provision new tenant (SYSTEM_ADMIN only)
GET  /api/v1/admin/tenants          — list tenants (SYSTEM_ADMIN only)
PATCH /api/v1/admin/tenants/:id     — update tenant metadata
POST /api/v1/admin/tenants/:id/deactivate — deactivate tenant
```

Middleware (applied globally): `TenantMiddleware` — extracts `tenantId` from JWT, sets `req.tenantId`.

### Audit-log reads (SYSTEM_ADMIN, 2026-09-15)

```text
GET /api/v1/admin/tenants/:tenantId/audit-logs?cursor=&limit=&q=          — one tenant, newest first
GET /api/v1/admin/tenants/:tenantId/audit-logs/export.csv?q=              — one tenant, CSV
GET /api/v1/admin/audit-logs?tenantId=&actorId=&action=&from=&to=&q=&cursor=&limit=  — all tenants
GET /api/v1/admin/audit-logs/summary?from=&to=                            — total · today · with_justification · privileged · privileged_7d
GET /api/v1/admin/audit-logs/export?format=csv|json&<the list filters>    — all tenants, CSV or JSON
```

`TenantAuditLogController` and `AdminAuditLogController` over `AdminAuditLogService`
(`admin-audit-log.service.ts`), documented in `docs/api/tenant.openapi.yaml`.

- **Every read is itself audited** — one `platform.audit_logs` row per call, action `audit.read` or
  `audit.export`, resource_type `audit_log`, filters in `metadata`, written in the read's transaction.
  A read whose audit row cannot be written fails. The row's tenant is the path tenant, else the
  `tenantId` filter's tenant, else the caller's own tenant.
- **RLS:** `audit_logs` policies apply `TO app_user` and allow one tenant at a time, so these reads run
  on the platform connection (`createPrismaClient()`, `DATABASE_URL`), the RLS-bypassing role that
  `TenantService` and the other cross-tenant jobs already use. Each read first checks that the role
  does bypass RLS, and answers 503 when it does not, instead of returning one tenant's rows as if they
  were all of them.
- Paging is keyset on `(occurred_at DESC, log_id DESC)`. The cursor holds the timestamp to the
  microsecond, so rows written within the same millisecond are not skipped. `limit` is 1-100, 50 by default.
- Exports stop at **50 000 rows** (`AUDIT_EXPORT_ROW_CAP`) and say whether they were cut:
  `X-Export-Truncated` on the response, and `truncated` in the JSON body. The CSV escaping is
  `shared/csv/escape-csv.ts`, which the BOQ export also uses.
- A credential-bearing URL inside `metadata` or `justification` is replaced by `[REDACTED]`.

## Dependencies

- `@cos/database` — `TenantPrismaService` pattern for RLS-scoped transactions (ADR-008)
- `@cos/rbac` — `SYSTEM_ADMIN` guard for admin endpoints
- `@cos/logger` — structured logging
- Keycloak — realm creation on tenant provisioning
- PgBouncer (transaction mode) — required; `SET LOCAL` is transaction-scoped

## Configuration

| Variable                       | Description                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                 | Points to PgBouncer, NOT PostgreSQL port 5432 directly                                            |
| `KEYCLOAK_ADMIN_URL`           | Keycloak admin API base URL                                                                       |
| `KEYCLOAK_ADMIN_CLIENT_SECRET` | Injected via AWS SM / Vault                                                                       |
| `APP_SECRET_ENCRYPTION_KEY`    | AES-256-GCM key used to encrypt `platform.tenants.dedicated_db_url` at rest (security review F5b) |
| `TRUSTED_PROXY_CIDRS`          | Edge ranges trusted for `X-Forwarded-For` — also gates Fastify `trustProxy` (F3)                  |

### IAM — enterprise provisioning worker (Temporal)

The `enterprise-provisioning` Temporal worker reads and creates AWS Secrets Manager secrets (security
review F4/F9): the AWS-managed RDS master secret, and a per-tenant `app_user` credential at
`cos/{env}/tenant-db/{tenantCode}/app_user`. Its role needs:

```json
{
  "Effect": "Allow",
  "Action": [
    "secretsmanager:GetSecretValue",
    "secretsmanager:CreateSecret",
    "secretsmanager:TagResource"
  ],
  "Resource": [
    "arn:aws:secretsmanager:*:*:secret:cos/*/tenant-db/*",
    "arn:aws:secretsmanager:*:*:secret:rds!db-*"
  ]
}
```

**This role is not created by anything in this repository.** There is no Terraform resource for
application IAM roles and no Kubernetes manifest for this worker here — the same situation as the
External Secrets Operator role, which `infrastructure/kubernetes/external-secrets/README.md` documents
and an operator attaches out of band (IRSA). Follow that pattern: create the role, then annotate the
worker's ServiceAccount with `eks.amazonaws.com/role-arn`. Without it, `createRdsActivity` succeeds and
`secureAppUserActivity` fails, leaving the tenant DB with the app_user password from migration
`20260623000001` — which is the F9 finding.

## Usage

All downstream modules use `TenantPrismaService` instead of raw `PrismaClient`:

```typescript
// In any module's service:
constructor(private readonly db: TenantPrismaService) {}

async findProjects() {
  return this.db.run((tx) =>
    tx.$queryRaw`SELECT * FROM projects.projects WHERE tenant_id = current_setting('app.current_tenant_id')::uuid`
  );
}
```

Provisioning flow:

1. `POST /api/v1/admin/tenants` → creates tenant record in `platform.tenants` + creates Keycloak realm
2. Emits `tenant.created` Kafka event

## Notes

- `tenant_code` is a data field (e.g. `acme_corp`) — no per-tenant PostgreSQL schema is created
- `platform.tenants` lives in schema `platform` (cross-tenant system tables)
- `TenantMiddleware` enforces tenant context on every request — developers cannot bypass via ORM base class
- See ADR-008 for the shared-DB tenant isolation design rationale
