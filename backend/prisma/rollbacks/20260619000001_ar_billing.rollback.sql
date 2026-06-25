-- Rollback: Phase 7 AR Billing increment (billings, ar_receipts, contracts, customers).
-- Safe to run only when no deployed code references these tables.

DROP TABLE IF EXISTS finance.ar_receipts CASCADE;
DROP TABLE IF EXISTS finance.billings CASCADE;
DROP TABLE IF EXISTS finance.contracts CASCADE;
DROP TABLE IF EXISTS finance.customers CASCADE;
DROP TYPE IF EXISTS finance."BillingStatus";
DROP TYPE IF EXISTS finance."ContractType";
