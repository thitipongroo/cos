---
title: 'ADR-002 — Tiered Tenant Isolation (Schema-per-tenant for Mid-market)'
status: Accepted
last_updated: '2026-05-29'
authors:
  - thitipongroo
---

# ADR-002 — Tiered Tenant Isolation (Schema-per-tenant for Mid-market)

**Status:** Accepted — Updated 2026-05-25
**Date:** 2026-01-15
**Deciders:** Engineering team

> ⚠️ **Update (2026-05-25):** This ADR originally described schema-per-tenant as the single
> universal isolation model. The architecture has since evolved to a **three-tier isolation
> model** based on deployment tier. See the updated Decision section below.
> Authoritative source: `07-multi-tenant-architecture §7.1` and `08-enterprise-deployment §8.1`.

## Context

Multi-tenancy requires strong data isolation. Three standard approaches:

1. **Shared DB with `tenant_id` column** on every table — simple, low overhead, suitable for SMB scale
2. **Schema-per-tenant** — each tenant gets its own PostgreSQL schema — stronger isolation, suitable for mid-market
3. **Dedicated DB per tenant** — maximum isolation, required for enterprise and on-premise

## Decision

**Three-tier isolation model, mapped to deployment tier:**

| Deployment Tier                            | Isolation Model             | Details                                                                                                                 |
| ------------------------------------------ | --------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Shared SaaS — SMB                          | **Shared DB + `tenant_id`** | All tenant tables include `tenant_id` column; queries include `WHERE tenant_id = $tenant_id`; enforced at service layer |
| Shared SaaS — Mid-market                   | **Schema-per-tenant**       | Each tenant gets an isolated `tenant_<id>` schema; `search_path` set per request by `RequestContextMiddleware`          |
| Dedicated Tenant / Enterprise / On-premise | **Dedicated DB**            | Entire database per tenant; Prisma connection string switched per tenant                                                |

**MVP default is SMB tier (Shared DB + `tenant_id`).** Schema-per-tenant applies to mid-market tenants only.

## Rationale — Shared DB + tenant_id (SMB)

- Lowest operational overhead for SMB: no per-tenant schema migration needed
- `tenant_id` is enforced at application service layer — guard validated by integration tests
- PostgreSQL RLS applied to `audit_logs` as defense-in-depth within the shared schema
- Easiest migration path as tenant grows: SMB → mid-market triggers schema extraction

## Rationale — Schema-per-tenant (Mid-market)

- Stronger isolation — no risk of `tenant_id` filter being accidentally omitted in complex queries
- Easier tenant data export/deletion (GDPR): `DROP SCHEMA tenant_abc123 CASCADE`
- Postgres schema-level permissions map cleanly to `cos_app` role
- PostgreSQL handles up to ~1000 schemas efficiently on a single instance

The tradeoff — migrations must run per-tenant schema — is managed by a tenant migration runner script.

## Consequences

- **SMB path:** all tables include `tenant_id` column; service layer enforces isolation; no schema switching
- **Mid-market path:** `RequestContextMiddleware` runs
  `SET LOCAL search_path TO tenant_<id>, public` per request; migrations run per-schema
- **Enterprise path:** Prisma `DATABASE_URL` is tenant-specific; completely separate database
- New tenant provisioning flow is documented in `07-multi-tenant-architecture §7.6`

## Superseded content from original ADR

The original ADR stated "Explicitly NOT done: `tenant_id` column on every table."
This applies **only to the mid-market schema-per-tenant tier** and is incorrect for the SMB tier,
where `tenant_id` is required on all tables. That statement has been removed to prevent misapplication.

---

## Alternatives Considered

| Option                                       | Reason Rejected                                                                                                                                 |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema-per-tenant universally (original ADR) | Over-engineered for SMB — per-tenant schema migration on each new signup is unsustainable; no natural step up to dedicated DB for enterprise    |
| Shared DB + `tenant_id` for all tiers        | Insufficient isolation for mid-market and enterprise compliance requirements; complex queries risk `tenant_id` filter omission in shared schema |
| Dedicated DB for all tiers                   | Unsustainable operational cost at SMB scale; each new SMB tenant would require a separate database instance                                     |

---

## References

- `docs/00-specifications/07-multi-tenant-architecture.md` §7.1 — canonical tiered isolation model (authoritative spec)
- `docs/00-specifications/08-enterprise-deployment.md` §8.1 — deployment tier definitions
- `docs/architecture/adr/018-prisma-as-orm.md` — Prisma as ORM (uses `SET LOCAL` inside `$transaction`)
- `docs/architecture/adr/008-shared-db-tenant-id-rls.md` — shared-DB + tenant_id + RLS (the SMB-tier default)
