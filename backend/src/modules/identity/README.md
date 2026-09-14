# identity

NestJS module for authentication and user identity.

## Purpose

Handles both authentication paths defined in Phase 2:

- **Path A — SMS OTP** (SITE_WORKER, SITE_ENGINEER): custom lightweight NestJS module using AWS SNS. Not via Keycloak extension.
- **Path B — Email/password** (PM, Finance, Admin, Executive): Keycloak OIDC with RS256-signed JWT.

Manages OTP generation, token issuance, JWT validation, refresh token rotation, and MFA (TOTP) for
TENANT_ADMIN and FINANCE roles.

## Public API

```text
POST /api/v1/auth/otp/request       — request SMS OTP (Path A)
POST /api/v1/auth/otp/verify        — verify OTP, returns JWT + refresh token
POST /api/v1/auth/refresh           — rotate refresh token
POST /api/v1/auth/logout            — invalidate refresh token
POST /api/v1/auth/mfa/enroll        — initiate TOTP setup (returns QR URI)
POST /api/v1/auth/mfa/verify        — confirm TOTP enrollment
POST /api/v1/auth/mfa/authenticate  — verify TOTP during login (Path B only)
```

JWT payload includes: `sub` (user_id), `tenantId`, `role`, `keycloakUserId`.

## Dependencies

- `@nestjs/jwt`, `@nestjs/passport`, `passport-jwt` — JWT validation
- `@aws-sdk/client-sns` — SMS OTP delivery via AWS SNS (ap-southeast-1)
- `@cos/rbac` — role definitions and guards
- `@cos/logger` — structured logging (never `console.log`)
- `@cos/tracing` — trace propagation
- Keycloak (via Docker Compose / EKS) — Path B identity source

## Configuration

| Variable                 | Description                                                      |
| ------------------------ | ---------------------------------------------------------------- |
| `JWT_SECRET`             | Signing secret (dev only — RS256 key in production via Keycloak) |
| `JWT_ACCESS_TTL`         | Access token TTL in seconds (default: 900 = 15 min)              |
| `JWT_REFRESH_TTL`        | Refresh token TTL in seconds (default: 2592000 = 30 days)        |
| `AWS_SNS_REGION`         | SNS region (default: ap-southeast-1)                             |
| `KEYCLOAK_BASE_URL`      | Keycloak server URL                                              |
| `KEYCLOAK_REALM`         | Realm name per tenant                                            |
| `KEYCLOAK_CLIENT_ID`     | Backend client ID                                                |
| `KEYCLOAK_CLIENT_SECRET` | Injected via AWS SM / Vault at runtime                           |

## Usage

```typescript
// Guard any controller endpoint
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(CosRole.PROJECT_MANAGER)
@Get('/projects')
findAll(@TenantId() tenantId: string) { ... }
```

OTP flow (Path A):

1. `POST /api/v1/auth/otp/request` with `{ phoneNumber: "+66812345678" }`
2. `POST /api/v1/auth/otp/verify` with `{ phoneNumber, otp }` → returns `{ accessToken, refreshToken }`

## Notes

- OTP: 6-digit numeric, TTL 5 min, max 3 attempts, max 10 requests/phone/day
- Offline session: cached JWT valid 7 days without internet (re-validates on reconnect)
- MFA required for `TENANT_ADMIN` and `FINANCE` roles (Path B only)
- `KeycloakJwtStrategy.validate()` refuses a token whose `sub` is not the `keycloak_user_id` of the account its
  `user_id` claim names (ADR-106). Several STARTER/PROFESSIONAL tenants share one realm, so the realm check alone
  cannot keep them apart. Kill switch `s1.identity.subject-binding` (default ON). Before relying on it in an
  environment, run `scripts/readiness/check-keycloak-subject-binding.sh` — it compares each Keycloak user's
  `user_id` attribute with that account's stored id, and each stored id of an active tenant with its realm. Exit 0
  means every account matches; exit 1 lists the accounts that would be locked out; exit 2 means it could not
  measure, including a realm it could not read
