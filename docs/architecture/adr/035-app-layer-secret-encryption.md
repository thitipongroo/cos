# ADR-035: Application-layer encryption for secrets at rest (TOTP MFA seeds)

**Date:** 2026-06-28
**Status:** Accepted
**Deciders:** Product owner, Engineering Lead
**Tags:** security | data

---

## Context

`platform.users.mfa_totp_secret` stored the raw TOTP shared secret in plaintext, relying solely on
database storage encryption (RDS/Aurora SSE-KMS, QM-4) for confidentiality. SSE-KMS protects against
physical media compromise and offline backups, but it is transparent to any principal that can read
the row — a SQL injection, an over-broad read grant, a leaked read-replica, or a logical backup
(`pg_dump`) all expose a directly usable MFA seed. Unlike a 6-digit OTP (which is short-lived and
brute-forceable regardless), a TOTP seed is long-lived and high-value: possession of the seed lets an
attacker mint valid TOTP codes indefinitely, defeating the second factor for `TENANT_ADMIN` /
`FINANCE` accounts.

This gap was identified during the Phase 2 identity-module security audit (finding "B").

## Decision

Encrypt secret values at the **application layer** before persisting them, above DB SSE-KMS
(defense-in-depth). A shared utility `backend/src/shared/crypto/secret-cipher.ts` provides
`encryptSecret()` / `decryptSecret()` using **AES-256-GCM**:

- 256-bit key supplied via `APP_SECRET_ENCRYPTION_KEY` (64 hex chars), injected from AWS Secrets
  Manager / Vault in production; a fixed dev key is used only when `NODE_ENV !== 'production'`
  (fail-fast if the key is missing in production).
- Wire format: `iv:authTag:ciphertext`, each hex-encoded (12-byte random IV per encryption;
  GCM auth tag detects tampering on decrypt). Output fits the existing `VARCHAR(255)` column.

`MfaService.verifyAndActivate()` encrypts the seed before the `UPDATE`; `MfaService.authenticate()`
decrypts it before TOTP verification. The first consumer is `mfa_totp_secret`; the utility is generic
and may be reused for future secrets classified `RESTRICTED`.

## Rationale

- **AES-256-GCM** is authenticated encryption — confidentiality + integrity in one primitive — and is
  the AES mode already mandated at rest (QM-4, "AES-256 minimum").
- **App-layer (not only SSE-KMS):** SSE-KMS is invisible to row reads; app-layer encryption ensures a
  DB read alone yields ciphertext, not a usable seed.
- **Direct symmetric key vs. envelope/KMS-per-record:** a single env-injected key was chosen for
  simplicity at current scale. Per-record envelope encryption (AWS KMS `GenerateDataKey`, or Vault
  Transit — see `docs/specifications/05-security-compliance.md`) was considered but deferred: it adds
  a KMS call per enrollment/login and key-version bookkeeping not justified for the single low-volume
  field today. The utility's interface is stable, so a future migration to Transit/KMS is contained.
- **Not hashing:** the seed must be recoverable to verify TOTP codes, so a one-way hash is not an
  option (unlike the OTP value, which is compared, not reconstructed).

## Consequences

### Positive

- A database read (injection, leaked replica, logical backup) no longer exposes usable MFA seeds.
- Reusable primitive for any future `RESTRICTED` secret stored at rest.

### Negative

- Introduces a long-lived secret (`APP_SECRET_ENCRYPTION_KEY`) that must be managed and rotated
  (added to `docs/policies/secrets-rotation-policy.md`).
- Key rotation requires decrypt-with-old + re-encrypt-with-new for all stored values (no key-version
  field today) — documented as the rotation procedure.
- A lost key makes existing `mfa_totp_secret` values unrecoverable; affected users must re-enrol MFA.

### Neutral

- Ciphertext (~122 chars) stays within the existing `VARCHAR(255)` column — no migration required.

## References

- `backend/src/shared/crypto/secret-cipher.ts` — implementation
- `backend/src/modules/identity/mfa/mfa.service.ts` — first consumer
- `docs/specifications/11-database-schema.md` — `platform.users.mfa_totp_secret`
- `docs/specifications/05-security-compliance.md` — encryption-at-rest / Vault Transit envelope option
- `docs/policies/secrets-rotation-policy.md` — `APP_SECRET_ENCRYPTION_KEY` rotation
- QM-4 (Security — AES-256 at rest), QM-11 (ADR requirement)
