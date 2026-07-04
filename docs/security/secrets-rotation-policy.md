# Secrets Rotation Policy

> **Required by:** QM-4 — all secrets must have a rotation schedule defined here.
> **Created:** Phase 2 (Authentication + Tenant System)
> **Owner:** Engineering Lead / Security Lead

---

## Rotation schedule by secret type

| Secret                                                  | Environment     | Rotation interval    | Method                                                                                                   | Responsible   |
| ------------------------------------------------------- | --------------- | -------------------- | -------------------------------------------------------------------------------------------------------- | ------------- |
| PostgreSQL credentials                                  | Cloud (AWS EKS) | 24 hours (automatic) | AWS SM Lambda rotation function                                                                          | AWS SM        |
| PostgreSQL credentials                                  | On-premise      | 24 hours (automatic) | Vault DB secrets engine (dynamic)                                                                        | Vault         |
| Redis password                                          | All             | 90 days (manual)     | Update SM/Vault secret → rolling pod restart                                                             | Engineering   |
| Keycloak admin password                                 | All             | 90 days (manual)     | Keycloak admin console + SM/Vault update                                                                 | Engineering   |
| Keycloak client secret (`cos-backend`)                  | All             | 180 days             | Keycloak admin console + SM/Vault update                                                                 | Engineering   |
| JWT signing keys (Path A — HS256)                       | All             | 180 days             | Rotate JWT_SECRET → rolling restart (tokens invalidated)                                                 | Engineering   |
| App secret encryption key (`APP_SECRET_ENCRYPTION_KEY`) | All             | 180 days             | Decrypt-with-old + re-encrypt-with-new all stored secrets, then SM/Vault update (see procedure; ADR-035) | Engineering   |
| Keycloak RS256 keypair (Path B)                         | All             | 180 days             | Keycloak JWKS rotation (zero-downtime — overlap period 7 days)                                           | Keycloak auto |
| AWS SNS credentials (OTP)                               | Cloud           | 90 days              | AWS IAM role rotation (prefer IAM role over long-lived keys)                                             | AWS IAM       |
| MinIO access/secret keys                                | All             | 90 days (manual)     | Update SM/Vault → rolling restart                                                                        | Engineering   |
| OpenAI API key                                          | All             | 90 days (manual)     | OpenAI dashboard + SM/Vault update                                                                       | Engineering   |
| SonarQube token                                         | CI              | 180 days             | SonarQube UI + GitHub Actions secret update                                                              | Engineering   |

---

## Rotation procedures

### PostgreSQL credentials (cloud — AWS SM automated rotation)

1. AWS SM triggers Lambda rotation function per resource type
2. Lambda creates new credentials → validates → updates SM secret
3. External Secrets Operator syncs new secret to K8s → pods restart automatically
4. Old credentials remain valid for 1 rotation cycle (no downtime)

### PostgreSQL credentials (on-premise — Vault DB engine)

1. Vault DB secrets engine issues dynamic credentials with 24h TTL
2. Vault Agent sidecar renews credentials before TTL expiry
3. No manual rotation required — credentials rotate automatically on lease expiry

### JWT signing keys (Path A — HS256)

> **Note:** Rotation invalidates all active Path A sessions. Users must re-authenticate.

1. Generate new `JWT_SECRET` value
2. Store in AWS SM / Vault
3. Coordinate rolling restart during low-traffic window (see `docs/runbooks/deployment-windows.md`)
4. Notify support team: expect OTP re-authentication surge for ~1 hour post-rotation

### Keycloak RS256 keypair (Path B — zero-downtime)

1. Keycloak generates new RSA keypair via admin console
2. Old keypair remains active in JWKS for 7 days (overlap period)
3. All existing tokens remain valid until expiry
4. After 7 days: deactivate old keypair
5. No user impact — token validation is stateless via JWKS

### App secret encryption key (`APP_SECRET_ENCRYPTION_KEY` — AES-256-GCM, ADR-035)

> **Note:** This key directly encrypts stored secrets (currently `platform.users.mfa_totp_secret`).
> There is no key-version field, so rotation requires re-encrypting every stored value with the new
> key in one coordinated step. A lost key makes existing values unrecoverable (affected users must
> re-enrol MFA).

1. Generate the new key: `openssl rand -hex 32`
2. Stage both keys (old + new) and run the re-encryption job: for each non-NULL `mfa_totp_secret`,
   `decryptSecret` with the old key → `encryptSecret` with the new key → `UPDATE`
3. Store the new key in AWS SM / Vault; remove the old key once re-encryption is verified
4. Coordinate during a low-traffic window (see `docs/runbooks/deployment-windows.md`)

---

## First rotation schedule (Phase 2 → Stage 2 transition)

All secrets must be rotated in staging at least once before Stage 1 → 2 transition (QM-4):

- [ ] PostgreSQL credentials rotated in staging — verified new credentials work
- [ ] Keycloak RS256 keypair rotated — verified zero-downtime
- [ ] JWT_SECRET rotated — verified re-authentication flow works
- [ ] APP_SECRET_ENCRYPTION_KEY rotated — verified re-encryption job + MFA authenticate still works
- [ ] MinIO credentials rotated — verified file upload still works

Record rotation execution results in `cos-audit/audit-<timestamp>.log`.
