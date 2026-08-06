# CLOUD: AWS S3 — replace with GCS (google_storage_bucket) or on-prem MinIO
# Construction OS — S3 buckets: file uploads, database backups
# IRSA service account role for file-service pod to access files bucket

# ─── File uploads bucket ─────────────────────────────────────────────────────
resource "aws_s3_bucket" "files" {
  bucket        = var.files_bucket_name
  force_destroy = var.environment != "production"
  tags          = merge(var.tags, { Purpose = "file-uploads" })
}

resource "aws_s3_bucket_versioning" "files" {
  bucket = aws_s3_bucket.files.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "files" {
  bucket = aws_s3_bucket.files.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.kms_master_key_id
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "files" {
  bucket                  = aws_s3_bucket.files.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "files" {
  bucket = aws_s3_bucket.files.id
  rule {
    id     = "transition-infrequent-access"
    status = "Enabled"
    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }
    expiration { days = 365 }
  }
}

# ─── Backups bucket ───────────────────────────────────────────────────────────
resource "aws_s3_bucket" "backups" {
  bucket        = var.backups_bucket_name
  force_destroy = false
  tags          = merge(var.tags, { Purpose = "db-backups" })
}

resource "aws_s3_bucket_versioning" "backups" {
  bucket = aws_s3_bucket.backups.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.kms_master_key_id
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "backups" {
  bucket                  = aws_s3_bucket.backups.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id
  rule {
    id     = "expire-old-backups"
    status = "Enabled"
    expiration { days = 90 }
    noncurrent_version_expiration { noncurrent_days = 30 }
  }
}

# ─── Keycloak realm backups bucket ───────────────────────────────────────────
# The keycloak-realm-backup CronJob (docs/runbooks/keycloak-realm-backup.md) writes a daily
# `kc.sh export` here. Added 2026-08-07: the runbooks referenced this bucket and disagreed on its
# retention (7 days vs 30) while it existed in no IaC at all, so the recovery window was unknowable.
#
# Keycloak is authoritative for identity on BOTH auth paths — Path A (SMS OTP) issues its token
# through Keycloak Direct Grant — and nothing rebuilds a realm from another store, so this bucket is
# the only thing standing between a realm loss and a full re-provision.
resource "aws_s3_bucket" "keycloak_backups" {
  bucket        = var.keycloak_backups_bucket_name
  force_destroy = false
  tags          = merge(var.tags, { Purpose = "keycloak-realm-backups" })
}

resource "aws_s3_bucket_versioning" "keycloak_backups" {
  bucket = aws_s3_bucket.keycloak_backups.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "keycloak_backups" {
  bucket = aws_s3_bucket.keycloak_backups.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.kms_master_key_id
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "keycloak_backups" {
  bucket                  = aws_s3_bucket.keycloak_backups.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "keycloak_backups" {
  bucket = aws_s3_bucket.keycloak_backups.id
  rule {
    id     = "expire-old-backups"
    status = "Enabled"
    # 90 days — the same window as the db-backups bucket above (product-owner decision 2026-08-07),
    # so both backup stores expire on one rule rather than two invented ones.
    #
    # PDPA note: a realm export contains user PII, and docs/compliance/data-retention-policy.md
    # purges a deleted account's Keycloak record after 30 days. A deleted user therefore persists in
    # these exports for up to 60 days longer. That is the standard backup carve-out, but it must be
    # stated in the RoPA and honoured on an erasure request — do not treat this bucket as out of
    # scope for §33 subject rights.
    expiration { days = 90 }
    noncurrent_version_expiration { noncurrent_days = 30 }
  }
}

# ─── IRSA: file-service pod S3 access ────────────────────────────────────────
data "aws_iam_policy_document" "file_service_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    effect  = "Allow"
    principals {
      type        = "Federated"
      identifiers = [var.eks_oidc_provider]
    }
    condition {
      test     = "StringEquals"
      variable = "${replace(var.eks_oidc_provider, "arn:aws:iam::*:oidc-provider/", "")}:sub"
      values   = ["system:serviceaccount:cos:file-service"]
    }
  }
}

resource "aws_iam_role" "file_service" {
  name               = "cos-file-service-s3-role"
  assume_role_policy = data.aws_iam_policy_document.file_service_assume.json
  tags               = var.tags
}

resource "aws_iam_role_policy" "file_service_s3" {
  name = "cos-file-service-s3-access"
  role = aws_iam_role.file_service.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
        Resource = [
          aws_s3_bucket.files.arn,
          "${aws_s3_bucket.files.arn}/*",
        ]
      },
      {
        # SSE-KMS: reading/writing encrypted objects requires data-key access on the bucket CMK (QM-4).
        Effect   = "Allow"
        Action   = ["kms:Decrypt", "kms:GenerateDataKey"]
        Resource = [var.kms_master_key_id]
      },
    ]
  })
}
