# CLOUD: AWS — replace with GCP/on-prem equivalent
variable "aws_region" {
  # Primary deployment region: ap-southeast-7 (Bangkok) per GLOB-001 (spec §8.8); DR = ap-southeast-1.
  # NOTE: terraform S3 backend state bucket stays in ap-southeast-1 (main.tf) — that is the state
  # store location, independent of the deployment region.
  description = "AWS deployment region (primary)"
  type        = string
  default     = "ap-southeast-7"
}

variable "environment" {
  description = "Deployment environment (dev | staging | production)"
  type        = string
  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "Must be dev, staging, or production."
  }
}

variable "cluster_name" {
  description = "EKS cluster name"
  type        = string
  default     = "cos-eks"
}

variable "cluster_version" {
  description = "Kubernetes version"
  type        = string
  default     = "1.29"
}

variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
  default     = "10.0.0.0/16"
}

variable "private_subnet_cidrs" {
  description = "Private subnet CIDR blocks (one per AZ)"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
}

variable "public_subnet_cidrs" {
  description = "Public subnet CIDR blocks (NAT gateways / ALB)"
  type        = list(string)
  default     = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]
}

variable "availability_zones" {
  # AZs for the primary region (ap-southeast-7, Bangkok). Naming follows the AWS {region}{a,b,c}
  # convention. VERIFY actual AZ availability for ap-southeast-7 before apply (newer region — AZ
  # count/IDs must be confirmed via `aws ec2 describe-availability-zones --region ap-southeast-7`);
  # adjust this list + the subnet CIDR lists if the region exposes fewer/more than 3 AZs.
  description = "Availability zones (primary region)"
  type        = list(string)
  default     = ["ap-southeast-7a", "ap-southeast-7b", "ap-southeast-7c"]
}

variable "node_instance_types" {
  description = "EC2 instance types for EKS node groups"
  type        = list(string)
  default     = ["t3.large"]
}

variable "node_desired_size" {
  description = "Desired number of worker nodes"
  type        = number
  default     = 3
}

variable "node_min_size" {
  description = "Minimum number of worker nodes"
  type        = number
  default     = 1
}

variable "node_max_size" {
  description = "Maximum number of worker nodes"
  type        = number
  default     = 10
}

variable "eks_public_access_cidrs" {
  description = "CIDRs allowed to reach the public EKS API endpoint (CIS EKS 5.4). Empty (default) disables public access — the API is reachable only privately via VPN/bastion. Never set to 0.0.0.0/0."
  type        = list(string)
  default     = []
}

variable "rds_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.medium"
}

variable "rds_allocated_storage" {
  description = "RDS allocated storage in GB"
  type        = number
  default     = 100
}

variable "rds_password" {
  description = "RDS master password — store in AWS Secrets Manager, not here"
  type        = string
  sensitive   = true
}

variable "elasticache_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t3.medium"
}

variable "elasticache_num_replicas" {
  description = "Number of ElastiCache read replicas"
  type        = number
  default     = 2
}

variable "msk_instance_type" {
  description = "MSK broker instance type"
  type        = string
  default     = "kafka.t3.small"
}

variable "msk_num_brokers" {
  description = "Number of MSK brokers (must be a multiple of AZ count)"
  type        = number
  default     = 3
}

variable "s3_files_bucket_name" {
  description = "S3 bucket name for file uploads"
  type        = string
}

variable "s3_backups_bucket_name" {
  description = "S3 bucket name for database backups"
  type        = string
}

variable "tags" {
  description = "Common tags applied to all resources"
  type        = map(string)
  default = {
    Project   = "construction-os"
    ManagedBy = "terraform"
  }
}
