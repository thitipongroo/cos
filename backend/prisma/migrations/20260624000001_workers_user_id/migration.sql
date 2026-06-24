-- Phase 10 feature-UI (option A, product-owner ruling): link a workforce worker to an auth user
-- so a logged-in SITE_WORKER can resolve "my worker" (GET /api/v1/workers/me) for self check-in.
-- The link is set at worker creation (CreateWorkerDto.user_id). Nullable (existing workers have
-- none); unique per tenant when set so one user maps to at most one active worker.

ALTER TABLE workforce.workers ADD COLUMN IF NOT EXISTS user_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_workers_user_id
  ON workforce.workers (tenant_id, user_id)
  WHERE user_id IS NOT NULL;
