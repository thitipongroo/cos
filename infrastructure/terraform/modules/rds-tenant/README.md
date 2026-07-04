# Terraform Module: rds-tenant

Provisions a dedicated AWS RDS PostgreSQL instance for an Enterprise tenant.

This module is the **IaC reference** for the RDS instance that
`EnterpriseProvisioningWorkflow` (Temporal) creates programmatically via the AWS SDK
(`@aws-sdk/client-rds`). The Terraform module exists for:

- Manual provisioning when the automated workflow is unavailable
- Re-creating an instance from a snapshot during disaster recovery
- Auditing the expected configuration via IaC diff

See workflow implementation: `backend/src/modules/tenant/workflows/enterprise-provisioning.activities.ts`

---

## Usage

```hcl
module "rds_tenant_acme" {
  source = "../../modules/rds-tenant"

  tenant_code  = "acme_corp"
  environment  = "prod"
  vpc_id       = var.vpc_id
  subnet_ids   = var.private_subnet_ids
  eks_node_sg_id = var.eks_node_security_group_id
  kms_key_arn  = aws_kms_key.tenant_acme.arn
}
```

---

## Inputs

| Name                    | Type         | Required | Default        | Description                                              |
| ----------------------- | ------------ | -------- | -------------- | -------------------------------------------------------- |
| `tenant_code`           | string       | Yes      | —              | Tenant slug (e.g. `acme_corp`). Used in resource naming. |
| `environment`           | string       | Yes      | —              | Deployment environment (`prod`, `staging`, `dev`).       |
| `vpc_id`                | string       | Yes      | —              | VPC ID where the RDS instance is deployed.               |
| `subnet_ids`            | list(string) | Yes      | —              | Private subnet IDs for the DB subnet group.              |
| `eks_node_sg_id`        | string       | Yes      | —              | EKS node security group ID — granted port 5432 access.   |
| `kms_key_arn`           | string       | Yes      | —              | Per-tenant KMS key ARN for storage encryption.           |
| `instance_class`        | string       | No       | `db.t3.medium` | RDS instance class. Negotiable per contract.             |
| `allocated_storage`     | number       | No       | `100`          | Initial storage in GB (GP3). Auto-scales to 1 TB.        |
| `backup_retention_days` | number       | No       | `7`            | Automated backup retention period in days.               |
| `db_name`               | string       | No       | `cos`          | Database name created on the instance.                   |
| `master_username`       | string       | No       | `cos_admin`    | Master username for the RDS instance.                    |

---

## Outputs

| Name                           | Description                                                                      |
| ------------------------------ | -------------------------------------------------------------------------------- |
| `db_endpoint`                  | RDS instance endpoint hostname (without port).                                   |
| `db_port`                      | RDS instance port (always 5432).                                                 |
| `db_connection_url_secret_arn` | ARN of the Secrets Manager secret containing the full PostgreSQL connection URL. |
| `security_group_id`            | ID of the RDS security group created by this module.                             |

---

## Resource naming convention

All resources created by this module follow:

```
cos-tenant-{tenant_code}-{environment}
```

Examples:

- RDS identifier: `cos-tenant-acme-corp-prod`
- DB subnet group: `cos-tenant-acme-corp-prod-subnet-group`
- Security group: `cos-tenant-acme-corp-prod-sg`
- Secrets Manager secret: `cos/tenant/acme-corp/prod/db-url`

---

## RDS configuration

| Parameter           | Value                                                     |
| ------------------- | --------------------------------------------------------- |
| Engine              | PostgreSQL 16 (matches shared RDS major version)          |
| Instance class      | `db.t3.medium` (default — override per contract)          |
| Storage type        | GP3                                                       |
| Allocated storage   | 100 GB (initial); auto-scales to 1 TB                     |
| Multi-AZ            | `true` in `prod`; `false` in `staging`/`dev`              |
| Backup retention    | 7 days                                                    |
| Encryption          | Enabled — per-tenant KMS key (not the shared RDS KMS key) |
| Deletion protection | `true` in `prod`; `false` in non-prod                     |
| Port                | 5432                                                      |

---

## Security

- Security group allows **inbound port 5432 only from the EKS node security group**.
  No public access. No broad CIDR rules.
- Storage encrypted with a per-tenant KMS key (passed in as `kms_key_arn`).
- Master password stored in AWS Secrets Manager under `cos/tenant/{tenant_code}/{env}/db-url`.
- The full PostgreSQL URL (including credentials) is stored in Secrets Manager
  and retrieved by `assignDedicatedDbActivity` to set `platform.tenants.dedicated_db_url`.

---

## Running Prisma migrations after provisioning

After this module creates the RDS instance, run migrations against the new DB:

```bash
DATABASE_URL="$(aws secretsmanager get-secret-value \
  --secret-id cos/tenant/acme-corp/prod/db-url \
  --query SecretString --output text)" \
  npx prisma migrate deploy
```

Or use the automated workflow — `runMigrationsActivity` does this programmatically.

---

## Related

- Temporal workflow: `backend/src/modules/tenant/workflows/enterprise-provisioning.workflow.ts`
- Activities: `backend/src/modules/tenant/workflows/enterprise-provisioning.activities.ts`
- Spec: `docs/specifications/07-multi-tenant-architecture.md` §7.3
- Runbook: `docs/runbooks/dedicated-db-provisioning.md`
