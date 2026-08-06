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

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

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
  identifier             = "cos-postgres-${var.environment}"
  engine                 = "postgres"
  # DRIFT — UNRESOLVED (recorded 2026-08-07). context/00_master_construction_os.md § infrastructure
  # stack specifies "PostgreSQL 18 — primary relational store"; this module provisions 16.2, and
  # docs/specifications/04-tech-stack.md names PostgreSQL without a version, so it settles nothing.
  # Not changed here on purpose: a major-version bump of the primary database is an operational
  # decision (TimescaleDB extension compatibility per ADR-032, pgvector, RDS availability in
  # ap-southeast-7, and a migration path for existing instances) — not a documentation edit.
  # Resolve before Stage 1→2 and make the two documents agree with whatever is provisioned.
  engine_version         = "16.2"
  instance_class         = var.instance_class
  allocated_storage      = var.allocated_storage
  max_allocated_storage  = var.allocated_storage * 3
  storage_type           = "gp3"
  storage_encrypted      = true
  # Customer-managed CMK (QM-4) — without this, RDS falls back to the AWS-managed aws/rds key.
  kms_key_id             = var.kms_key_id

  db_name  = "cos"
  username = "cos_admin"
  password = var.master_password

  multi_az               = var.environment == "production"
  publicly_accessible    = false
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  parameter_group_name   = aws_db_parameter_group.main.name

  backup_retention_period    = var.environment == "production" ? 30 : 7
  backup_window              = "02:00-03:00"
  maintenance_window         = "sun:04:00-sun:05:00"
  deletion_protection        = var.environment == "production"
  skip_final_snapshot        = var.environment != "production"
  final_snapshot_identifier  = "cos-postgres-final-${var.environment}"

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
