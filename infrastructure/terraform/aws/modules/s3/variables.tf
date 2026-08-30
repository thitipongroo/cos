variable "environment" { type = string }
variable "files_bucket_name" { type = string }
variable "backups_bucket_name" { type = string }
variable "eks_oidc_provider" { type = string }
variable "keycloak_backups_bucket_name" {
  type        = string
  description = "Bucket for the daily Keycloak realm export (docs/runbooks/keycloak-realm-backup.md)"
}
variable "kms_master_key_id" {
  type        = string
  description = "Customer-managed KMS CMK ARN for SSE-KMS on all buckets (QM-4)"
}
variable "tags" { type = map(string) }
