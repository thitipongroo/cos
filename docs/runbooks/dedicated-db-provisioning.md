---
title: Dedicated DB Provisioning
version: 1.0.0
last_updated: 2026-06-06
audience: SYSTEM_ADMIN, Platform Engineering
---

# Dedicated DB Provisioning Runbook

Use this runbook when an enterprise tenant signs a contract requiring dedicated database isolation.

## Prerequisites

Before starting:

- [ ] Tenant exists in `platform.tenants` with `plan_type = 'ENTERPRISE'`
- [ ] Tenant is active (`is_active = true`)
- [ ] RDS (or equivalent PostgreSQL) instance is provisioned and reachable from the app subnet
- [ ] PostgreSQL superuser credentials are available for the new instance
- [ ] You hold a valid SYSTEM_ADMIN JWT token
- [ ] Maintenance window is agreed with the tenant (writes during migration will target old shared DB)

---

## Step 1 — Provision the RDS Instance

Provision an isolated PostgreSQL instance for the tenant. Requirements:

- PostgreSQL 15+
- Accessible from the ECS/K8s service subnet
- Credentials stored in AWS Secrets Manager (or equivalent vault)
- Connection URL format: `postgresql://USER:PASS@HOST:5432/DBNAME`

Verify connectivity from the app host:

```bash
psql "postgresql://USER:PASS@HOST:5432/DBNAME" -c "SELECT version();"
```

---

## Step 2 — Run Prisma Migrations on the Dedicated Instance

The dedicated DB must have all migrations applied before traffic is routed to it.

```bash
DATABASE_URL="postgresql://USER:PASS@HOST:5432/DBNAME" \
  npx prisma migrate deploy --schema=backend/prisma/schema.prisma
```

Verify migrations completed:

```bash
psql "postgresql://USER:PASS@HOST:5432/DBNAME" \
  -c "SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5;"
```

All migrations should show a non-null `finished_at`.

---

## Step 3 — Assign the Dedicated DB URL via API

Call `PATCH /admin/tenants/{tenantId}/dedicated-db` with the SYSTEM_ADMIN token:

```bash
curl -X PATCH "https://api.construction-os.com/admin/tenants/{TENANT_ID}/dedicated-db" \
  -H "Authorization: Bearer ${SYSTEM_ADMIN_JWT}" \
  -H "Content-Type: application/json" \
  -d '{"dedicatedDbUrl": "postgresql://USER:PASS@HOST:5432/DBNAME"}'
```

Expected response:

```json
{ "message": "Dedicated DB assigned" }
```

From this point, all new requests for the tenant are routed to the dedicated instance: `KeycloakJwtStrategy.validate()` resolves the tenant's `dedicated_db_url`, `JwtAuthGuard` publishes it into CLS, and `TenantPrismaService` connects there (see ADR-031 — there is no pre-auth `TenantMiddleware`; it is retained only as a type holder). Non-HTTP paths (Temporal activities, Kafka consumers) resolve the URL via `getDbUrlForTenant()`.

---

## Step 4 — Verify Routing

Trigger any read operation for the tenant and confirm it hits the dedicated instance.

Check application logs for the tenant — DB connections should reference the dedicated host, not the shared `DATABASE_URL`.

---

## Step 5 — Migrate Existing Tenant Data (if required)

If the tenant has existing data on the shared DB that must be moved to the dedicated instance:

1. Export from shared DB:
   ```bash
   pg_dump "postgresql://SHARED_URL/DBNAME" \
     --schema=public \
     --where="tenant_id = 'TENANT_UUID'" \
     -f /tmp/tenant_export.sql
   ```
2. Import to dedicated DB:
   ```bash
   psql "postgresql://USER:PASS@HOST:5432/DBNAME" -f /tmp/tenant_export.sql
   ```
3. Verify row counts match before and after.
4. Delete tenant rows from shared DB after confirming the dedicated DB is live (coordinate with tenant during maintenance window).

> **Platform schema tables (`platform.*`) are never migrated.** `platform.tenants`, `platform.users`, and `platform.tenant_memberships` always remain on the shared DB regardless of tier. Do not attempt to copy or move these.

---

## Rollback

To revert the tenant to the shared DB, set `dedicated_db_url` to NULL via direct SQL (no API endpoint — intentional; this is an irreversible-by-default operation):

```sql
UPDATE platform.tenants
SET dedicated_db_url = NULL, updated_at = now()
WHERE tenant_id = 'TENANT_UUID'::uuid;
```

After running, all subsequent requests fall back to `DATABASE_URL` (shared DB).

---

## References

- Spec: `docs/specifications/07-multi-tenant-architecture.md` §7.1 Dedicated DB
- API: `docs/api/tenant.openapi.yaml` — `PATCH /admin/tenants/{tenantId}/dedicated-db`
- UX flow: `docs/specifications/20-ux-flow.md` §20.4.3 Assign Dedicated DB
- ADR-008: `context/00_master_construction_os.md`
