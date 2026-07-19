-- Rollback: Phase 24 carbon analytics migration (QM-9)
-- Safe to run only when no deployed code references these tables.
--
-- Order matters: carbon_records has no FK to carbon_factors (the factor value and its source are
-- copied onto each record at calculation time, not joined), so the two drop independently — but
-- dropping records first keeps the intent obvious if a future revision adds that FK.

DROP TABLE IF EXISTS site_ops.carbon_records CASCADE;
DROP TABLE IF EXISTS site_ops.carbon_factors CASCADE;
