-- Phase 2 gap: MFA TOTP secret storage
-- Backward-compatible: nullable column, no default required (existing rows get NULL)
-- mfa_enabled stays false until verifyAndActivate() is called

ALTER TABLE platform.users
  ADD COLUMN IF NOT EXISTS mfa_totp_secret VARCHAR(255);
