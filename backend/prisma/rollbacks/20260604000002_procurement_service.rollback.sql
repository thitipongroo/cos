-- Rollback: Phase 5 Procurement Service migration
-- Drops tables in reverse dependency order.
-- Safe to run only when no deployed code references these tables.

DROP TABLE IF EXISTS wht_rules CASCADE;
DROP TABLE IF EXISTS vendor_score_weights CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS delivery_items CASCADE;
DROP TABLE IF EXISTS deliveries CASCADE;
DROP TABLE IF EXISTS po_line_items CASCADE;
DROP TABLE IF EXISTS purchase_orders CASCADE;
DROP TABLE IF EXISTS quotations CASCADE;
DROP TABLE IF EXISTS rfqs CASCADE;
DROP TABLE IF EXISTS purchase_requests CASCADE;
DROP TABLE IF EXISTS vendors CASCADE;
