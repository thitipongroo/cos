-- Rollback: 20260816000004_subject_request_verification
--
-- DESTRUCTIVE in the way that matters here: dropping these columns discards the evidence that a data
-- subject's control of their identifier was proved — the record PDPA-48 rests on. The requests
-- themselves survive; what is lost is the answer to "how do you know it was them", which cannot be
-- reconstructed from anything else.
--
-- Export `request_id, verification_sent_to, verification_sent_at, verified_at, verification_method`
-- before running this if any request was verified.
--
-- Drop order: index and constraints first, then the columns.

DROP INDEX IF EXISTS platform.idx_subject_requests_verification_token;

ALTER TABLE platform.subject_requests
  DROP CONSTRAINT IF EXISTS subject_requests_verified_has_evidence;

ALTER TABLE platform.subject_requests
  DROP CONSTRAINT IF EXISTS subject_requests_verification_method_check;

ALTER TABLE platform.subject_requests
  DROP COLUMN IF EXISTS verification_method,
  DROP COLUMN IF EXISTS verified_at,
  DROP COLUMN IF EXISTS verification_sent_at,
  DROP COLUMN IF EXISTS verification_sent_to,
  DROP COLUMN IF EXISTS verification_token_hash;
