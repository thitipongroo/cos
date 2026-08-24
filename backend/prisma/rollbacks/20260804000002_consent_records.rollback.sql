-- Rollback: 20260804000002_consent_records
--
-- Drops the consent record entirely. Safe as a schema operation — the forward migration only ADDED a
-- type and a table, so nothing pre-existing is restored or disturbed, and no deployed code path read
-- platform.consents before it existed.
--
-- READ THIS BEFORE RUNNING IT. Unlike the other rollbacks in this directory, this one is
-- DATA-DESTRUCTIVE in a way that matters legally: platform.consents is the evidence PDPA §19 requires
-- a controller to be able to produce (PDPA-22), and the table is append-only precisely so that
-- history survives. Dropping it destroys every grant and withdrawal ever recorded, and there is no
-- second copy — the audit_logs row written by AuditInterceptor records that a consent endpoint was
-- called, not what the decision was.
--
-- If the goal is to disable the feature rather than erase the evidence, turn the flag off instead
-- (docs/registers/feature-flag-registry.md) and leave the table in place. Only run this if the migration is
-- being rolled back before any real consent decision has been captured.

DROP TABLE IF EXISTS platform.consents;

DROP TYPE IF EXISTS platform."ConsentPurpose";
