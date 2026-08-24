-- Rollback: 20260804000003_data_export_requests
--
-- Safe as a schema operation — the forward migration only ADDED two types and a table, so nothing
-- pre-existing is restored or disturbed and no deployed code read platform.export_requests before it
-- existed.
--
-- READ BEFORE RUNNING. Like the consent rollback, this one destroys COMPLIANCE EVIDENCE: each row is
-- the record that a PDPA §30/§31 subject request was received and answered, which is what a
-- controller must be able to produce on audit. Dropping the table cannot be undone from the
-- audit_logs rows AuditInterceptor wrote — those record that the endpoint was called, not what was
-- requested or whether it completed.
--
-- Two further consequences worth knowing before running it:
--   1. Archives already uploaded to the File Service are NOT removed here. They are referenced only
--      by export_requests.file_id, so dropping this table ORPHANS them — RESTRICTED payloads with
--      nothing left pointing at them and nothing left to expire them. Delete or expire outstanding
--      exports first.
--   2. Requests in flight lose their result: a Temporal workflow that completes after this runs will
--      fail to write back.
--
-- To disable the feature instead, turn off s1.identity.data-export (docs/registers/feature-flag-registry.md)
-- and leave the table in place.

DROP TABLE IF EXISTS platform.export_requests;

DROP TYPE IF EXISTS platform."ExportFormat";

DROP TYPE IF EXISTS platform."ExportStatus";
