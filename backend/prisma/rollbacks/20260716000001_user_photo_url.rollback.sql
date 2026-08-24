-- Rollback for 20260716000001_user_photo_url.
-- Drops the avatar photos. The uploaded files themselves survive in files.files — only the link from
-- the user to their photo is lost, so re-applying the migration starts everyone back at initials.

ALTER TABLE platform.users
  DROP COLUMN IF EXISTS photo_url;
