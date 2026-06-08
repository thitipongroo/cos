output "bootstrap_brokers_tls"      { value = aws_msk_cluster.main.bootstrap_brokers_tls; sensitive = true }
output "bootstrap_brokers_sasl"     { value = aws_msk_cluster.main.bootstrap_brokers_sasl_scram; sensitive = true }
output "zookeeper_connect_string"   { value = aws_msk_cluster.main.zookeeper_connect_string; sensitive = true }
output "cluster_arn"                { value = aws_msk_cluster.main.arn }
