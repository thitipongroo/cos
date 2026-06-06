output "db_endpoint" {
  description = "RDS instance endpoint hostname (without port)."
  value       = aws_db_instance.tenant.address
}

output "db_port" {
  description = "RDS instance port (always 5432)."
  value       = aws_db_instance.tenant.port
}

output "db_connection_url_secret_arn" {
  description = "ARN of the Secrets Manager secret containing the full PostgreSQL connection URL."
  value       = aws_secretsmanager_secret.db_url.arn
}

output "security_group_id" {
  description = "ID of the RDS security group created by this module."
  value       = aws_security_group.rds.id
}
