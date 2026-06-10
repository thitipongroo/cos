-- Phase 2 gap closure (F-1): store phone number separately so keycloak_user_id
-- can hold the actual Keycloak UUID (per spec §5.4.1) instead of the phone placeholder.
-- Nullable: only Path A users have a phone_number; Path B users leave it NULL.

ALTER TABLE platform.users
  ADD COLUMN phone_number VARCHAR(20);

CREATE INDEX users_phone_number_idx
  ON platform.users (phone_number)
  WHERE phone_number IS NOT NULL;
