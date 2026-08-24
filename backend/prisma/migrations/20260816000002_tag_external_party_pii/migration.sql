-- Extend the @pdpa column taxonomy (20260803000001, 20260804000005) to personal data about people
-- who are NOT platform users — CRM contacts and leads, and the named contact person at a vendor.
--
-- WHY THIS WAS MISSING. Both earlier passes scoped themselves to the data the export collector reads,
-- and that collector is keyed by `userId`: it answers "what does this platform hold about this
-- ACCOUNT HOLDER". Everyone in the tables below is an outside party with no account, so no query
-- could reach them and nothing prompted a tag. The tagging then read as a statement that the
-- platform holds no personal data here, which was untrue — found 2026-08-16 while auditing the
-- @pdpa coverage against the migrations rather than against the collector.
--
-- THIS IS PROCESSOR DATA, AND THE TAG SAYS SO. For everything below the TENANT is the controller —
-- it decides to record these people and why — and Construction OS is the processor. That does not
-- remove the obligation to inventory it: PDPA §40 makes a processor keep its own record of the
-- categories of processing carried out on behalf of each controller, and the fine for not doing so
-- is administrative, up to THB 5,000,000. It does change WHO answers a subject: a request that
-- arrives here is routed to the tenant, and the tenant is given the tooling to answer it (ADR-090).
--
-- THERE IS NO B2B EXEMPTION IN THAI LAW, which is the reason "it is only business contact data" was
-- not accepted as a basis for leaving these untagged. Singapore's PDPA §4(5) does exempt business
-- contact information used for B2B; Thailand's does not, and its definition — data enabling the
-- identification of a person, directly or indirectly — plainly covers a named person's work email
-- and phone. Thailand's PDPA follows the GDPR model here, not Singapore's.
--
-- Metadata-only: adds no column, changes no type, reads no row (QM-9).
-- Rollback: prisma/rollbacks/20260816000002_tag_external_party_pii.rollback.sql

-- ─── crm.contacts — a named person at a prospect, with their own contact details ────────────────
-- The clearest case in the schema: `name` is NOT NULL, so every row identifies someone.
COMMENT ON COLUMN crm.contacts.name IS '@pdpa(category: "identity", role: "processor") — name of an external contact; tenant is the controller';
COMMENT ON COLUMN crm.contacts.email IS '@pdpa(category: "contact", role: "processor") — external contact''s email; tenant is the controller';
COMMENT ON COLUMN crm.contacts.phone IS '@pdpa(category: "contact", role: "processor") — external contact''s phone; tenant is the controller';

-- ─── crm.leads — the person named on the lead itself ────────────────────────────────────────────
-- `company` is deliberately NOT tagged: a company is a juristic person and not a data subject under
-- the PDPA. `contact_name` is the person.
COMMENT ON COLUMN crm.leads.contact_name IS '@pdpa(category: "identity", role: "processor") — name of the person a lead is held against; tenant is the controller';

-- ─── procurement.vendors — the contact person at a supplier ─────────────────────────────────────
-- Tagged even though the vendor itself is usually a company: these two columns hold a PERSON's work
-- email and phone, and it is that person, not the company, who is the data subject.
COMMENT ON COLUMN procurement.vendors.contact_email IS '@pdpa(category: "contact", role: "processor") — work email of a named person at the vendor; tenant is the controller';
COMMENT ON COLUMN procurement.vendors.contact_phone IS '@pdpa(category: "contact", role: "processor") — work phone of a named person at the vendor; tenant is the controller';

-- ─── procurement.vendors.tax_id / .address — CONDITIONAL, and the condition is a column ─────────
-- Personal data only when `vendor_type = 'INDIVIDUAL'` (a sole trader's tax id is their own; their
-- business address is where they live). Not personal data when the vendor is JURISTIC. The tag
-- records the condition rather than asserting either case, because the table holds both and NULL
-- means the type was never recorded — see 20260816000001. A consumer of these tags MUST read
-- `vendor_type` before treating a row as personal data; treating every row as personal would put a
-- company's public tax id into an individual's subject-access archive.
COMMENT ON COLUMN procurement.vendors.tax_id IS '@pdpa(category: "identity", role: "processor", conditional: "vendor_type = INDIVIDUAL") — a sole trader''s tax id is personal data; a company''s is not';
COMMENT ON COLUMN procurement.vendors.address IS '@pdpa(category: "contact", role: "processor", conditional: "vendor_type = INDIVIDUAL") — a sole trader''s address is where a person lives; a company''s is not';
