# ADR-108: Platform settings are one versioned, audited document — stored only, read by nothing yet

**Date:** 2026-09-15
**Status:** Accepted
**Deciders:** product owner, 2026-09-15 (decision D10 of plan revision R17)
**Tags:** architecture | data | security

---

## Context

§6.7 of `docs/specifications/06-rbac-permission-matrix.md` lists "Platform configuration — update
platform-wide settings: feature flags, rate limits, SLA parameters" among the SYSTEM_ADMIN capabilities, and
says every System Admin action is "immutably audit-logged with the operator's user identity, action type,
target tenant_id, and a mandatory justification string". Nothing implemented it: before this ADR there was no
table and no endpoint for platform-wide settings (`backend/src/modules/tenant/settings.*` is the TENANT-level
settings of one tenant and is unrelated).

The Stitch screen "System Settings - SYSTEM_ADMIN" draws a form for it. The product owner decided on
2026-09-15 (D10) to build that screen with a backend behind it: stored settings, read and save, a mandatory
justification on every save, every save audited.

What the drawing shows, grouped as the API carries it:

| Section                                              | Settings                                                                                                                                                         |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| External data gateways                               | primary endpoint (name, URL, protocol) · secondary endpoint (name, URL, max retries) · auto-sync cadence · failover cache TTL (hours) · auto-fallback on timeout |
| Maintenance windows                                  | safety non-suspension · shared tiers (STARTER + PROFESSIONAL) window · ENTERPRISE mode                                                                           |
| Advance broadcast notice                             | lead time (hours) · channels (`IN_APP_BANNER`, `EMAIL_DIGEST`)                                                                                                   |
| Cluster and fleet limits                             | shared-tenant cap · default max pool connections                                                                                                                 |
| Tier limits, per STARTER / PROFESSIONAL / ENTERPRISE | tenant DB strategy · storage quota (GB) · API monthly quota · token limit per month                                                                              |

The drawing also prints figures for these — retry counts, TTLs, quotas. No specification, measurement or
existing configuration in this repository backs any of them.

## Decision

1. **One document, one row.** `platform.platform_settings` holds a single row keyed `'global'`
   (`settings_key TEXT PRIMARY KEY CHECK (settings_key = 'global')`, `value JSONB` object, `version INTEGER`,
   `updated_by UUID NULL → platform.users`, `updated_at TIMESTAMPTZ`). Migration
   `backend/prisma/migrations/20260915000001_platform_settings`, rollback
   `backend/prisma/rollbacks/20260915000001_platform_settings.rollback.sql`.
2. **The document is typed and validated whole.** `PlatformSettings` in
   `backend/src/modules/platform-settings/platform-settings.types.ts`; `PUT` replaces the whole document through
   class-validator DTOs — gateway URLs `https` only, counts non-negative integers under an input bound,
   channels from the enum, unknown keys refused at every level.
3. **Every field is nullable, and null means "not set".** The defaults are all null (channels empty). The
   drawing's figures are not seeded; the operator enters a number, the system never invents one.
4. **Optimistic concurrency on the whole document.** `GET` returns `version` (0 while nothing is saved); `PUT`
   names the version it read, and a stored version that has moved is `409 COS-PSET-001`. Inside the
   transaction the row is read `FOR UPDATE`, and the upsert carries `WHERE version = expected`, which is what
   refuses the second of two first saves when there was no row to lock.
5. **A justification and an audit row on every change, in the same transaction.** The justification follows
   the §6.7 rules every SYSTEM_ADMIN tenant action already uses (`AdminJustificationDto`: trimmed, 10-500).
   `platform.audit_logs` gets `action = 'platform.settings.update'`, `resource_type = 'platform_settings'`,
   `actor_id` = the operator, `tenant_id` = the operator's home tenant, and
   `metadata = { justification, before, after }`. A save whose audit row cannot be written is not saved.
