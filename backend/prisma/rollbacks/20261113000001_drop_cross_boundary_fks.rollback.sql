-- Rollback: 20261113000001_drop_cross_boundary_fks
--
-- Re-adds the three cross-boundary foreign keys (D56 dropped them). NOT VALID: rows written while they were gone
-- are not checked — in a dedicated database every non-null reference into platform would fail, which is why
-- they were dropped; on the shared database a trading relationship may name a vendor that lives only in a
-- tenant's dedicated database. New writes are checked again once this has run, so an ENTERPRISE tenant can no
-- longer link central prices or invite vendors (the state before D56).
--
-- Re-runnable: each constraint is added only if it is absent.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'boq_items_central_price_id_fkey') THEN
    ALTER TABLE boq.boq_items
      ADD CONSTRAINT boq_items_central_price_id_fkey
      FOREIGN KEY (central_price_id) REFERENCES platform.central_price_catalog (price_id)
      ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rfq_invitations_vendor_identity_id_fkey') THEN
    ALTER TABLE procurement.rfq_invitations
      ADD CONSTRAINT rfq_invitations_vendor_identity_id_fkey
      FOREIGN KEY (vendor_identity_id) REFERENCES platform.vendor_identities (vendor_identity_id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendor_trading_relationships_vendor_id_fkey') THEN
    ALTER TABLE platform.vendor_trading_relationships
      ADD CONSTRAINT vendor_trading_relationships_vendor_id_fkey
      FOREIGN KEY (vendor_id) REFERENCES procurement.vendors (vendor_id) NOT VALID;
  END IF;
END $$;
