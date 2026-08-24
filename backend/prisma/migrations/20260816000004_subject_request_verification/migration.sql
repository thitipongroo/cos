-- Platform-witnessed identity verification for a subject request (ADR-090 §6; closes the last
-- PARTIAL on PDPA-48).
--
-- THE PROBLEM THESE COLUMNS SOLVE. Verification of an external data subject happened entirely
-- off-platform — the tenant emailed or phoned the person — so Construction OS could evidence that
-- the mechanism existed and was used, but not that the tenant checked the RIGHT person. A boolean
-- "verified" flag would not have fixed it: a checkbox nothing checks is evidence of nothing.
--
-- WHAT IS ACTUALLY PROVED, stated precisely so nobody later reads more into it than it carries: that
-- whoever answered CONTROLS THE IDENTIFIER THE TENANT ALREADY HOLDS. The challenge is sent to the
-- address ON THE MATCHED RECORD, never to an address typed into the request — proving control of a
-- claimed address would prove nothing about the person the tenant holds data about. It is not proof
-- of legal identity, and it is not meant to be: regulators ask for verification PROPORTIONATE to the
-- risk, built on information already held, and treat over-verification (demanding ID documents
-- without reasonable doubt) as an infringement in its own right (GDPR Art 12(2)/12(6)).
--
-- WHY THE HASH AND NOT THE TOKEN. Same rule the vendor-portal and contract-signing links follow
-- (ADR-030, ADR-058): the raw token goes out in the email and only sha256(token) is stored, so a
-- database copy cannot be replayed as a live link. Single use is enforced by `verified_at` being set.
--
-- Backward-compatible (QM-9): five nullable columns, no default that changes an existing row's
-- meaning. A request opened before this migration reads "never challenged", which is true.
-- Rollback: prisma/rollbacks/20260816000004_subject_request_verification.rollback.sql

ALTER TABLE platform.subject_requests
  -- sha256 of the issued token. NULL = no challenge has been sent.
  ADD COLUMN IF NOT EXISTS verification_token_hash VARCHAR(64),
  -- The identifier the challenge was actually sent to, copied from the MATCHED RECORD. Kept so an
  -- auditor can see the address that was proved, not merely that something was proved.
  ADD COLUMN IF NOT EXISTS verification_sent_to    VARCHAR(255),
  ADD COLUMN IF NOT EXISTS verification_sent_at    TIMESTAMPTZ,
  -- Set when the subject answers. Also what makes the token single-use.
  ADD COLUMN IF NOT EXISTS verified_at             TIMESTAMPTZ,
  -- How control was proved. One value today ('EMAIL_LINK'); the column exists because an SMS
  -- challenge is the obvious second, and a bare timestamp would not say which was used.
  ADD COLUMN IF NOT EXISTS verification_method     VARCHAR(20)
    CONSTRAINT subject_requests_verification_method_check
    CHECK (verification_method IN ('EMAIL_LINK'));

-- A request cannot be verified without a record of what was sent and where. Without this a row could
-- claim `verified_at` with nothing behind it — exactly the "checkbox that checks nothing" this
-- migration exists to avoid.
ALTER TABLE platform.subject_requests
  ADD CONSTRAINT subject_requests_verified_has_evidence
  CHECK (
    verified_at IS NULL
    OR (verification_sent_to IS NOT NULL
        AND verification_sent_at IS NOT NULL
        AND verification_method IS NOT NULL)
  );

-- The public confirm endpoint looks a request up by token hash and nothing else, so this is the only
-- index it can use. Partial: a challenged request is a small minority of rows.
CREATE INDEX IF NOT EXISTS idx_subject_requests_verification_token
  ON platform.subject_requests (verification_token_hash)
  WHERE verification_token_hash IS NOT NULL;

COMMENT ON COLUMN platform.subject_requests.verification_sent_to IS '@pdpa(category: "contact", role: "processor") — the identifier a verification challenge was sent to';
COMMENT ON COLUMN platform.subject_requests.verified_at IS 'When control of that identifier was proved. Proof of CONTROL, not of legal identity (ADR-090 §6).';
