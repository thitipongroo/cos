-- Rollback: client contract-signing magic-link tokens (ADR-058 CT-4).
DROP TABLE IF EXISTS finance.contract_sign_tokens CASCADE;
