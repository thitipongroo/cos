-- Rollback: contract free-text terms (ADR-058 CT-2c-1).
ALTER TABLE finance.contracts DROP COLUMN IF EXISTS terms;
