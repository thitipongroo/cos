-- Rollback: 20260817000001_privacy_inquiries
--
-- DESTRUCTIVE, and what is lost is compliance evidence rather than operational data: the table is the
-- platform's own record that a person with no account wrote in about their data — who, when, what
-- they asked for, and what was done. `docs/registers/pdpa-controls.md` scores PDPA-03 on the
-- existence of a channel a data subject can actually reach; dropping this removes the evidence that
-- one was answered.
--
-- Export the table before running this if any inquiry is still OPEN or ROUTED. A ROUTED inquiry has a
-- `linked_request_id` into platform.subject_requests, and that row does NOT come back with it: the
-- tenant's own handling record survives this script, orphaned from the inquiry that started it.
--
-- Nothing in this migration was destructive to begin with (new types + new table only), so the
-- reverse is a clean drop with no data to restore elsewhere.
--
-- Drop order: table first (its indexes and the FK go with it), then the enum types, which nothing
-- else references.

DROP TABLE IF EXISTS platform.privacy_inquiries;

DROP TYPE IF EXISTS platform."PrivacyInquiryStatus";

DROP TYPE IF EXISTS platform."PrivacyInquiryCategory";
