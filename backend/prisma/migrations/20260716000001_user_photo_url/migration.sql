-- Profile photo for platform.users (§11 platform.users; product-owner decision 2026-07-16).
-- Backing store for the mobile header avatar, which falls back to the user's initials while this is
-- NULL — so the column is nullable and no backfill is needed.
--
-- Stores the file-service URL rather than the image: uploads already go through
-- POST /api/v1/files/upload (files.files), and duplicating blob storage on the identity table would
-- put user photos outside the retention policies that own every other uploaded file.

ALTER TABLE platform.users
  ADD COLUMN IF NOT EXISTS photo_url TEXT;
