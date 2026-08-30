terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

locals {
  name_prefix = "cos-tenant-${replace(var.tenant_code, "_", "-")}-${var.environment}"
}

# ── Security group ────────────────────────────────────────────────────────────

resource "aws_security_group" "rds" {
  name        = "${local.name_prefix}-sg"
  description = "RDS security group for tenant ${var.tenant_code}"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [var.eks_node_sg_id]
    description     = "PostgreSQL from EKS nodes only"
  }

  # No egress rule at all — deliberate, 2026-08-29.
  #
  # This was `0.0.0.0/0` on every protocol, which Trivy flags as AWS-0104 and which nothing had ever
  # run to notice: CI gained a Terraform step and IaC misconfiguration scanning on the same day.
  #
  # A managed PostgreSQL endpoint is a destination, not a client. It accepts connections from the EKS
  # nodes on the ingress rule above and initiates none of its own — no image pulls, no API calls, no
  # package installs. An AWS security group denies all egress when no egress block is present, so
  # removing the rule IS the restriction; there is nothing to replace it with.
  #
  # If a future feature needs this service to reach out — cross-region replication, an external
  # audit sink — add a rule for that destination and port. Do not restore the blanket allow.

  tags = {
    Name       = "${local.name_prefix}-sg"
    tenant     = var.tenant_code
    managed_by = "cos-terraform"
  }
}

# ── DB subnet group ───────────────────────────────────────────────────────────

resource "aws_db_subnet_group" "rds" {
  name       = "${local.name_prefix}-subnet-group"
  subnet_ids = var.subnet_ids

  tags = {
    Name       = "${local.name_prefix}-subnet-group"
    tenant     = var.tenant_code
    managed_by = "cos-terraform"
  }
}

# ── RDS instance ──────────────────────────────────────────────────────────────

resource "aws_db_instance" "tenant" {
  identifier = local.name_prefix

  engine = "postgres"
  # Must match the shared RDS major version (aws/modules/rds engine_version); spec §34. Raised with it
  # from 16.2 to 18 on 2026-08-07 — see the verification preconditions in that module before applying.
  engine_version = "18"
  instance_class = var.instance_class

  allocated_storage     = var.allocated_storage
  max_allocated_storage = 1024
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = var.kms_key_arn

  db_name  = var.db_name
  username = var.master_username

  manage_master_user_password = true

  multi_az               = var.environment == "prod"
  db_subnet_group_name   = aws_db_subnet_group.rds.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  backup_retention_period = var.backup_retention_days
  backup_window           = "02:00-03:00"
  maintenance_window      = "mon:04:00-mon:05:00"

  deletion_protection = var.environment == "prod"
  skip_final_snapshot = var.environment != "prod"

  final_snapshot_identifier = var.environment == "prod" ? "${local.name_prefix}-final" : null

  apply_immediately = var.environment != "prod"

  tags = {
    Name       = local.name_prefix
    tenant     = var.tenant_code
    managed_by = "cos-terraform"
  }
}

# ── Secrets Manager — store connection URL ────────────────────────────────────

resource "aws_secretsmanager_secret" "db_url" {
  name        = "cos/tenant/${replace(var.tenant_code, "_", "-")}/${var.environment}/db-url"
  description = "PostgreSQL connection URL for tenant ${var.tenant_code} dedicated DB"
  kms_key_id  = var.kms_key_arn

  tags = {
    tenant     = var.tenant_code
    managed_by = "cos-terraform"
  }
}

resource "aws_secretsmanager_secret_version" "db_url" {
  secret_id = aws_secretsmanager_secret.db_url.id
  secret_string = jsonencode({
    url      = "postgresql://${var.master_username}@${aws_db_instance.tenant.endpoint}/${var.db_name}"
    host     = aws_db_instance.tenant.address
    port     = aws_db_instance.tenant.port
    db_name  = var.db_name
    username = var.master_username
  })

  depends_on = [aws_db_instance.tenant]
}
