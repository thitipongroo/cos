-- Rollback: Phase 3 Project Service migration
-- Run ONCE per tenant schema: SET search_path = {tenant_code}; then execute this file.
-- This drops all Phase 3 tables and enums. Data loss is irreversible.

DROP TABLE IF EXISTS outbox_events;
DROP TABLE IF EXISTS project_documents;
DROP TABLE IF EXISTS project_members;
DROP TABLE IF EXISTS projects;

DROP TYPE IF EXISTS "ProjectMemberRole";
DROP TYPE IF EXISTS "ProjectStatus";
DROP TYPE IF EXISTS "ProjectType";
