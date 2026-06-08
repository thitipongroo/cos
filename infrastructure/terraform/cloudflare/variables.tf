variable "cloudflare_api_token" {
  description = "Cloudflare API token with Zone:Edit and WAF:Edit permissions"
  type        = string
  sensitive   = true
}

variable "cloudflare_zone_id" {
  description = "Cloudflare Zone ID for construction-os.io"
  type        = string
}

variable "cloudflare_account_id" {
  description = "Cloudflare Account ID"
  type        = string
}

variable "environment" {
  description = "Deployment environment: production, staging"
  type        = string
  default     = "production"
  validation {
    condition     = contains(["production", "staging"], var.environment)
    error_message = "environment must be production or staging"
  }
}

variable "aws_alb_cidr" {
  description = "AWS ALB CIDR block — restrict origin access to Cloudflare IPs only"
  type        = string
}

variable "tenant_header_name" {
  description = "Name of the tenant routing header (default: x-tenant-id)"
  type        = string
  default     = "x-tenant-id"
}
