-- Rollback: 20260816000003_subject_requests
--
-- DESTRUCTIVE, and the loss is compliance evidence rather than operational data: dropping the table
-- discards the tenant's record of which subject requests it received, when, and how it answered —
-- the auditable trail PDPA §30 and GDPR Art 12 expect to exist. The CRM and vendor rows the requests
-- were about are untouched; anonymisation already applied to them is NOT reversed by this script and
-- cannot be, which is the point of anonymising rather than soft-deleting (ADR-090 §5).
--
-- Export the table before running this if any request row is still within its 30-day window or under
-- a retention obligation.
--
-- Drop order: table first (the policy and grant go with it), then the enum types, which nothing else
-- references.

DROP TABLE IF EXISTS platform.subject_requests;

DROP TYPE IF EXISTS platform."SubjectRequestStatus";

DROP TYPE IF EXISTS platform."SubjectRequestType";
