# CLOUD: AWS RDS PostgreSQL — replace with Cloud SQL (GCP) or on-prem Patroni cluster
# Construction OS — Multi-AZ PostgreSQL 16 with RLS enabled

resource "aws_security_group" "rds" {
  name        = "cos-rds-sg-${var.environment}"
  description = "Allow PostgreSQL access from EKS nodes only"
  vpc_id      = var.vpc_id

  ingress {
    description     = "PostgreSQL from EKS nodes"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [var.eks_security_group]
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

  tags = merge(var.tags, { Name = "cos-rds-sg-${var.environment}" })
}

resource "aws_db_subnet_group" "main" {
  name       = "cos-rds-subnet-${var.environment}"
  subnet_ids = var.subnet_ids
  tags       = var.tags
}

resource "aws_db_parameter_group" "main" {
  name   = "cos-pg16-${var.environment}"
  family = "postgres16"

  parameter {
    name  = "log_statement"
    value = "ddl"
  }
  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }
  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements,timescaledb"
  }
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  tags = var.tags
}

resource "aws_db_instance" "main" {
  identifier = "cos-postgres-${var.environment}"
  engine     = "postgres"
  # PostgreSQL 18 per context/00_master_construction_os.md § infrastructure stack. Raised from 16.2
  # on 2026-08-07 (product-owner decision) to close a real dev/prod parity gap: docker-compose.yml
  # already runs timescale/timescaledb:latest-pg18, so local development and production were two
  # major versions apart. Prisma 7.8 + pg 8.22 support 18, and no migration in backend/prisma uses a
  # version-gated feature.
  #
  # ⚠️ VERIFY BEFORE `terraform apply` — two preconditions were NOT verifiable from this repository:
  #   1. AWS RDS must offer PostgreSQL 18 in ap-southeast-7 (Bangkok). Check
  #      `aws rds describe-db-engine-versions --engine postgres --region ap-southeast-7`.
  #      If 18 is unavailable there, pin the highest offered major and fix 00_master to match.
  #   2. TimescaleDB must be available for that engine version — ADR-032 co-locates TimescaleDB on
  #      this instance through Stages 1–3, so an engine RDS supports but Timescale does not is a
  #      broken deployment, not an upgrade.
  # An already-provisioned instance additionally needs a planned major-version upgrade; changing this
  # value alone does not migrate it.
  engine_version        = "18"
  instance_class        = var.instance_class
  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.allocated_storage * 3
  storage_type          = "gp3"
  storage_encrypted     = true
  # Customer-managed CMK (QM-4) — without this, RDS falls back to the AWS-managed aws/rds key.
  kms_key_id = var.kms_key_id

  db_name  = "cos"
  username = "cos_admin"
  password = var.master_password

  multi_az               = var.environment == "production"
  publicly_accessible    = false
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  parameter_group_name   = aws_db_parameter_group.main.name

  backup_retention_period   = var.environment == "production" ? 30 : 7
  backup_window             = "02:00-03:00"
  maintenance_window        = "sun:04:00-sun:05:00"
  deletion_protection       = var.environment == "production"
  skip_final_snapshot       = var.environment != "production"
  final_snapshot_identifier = "cos-postgres-final-${var.environment}"

  performance_insights_enabled          = true
  performance_insights_retention_period = 7
  monitoring_interval                   = 60
  monitoring_role_arn                   = aws_iam_role.rds_monitoring.arn
  enabled_cloudwatch_logs_exports       = ["postgresql", "upgrade"]

  tags = var.tags
}

resource "aws_iam_role" "rds_monitoring" {
  name = "cos-rds-monitoring-${var.environment}"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "monitoring.rds.amazonaws.com" }
    }]
  })
  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
  role       = aws_iam_role.rds_monitoring.name
}
