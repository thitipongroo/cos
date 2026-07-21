-- CredentialService (W3C DID/VC) — MVP (ADR-067; spec §5.3 BG-001).
-- Storage for the DID/VC platform that underpins client contract signing (ADR-058) and BG-001
-- worker/equipment/training credentials.
--
-- Roles (ADR-067): ISSUER = persistent per-tenant did:web (Ed25519 key held in Vault/AWS SM, ADR-013 —
-- only a `key_ref` is stored here, never the private key); SIGNER (contract signing) = ephemeral did:key
-- (no stored key). VC format = Ed25519Signature2020 (JSON-LD Data Integrity). Revocation = Status List 2021.
--
-- Data classification: RESTRICTED (identity + credential material). Tenant-scoped: RLS by tenant_id.
-- Enums UPPERCASE; convention per ar_billing / codebase.

CREATE SCHEMA IF NOT EXISTS credentials;

-- ─── Enums ───────────────────────────────────────────────────────────────────

CREATE TYPE credentials."DidMethod"         AS ENUM ('WEB', 'KEY');
CREATE TYPE credentials."DidStatus"         AS ENUM ('ACTIVE', 'ROTATED', 'REVOKED');
CREATE TYPE credentials."DidRole"           AS ENUM ('ISSUER', 'SIGNER');
CREATE TYPE credentials."CredentialType"    AS ENUM ('LICENCE', 'EQUIPMENT_CERT', 'TRAINING_RECORD', 'CONTRACT_SIGNATURE');
CREATE TYPE credentials."VcStatus"          AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');
CREATE TYPE credentials."StatusListPurpose" AS ENUM ('REVOCATION');

-- ─── did_documents ───────────────────────────────────────────────────────────
-- ISSUER (did:web) = persistent, key_ref → Vault/AWS SM (ADR-013). SIGNER (did:key) = ephemeral, key_ref NULL.

CREATE TABLE credentials.did_documents (
  did_document_id UUID                       PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID                       NOT NULL,
  did             VARCHAR(512)               NOT NULL,
  method          credentials."DidMethod"    NOT NULL,
  did_role        credentials."DidRole"      NOT NULL,
  did_document    JSONB                      NOT NULL,
  encrypted_private_key TEXT,                -- AES-256-GCM ciphertext of the issuer private key (ADR-035; master key via env APP_SECRET_ENCRYPTION_KEY from SM/Vault); NULL for an ephemeral signer
  status          credentials."DidStatus"    NOT NULL DEFAULT 'ACTIVE',
  created_at      TIMESTAMPTZ                NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, did)
);

CREATE INDEX idx_did_documents_tenant ON credentials.did_documents (tenant_id);
CREATE INDEX idx_did_documents_role   ON credentials.did_documents (tenant_id, did_role, status);

-- ─── revocation_status_lists (W3C Status List 2021) ──────────────────────────
-- One (or more) per tenant; worker VCs occupy a bit index. Ephemeral contract signatures are
-- point-in-time (non-revocable) and do not occupy a status-list index.

CREATE TABLE credentials.revocation_status_lists (
  status_list_id         UUID                            PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID                            NOT NULL,
  purpose                credentials."StatusListPurpose" NOT NULL DEFAULT 'REVOCATION',
  status_list_credential JSONB                           NOT NULL,   -- signed StatusList VC
  encoded_list           TEXT                            NOT NULL,   -- base64url gzip bitstring
  capacity               INTEGER                         NOT NULL DEFAULT 131072,
  next_index             INTEGER                         NOT NULL DEFAULT 0,
  version                INTEGER                         NOT NULL DEFAULT 1,
  created_at             TIMESTAMPTZ                     NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ                     NOT NULL DEFAULT now()
);

CREATE INDEX idx_status_lists_tenant ON credentials.revocation_status_lists (tenant_id);

-- ─── verifiable_credentials ──────────────────────────────────────────────────

CREATE TABLE credentials.verifiable_credentials (
  vc_id             UUID                          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID                          NOT NULL,
  credential_type   credentials."CredentialType"  NOT NULL,
  issuer_did        VARCHAR(512)                  NOT NULL,
  subject_did       VARCHAR(512),
  credential        JSONB                         NOT NULL,   -- signed VC (Ed25519Signature2020)
  document_hash     VARCHAR(128),                             -- SHA-256 hex; set for CONTRACT_SIGNATURE
  status            credentials."VcStatus"        NOT NULL DEFAULT 'ACTIVE',
  status_list_id    UUID                          REFERENCES credentials.revocation_status_lists (status_list_id),
  status_list_index INTEGER,                                  -- bit position for revocable worker VCs
  issued_at         TIMESTAMPTZ                   NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ                   NOT NULL DEFAULT now()
);

CREATE INDEX idx_vc_tenant       ON credentials.verifiable_credentials (tenant_id);
CREATE INDEX idx_vc_type         ON credentials.verifiable_credentials (tenant_id, credential_type, status);
CREATE INDEX idx_vc_subject      ON credentials.verifiable_credentials (subject_did);
CREATE INDEX idx_vc_document_hash ON credentials.verifiable_credentials (document_hash);

-- ─── audit_log (QM-4 immutable audit; §5.9.8 Repudiation) ─────────────────────
-- Every state-changing credential operation (issue/revoke) writes an append-only row here, in the SAME
-- tenant transaction as the change, so no state change can go un-audited. Self-contained (no cross-schema
-- FK); app_user is granted SELECT + INSERT only (no UPDATE/DELETE) → immutable.

CREATE TABLE credentials.audit_log (
  audit_id      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL,
  actor_id      TEXT        NOT NULL,                 -- x-user-id: a platform user UUID, or a non-user actor URN (e.g. external contract-signing client, ADR-058 CT-5)
  action        VARCHAR(64) NOT NULL,                 -- CREDENTIAL_ISSUED | CREDENTIAL_REVOKED
  resource_type VARCHAR(64) NOT NULL,                 -- 'verifiable_credential'
  resource_id   UUID,                                 -- vc_id
  metadata      JSONB,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_credentials_audit_tenant ON credentials.audit_log (tenant_id, occurred_at DESC);

-- ─── RLS: tenant isolation (replicate §Phase 16 standard policy) ──────────────

DO $$ DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['did_documents', 'revocation_status_lists', 'verifiable_credentials', 'audit_log']
  LOOP
    EXECUTE format('ALTER TABLE credentials.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE credentials.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS rls_tenant_isolation ON credentials.%I', t);
    EXECUTE format($p$
      CREATE POLICY rls_tenant_isolation ON credentials.%I
        AS PERMISSIVE FOR ALL TO app_user
        USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid)
        WITH CHECK (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid)
    $p$, t);
  END LOOP;
END $$;

-- ─── Grants (app_user; soft-delete model per §11.4 — no hard DELETE) ──────────

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT USAGE ON SCHEMA credentials TO app_user;
    GRANT SELECT, INSERT, UPDATE ON credentials.did_documents           TO app_user;
    GRANT SELECT, INSERT, UPDATE ON credentials.revocation_status_lists TO app_user;
    GRANT SELECT, INSERT, UPDATE ON credentials.verifiable_credentials  TO app_user;
    GRANT SELECT, INSERT         ON credentials.audit_log               TO app_user;  -- immutable: no UPDATE/DELETE
  END IF;
END $$;
