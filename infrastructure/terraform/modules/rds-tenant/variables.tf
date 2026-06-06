variable "tenant_code" {
  type        = string
  description = "Tenant slug (e.g. acme_corp). Used in resource naming."

  validation {
    condition     = can(regex("^[a-z0-9_]{2,50}$", var.tenant_code))
    error_message = "tenant_code must match ^[a-z0-9_]{2,50}$"
  }
}

variable "environment" {
  type        = string
  description = "Deployment environment (prod, staging, dev)."

  validation {
    condition     = contains(["prod", "staging", "dev"], var.environment)
    error_message = "environment must be one of: prod, staging, dev"
  }
}

variable "vpc_id" {
  type        = string
  description = "VPC ID where the RDS instance is deployed."
}

variable "subnet_ids" {
  type        = list(string)
  description = "Private subnet IDs for the DB subnet group (minimum 2 AZs)."
}

variable "eks_node_sg_id" {
  type        = string
  description = "EKS node security group ID — granted inbound port 5432 access."
}

variable "kms_key_arn" {
  type        = string
  description = "Per-tenant KMS key ARN for RDS storage encryption."
}

variable "instance_class" {
  type        = string
  default     = "db.t3.medium"
  description = "RDS instance class. Negotiable per contract."
}

variable "allocated_storage" {
  type        = number
  default     = 100
  description = "Initial storage in GB (GP3). Auto-scales to 1 TB."

  validation {
    condition     = var.allocated_storage >= 20
    error_message = "allocated_storage must be at least 20 GB."
  }
}

variable "backup_retention_days" {
  type        = number
  default     = 7
  description = "Automated backup retention period in days."
}

variable "db_name" {
  type        = string
  default     = "cos"
  description = "Database name created on the instance."
}

variable "master_username" {
  type        = string
  default     = "cos_admin"
  description = "Master username for the RDS instance."
}
