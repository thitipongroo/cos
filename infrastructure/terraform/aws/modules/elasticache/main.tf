# CLOUD: AWS ElastiCache Redis — replace with Cloud Memorystore (GCP) or on-prem Redis Sentinel
# Construction OS — Redis 7.x with cluster mode, TLS, encryption at rest

resource "aws_security_group" "redis" {
  name        = "cos-redis-sg-${var.environment}"
  description = "Allow Redis access from EKS nodes only"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Redis from EKS nodes"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [var.eks_security_group]
  }

  # No egress rule at all — deliberate, 2026-08-29.
  #
  # This was `0.0.0.0/0` on every protocol, which Trivy flags as AWS-0104 and which nothing had ever
  # run to notice: CI gained a Terraform step and IaC misconfiguration scanning on the same day.
  #
  # A managed Redis endpoint is a destination, not a client. It accepts connections from the EKS
  # nodes on the ingress rule above and initiates none of its own — no image pulls, no API calls, no
  # package installs. An AWS security group denies all egress when no egress block is present, so
  # removing the rule IS the restriction; there is nothing to replace it with.
  #
  # If a future feature needs this service to reach out — cross-region replication, an external
  # audit sink — add a rule for that destination and port. Do not restore the blanket allow.

  tags = merge(var.tags, { Name = "cos-redis-sg-${var.environment}" })
}

resource "aws_elasticache_subnet_group" "main" {
  name       = "cos-redis-subnet-${var.environment}"
  subnet_ids = var.subnet_ids
  tags       = var.tags
}

resource "aws_elasticache_parameter_group" "main" {
  family = "redis7"
  name   = "cos-redis7-${var.environment}"

  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }

  tags = var.tags
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id = "cos-redis-${var.environment}"
  description          = "Construction OS Redis cache — ${var.environment}"

  node_type                  = var.node_type
  num_node_groups            = 1
  replicas_per_node_group    = var.num_replicas
  automatic_failover_enabled = var.num_replicas > 0

  engine_version = "7.1"
  port           = 6379

  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [aws_security_group.redis.id]
  parameter_group_name = aws_elasticache_parameter_group.main.name

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true

  multi_az_enabled           = var.environment == "production"
  auto_minor_version_upgrade = true
  maintenance_window         = "sun:05:00-sun:06:00"
  snapshot_retention_limit   = var.environment == "production" ? 7 : 1
  snapshot_window            = "03:00-04:00"

  log_delivery_configuration {
    destination      = "cos-redis-logs-${var.environment}"
    destination_type = "cloudwatch-logs"
    log_format       = "json"
    log_type         = "slow-log"
  }

  tags = var.tags
}
