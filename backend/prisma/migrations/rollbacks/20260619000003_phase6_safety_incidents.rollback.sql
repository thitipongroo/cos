-- Rollback: Phase 6 Safety Incidents.
-- Safe to run only when no deployed code references this table.

DROP TABLE IF EXISTS site_ops.incidents CASCADE;
