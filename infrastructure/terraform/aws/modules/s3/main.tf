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
      sse_algorithm = "aws:kms"
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
      sse_algorithm = "aws:kms"
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
    Statement = [{
      Effect = "Allow"
      Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
      Resource = [
        aws_s3_bucket.files.arn,
        "${aws_s3_bucket.files.arn}/*",
      ]
    }]
  })
}
