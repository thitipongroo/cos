-- Rollback: client contract signing CT-1 data model (ADR-058).
-- Safe to run only when no deployed code references these objects.

DROP TABLE IF EXISTS finance.contract_signatures CASCADE;

ALTER TABLE finance.contracts DROP COLUMN IF EXISTS signed_document_id;

DROP TYPE IF EXISTS finance."SignatureVerificationStatus";
DROP TYPE IF EXISTS finance."SignerParty";
