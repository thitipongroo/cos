-- Rollback: CredentialService (W3C DID/VC) schema (ADR-067).
-- Safe to run only when no deployed code references these tables.

DROP TABLE IF EXISTS credentials.audit_log CASCADE;
DROP TABLE IF EXISTS credentials.verifiable_credentials CASCADE;
DROP TABLE IF EXISTS credentials.revocation_status_lists CASCADE;
DROP TABLE IF EXISTS credentials.did_documents CASCADE;

DROP TYPE IF EXISTS credentials."StatusListPurpose";
DROP TYPE IF EXISTS credentials."VcStatus";
DROP TYPE IF EXISTS credentials."CredentialType";
DROP TYPE IF EXISTS credentials."DidRole";
DROP TYPE IF EXISTS credentials."DidStatus";
DROP TYPE IF EXISTS credentials."DidMethod";

DROP SCHEMA IF EXISTS credentials CASCADE;
