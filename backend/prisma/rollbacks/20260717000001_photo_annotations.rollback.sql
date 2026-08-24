-- Rollback for 20260717000001_photo_annotations (QM-9: every migration ships a verified rollback,
-- kept OUTSIDE prisma/migrations/ so `prisma migrate deploy` does not treat it as a migration, P3015).
--
-- Drops the table and its RLS policy. The policy goes with the table on DROP, but it is dropped
-- explicitly first so the rollback is safe to run even if a partial migration left the table without
-- it. No data-preservation step: this is a new table with no prior consumers.

DROP POLICY IF EXISTS rls_tenant_isolation ON files.photo_annotations;

DROP TABLE IF EXISTS files.photo_annotations;
