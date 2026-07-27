-- Rollback for 20260727000001_ai_token_usage.
-- Drops the table (RLS policy, index, unique constraint, grants go with it) and the schema. Safe: the
-- table was additive (QM-9) — no pre-existing code or column depended on it. DROP SCHEMA uses RESTRICT
-- implicitly (no CASCADE) so it only succeeds once the table is gone, i.e. nothing else lives in `ai`.
DROP TABLE IF EXISTS ai.token_usage;
DROP SCHEMA IF EXISTS ai;
