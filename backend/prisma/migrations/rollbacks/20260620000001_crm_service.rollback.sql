-- Rollback: CRM Service (leads, opportunities, contacts).
-- Safe to run only when no deployed code references these tables.
-- finance.customers (the Customer store) is NOT touched — it predates CRM (ADR-024).

DROP TABLE IF EXISTS crm.contacts CASCADE;
DROP TABLE IF EXISTS crm.opportunities CASCADE;
DROP TABLE IF EXISTS crm.leads CASCADE;
DROP SCHEMA IF EXISTS crm;
