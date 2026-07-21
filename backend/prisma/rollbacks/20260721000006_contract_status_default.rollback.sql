-- Rollback: contract status default (ADR-058 CT-7).
ALTER TABLE finance.contracts ALTER COLUMN status SET DEFAULT 'ACTIVE';
