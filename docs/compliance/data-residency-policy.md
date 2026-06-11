# Construction OS — Data Residency Policy

**Authoritative file** referenced by `docs/specifications/05-security-compliance.md` §5.6.

## 1. Purpose

This policy defines where Construction OS stores and processes tenant data to satisfy
Thai PDPA (B.E. 2562) and GDPR obligations. Every storage service (RDS, S3, ElastiCache,
MSK, ClickHouse) must honour the residency assignment of the tenant's home region.

## 2. Region assignments

| Tenant origin   | Primary region             | DR region          | Governing law                        |
| --------------- | -------------------------- | ------------------ | ------------------------------------ |
| Thai tenants    | `ap-southeast-7` (Bangkok) | `ap-southeast-1`   | PDPA — data must not leave Thailand  |
| EU tenants      | `eu-west-1` (Ireland)      | —                  | GDPR                                 |
| Other / default | `ap-southeast-1` (Singapore) | —                | Platform default                     |

## 3. Enforcement rules

- Thai-origin data must not leave `ap-southeast-7` / `ap-southeast-1` without explicit
  tenant consent documented in the consent record (Keycloak consent claim).
- EU-origin data must not leave `eu-west-1` without explicit tenant consent.
- A tenant's `home_region` is recorded at tenant creation time in the platform tenant
  registry and is immutable after first data write.
- All database connection strings, S3 bucket references, and Kafka broker endpoints are
  region-scoped. The platform routing layer reads `tenant.home_region` from the tenant
  registry and selects the correct regional endpoint before executing any query.
- Cross-region replication (active-passive DR) replicates only within permitted boundaries:
  Thai primary (`ap-southeast-7`) may replicate to DR (`ap-southeast-1`) because both
  regions are within Thailand's data sovereignty zone for PDPA purposes.

## 4. Implementation checkpoints

| Layer         | Control                                                          | Owner             |
| ------------- | ---------------------------------------------------------------- | ----------------- |
| Terraform     | S3 buckets created per region; RDS instances per region          | Infrastructure    |
| Application   | `TenantRoutingMiddleware` selects regional DB URL before queries  | Backend           |
| CI/CD         | Terraform workspace per region (`dev`, `staging`, `production`)  | DevOps            |
| Audit         | Data residency compliance reviewed annually (spec §5.1.3)        | Compliance        |

## 5. Related documents

- `docs/specifications/05-security-compliance.md` §5.6 — canonical residency table
- `docs/compliance/pdpa-controls.md` — PDPA control tracking
- `infrastructure/terraform/aws/` — regional Terraform modules
