# CLOUD: AWS — outputs for downstream tooling (ArgoCD, Helm, cert-manager)

output "eks_cluster_endpoint" {
  description = "EKS cluster API server endpoint"
  value       = module.eks.cluster_endpoint
}

output "eks_cluster_name" {
  description = "EKS cluster name"
  value       = module.eks.cluster_name
}

output "eks_oidc_provider_arn" {
  description = "EKS OIDC provider ARN (used for IRSA service accounts)"
  value       = module.eks.oidc_provider_arn
}

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint"
  value       = module.rds.endpoint
  sensitive   = true
}

output "elasticache_endpoint" {
  description = "ElastiCache Redis primary endpoint"
  value       = module.elasticache.primary_endpoint
  sensitive   = true
}

output "msk_bootstrap_brokers" {
  description = "MSK Kafka bootstrap broker string (TLS)"
  value       = module.msk.bootstrap_brokers_tls
  sensitive   = true
}

output "s3_files_bucket_arn" {
  description = "ARN of the file uploads S3 bucket"
  value       = module.s3.files_bucket_arn
}

output "s3_keycloak_backups_bucket_arn" {
  description = "ARN of the Keycloak realm backups S3 bucket"
  value       = module.s3.keycloak_backups_bucket_arn
}

output "s3_backups_bucket_arn" {
  description = "ARN of the database backups S3 bucket"
  value       = module.s3.backups_bucket_arn
}

output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = aws_subnet.private[*].id
}
