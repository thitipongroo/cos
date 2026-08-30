# CLOUD: AWS MSK — replace with Confluent Cloud or on-prem Kafka (Strimzi on k8s)
# Construction OS — Managed Kafka cluster (MSK) with TLS, SASL/SCRAM

resource "aws_security_group" "msk" {
  name        = "cos-msk-sg-${var.environment}"
  description = "Allow Kafka access from EKS nodes only"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Kafka TLS from EKS nodes"
    from_port       = 9094
    to_port         = 9094
    protocol        = "tcp"
    security_groups = [var.eks_security_group]
  }

  ingress {
    description     = "Kafka SASL/SCRAM from EKS nodes"
    from_port       = 9096
    to_port         = 9096
    protocol        = "tcp"
    security_groups = [var.eks_security_group]
  }

  ingress {
    description = "ZooKeeper from brokers (inter-broker)"
    from_port   = 2181
    to_port     = 2181
    protocol    = "tcp"
    self        = true
  }

  # No egress rule at all — deliberate, 2026-08-29.
  #
  # This was `0.0.0.0/0` on every protocol, which Trivy flags as AWS-0104 and which nothing had ever
  # run to notice: CI gained a Terraform step and IaC misconfiguration scanning on the same day.
  #
  # A managed Kafka endpoint is a destination, not a client. It accepts connections from the EKS
  # nodes on the ingress rule above and initiates none of its own — no image pulls, no API calls, no
  # package installs. An AWS security group denies all egress when no egress block is present, so
  # removing the rule IS the restriction; there is nothing to replace it with.
  #
  # If a future feature needs this service to reach out — cross-region replication, an external
  # audit sink — add a rule for that destination and port. Do not restore the blanket allow.

  tags = merge(var.tags, { Name = "cos-msk-sg-${var.environment}" })
}

resource "aws_msk_configuration" "main" {
  name           = "cos-kafka-${var.environment}"
  kafka_versions = ["3.6.0"]

  server_properties = <<-EOF
    auto.create.topics.enable=false
    default.replication.factor=3
    min.insync.replicas=2
    num.partitions=6
    log.retention.hours=168
    log.segment.bytes=1073741824
    delete.topic.enable=true
    compression.type=lz4
  EOF
}

resource "aws_msk_cluster" "main" {
  cluster_name           = "cos-kafka-${var.environment}"
  kafka_version          = "3.6.0"
  number_of_broker_nodes = var.num_brokers

  broker_node_group_info {
    instance_type  = var.instance_type
    client_subnets = var.subnet_ids
    storage_info {
      ebs_storage_info {
        volume_size = 100
      }
    }
    security_groups = [aws_security_group.msk.id]
  }

  configuration_info {
    arn      = aws_msk_configuration.main.arn
    revision = aws_msk_configuration.main.latest_revision
  }

  encryption_info {
    encryption_in_transit {
      client_broker = "TLS"
      in_cluster    = true
    }
    # AWS-managed key is intentional (security review L17): QM-4's customer-managed-CMK list is S3 /
    # RDS / ElastiCache only — MSK is not in it. Empty ARN = AWS-managed at-rest encryption (still
    # encrypted). Set a CMK ARN here only if the CMK scope is later extended to MSK.
    encryption_at_rest_kms_key_arn = ""
  }

  client_authentication {
    sasl {
      scram = true
    }
    tls {}
  }

  enhanced_monitoring = "PER_TOPIC_PER_BROKER"

  open_monitoring {
    prometheus {
      jmx_exporter { enabled_in_broker = true }
      node_exporter { enabled_in_broker = true }
    }
  }

  logging_info {
    broker_logs {
      cloudwatch_logs {
        enabled   = true
        log_group = "/cos/msk/${var.environment}"
      }
    }
  }

  tags = var.tags
}
