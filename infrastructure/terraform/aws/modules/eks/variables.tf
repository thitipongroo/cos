variable "cluster_name" { type = string }
variable "cluster_version" { type = string }
variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "public_access_cidrs" {
  type        = list(string)
  default     = []
  description = "CIDRs allowed to reach the public EKS API endpoint (CIS EKS 5.4). Empty = public access off (private-only). Never 0.0.0.0/0."
}
variable "secrets_kms_key_arn" {
  type        = string
  description = "Customer-managed KMS CMK ARN for etcd Kubernetes Secrets envelope encryption (CIS EKS 3.1)"
}
variable "tags" { type = map(string) }
variable "vpc_cidr" {
  type        = string
  description = "VPC CIDR — the node egress rules scope AWS-API and DNS traffic to it"
}
variable "s3_prefix_list_id" {
  type        = string
  description = "AWS-managed prefix list for S3 in this region, for the gateway-endpoint egress rule"
}
