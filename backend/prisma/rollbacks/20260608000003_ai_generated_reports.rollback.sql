-- Rollback: 20260608000003_ai_generated_reports
-- Drops ai.ai_generated_reports and its enum (policy and indexes drop with the table).
-- Run ONLY if migration must be reverted — all persisted AI report history will be lost.

DROP TABLE IF EXISTS ai.ai_generated_reports CASCADE;
DROP TYPE IF EXISTS ai.report_type_enum;
