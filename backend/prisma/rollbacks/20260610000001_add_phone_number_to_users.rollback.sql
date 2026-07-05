-- Rollback: 20260610000001_add_phone_number_to_users
-- Reverses the nullable phone_number column + partial index on platform.users.
-- Safe to run only when no deployed code references phone_number (QM-9): the column is
-- read by Path A (SMS OTP) identity flows — roll back the application first.

DROP INDEX IF EXISTS platform.users_phone_number_idx;
ALTER TABLE platform.users DROP COLUMN IF EXISTS phone_number;
