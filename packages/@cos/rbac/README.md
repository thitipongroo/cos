# @cos/rbac

RBAC role definitions, permission maps, and NestJS guard utilities.

## Purpose

Single source of truth for all role identifiers, permission mappings, and NestJS guards. All services enforce RBAC using this package — never define roles or permissions in individual services. Role identifiers are aligned to spec §6.2 (ADR-014).

## Public API

```typescript
import { CosRole } from '@cos/rbac';
import { Roles, RolesGuard } from '@cos/rbac';
import { ROLE_PERMISSIONS, hasPermission } from '@cos/rbac';
```

### Roles (spec §6.2 + §6.8)

| Identifier                    | Description                                     |
| ----------------------------- | ----------------------------------------------- |
| `CosRole.SYSTEM_ADMIN`        | Platform admin (cross-tenant)                   |
| `CosRole.TENANT_ADMIN`        | Full access within tenant                       |
| `CosRole.EXECUTIVE`           | C-level; all projects + financials              |
| `CosRole.PROJECT_MANAGER`     | Full access to assigned projects                |
| `CosRole.PROCUREMENT_OFFICER` | RFQ, PO, vendors, deliveries                    |
| `CosRole.FINANCE`             | Cost, billing, payments, cash flow              |
| `CosRole.SAFETY_OFFICER`      | Safety checklists, incidents, compliance        |
| `CosRole.SITE_ENGINEER`       | Site operations and field work                  |
| `CosRole.CRM_SALES_MANAGER`   | Leads, opportunities, accounts                  |
| `CosRole.PROC_MANAGER`        | Procurement approval authority (spec §6.8)      |
| `CosRole.SITE_WORKER`         | Field worker: report submission + tasks (§6.8)  |
| `CosRole.VIEWER`              | Read-only across all modules per project (§6.8) |

### `@Roles(...roles)` decorator + `RolesGuard`

```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
@Get('/projects')
findAll() { ... }
```

### `hasPermission(role, permission): boolean`

Checks `ROLE_PERMISSIONS` map at runtime. Permissions use `resource:action` format (e.g. `project:read`, `boq:write`).

## Dependencies

- `@cos/types` — `CosRole` enum
- `@nestjs/common` — `SetMetadata` for decorator

## Configuration

No environment variables.

## Usage

```typescript
import { CosRole, hasPermission } from '@cos/rbac';

// Check in a service
if (!hasPermission(user.role, 'finance:write')) {
  throw new ForbiddenException();
}
```

## Notes

- ABAC (project_membership, tenant_match, resource_ownership) enforced via `PolicyGuard` in `backend/src/` — this package covers RBAC only
- Advanced configurable ABAC policies: EP-AUTH-001 stub — Post-MVP
- Mobile: import `CosRole` type-only where possible to avoid bundling guard code (Rule 34)
