# platform-settings

NestJS module for the platform-wide settings a SYSTEM_ADMIN reads and saves on System Settings.

## Purpose

§6.7 "Platform configuration" (`docs/specifications/06-rbac-permission-matrix.md`). One versioned settings
document in `platform.platform_settings`. Every save carries a mandatory justification and is written to
`platform.audit_logs` with the before and after, in the same transaction. Decision record:
`docs/architecture/adr/108-platform-settings-store.md`.

**Stored only.** Nothing in the system reads these values to change behaviour: no gateway client,
scheduler, throttler, connection pool or quota check. Saving a value changes what the screen shows and what
the audit trail records, and nothing else.

Not to be confused with `backend/src/modules/tenant/settings.*`, which holds one tenant's own settings.

## Public API

Both routes need the `SYSTEM_ADMIN` role (`JwtAuthGuard` + `RolesGuard`).

```text
GET /api/v1/admin/settings
PUT /api/v1/admin/settings
```

`GET` returns `PlatformSettingsResponse`, and a successful `PUT` returns the same shape:

```ts
{
  version: number;                 // 0 while nothing has been saved
  updated_at: string | null;       // ISO 8601
  updated_by: { user_id: string; email: string; name: string } | null;
  settings: PlatformSettings;      // platform-settings.types.ts; every field null = "not set"
  counts: { shared_tenants: number; dedicated_tenants: number }; // active tenants in platform.tenants
}
```

The `PUT` body is `UpdatePlatformSettingsDto`, and it replaces the whole document:

```ts
{
  version: number;
  justification: string;
  settings: PlatformSettings;
}
```

| Status | When                                                                                                                                                                                                                                                       |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 200    | Saved. The body has the new version                                                                                                                                                                                                                        |
| 400    | Validation failed: justification shorter than 10 or longer than 500 characters after trimming, a non-`https` URL, a negative or out-of-bound count, an unknown channel, an unknown key at any level, or a missing field (a PUT carries the whole document) |
| 401    | Unauthenticated, or the request carries no operator id or home tenant                                                                                                                                                                                      |
| 403    | Not SYSTEM_ADMIN                                                                                                                                                                                                                                           |
| 409    | `COS-PSET-001`: `version` is not the stored version. `details` has `expected_version` and `stored_version`                                                                                                                                                 |

Programmatic surface: `PlatformSettingsService.get()` and
`PlatformSettingsService.update(expectedVersion, settings, justification, { userId, tenantId })`. The module
exports nothing, because nothing consumes the values.

## Dependencies

- `platform.platform_settings`: migration `20260915000001_platform_settings`
- `platform.audit_logs`: the audit row (`action = 'platform.settings.update'`,
  `resource_type = 'platform_settings'`, `tenant_id` = the operator's home tenant)
- `platform.users`: resolves `updated_by`. `platform.tenants`: the two counts; `dedicated_db_url` is only
  tested for null, never selected
- `AdminJustificationDto` (`modules/tenant/dto`), extended so the §6.7 justification rules stay in one place
- `createPrismaClient` on `DATABASE_URL`, closed in `onModuleDestroy` (Rule 39, ADR-034)

## Configuration

None of its own. It uses `DATABASE_URL`, the platform connection that `TenantService` also uses.

## Usage

```bash
# read — note the version
curl -H "Authorization: Bearer $TOKEN" https://api.example.com/api/v1/admin/settings

# save — send the version you read, the whole document, and a reason
curl -X PUT -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  https://api.example.com/api/v1/admin/settings \
  -d '{"version": 3, "justification": "Primary gateway moved (ticket OPS-6001).", "settings": { ... }}'
```

On `409`, fetch again, re-apply the change to the new document and save with the new version.

## Tests

- Unit: `__tests__/platform-settings.service.spec.ts`, `platform-settings.controller.spec.ts`,
  `update-platform-settings.dto.spec.ts` and `platform-settings.types.spec.ts`
- Integration (Testcontainers): `backend/test/platform-settings/01-platform-settings.integration.spec.ts`.
  Covers HTTP 200/400/403/409, the audit row, concurrent saves, RLS as `app_user`, and the rollback
- OpenAPI: `docs/api/platform-settings.openapi.yaml`
