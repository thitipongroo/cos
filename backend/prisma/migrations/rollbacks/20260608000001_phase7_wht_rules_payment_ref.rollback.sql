-- Rollback Phase 7 addendum: wht_rules and payments.wht_certificate_ref
ALTER TABLE finance.payments DROP COLUMN IF EXISTS wht_certificate_ref;
DROP TABLE IF EXISTS finance.wht_rules;
