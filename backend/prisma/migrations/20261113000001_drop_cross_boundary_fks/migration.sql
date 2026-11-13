-- No foreign key crosses between `platform` and a tenant's data (D56, 2026-11-13).
--
-- WHY
-- ---
-- An ENTERPRISE tenant's domain schemas live in its dedicated database; `platform` never moves (get-db-url.ts)
-- and is empty there. Three foreign keys crossed that line, measured on a fully migrated database:
--
--   boq.boq_items.central_price_id               → platform.central_price_catalog  (ADR-061)
--   procurement.rfq_invitations.vendor_identity_id → platform.vendor_identities      (vendor portal)
--   platform.vendor_trading_relationships.vendor_id → procurement.vendors           (the other way round)
--
-- In a dedicated database the first two fail every insert that sets them (the referenced platform rows are not
-- there), so an ENTERPRISE tenant could neither link a BOQ line to a central price nor invite a vendor. The third
-- lives in the shared database and names a tenant row: a vendor created in a dedicated database is not in the
-- shared `procurement.vendors`, so its trading relationship could not be created at all.
--
-- The references are checked where they are written instead: central_price_id only ever comes from a read of
-- the shared catalog (BoqService → CentralPriceCatalogService), vendor_identity_id from upsertIdentity in the
-- same request, and vendor_id is now checked against the tenant's own vendors (VendorPortalService). No code
-- deletes rows of the referenced tables, so ON DELETE RESTRICT guarded nothing the application does.
--
-- Dropped on every database alike, so the shared and dedicated schemas stay one schema.
--
-- BACKWARD-COMPATIBLE (QM-9)
-- --------------------------
-- Removes constraints only; no data changes. The running backend writes nothing a dropped constraint would have
-- rejected (see above). Re-runnable: IF EXISTS.
--
-- Rollback: prisma/rollbacks/20261113000001_drop_cross_boundary_fks.rollback.sql

ALTER TABLE boq.boq_items DROP CONSTRAINT IF EXISTS boq_items_central_price_id_fkey;
ALTER TABLE procurement.rfq_invitations DROP CONSTRAINT IF EXISTS rfq_invitations_vendor_identity_id_fkey;
ALTER TABLE platform.vendor_trading_relationships DROP CONSTRAINT IF EXISTS vendor_trading_relationships_vendor_id_fkey;
