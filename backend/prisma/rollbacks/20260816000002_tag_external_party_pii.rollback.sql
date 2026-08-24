-- Rollback: 20260816000002_tag_external_party_pii
--
-- Safe: metadata-only (COMMENT ON COLUMN), same class as the two tagging migrations it extends. No
-- column, type, constraint or row is touched and no application code reads these comments at
-- runtime.
--
-- What is lost is the record, not the data: the PII inventory regenerated from the live schema stops
-- listing CRM and vendor contact columns, and the RoPA obligation those tags discharge (PDPA §40,
-- processor duty — see the migration header) is no longer evidenced in the database. Re-apply before
-- any audit that relies on the inventory query in 20260803000001.

COMMENT ON COLUMN crm.contacts.name IS NULL;
COMMENT ON COLUMN crm.contacts.email IS NULL;
COMMENT ON COLUMN crm.contacts.phone IS NULL;

COMMENT ON COLUMN crm.leads.contact_name IS NULL;

COMMENT ON COLUMN procurement.vendors.contact_email IS NULL;
COMMENT ON COLUMN procurement.vendors.contact_phone IS NULL;
COMMENT ON COLUMN procurement.vendors.tax_id IS NULL;
COMMENT ON COLUMN procurement.vendors.address IS NULL;
