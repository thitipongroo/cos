-- Client contract signing (ADR-058, re-based onto ADR-019 CredentialService). Bilateral PKI/VC signing
-- in the finance service. CT-1: data model only — the ContractSignature entity + Contract.signed_document_id.
-- The status lifecycle, signing endpoints, and events land in later increments (CT-2..CT-7).
--
-- Data classification: RESTRICTED (signatory identity + document hashes; §11). Tenant-scoped: RLS by tenant_id.
-- Enums UPPERCASE; grants SELECT/INSERT/UPDATE only (soft-delete model, §11.4) — matching the finance schema.

-- ─── Enums ───────────────────────────────────────────────────────────────────

CREATE TYPE finance."SignerParty"                AS ENUM ('INTERNAL', 'CLIENT');
CREATE TYPE finance."SignatureVerificationStatus" AS ENUM ('VERIFIED', 'PENDING', 'FAILED');

-- ─── Contract.signed_document_id (FK → File Service file) ────────────────────
-- The attached/generated contract PDF lives in the files schema (File Service); same convention as
-- files.photo_annotations.file_id. Nullable — set when a document is attached (CT-2).

ALTER TABLE finance.contracts
  ADD COLUMN signed_document_id UUID REFERENCES files.files (file_id);

-- ─── contract_signatures (ADR-058 §Data model) ──────────────────────────────
-- One row per signature (bilateral → typically INTERNAL + CLIENT). Each binds a signer to the SHA-256
-- hash of the signed document via a CredentialService-issued VC (credential_ref).

CREATE TABLE finance.contract_signatures (
  signature_id        UUID                                     PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID                                     NOT NULL,
  contract_id         UUID                                     NOT NULL REFERENCES finance.contracts (contract_id),
  signer_party        finance."SignerParty"                    NOT NULL,
  signer_identity     JSONB                                    NOT NULL,   -- {userId} for INTERNAL; {name,email|phone} for CLIENT
  credential_ref      VARCHAR(512),                                        -- VC id / DID reference from CredentialService
  document_hash       VARCHAR(128)                             NOT NULL,   -- SHA-256 hex of the document at signing time
  signed_at           TIMESTAMPTZ                              NOT NULL DEFAULT now(),
  ip_address          INET,
  magic_link_token_id UUID,                                                -- nullable; populated for a CLIENT signature
  verification_status finance."SignatureVerificationStatus"    NOT NULL DEFAULT 'PENDING',
  created_at          TIMESTAMPTZ                              NOT NULL DEFAULT now()
);

CREATE INDEX idx_contract_signatures_contract ON finance.contract_signatures (contract_id, tenant_id);
CREATE INDEX idx_contract_signatures_tenant   ON finance.contract_signatures (tenant_id);

-- ─── RLS: tenant isolation (finance standard policy) ─────────────────────────

DO $$ BEGIN
  ALTER TABLE finance.contract_signatures ENABLE ROW LEVEL SECURITY;
  ALTER TABLE finance.contract_signatures FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS rls_tenant_isolation ON finance.contract_signatures;
  CREATE POLICY rls_tenant_isolation ON finance.contract_signatures
    AS PERMISSIVE FOR ALL TO app_user
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);
END $$;

-- ─── Grants (app_user; soft-delete model per §11.4 — no hard DELETE) ─────────

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT SELECT, INSERT, UPDATE ON finance.contract_signatures TO app_user;
  END IF;
END $$;
