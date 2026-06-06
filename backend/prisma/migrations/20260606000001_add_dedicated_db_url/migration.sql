-- Migration: add dedicated_db_url to platform.tenants
-- Purpose: enable per-tenant dedicated PostgreSQL routing for enterprise tier
-- NULL = tenant uses shared DB (DATABASE_URL); non-NULL = dedicated DB connection string
-- Trigger for code routing: dedicated_db_url IS NOT NULL

ALTER TABLE platform.tenants
  ADD COLUMN dedicated_db_url VARCHAR(500) NULL;
