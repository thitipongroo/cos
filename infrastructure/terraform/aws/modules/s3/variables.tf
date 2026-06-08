variable "environment"           { type = string }
variable "files_bucket_name"     { type = string }
variable "backups_bucket_name"   { type = string }
variable "eks_oidc_provider"     { type = string }
variable "tags"                  { type = map(string) }
