-- Rollback: 20260608000002_ai_usage_logs
-- Drops ai.ai_usage_logs (policy and index drop with the table).
-- Run ONLY if migration must be reverted — all LLM token-usage history will be lost.
-- The `ai` schema is intentionally NOT dropped: it is shared with ai.ai_generated_reports
-- (20260608000003) and later ai.* objects; drop the schema only after every ai.* migration
-- has been rolled back.

DROP TABLE IF EXISTS ai.ai_usage_logs CASCADE;
