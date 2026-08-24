# CLOUD: AWS — KMS Customer-Managed Keys (CMK)
# QM-4: AES-256 minimum; SSE-KMS CMK for all S3, RDS, ElastiCache
# Key alias convention: cos/{env}/rds | cos/{env}/s3 | cos/{env}/elasticache
# All buckets: default encryption enforced at bucket level (see s3.tf)
# RDS: encryption enabled at instance creation — cannot be added post-creation
#
# Key policy (QM-4: "grants use to the app service role + SYSTEM_ADMIN only"):
#   - Admin  = the AWS account root (arn:aws:iam::<account>:root). There is no dedicated SYSTEM_ADMIN
#     IAM principal in this Terraform; account root represents the account administrators, and a CMK
#     MUST retain a root-admin statement or it can become unmanageable (AWS requirement). If a dedicated
#     SYSTEM_ADMIN IAM role is added later, extend the admin statement to include it. (PO decision 2026-07-24)
#   - Usage  = the specific principal that actually uses the key (RDS service for the DB CMK; the
#     file-service app role for the S3 CMK). No broad account-wide use is granted.

data "aws_caller_identity" "current" {}

# ─── RDS CMK ─────────────────────────────────────────────────────────────────
resource "aws_kms_key" "rds" {
  description             = "Construction OS — RDS encryption key (${var.environment})"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "EnableAccountAdmin"
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root" }
        Action    = "kms:*"
        Resource  = "*"
      },
      {
        # RDS uses the CMK on the account's behalf via the RDS service (storage + snapshots). Scoped by
        # kms:ViaService + kms:CallerAccount so only calls through RDS in this account can use the key.
        Sid       = "AllowRDSServiceUse"
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root" }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:CreateGrant",
          "kms:DescribeKey",
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "kms:ViaService"    = "rds.${var.aws_region}.amazonaws.com"
            "kms:CallerAccount" = data.aws_caller_identity.current.account_id
          }
        }
      },
    ]
  })

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

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "EnableAccountAdmin"
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root" }
        Action    = "kms:*"
        Resource  = "*"
      },
      {
        # The file-service app role (IRSA, modules/s3) reads/writes SSE-KMS objects, so it needs data-key
        # access on this CMK. Referenced by constructed ARN (fixed role name) to avoid a module dependency
        # cycle: the S3 module consumes this key's ARN, so it cannot also be an input to the key's policy.
        Sid    = "AllowAppServiceRoleUse"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/cos-file-service-s3-role"
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:DescribeKey",
        ]
        Resource = "*"
      },
    ]
  })

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

# ─── EKS secrets CMK ─────────────────────────────────────────────────────────
# Envelope-encrypts Kubernetes Secrets in etcd (CIS EKS 3.1). Every SealedSecret/ExternalSecret
# materializes as a native K8s Secret (base64, not encrypted); without this the Secret values sit in
# etcd protected only by EBS volume encryption. Root-admin key policy: EKS creates a grant on the key
# when encryption_config references it (the account-root statement delegates that to IAM). Root =
# account administrators = SYSTEM_ADMIN at the infra layer (PO decision 2026-07-24).
resource "aws_kms_key" "eks" {
  description             = "Construction OS — EKS secrets envelope encryption (${var.environment})"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "EnableAccountAdmin"
      Effect    = "Allow"
      Principal = { AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root" }
      Action    = "kms:*"
      Resource  = "*"
    }]
  })

  tags = merge(var.tags, {
    Name        = "cos-${var.environment}-eks"
    Environment = var.environment
    Service     = "eks"
  })
}

resource "aws_kms_alias" "eks" {
  name          = "alias/cos/${var.environment}/eks"
  target_key_id = aws_kms_key.eks.key_id
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
