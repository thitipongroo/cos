-- Add an optional HR "department" column to platform.users (supports future HR features).
ALTER TABLE platform.users ADD COLUMN IF NOT EXISTS department VARCHAR(255);
