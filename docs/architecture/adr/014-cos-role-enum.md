# ADR-014: CosRole Enum — Role Definitions and Implementation Sub-Roles

**Date:** 2026-05-27
**Status:** Accepted
**Deciders:** Product Owner, Engineering Lead
**Tags:** architecture, security

---

## Context

Construction OS requires a Role-Based Access Control (RBAC) system that covers two distinct
user populations:

1. **Office / management users** — authenticated via Keycloak OIDC (Path B); roles map directly
   to Keycloak realm roles and are embedded as JWT claims.
2. **Field workers** — authenticated via SMS OTP (Path A); roles embedded as JWT claims by the
   COS identity service at token issuance.

`docs/specifications/06-rbac-permission-matrix` §6.2 defines nine named roles to be seeded at
tenant provisioning. During Phase 2 implementation, a third category emerged: implementation
sub-roles that are not seeded automatically but assigned manually to individual users
post-provisioning. These sub-roles needed a home in the enum without requiring a spec revision.

The question was: define a single `CosRole` enum that spans all three categories (platform admin,
tenant spec roles, implementation sub-roles), or maintain separate enums.

## Decision

Define a single `CosRole` enum in `@cos/types` containing all twelve roles:

**Spec §6.2 roles (9) — seeded at tenant provisioning:**

| Role                  | Scope                                                             |
| --------------------- | ----------------------------------------------------------------- |
| `SYSTEM_ADMIN`        | Cross-tenant platform admin; never provisioned to a tenant (§6.7) |
| `TENANT_ADMIN`        | Full access within tenant                                         |
| `EXECUTIVE`           | Read all projects + financial data                                |
| `PROJECT_MANAGER`     | Full access to assigned projects                                  |
| `PROCUREMENT_OFFICER` | Procurement data entry, RFQ, PO, vendors, deliveries              |
| `FINANCE`             | Cost, billing, payments, cash flow                                |
| `SAFETY_OFFICER`      | Safety checklists, incidents, compliance                          |
| `SITE_ENGINEER`       | Site operations and daily field work                              |
| `CRM_SALES_MANAGER`   | Leads, opportunities, customer accounts                           |

**Implementation sub-roles (3) — spec §6.8; assigned manually post-provisioning:**

| Role           | Purpose                                                         |
| -------------- | --------------------------------------------------------------- |
| `PROC_MANAGER` | Procurement approval authority tier above `PROCUREMENT_OFFICER` |
| `SITE_WORKER`  | Site operations read + report submission (field worker)         |
| `VIEWER`       | Read-only across all modules per project assignment             |

The enum is the single source of truth. `CosRoleEnum` in the PostgreSQL schema
(`platform."CosRoleEnum"`) mirrors this list exactly.

### Role identifier naming — spec §6.2 alignment

The system identifiers use SCREAMING_SNAKE_CASE matching the spec §6.2 role names
exactly (no abbreviations, no extra suffixes). Earlier drafts used mismatched
identifiers, corrected as follows (AWAITING_DECISION C-03, resolved 2026-05-27):

| Old identifier    | Current identifier    | Spec §6.2 name      |
| ----------------- | --------------------- | ------------------- |
| `SITE_MANAGER`    | `SITE_ENGINEER`       | Site Engineer       |
| `PROC_OFFICER`    | `PROCUREMENT_OFFICER` | Procurement Officer |
| `FINANCE_OFFICER` | `FINANCE`             | Finance             |
| `SUPER_ADMIN`     | `SYSTEM_ADMIN`        | System Admin        |

Rationale: spec §6.2 is the source of truth; identifiers in code, JWT claims,
Keycloak roles, and API guards must match it to avoid documentation–code divergence.
"Site Engineer" (not "Site Manager") is the spec role — a Site Manager is a
different seniority in construction context — and the abbreviated/suffixed forms
(`PROC_`, `_OFFICER`, `SUPER_`) have no spec backing.

## Rationale

**Single enum vs. separate enums:** A single enum is simpler to validate in DTOs
(`@IsEnum(CosRole)`), guards (`@Roles(CosRole.TENANT_ADMIN)`), and permission maps. Separate
enums would require union types throughout the codebase and union handling in Prisma schema.

**Sub-roles in the same enum:** Sub-roles share the same JWT claim field (`role`) and the same
guard/permission infrastructure as spec roles. Splitting them into a separate enum would require
union handling with no architectural benefit.

**`SYSTEM_ADMIN` in the tenant enum:** `SYSTEM_ADMIN` is included in `CosRoleEnum` so that
system-level API routes can use the same `@Roles` guard. The guard is the enforcement point;
the provisioning process (spec §6.7) ensures `SYSTEM_ADMIN` is never granted to tenant users.

**Alternatives rejected:**

- _Separate `SpecRole` and `SubRole` enums_ — requires union types in guards and permission maps;
  increases complexity with no isolation benefit.
- _String literals_ — no compile-time safety; cannot use `@IsEnum` validation.
- _Keycloak-only role management_ — Path A (OTP) users are not managed in Keycloak realm roles;
  the COS identity service must embed the role claim independently.

## Consequences

### Positive

- Single `@IsEnum(CosRole)` validator covers all DTO role fields.
- `ROLE_PERMISSIONS` map in `@cos/rbac` has one entry per role — exhaustive and type-checked.
- PostgreSQL `CosRoleEnum` stays in sync automatically (Prisma generates from the enum).
- Guards (`@Roles`, `PolicyGuard`) work identically for all role categories.

### Negative

- Adding a new role requires updating the enum, the permission map, and the PostgreSQL enum
  type (via migration). Three-file change is unavoidable.
- `SYSTEM_ADMIN` appears in the tenant-scoped enum; developers must remember it is never
  assigned to tenant users — enforced by provisioning logic, not the type system.

### Neutral

- Sub-roles are documented inline in `roles.ts` with a section comment to distinguish them
  from spec §6.2 roles.

## References

- [docs/specifications/06-rbac-permission-matrix §6.2](../../specifications/06-rbac-permission-matrix.md)
- [docs/specifications/06-rbac-permission-matrix §6.7](../../specifications/06-rbac-permission-matrix.md)
- [docs/specifications/06-rbac-permission-matrix §6.8](../../specifications/06-rbac-permission-matrix.md)
- [context/00_master_construction_os.md §Phase 2 RBAC Role Definitions](../../../context/00_master_construction_os.md)
- [packages/@cos/types/src/roles.ts](../../../packages/@cos/types/src/roles.ts)
- [packages/@cos/rbac/src/permissions.ts](../../../packages/@cos/rbac/src/permissions.ts)
