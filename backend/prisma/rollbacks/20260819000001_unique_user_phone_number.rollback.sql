-- Rollback: 20260819000001_unique_user_phone_number
--
-- NOT destructive to data — it drops a constraint, so nothing that is currently stored becomes
-- invalid. What it removes is the guarantee, and the consequence is not cosmetic: with the unique
-- index gone, two accounts can again hold one phone number, and Path A OTP login resolves them with
-- `LIMIT 1` and no ORDER BY. IdentityService now refuses to issue tokens when it sees more than one
-- match (COS-AUTH-101) rather than picking arbitrarily, so a duplicate created after this rollback
-- locks that worker out of login instead of logging them into the wrong tenant — a safe failure, but
-- still a failure. Only run this if the constraint is genuinely blocking something.
--
-- The plain index is recreated so phone lookups do not fall back to a sequential scan.

DROP INDEX IF EXISTS platform.users_phone_number_key;

CREATE INDEX IF NOT EXISTS users_phone_number_idx
  ON platform.users (phone_number)
  WHERE phone_number IS NOT NULL;
