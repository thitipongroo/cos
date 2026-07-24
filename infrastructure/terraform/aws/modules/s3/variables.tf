variable "environment"           { type = string }
variable "files_bucket_name"     { type = string }
variable "backups_bucket_name"   { type = string }
variable "eks_oidc_provider"     { type = string }
variable "kms_master_key_id" {
  type        = string
  description = "Customer-managed KMS CMK ARN for SSE-KMS on all buckets (QM-4)"
}
variable "tags"                  { type = map(string) }
