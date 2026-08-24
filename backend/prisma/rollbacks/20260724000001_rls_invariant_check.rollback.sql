-- Rollback for 20260724000001_rls_invariant_check.
-- The migration is a check-only assertion (a DO block that RAISEs if a domain tenant_id table lacks
-- RLS) — it makes no schema change, so there is nothing to undo. No-op.
SELECT 1;
