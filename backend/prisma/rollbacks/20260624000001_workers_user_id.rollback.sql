-- Rollback: 20260624000001_workers_user_id
-- Reverses the nullable workforce.workers.user_id link column + its partial unique index.
-- Safe to run only when no deployed code references user_id (QM-9): GET /api/v1/workers/me
-- resolves "my worker" through this column — roll back the application first.

DROP INDEX IF EXISTS workforce.uq_workers_user_id;
ALTER TABLE workforce.workers DROP COLUMN IF EXISTS user_id;
