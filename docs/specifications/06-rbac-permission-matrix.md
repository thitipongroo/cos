---
title: 'RBAC Permission Matrix'
version: '1.2.0'
status: Active
last_updated: '2026-06-20'
authors:
  - thitipongroo
related_docs:
  - 05-security-compliance.md
  - 07-multi-tenant-architecture.md
  - 13-product-architecture.md
  - 20-ux-flow.md
---

# 6. RBAC Permission Matrix

## Table of Contents

- [6.1 Overview](#61-overview)
- [6.2 Roles](#62-roles)
- [6.3 Permission Levels](#63-permission-levels)
- [6.4 Module Permission Matrix](#64-module-permission-matrix)
- [6.5 ABAC Supplementary Rules](#65-abac-supplementary-rules)
- [6.6 Default Role Seeding at Tenant Provisioning](#66-default-role-seeding-at-tenant-provisioning)
- [6.7 System Admin — Platform-level Permissions](#67-system-admin--platform-level-permissions)
- [6.8 Implementation Sub-roles](#68-implementation-sub-roles)
- [6.8b External Principals — Vendor Portal](#68b-external-principals--vendor-portal)
- [6.9 NestJS Guard Implementation](#69-nestjs-guard-implementation)

---

## 6.1 Overview

This document defines the role-based access control (RBAC) matrix for all platform modules.

Roles are defined in section 6.2 of this document (the authoritative role definition).
20-ux-flow section 20.2 describes UX requirements per role — it does not define roles.
Modules are defined in 13-product-architecture section 13.1 (Layer 2).
Security controls (RBAC/ABAC) are defined in 05-security-compliance section 5.2.

---

## 6.2 Roles

| Role                | Description                                                    |
| ------------------- | -------------------------------------------------------------- |
| Executive           | Company owner or C-level; sees all projects and financial data |
| Project Manager     | Manages one or more projects end-to-end                        |
| Site Engineer       | Executes and reports daily field work                          |
| Procurement Officer | Manages RFQ, PO, vendors, and deliveries                       |
| Finance             | Manages cost, billing, payments, and cash flow                 |
| Safety Officer      | Manages safety checklists, incidents, and compliance           |
| CRM / Sales Manager | Manages leads, opportunities, and customer accounts            |
| Tenant Admin        | Configures the tenant: users, roles, workflows, integrations   |
| System Admin        | Platform-level administration (SaaS operator only)             |

> **Display name → JWT enum mapping:** The display names above are used in UI, documentation,
> and approval chain tables. In JWT tokens and code, these map to uppercase snake_case enum
> constants (e.g., "CRM / Sales Manager" → `CRM_SALES_MANAGER`, "Site Engineer" → `SITE_ENGINEER`,
> "Project Manager" → `PROJECT_MANAGER`). See `05-security-compliance` §5.4.1 for the
> authoritative JWT claim names.

---

## 6.3 Permission Levels

| Level | Meaning                                      |
| ----- | -------------------------------------------- |
| —     | No access                                    |
| R     | Read only                                    |
| RW    | Read and write (create, update)              |
| RWD   | Read, write, and delete                      |
| A     | Approve (can trigger approval workflow step) |
| FULL  | Full access including configuration          |

---

## 6.4 Module Permission Matrix

### Core Platform

| Module                   | Executive | PM  | Site Engineer | Procurement | Finance | Safety | CRM/Sales | Tenant Admin |
| ------------------------ | --------- | --- | ------------- | ----------- | ------- | ------ | --------- | ------------ |
| User management          | R         | —   | —             | —           | —       | —      | —         | FULL         |
| Role assignment          | —         | —   | —             | —           | —       | —      | —         | FULL         |
| Tenant settings          | —         | —   | —             | —           | —       | —      | —         | FULL         |
| Workflow configuration   | R         | R   | —             | —           | —       | —      | —         | FULL         |
| Audit logs               | R         | R   | —             | —           | R       | —      | —         | FULL         |
| Notification preferences | R         | RW  | RW            | RW          | RW      | RW     | RW        | FULL         |

### Construction Modules

| Module                       | Executive | PM   | Site Engineer | Procurement | Finance | Safety | CRM/Sales | Tenant Admin |
| ---------------------------- | --------- | ---- | ------------- | ----------- | ------- | ------ | --------- | ------------ |
| Project (create/configure)   | RW        | RW   | —             | —           | —       | —      | —         | FULL         |
| Project (view)               | FULL      | FULL | R             | R           | R       | R      | R         | FULL         |
| BOQ                          | R         | RW   | R             | R           | R       | —      | —         | FULL         |
| Tasks                        | R         | RW   | RW            | R           | —       | R      | —         | FULL         |
| Site reports                 | R         | RW   | RW            | R           | R       | R      | —         | FULL         |
| Inspections / QC             | R         | RW   | RW            | —           | —       | RW     | —         | FULL         |
| Risk register                | R         | RW   | RW            | —           | —       | —      | —         | FULL         |
| Communications / doc-control | R         | RW   | RW            | R           | R       | R      | R         | FULL         |
| Safety checklists            | R         | R    | RW            | —           | —       | RWD    | —         | FULL         |
| Safety incidents             | R         | R    | RW            | —           | —       | RWD    | —         | FULL         |
| Workforce attendance         | R         | RW   | RW            | —           | R       | —      | —         | FULL         |
| Equipment                    | R         | RW   | R             | R           | R       | —      | —         | FULL         |
| Permits                      | R         | RW   | R             | —           | —       | RW     | —         | FULL         |

> **Permits row scope (ADR-064):** the same row now also covers `building_permit` and company `license`
> (PM = RW, Tenant Admin = FULL) — no new row; building permits & licences share the existing Permit register.

### Procurement Modules

| Module                      | Executive | PM  | Site Engineer | Procurement | Finance | Safety | CRM/Sales | Tenant Admin |
| --------------------------- | --------- | --- | ------------- | ----------- | ------- | ------ | --------- | ------------ |
| Purchase requests           | R         | RW  | RW            | RWD         | R       | —      | —         | FULL         |
| RFQ                         | R         | R   | —             | RWD         | R       | —      | —         | FULL         |
| Vendor quotations           | R         | R   | —             | RWD         | R       | —      | —         | FULL         |
| Purchase orders             | A         | A   | —             | RW          | A       | —      | —         | FULL         |
| Deliveries                  | R         | R   | RW            | RWD         | R       | —      | —         | FULL         |
| Vendor Invoices (AP)        | A         | R   | —             | RW          | RWD     | —      | —         | FULL         |
| Inventory                   | R         | R   | RW            | RWD         | R       | —      | —         | FULL         |
| Warehouses (WMS)            | R         | R   | R             | RWD         | R       | —      | —         | FULL         |
| Goods receipt / stock moves | R         | R   | RW            | RWD         | R       | —      | —         | FULL         |
| Vendor management           | R         | R   | —             | RWD         | R       | —      | —         | FULL         |

> **ราคากลาง central-price catalog (ADR-061):** `platform.central_price_catalog` is **platform-managed** —
> `SYSTEM_ADMIN` imports / syncs it (file import or the `CentralPriceAdapter` API); **all tenant roles are
> read-only**. It is not a tenant-role module, so it carries no per-role RW cell here.

### Financial Modules

| Module              | Executive | PM  | Site Engineer | Procurement | Finance | Safety | CRM/Sales | Tenant Admin |
| ------------------- | --------- | --- | ------------- | ----------- | ------- | ------ | --------- | ------------ |
| Budget (view)       | FULL      | R   | —             | R           | FULL    | —      | —         | FULL         |
| Budget (edit)       | A         | RW  | —             | —           | RW      | —      | —         | FULL         |
| Cost transactions   | R         | R   | —             | R           | RWD     | —      | —         | FULL         |
| Client Billing (AR) | A         | A   | —             | R           | RWD     | —      | —         | FULL         |
| AR Receipts         | R         | R   | —             | —           | RW      | —      | —         | FULL         |
| Payments            | A         | —   | —             | —           | RW      | —      | —         | FULL         |
| Contracts           | R         | RW  | —             | R           | R       | —      | —         | FULL         |
| Contract signing    | A         | A   | —             | —           | R       | —      | —         | FULL         |
| Variation Orders    | A         | RW  | —             | —           | R       | —      | —         | FULL         |
| Claims              | A         | RW  | —             | —           | R       | —      | —         | FULL         |
| Bonds / guarantees  | R         | RW  | —             | —           | RW      | —      | —         | FULL         |
| Financial reports   | R         | R   | —             | —           | FULL    | —      | —         | FULL         |
| Cash flow forecast  | R         | R   | —             | —           | FULL    | —      | —         | FULL         |

> **Contract signing (ADR-058):** `A` here = attach the contract document, apply the contractor-side
> PKI/VC signature, and issue the client magic-link. The **external client** is authorized solely by the
> single-use magic-link token (ADR-030 pattern) — **not** a platform role; no new role is introduced.
> `signed` is reached only when both the contractor (INTERNAL) and client (CLIENT) signatures verify.

### Asset Management

| Module         | Executive | PM  | Site Engineer | Procurement | Finance | Safety | CRM/Sales | Tenant Admin |
| -------------- | --------- | --- | ------------- | ----------- | ------- | ------ | --------- | ------------ |
| Unit inventory | R         | RW  | R             | —           | R       | —      | R         | FULL         |
| Asset handover | R         | RW  | RW            | —           | R       | —      | RW        | FULL         |
| Warranty       | R         | R   | —             | —           | R       | —      | R         | FULL         |
| Maintenance    | R         | RW  | R             | R           | R       | —      | —         | FULL         |

### CRM Modules

| Module         | Executive | PM  | Site Engineer | Procurement | Finance | Safety | CRM/Sales | Tenant Admin |
| -------------- | --------- | --- | ------------- | ----------- | ------- | ------ | --------- | ------------ |
| Leads          | R         | —   | —             | —           | —       | —      | RWD       | FULL         |
| Opportunities  | R         | —   | —             | —           | R       | —      | RWD       | FULL         |
| Contacts       | R         | —   | —             | —           | —       | —      | RWD       | FULL         |
| Customers      | R         | R   | —             | —           | R       | —      | RWD       | FULL         |
| Tenders (e-GP) | A         | RW  | —             | —           | R       | —      | RW        | FULL         |
| Bids           | A         | RW  | —             | —           | R       | —      | RW        | FULL         |

### Intelligence Layer

| Module                 | Executive | PM  | Site Engineer | Procurement | Finance | Safety | CRM/Sales | Tenant Admin |
| ---------------------- | --------- | --- | ------------- | ----------- | ------- | ------ | --------- | ------------ |
| Executive dashboard    | FULL      | R   | —             | —           | R       | —      | —         | FULL         |
| AI risk predictions    | R         | R   | R             | R           | R       | R      | —         | FULL         |
| Forecasting reports    | R         | R   | —             | R           | R       | —      | —         | FULL         |
| Knowledge graph (read) | R         | R   | —             | —           | —       | —      | —         | FULL         |
| AI copilot             | R         | R   | R             | R           | R       | R      | R         | FULL         |

---

## 6.5 ABAC Supplementary Rules

RBAC defines module-level access. ABAC (Attribute-Based Access Control) enforces
row-level and context-level rules on top of RBAC :

- Project scope: a PM can only read/write entities within projects they are assigned to
- Tenant scope: all queries are filtered by tenant_id — cross-tenant access is blocked at service layer
- Approval authority: Finance can approve Vendor Invoices (AP) only up to their configured approval limit;
  above the limit requires Executive approval
- Approval authority: PM can approve Client Billing (AR) only up to their configured approval limit;
  above the limit requires Executive approval
- Self-service: a Site Engineer can update only their own attendance record, not other workers'

---

## 6.6 Default Role Seeding at Tenant Provisioning

When a new tenant is provisioned (see 07-multi-tenant-architecture section 7.6),
these default roles are created :

- Executive (1 seat — the account owner)
- Tenant Admin (1 seat — may be the same person as Executive)
- Project Manager
- Site Engineer
- Procurement Officer
- Finance
- Safety Officer
- CRM / Sales Manager

All roles are customizable per tenant after provisioning.

---

## 6.7 System Admin — Platform-level Permissions

System Admin (defined in section 6.2) is a cross-tenant platform operator role assigned
only to SaaS platform operators. It is NOT provisioned to any tenant.
Because System Admin operates outside tenant-scoped module boundaries, it is not included
as a column in the module permission matrices in section 6.4.

System Admin platform capabilities :

| Capability               | Description                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| Tenant management        | Create, suspend, delete, and configure tenants via the platform admin API                       |
| Cross-tenant read        | Read-only access to any tenant's data for support, debugging, and compliance                    |
| Platform configuration   | Update platform-wide settings: feature flags, rate limits, SLA parameters                       |
| Keycloak administration  | Manage realms, clients, and IdP federation configurations                                       |
| Billing and subscription | Manage tenant billing state, subscription tier, and usage quotas                                |
| Audit access             | Read all tenant audit logs for platform-level compliance and incident investigation             |
| Emergency override       | Temporary elevated write access for incident response — requires mandatory justification string |

All System Admin actions are immutably audit-logged with the operator's user identity,
action type, target tenant_id, and a mandatory justification string.
No System Admin action is silent — every cross-tenant operation is fully traceable.

System Admin cannot be assigned to a tenant-level user via the Tenant Admin role
provisioning flow (section 6.6). It requires direct platform operator provisioning
by the SaaS operator team.

---

## 6.8 Implementation Sub-roles

The following sub-roles are **not** in the business role taxonomy (§6.2) and are not
provisioned at tenant creation (§6.6). They exist for implementation granularity and
are assigned manually by Tenant Admin after provisioning.

They carry a JWT `role` claim identical in structure to §6.2 roles and are enforced
by the same RBAC guards.

| Sub-role            | Code constant  | Description                                                   |
| ------------------- | -------------- | ------------------------------------------------------------- |
| Procurement Manager | `PROC_MANAGER` | Procurement approval authority tier above Procurement Officer |
| Site Worker         | `SITE_WORKER`  | Field worker: site operations read + report submission        |
| Viewer              | `VIEWER`       | Read-only across all modules, scoped to project assignment    |

### Procurement Manager (`PROC_MANAGER`) — Module Permissions

| Module               | Permission |
| -------------------- | ---------- |
| Project (view)       | R          |
| BOQ                  | R          |
| Purchase requests    | RWD        |
| RFQ                  | RWD        |
| Vendor quotations    | RWD        |
| Purchase orders      | RW + A     |
| Deliveries           | RWD        |
| Vendor Invoices (AP) | RW         |
| Inventory            | RWD        |
| Vendor management    | RWD        |
| Budget (view)        | R          |
| Cost transactions    | R          |

Workflow authority: may trigger `EVALUATED → AWARDED` and `EVALUATED → CANCELLED`
on RFQ (see 32-implementation-specifications §32.6). All other workflow roles follow §32.6.

### Site Worker (`SITE_WORKER`) — Module Permissions

| Module               | Permission |
| -------------------- | ---------- |
| Project (view)       | R          |
| Tasks                | RW         |
| Site reports         | RW         |
| Safety checklists    | RW         |
| Safety incidents     | RW         |
| Workforce attendance | R          |
| Equipment            | R          |
| Issues               | RW         |

### Viewer (`VIEWER`) — Module Permissions

Read-only across all modules assigned to the viewer's project scope.

| Module            | Permission |
| ----------------- | ---------- |
| Project (view)    | R          |
| BOQ               | R          |
| Tasks             | R          |
| Site reports      | R          |
| Issues            | R          |
| Procurement (all) | R          |
| Finance (all)     | R          |

Viewer does not have write, delete, or approve access on any module.

---

## 6.8b External Principals — Vendor Portal

`VENDOR_PORTAL` is **not** a `CosRole` and is never provisioned to a tenant. It is a distinct
external authorization context for vendor-network users (ADR-030). An external vendor must never
receive an internal role; the two principal types are kept separate.

Authentication is two-tier (§05): Tier-1 magic-link (no account) for RFQ response, Tier-2
lightweight account for PO-status tracking and invoice submission. Authorization is **not** tenant
RLS — access is scoped by `vendor_identity_id` and the `platform.vendor_trading_relationships` link:

| Capability       | Scope                                                                      |
| ---------------- | -------------------------------------------------------------------------- |
| RFQ response     | Only RFQs the vendor was invited to (`procurement.rfq_invitations` token)  |
| Submit quotation | Only against an RFQ the vendor was invited to                              |
| Track PO status  | Only POs on a tenant where the vendor has an `ACTIVE` trading relationship |
| Submit invoice   | Only the vendor's own invoices on a linked PO                              |

The data read remains tenant-scoped; the vendor's view is filtered to their relationship/ownership.

---

## 6.9 NestJS Guard Implementation

This section documents the authoritative file-placement rule for NestJS `CanActivate` guards
and the RBAC/ABAC vocabulary they consume. The split was decided during Phase 2 implementation
based on the dependency analysis below.

### Package boundary

| Artifact                                 | Location                                                  | Reason                                                                            |
| ---------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `CosRole` enum                           | `packages/@cos/rbac/src/` (re-exported from `@cos/types`) | Used by every platform (mobile, web, Node.js) — belongs in shared layer           |
| `ROLE_PERMISSIONS` map                   | `packages/@cos/rbac/` (shared package)                    | Pure data; no framework dependency; used by both guards and business logic        |
| `@Roles(...)` decorator                  | `packages/@cos/rbac/` (shared package)                    | Calls `SetMetadata` only — no request context or JWT dependency                   |
| `@RequirePermissions(...)` decorator     | `packages/@cos/rbac/` (shared package)                    | Same as above                                                                     |
| `ROLES_KEY`, `PERMISSIONS_KEY` constants | `packages/@cos/rbac/` (shared package)                    | Metadata keys consumed by concrete guards                                         |
| `RolesGuard` (`CanActivate`)             | `backend/src/shared/guards/` (application layer)          | Depends on `JwtPayload` (application-layer type) and `Reflector` (`@nestjs/core`) |
| `PolicyGuard` (`CanActivate`)            | `backend/src/shared/guards/` (application layer)          | Depends on `JwtPayload`, `ExecutionContext`, and may query Prisma for ABAC        |
| `JwtAuthGuard` (`CanActivate`)           | `backend/src/modules/identity/guards/`                    | Passport strategy wrapper — identity-module concern                               |

### Why concrete guards are NOT in `@cos/rbac`

1. **`JwtPayload` is application-specific** — its shape is determined by Keycloak realm
   configuration and is an identity-module concern, not a shared-library concern.
   Moving it to `@cos/types` would couple the shared type layer to the authentication
   implementation choice.

2. **`Reflector` is a framework concern** — injected by `@nestjs/core`; suitable in the
   application layer, not in a shared package that must remain framework-agnostic where
   possible.

3. **ABAC (`PolicyGuard`) may require database access** — project membership checks need
   Prisma queries; shared packages must not import the database layer.

4. **Matches NestJS enterprise conventions** — official NestJS documentation and
   community patterns (Trilon, Nx monorepo guides) consistently place concrete guards
   in `src/common/guards/` or `src/shared/guards/` of the application, not in shared
   libraries. Shared libraries provide the vocabulary (metadata keys, decorators);
   applications provide the enforcement.

### Rule for future guards

Any new `CanActivate` implementation that:

- reads `JwtPayload` fields, OR
- queries the database, OR
- depends on `@nestjs/core` Reflector

**must** be placed in `backend/src/shared/guards/` — never in `@cos/rbac`.

Abstract base guards (no framework/JWT/DB dependency) may be placed in `@cos/rbac` if
reuse across multiple NestJS applications is required.

---

## References

| ID          | Title                                                              | Source                                                                                                 |
| ----------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| [IEEE 830]  | IEEE Recommended Practice for Software Requirements Specifications | IEEE Std 830-1998                                                                                      |
| [NIST-RBAC] | Role Based Access Control — NIST SP 800-207                        | NIST Special Publication 800-207                                                                       |
| [ABAC]      | Guide to Attribute Based Access Control (ABAC)                     | NIST SP 800-162                                                                                        |
| [OAuth2]    | The OAuth 2.0 Authorization Framework                              | RFC 6749                                                                                               |
| [OIDC]      | OpenID Connect Core 1.0                                            | [openid.net/specs/openid-connect-core-1_0.html](https://openid.net/specs/openid-connect-core-1_0.html) |
| [Keycloak]  | Keycloak Server Documentation                                      | [keycloak.org/documentation](https://www.keycloak.org/documentation)                                   |
| [JWT-RFC]   | JSON Web Token (JWT)                                               | RFC 7519                                                                                               |

> 📎 See also: [05-security-compliance](05-security-compliance.md) · [07-multi-tenant-architecture](07-multi-tenant-architecture.md)
> · [13-product-architecture](13-product-architecture.md) · [20-ux-flow](20-ux-flow.md)
