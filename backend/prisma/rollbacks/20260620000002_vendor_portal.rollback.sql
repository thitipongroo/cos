-- Rollback: Vendor Portal (vendor_identities, vendor_trading_relationships, rfq_invitations).
-- Safe to run only when no deployed code references these tables.
-- procurement.vendors / procurement.rfqs are NOT touched — they predate the Vendor Portal.

DROP TABLE IF EXISTS procurement.rfq_invitations CASCADE;
DROP TABLE IF EXISTS platform.vendor_trading_relationships CASCADE;
DROP TABLE IF EXISTS platform.vendor_identities CASCADE;
