-- Device trust (product-owner decision 2026-07-16; §20.6.1 device-trust indicator).
--
-- The OTP screen's "device recognized as trusted hardware" banner was static text. This makes it a
-- server-side fact: a device is trusted when it holds a non-extractable P-256 key (Secure Enclave /
-- Android Keystore) whose PUBLIC key is registered here, is not revoked, has not expired, and proves
-- possession by signing a fresh server challenge at OTP verify. Trust is EARNED — a brand-new device
-- is untrusted on its first login (the OTP is the real auth) and enrols on success, so the next login
-- from that device is trusted. Mirrors the mainstream "remember this device" pattern.
--
-- Cross-tenant identity data, like platform.users: the lookup at OTP verify runs before any tenant
-- context exists (keyed by user_id + device_id). public_key is a PUBLIC key, never a secret.

CREATE TABLE IF NOT EXISTS platform.trusted_devices (
  device_row_id UUID         NOT NULL DEFAULT gen_random_uuid(),
  tenant_id     UUID         NOT NULL,
  user_id       UUID         NOT NULL REFERENCES platform.users (user_id) ON DELETE CASCADE,
  -- Stable per-install id the app keeps in secure storage (not a hardware serial).
  device_id     VARCHAR(128) NOT NULL,
  -- Base64url SPKI DER P-256 public key (react-native-secure-sign getPublicKey()).
  public_key    TEXT         NOT NULL,
  platform      VARCHAR(16)  NOT NULL,
  model         VARCHAR(128),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  -- Sliding trust window, extended on each trusted verify (§20.6.1: 30 days, renew on use).
  expires_at    TIMESTAMPTZ  NOT NULL,
  revoked_at    TIMESTAMPTZ,

  CONSTRAINT trusted_devices_pkey PRIMARY KEY (device_row_id),
  -- One enrolment row per (user, install); re-enrolment upserts the public key.
  CONSTRAINT trusted_devices_user_device_key UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_trusted_devices_user ON platform.trusted_devices (user_id);

-- Tenant isolation, identical to the standard rls_tenant_isolation applied to every table carrying a
-- tenant_id (20260608000004_rls_policies). Spelled out here rather than left to a replay of that
-- migration: ENABLE without a policy would deny app_user everything. The identity flow reads this
-- table cross-tenant via the app runtime connection (as it already does for platform.users), and
-- application queries additionally filter by user_id — the app-layer WHERE is secondary defence.
ALTER TABLE platform.trusted_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.trusted_devices FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_tenant_isolation ON platform.trusted_devices;

CREATE POLICY rls_tenant_isolation ON platform.trusted_devices
  AS PERMISSIVE
  FOR ALL
  TO app_user
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid);
