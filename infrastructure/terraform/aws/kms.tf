# CLOUD: AWS — KMS Customer-Managed Keys (CMK)
# QM-4: AES-256 minimum; SSE-KMS CMK for all S3, RDS, ElastiCache
# Key alias convention: cos/{env}/rds | cos/{env}/s3 | cos/{env}/elasticache
# All buckets: default encryption enforced at bucket level (see s3.tf)
# RDS: encryption enabled at instance creation — cannot be added post-creation

# ─── RDS CMK ─────────────────────────────────────────────────────────────────
resource "aws_kms_key" "rds" {
  description             = "Construction OS — RDS encryption key (${var.environment})"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = merge(var.tags, {
    Name        = "cos-${var.environment}-rds"
    Environment = var.environment
    Service     = "rds"
  })
}

resource "aws_kms_alias" "rds" {
  name          = "alias/cos/${var.environment}/rds"
  target_key_id = aws_kms_key.rds.key_id
}

# ─── S3 CMK ──────────────────────────────────────────────────────────────────
resource "aws_kms_key" "s3" {
  description             = "Construction OS — S3 encryption key (${var.environment})"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = merge(var.tags, {
    Name        = "cos-${var.environment}-s3"
    Environment = var.environment
    Service     = "s3"
  })
}

resource "aws_kms_alias" "s3" {
  name          = "alias/cos/${var.environment}/s3"
  target_key_id = aws_kms_key.s3.key_id
}

# ─── ElastiCache CMK ─────────────────────────────────────────────────────────
# Note: ElastiCache uses AWS-managed key for at-rest encryption
# (at_rest_encryption_enabled = true in elasticache.tf)
# This CMK is reserved for future use if CMK support is enabled per account
resource "aws_kms_key" "elasticache" {
  description             = "Construction OS — ElastiCache encryption key (${var.environment})"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = merge(var.tags, {
    Name        = "cos-${var.environment}-elasticache"
    Environment = var.environment
    Service     = "elasticache"
  })
}

resource "aws_kms_alias" "elasticache" {
  name          = "alias/cos/${var.environment}/elasticache"
  target_key_id = aws_kms_key.elasticache.key_id
}

# ─── Outputs ─────────────────────────────────────────────────────────────────
output "kms_key_arn_rds" {
  description = "KMS CMK ARN for RDS encryption"
  value       = aws_kms_key.rds.arn
}

output "kms_key_arn_s3" {
  description = "KMS CMK ARN for S3 SSE-KMS encryption"
  value       = aws_kms_key.s3.arn
}

output "kms_key_arn_elasticache" {
  description = "KMS CMK ARN for ElastiCache encryption"
  value       = aws_kms_key.elasticache.arn
}
