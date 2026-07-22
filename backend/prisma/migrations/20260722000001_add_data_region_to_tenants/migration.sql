-- Data-residency region for platform.tenants (05-security-compliance §5.6; 11-database-schema §11.1).
-- Assigned at provisioning: Thai -> ap-southeast-7, EU -> eu-west-1, default -> ap-southeast-1. A
-- tenant's Kafka topics and ClickHouse analytics are confined to this region; downstream consumers
-- resolve it from platform.tenants via tenant_id (it is NOT carried on the event envelope, §5.6).
-- Immutable after first data write -- no update path sets it (a change requires a full data
-- migration with product-owner and legal sign-off, §5.6).
--
-- NOT NULL DEFAULT makes the add backward-compatible (QM-9): existing rows take the default and code
-- that predates the column keeps working. platform.tenants is a cross-tenant system table (no RLS,
-- spec §7 identity-tables-in-platform), and a table-level grant already covers the new column.

ALTER TABLE platform.tenants
  ADD COLUMN IF NOT EXISTS data_region VARCHAR(20) NOT NULL DEFAULT 'ap-southeast-1';
