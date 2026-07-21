-- Client contract-signing magic-link tokens (ADR-058 CT-4; ADR-030 pattern). A single-use, HMAC-signed,
-- short-expiry token lets an external client sign a contract without a platform account. Only sha256(token)
-- is stored (token_hash) — never the raw token; single-use is enforced by used_at.
--
-- Data classification: RESTRICTED (grants signing authority). invited_email is PDPA personal data.
-- Tenant-scoped: RLS by tenant_id. Needs UPDATE (mark used_at on signing) — SELECT/INSERT/UPDATE, no DELETE.

CREATE TABLE finance.contract_sign_tokens (
  token_id      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID          NOT NULL,
  contract_id   UUID          NOT NULL REFERENCES finance.contracts (contract_id),
  token_hash    CHAR(64)      NOT NULL,   -- sha256(token); the raw token is never persisted
  invited_name  VARCHAR(255),
  -- @pdpa(category: "contact") — invited client email
  invited_email VARCHAR(320),
  expires_at    TIMESTAMPTZ   NOT NULL,
  used_at       TIMESTAMPTZ,              -- set when the client signs; NULL = still usable (single-use)
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_sign_tokens_contract ON finance.contract_sign_tokens (contract_id, tenant_id);
CREATE INDEX idx_sign_tokens_hash     ON finance.contract_sign_tokens (token_hash);

-- ─── RLS: tenant isolation (finance standard policy) ─────────────────────────

DO $$ BEGIN
  ALTER TABLE finance.contract_sign_tokens ENABLE ROW LEVEL SECURITY;
  ALTER TABLE finance.contract_sign_tokens FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS rls_tenant_isolation ON finance.contract_sign_tokens;
  CREATE POLICY rls_tenant_isolation ON finance.contract_sign_tokens
    AS PERMISSIVE FOR ALL TO app_user
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);
END $$;

-- ─── Grants (app_user; SELECT/INSERT/UPDATE — no hard DELETE) ────────────────

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT SELECT, INSERT, UPDATE ON finance.contract_sign_tokens TO app_user;
  END IF;
END $$;
