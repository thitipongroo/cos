output "files_bucket_arn"          { value = aws_s3_bucket.files.arn }
output "files_bucket_name"         { value = aws_s3_bucket.files.id }
output "backups_bucket_arn"        { value = aws_s3_bucket.backups.arn }
output "backups_bucket_name"       { value = aws_s3_bucket.backups.id }
output "keycloak_backups_bucket_arn"  { value = aws_s3_bucket.keycloak_backups.arn }
output "keycloak_backups_bucket_name" { value = aws_s3_bucket.keycloak_backups.id }
output "file_service_role_arn"     { value = aws_iam_role.file_service.arn }
