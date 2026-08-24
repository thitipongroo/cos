-- Three facts about a permit that the app had nowhere to put: who is doing the work, what the work
-- is, and why it was turned down.
--
-- Source: mockup/mobile/07_safety_officer/04_permit_management/ — the dashboard card prints
-- CONTRACTOR on every row and REASON on a revoked one, and the request form
-- (02_permit_request) collects a contractor and a description. `site_ops.permits`
-- (20260619000002_tasks_permits) carried only type, number, validity and status, so none of the
-- three had a column behind it. Product-owner decision 2026-08-13: add the columns rather than draw
-- the fields as unavailable.
--
-- WHAT IS NOT ADDED, AND WHY. The same drawings show an AUTO-REJECT countdown ("12h 15m") on a
-- pending permit. That is a MECHANISM, not a field: it needs a scheduled job that flips PENDING to
-- REVOKED on a deadline, and no such job, policy or deadline exists anywhere in
-- `docs/specifications/`. A column alone would render a countdown that never fires. It stays drawn
-- and marked unavailable (PO ruling 2026-08-13), like the AI zones beside it.
--
-- WHY contractor_name IS A PLAIN COLUMN AND NOT AN FK TO procurement.vendors. A permit's contractor
-- is whoever is performing the permitted work — frequently a subcontractor crew that the tenant has
-- never raised a purchase order against, so requiring a vendor record would block the permit on
-- procurement data entry. It is also the wrong direction structurally: master §4 forbids one
-- module's tables reaching into another's, and site_ops joining procurement.vendors would be exactly
-- that. If the two ever need linking, that is a vendor_id column added deliberately, not a
-- constraint smuggled in here.
--
-- NOT TAGGED @pdpa, deliberately and consistently: this is a firm performing work, and
-- `procurement.vendors.vendor_name` — the same kind of fact — is untagged in both PII passes
-- (20260803000001, 20260804000005), which tag only person-level fields (users.email,
-- workers.contact_phone, display_name). A sole trader's business name would be a judgement call for
-- a future PDPA review of BOTH columns together, not a divergence introduced on this one.
--
-- NO NEW INDEX. All three are DISPLAY fields — the dashboard filters on (project_id, tenant_id),
-- which idx_permits_project already serves, and on `status`, which is a four-value column over a
-- small per-tenant set. An index nothing queries is write cost with no read benefit.
--
-- Backward-compatible (QM-9): all three are additive and NULLABLE, so deployed code that never
-- writes them keeps working. NULL is the correct value for every existing row — no permit recorded
-- before today has a contractor, a description or a rejection reason, and a '' default would assert
-- an empty answer where there was never a question.
--
-- Rollback: prisma/rollbacks/20260813000001_add_contractor_description_reason_to_permits.rollback.sql

ALTER TABLE site_ops.permits
  ADD COLUMN IF NOT EXISTS contractor_name VARCHAR(255);

ALTER TABLE site_ops.permits
  ADD COLUMN IF NOT EXISTS description TEXT;

-- VARCHAR(500) matches the platform's other reason fields — projects.projects.on_hold_reason and
-- .cancellation_reason (20260531000003_project_service) — so a reason is the same size wherever one
-- is recorded.
ALTER TABLE site_ops.permits
  ADD COLUMN IF NOT EXISTS revoke_reason VARCHAR(500);

COMMENT ON COLUMN site_ops.permits.contractor_name IS
  'INTERNAL — the firm performing the permitted work, as entered. NULL = not recorded. Free text by design: not an FK to procurement.vendors (a subcontractor crew often has no vendor record, and site_ops must not read another module''s tables — master §4).';

COMMENT ON COLUMN site_ops.permits.description IS
  'INTERNAL — scope of work and safety measures, as entered on the request form. NULL = not recorded.';

COMMENT ON COLUMN site_ops.permits.revoke_reason IS
  'INTERNAL — why the permit was rejected or revoked (status REVOKED). NULL = never revoked, or revoked before this column existed. Optional on PATCH /safety/permits/:id/reject, so it stays NULL when the approver gives no reason.';
