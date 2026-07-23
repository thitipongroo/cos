---
title: "ADR-014 — RBAC Role Identifiers: Spec-Aligned System Names"
status: Accepted
last_updated: "2026-05-29"
authors:
  - thitipongroo
---

# ADR-014: RBAC Role Identifiers — Spec-Aligned System Names

> **Status:** Accepted
>
> **Date:** 2026-05-27
>
> **Supersedes:** —

---

## Context

`docs/00-specifications/06-rbac-permission-matrix.md` §6.2 defines the authoritative
role names for the Construction OS platform:

> Executive, Project Manager, Site Engineer, Procurement Officer, Finance,
> Safety Officer, CRM/Sales Manager, Tenant Admin, System Admin

The previous `context/00_master_construction_os.md` used abbreviated or mismatched
system identifiers that did not correspond to the spec names:

| Old identifier | Spec §6.2 name | Conflict |
| --- | --- | --- |
| `SITE_MANAGER` | Site Engineer | Wrong role name — "Manager" vs "Engineer" |
| `PROC_OFFICER` | Procurement Officer | Abbreviated — "PROC" vs "PROCUREMENT" |
| `FINANCE_OFFICER` | Finance | "OFFICER" suffix not in spec |
| `SUPER_ADMIN` | System Admin | "SUPER" vs "SYSTEM" |

This was flagged as AWAITING_DECISION C-03.

---

## Decision

All RBAC role system identifiers (used in code, JWT claims, Keycloak roles, and
API authorization guards) **must match the spec §6.2 role names** using
SCREAMING_SNAKE_CASE, with spaces replaced by underscores and no extra suffixes.

| Old identifier | New identifier | Spec §6.2 name |
| --- | --- | --- |
| `SITE_MANAGER` | `SITE_ENGINEER` | Site Engineer |
| `PROC_OFFICER` | `PROCUREMENT_OFFICER` | Procurement Officer |
| `FINANCE_OFFICER` | `FINANCE` | Finance |
| `SUPER_ADMIN` | `SYSTEM_ADMIN` | System Admin |

Unchanged identifiers (already matching spec):

| Identifier | Spec §6.2 name |
| --- | --- |
| `TENANT_ADMIN` | Tenant Admin |
| `PROJECT_MANAGER` | Project Manager |
| `SITE_WORKER` | (field worker — not a separate spec role name; kept) |
| `PROC_MANAGER` | (approval tier — kept as implementation sub-role) |
| `VIEWER` | (read-only — kept as implementation sub-role) |

---

## Rationale

- **Spec authority:** spec §6.2 names these roles explicitly; system identifiers must
  align to avoid documentation–code divergence and onboarding confusion.
- **`SITE_MANAGER` → `SITE_ENGINEER`:** the spec names this role "Site Engineer" not
  "Site Manager" — a Site Manager is a different seniority in construction industry
  context; using the wrong label misrepresents the role's scope.
- **`PROC_OFFICER` → `PROCUREMENT_OFFICER`:** abbreviation causes confusion when
  reading JWT claims or Keycloak role lists; full name is unambiguous.
- **`FINANCE_OFFICER` → `FINANCE`:** spec §6.2 names the role simply "Finance";
  the "OFFICER" suffix is not in spec and implies a seniority level not intended.
- **`SUPER_ADMIN` → `SYSTEM_ADMIN`:** spec §6.2 names this "System Admin"; "SUPER"
  is a generic term with no spec backing.

---

## Consequences

### Positive

- Code, JWT claims, Keycloak role names, and spec all use the same vocabulary
- Onboarding engineers can match code directly to spec §6.2 without translation
- Audit trail: RBAC Role Definitions table in master is single source of truth,
  aligned to spec

### Negative / Trade-offs

- All existing code using old identifiers must be renamed before Phase 2 Keycloak
  configuration (no production code deployed yet at Stage 1 BUILD — no migration required)
- Any future code written must use the new identifiers — enforced via ESLint custom rule
  or grep in CI (recommended: add `no-legacy-role-identifiers` lint rule in Phase 2)

### Risks

- **Keycloak realm config uses old names:** mitigation — Keycloak realm JSON is generated
  in Phase 2; use new identifiers from the start; no realm migration needed
- **Mobile app hardcodes role strings:** mitigation — mobile app reads roles from JWT
  claims only; no hardcoded role strings in UI (role check via NestJS guards at API layer)

---

## Alternatives Considered

| Option | Reason Rejected |
| ------ | --------------- |
| Keep old identifiers, rename only in spec | Spec is the source of truth; code must follow spec |
| Use numeric role IDs | Opaque; harder to audit; not industry practice for RBAC |
| Keep `FINANCE_OFFICER` | Adds "OFFICER" suffix not present in spec; inconsistent with spec authority principle |

---

## References

- `docs/00-specifications/06-rbac-permission-matrix.md` §6.2 — Authoritative role names
- `context/00_master_construction_os.md` §RBAC Role Definitions — Role identifier table

---

*Template source: `docs/01-architecture/adr/000-template.md`*
*Format: Based on Michael Nygard's ADR format*
