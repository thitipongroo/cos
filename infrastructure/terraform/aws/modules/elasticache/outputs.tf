output "primary_endpoint"       { value = aws_elasticache_replication_group.main.primary_endpoint_address; sensitive = true }
output "reader_endpoint"        { value = aws_elasticache_replication_group.main.reader_endpoint_address; sensitive = true }
output "port"                   { value = 6379 }
output "replication_group_id"   { value = aws_elasticache_replication_group.main.replication_group_id }
