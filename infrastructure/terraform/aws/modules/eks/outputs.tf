output "cluster_endpoint"        { value = aws_eks_cluster.main.endpoint }
output "cluster_name"            { value = aws_eks_cluster.main.name }
output "cluster_ca_certificate"  { value = aws_eks_cluster.main.certificate_authority[0].data }
output "oidc_provider_arn"       { value = aws_iam_openid_connect_provider.main.arn }
output "oidc_issuer_url"         { value = aws_eks_cluster.main.identity[0].oidc[0].issuer }
output "node_security_group_id"  { value = aws_security_group.nodes.id }
output "node_role_arn"           { value = aws_iam_role.nodes.arn }
