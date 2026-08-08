-- Rollback for 20260808000002_add_signature_to_inspections.
--
-- Drops the nullable signature column. It was additive (QM-9), so deployed code that never sends it
-- is unaffected; a client that DOES send it starts getting a column-does-not-exist error, so roll the
-- application back first, then this.
--
-- WHAT IS LOST: every signature captured while the column existed. It cannot be reconstructed — the
-- strokes live nowhere else, and the mobile client holds a copy only until its sync item flushes.
-- The inspection rows themselves survive intact and still carry `inspected_by` and `inspected_at`,
-- which are the facts that actually attribute the verification; what disappears is the drawn mark.
--
-- Re-applying the migration starts signature collection over from that moment.
ALTER TABLE site_ops.inspections
  DROP COLUMN IF EXISTS signature;
