# ADR-109: Free-trial tenant lifecycle and plan limits by active-project count

**Date:** 2026-11-01
**Status:** Accepted
**Deciders:** product owner, 2026-11-01
**Tags:** architecture | data | security

---

## Context

The marketing site (construction-os.io) sells four plans at flat monthly prices with unlimited users —
`LITE` ฿4,900 (1 project), `STARTER` ฿15,000 (3), `PROFESSIONAL` ฿45,000 (10) and a quoted `ENTERPRISE` —
and offers a 30-day free trial. None of that was in this repository:

- `docs/specifications/26-pricing-model.md` §26.1 described a per-project plus per-seat SMB model and a per-user
  Mid-market model that were never offered
- `platform."PlanType"` had no `LITE`
- no specification, table or endpoint knew about trials, and nothing limited the number of projects a tenant can
  run
- a tenant could only be fully on (`is_active = true`) or fully off; there was no read-only state

The product owner decided on 2026-11-01:

1. §26.1 becomes the published price list; the Mid-market per-user model is removed
2. trial state changes are published as events, for analytics and CRM
3. the project limit counts active projects only (`DRAFT`, `ACTIVE`, `ON_HOLD`); a plan change below the
   current count is refused rather than closing projects
4. trial notices go to `TENANT_ADMIN` and `EXECUTIVE` users
5. trials are opened by a SYSTEM_ADMIN (sales-assisted); self-service signup comes later
6. after day 30 the tenant is read-only for 30 days, then deleted manually

## Decision

1. **`LITE` is added to `platform."PlanType"`.** It uses the shared realm and shared database exactly like
   `STARTER`
2. **A separate `subscription_status` column** (`ACTIVE` / `TRIAL` / `EXPIRED` / `PENDING_DELETION`) records the
   commercial state. `is_active` keeps its meaning — the SYSTEM_ADMIN deactivation switch — so no existing reader
   of `is_active` changes behaviour. Every existing tenant becomes `ACTIVE`
3. **Read-only is enforced by a global interceptor** (`TrialReadOnlyInterceptor`), which runs after every guard and
   so after `KeycloakJwtStrategy.validate()` has resolved the tenant: non-safe methods are refused with
   `COS-PLAN-003` while the status is `EXPIRED` or `PENDING_DELETION`. The exceptions — authentication and session
   endpoints, consent changes and the data-export request — are marked `@AllowWhileReadOnly()`
4. **The project limit is enforced in the project module** when a project is created, from a single limit table
   keyed by plan (`tenant/public/plan-limits.ts`), inside the INSERT's transaction under a per-tenant advisory lock
   so two concurrent creates cannot both pass; and in the tenant module when a trial converts
5. **A daily `@nestjs/schedule` job** (`trial-lifecycle`) moves trials forward and sends the notices of §7.10,
   recording each sent notice so a rerun or a second replica sends nothing twice
6. **Four `platform.tenant.*` events** on `platform.events`, written through the outbox in the same transaction
   as the status change
7. **Feature flags (QM-15), both default OFF:** `s1.tenant.trial-lifecycle` gates the job and the read-only
   enforcement; `s1.project.plan-project-limit` gates the limit at project creation, separately because it applies
   to every paying tenant, not only trials

## Rationale

- **Status column instead of overloading `is_active`.** `is_active = false` makes the middleware refuse every
  request, including reads and the data export a trial user is entitled to during the read-only month. Reusing
  it would either lose that or change what deactivation means for every caller
- **One global interceptor instead of per-controller guards.** Read-only must hold for every write in every module,
  including modules added later; a guard that each controller must remember is exactly the gap this repository has
  documented elsewhere. Not middleware and not a global guard: both run before the route's `JwtAuthGuard`, so
  neither sees the tenant (`tenant.middleware.ts` is not wired for that reason). `validate()` already reads the
  tenant row on every request; `subscription_status` is one more column of that query
- **Refuse plan changes instead of closing projects.** Closing a customer's projects automatically would destroy
  work state the customer did not choose to end
- **Cron instead of a Temporal workflow per trial.** The transitions are date comparisons over one table, done
  once a day; a workflow per tenant would hold thousands of 60-day timers for no benefit. The pattern matches the
  seven existing `@Cron` jobs
- **Manual deletion.** No tenant purge exists (`docs/policies/data-retention-policy.md` records PostgreSQL deletion
  as not implemented). Building one is a separate, higher-risk change; a runbook keeps the commitment honest now

Alternatives rejected: per-seat billing (not what is sold); a `TRIAL` plan type (a trial is a state of a real plan
— the customer tries `STARTER`, not a fifth plan); deleting at day 60 automatically (no purge exists).

## Consequences

### Positive

- The published price list, the specification and the enforcement agree
- Trial-to-paid conversion is measurable from `platform.tenants` and the four events
- Expired trials keep read and export access, as the website promises

### Negative

- One more interceptor runs on every request; it reads a column `validate()` already selects, so no extra query is
  added
- Project creation takes a per-tenant advisory lock while the limit flag is on, serialising concurrent creates
  within one tenant
- Vendor-portal writes (`VendorAuthGuard`, a separate authentication path) cost one primary-key lookup of the
  tenant's status, so the read-only rule covers them too (product owner, 2026-11-01)
- An unreadable plan refuses project creation with `COS-PLAN-005` instead of creating without a limit (product
  owner, 2026-11-01)
- Removing `LITE` from the enum on rollback needs the type recreated (see the rollback script)
- Deletion stays a manual step (`docs/runbooks/trial-tenant-deletion.md`); its PostgreSQL part is one audited
  script, `scripts/maintenance/trial-tenant-purge.sql`, not an application feature
- Trial notices are Thai then English in one message: `platform.users` has no locale to choose by

### Neutral

- `ENTERPRISE` is unaffected: no project limit, no trial
- Self-service signup will create tenants through the same `TRIAL` path

## References

- `docs/specifications/26-pricing-model.md` §26.1, §26.1.2
- `docs/specifications/07-multi-tenant-architecture.md` §7.6, §7.10
- ADR-108 (platform settings — `PLAN_TIERS` gains `LITE`)
- `docs/api/error-codes.md` — `COS-PLAN`