6. **Values are stored only. Nothing reads them.** No gateway client, scheduler, maintenance process,
   broadcast sender, throttler, connection pool, provisioning step or quota check consults this table, and
   none of the settings in the table above is enforced anywhere. Saving one changes what the screen shows and
   what the audit trail records — nothing else.

## Rationale

**Why one row rather than one row per setting.** The form is saved as one action with one justification, and
the audit row carries one before / after. A row per key would need a version per key, and two operators each
saving a different section of the same stale page would both succeed, each silently reverting the other's
section. One version over the document turns that into a 409.

**Why not Unleash.** Feature flags are served by Unleash with server-side evaluation (ADR-049), which is the
right home for toggles the code evaluates. These values are not evaluated by any code; putting them in Unleash
would imply a consumer that does not exist and would split the §6.7 audit trail between two systems.

**Why no RLS.** `platform` cross-tenant tables are RLS-exempt (§11.0 of
`docs/specifications/11-database-schema.md`), as `platform.scheduled_job_locks` already is. The row describes
the deployment and has no tenant to scope it to. The audit row it writes IS tenant-scoped, so the service sets
`app.current_tenant_id` (UUID-validated) before inserting it, as `TenantService.writeAdminAudit` does; an
integration test proves the INSERT passes the policy as `app_user`.

**Why the operator's home tenant on the audit row.** `audit_logs.tenant_id` is NOT NULL and is a foreign key to
`platform.tenants`; the document belongs to no tenant. Every SYSTEM_ADMIN has a home tenant (§6.7's
implementation note of 2026-09-14), and it is the one tenant the operator is always tied to, so the row is
always writable and always found by filtering on the actor.

**Why no seeded figures.** A default is a claim the platform makes, and here it would be a claim about
configuration the operator is responsible for. The drawing's numbers have no source in this repository, so
they are not stored as values. ADR-099 is not a precedent for doing otherwise: it lets EXECUTIVE screens
_print_ a mockup figure on a read-only card, and does not make one a stored setting.

**Alternatives rejected.** Environment variables or a ConfigMap: not editable from the screen and not audited.
A row per setting: loses whole-form concurrency (above). Storing on `platform.tenant_settings`: that table is
tenant-scoped under RLS and is a different concept.

## Consequences

### Positive

- The System Settings screen reads and saves real, persistent values, and every change is traceable to an
  operator, a reason and an exact before / after.
- Lost updates between two operators are impossible, including on the very first save.
- Adding a consumer later needs no schema change: the document is already typed and versioned.

### Negative

- The screen presents settings that have no effect. An operator may reasonably assume that changing the
  shared-tenant cap caps shared tenants; it does not. The screen must say so, and this ADR is the record.
- Any future consumer must be designed on its own — where it reads the value, how it reacts to a change, what
  it does while a value is null. None of that is decided here.
- `GET` reads `platform.tenants` directly for the shared / dedicated counts, a table the tenant module owns.
  It selects two counts and never the `dedicated_db_url` column; routing it through `TenantService` would need
  a change to that module, which was being edited concurrently when this was built.

### Neutral

- The input bounds in `update-platform-settings.dto.ts` (`PLATFORM_SETTINGS_BOUNDS`) refuse typos; they are
  not recommended values and nothing enforces them at runtime.
- The rollback drops the table; the audit history of every change stays in `platform.audit_logs`.

## References

- `docs/specifications/06-rbac-permission-matrix.md` §6.7 — System Admin platform capabilities
- `docs/specifications/11-database-schema.md` §11.0 — `platform` schema RLS exemption
- [ADR-049](049-unleash-feature-flags.md) — Unleash feature flags
- [ADR-099](099-mockup-figures-without-a-data-source.md) — mockup figures printed on read-only screens (contrasted above)
- [ADR-034](034-graceful-shutdown-resource-lifecycle.md) — the service closes its Prisma client on shutdown
- `backend/src/modules/platform-settings/README.md`
- `docs/api/platform-settings.openapi.yaml`
