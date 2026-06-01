-- Rollback: 20260601000001_mfa_totp_secret
-- Safe: column is nullable — no data loss risk IF no rows have mfa_enabled=true
-- WARNING: run only if no tenants have completed MFA enrollment (mfa_enabled=true)

ALTER TABLE platform.users
  DROP COLUMN IF EXISTS mfa_totp_secret;
