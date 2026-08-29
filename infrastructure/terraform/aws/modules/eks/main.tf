# CLOUD: AWS EKS — replace with GKE (google_container_cluster) or on-prem kubeadm
# Construction OS — Managed Kubernetes cluster

# ─── IAM: Cluster role ────────────────────────────────────────────────────────
resource "aws_iam_role" "cluster" {
  name = "${var.cluster_name}-cluster-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "eks.amazonaws.com" }
    }]
  })
  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "cluster_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
  role       = aws_iam_role.cluster.name
}

# ─── IAM: Node role ───────────────────────────────────────────────────────────
resource "aws_iam_role" "nodes" {
  name = "${var.cluster_name}-node-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })
  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "node_worker" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
  role       = aws_iam_role.nodes.name
}

resource "aws_iam_role_policy_attachment" "node_cni" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
  role       = aws_iam_role.nodes.name
}

resource "aws_iam_role_policy_attachment" "node_ecr" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
  role       = aws_iam_role.nodes.name
}

# ─── Security group for nodes ────────────────────────────────────────────────
resource "aws_security_group" "nodes" {
  name        = "${var.cluster_name}-nodes-sg"
  description = "EKS worker node security group"
  vpc_id      = var.vpc_id

  ingress {
    description = "Inter-node communication"
    from_port   = 0
    to_port     = 65535
    protocol    = "tcp"
    self        = true
  }

  # Egress, narrowed twice on 2026-08-29.
  #
  # It began as `protocol = "-1"` to 0.0.0.0/0 — every protocol, every port, anywhere — which Trivy
  # flags as AWS-0104 and which nothing had run to notice: CI gained a Terraform step and IaC
  # misconfiguration scanning that same day. The first pass cut it to TCP/443 and DNS. This is the
  # second, after the VPC endpoints in ../../vpc-endpoints.tf gave the AWS API traffic somewhere to
  # go that is not the internet.
  #
  # Three rules, each with a different reason to exist:

  # 1. AWS APIs — ECR, STS, EKS, CloudWatch Logs — now resolve to interface-endpoint ENIs inside the
  #    VPC (private_dns_enabled), so this never leaves the CIDR. S3 goes through the gateway endpoint
  #    and is covered by the prefix list below.
  egress {
    description = "HTTPS to VPC interface endpoints (ECR, STS, EKS, Logs)"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  # 2. S3 via the gateway endpoint. A gateway endpoint is a ROUTE, not an ENI, so its traffic is
  #    addressed to S3's public ranges and the VPC CIDR rule above does not cover it. The managed
  #    prefix list is what makes this precise instead of another 0.0.0.0/0 — and it tracks AWS's
  #    ranges automatically, which a hand-copied CIDR list would not.
  egress {
    description     = "HTTPS to S3 via the gateway endpoint (ECR image layers)"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    prefix_list_ids = [var.s3_prefix_list_id]
  }

  # 3. The genuinely public half — eleven third-party hosts, enumerated in
  #    ../../network-firewall.tf. A security group filters by ADDRESS and every one of those hosts
  #    sits behind a CDN, so there is no CIDR that expresses the requirement; this rule stays open
  #    on 443 and AWS-0104 stays in .trivyignore.yaml for it.
  #
  #    What changed on 2026-08-29 is what sits behind the rule. Private-subnet traffic no longer
  #    routes straight to the NAT gateway: it goes through a Network Firewall endpoint that matches
  #    the TLS SNI against an allowlist and drops everything else. The security group is now the
  #    outer of two gates, not the only one.
  #
  #    An earlier version of this comment said the rule was for "OpenAI and package mirrors". The
  #    mirrors part was wrong — nothing installs packages at runtime, that is the image build — and
  #    naming one host understated what the rule actually permitted.
  egress {
    description = "HTTPS to third parties, filtered by domain at the Network Firewall"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # DNS stays inside the VPC. AmazonProvidedDNS answers at the VPC base address + 2 and no DHCP
  # options set overrides it, so nothing here needs to reach a resolver on the internet — this was
  # 0.0.0.0/0 until the endpoints landed, for no reason beyond nobody having looked.
  egress {
    description = "DNS over UDP to the VPC resolver"
    from_port   = 53
    to_port     = 53
    protocol    = "udp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    description = "DNS over TCP: responses above the 512-byte UDP limit"
    from_port   = 53
    to_port     = 53
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  tags = merge(var.tags, { Name = "${var.cluster_name}-nodes-sg" })
}

# ─── EKS Cluster ─────────────────────────────────────────────────────────────
resource "aws_eks_cluster" "main" {
  name     = var.cluster_name
  role_arn = aws_iam_role.cluster.arn
  version  = var.cluster_version

  vpc_config {
    subnet_ids              = var.private_subnet_ids
    endpoint_private_access = true
    # Public access is enabled ONLY when an explicit CIDR allowlist is supplied (CIS EKS 5.4.1/5.4.2).
    # Default is an empty list → public access is off (private-only via VPN/bastion). Never 0.0.0.0/0.
    endpoint_public_access = length(var.public_access_cidrs) > 0
    public_access_cidrs    = var.public_access_cidrs
    security_group_ids     = [aws_security_group.nodes.id]
  }

  # Envelope-encrypt Kubernetes Secrets at rest with a customer-managed KMS key (CIS EKS 3.1).
  encryption_config {
    provider {
      key_arn = var.secrets_kms_key_arn
    }
    resources = ["secrets"]
  }

  enabled_cluster_log_types = ["api", "audit", "authenticator", "controllerManager", "scheduler"]

  tags       = var.tags
  depends_on = [aws_iam_role_policy_attachment.cluster_policy]
}

# ─── OIDC Provider (required for IRSA) ───────────────────────────────────────
data "tls_certificate" "oidc" {
  url = aws_eks_cluster.main.identity[0].oidc[0].issuer
}

resource "aws_iam_openid_connect_provider" "main" {
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.oidc.certificates[0].sha1_fingerprint]
  url             = aws_eks_cluster.main.identity[0].oidc[0].issuer
  tags            = var.tags
}

# ─── Managed Node Groups ─────────────────────────────────────────────────────
# CLOUD: AWS — replace with GCP/on-prem equivalent
#
# master:4650-4654 specifies FOUR pools. Three are built here; analytics-pool is deliberately not,
# and the reason is recorded in master beside the pool list: it exists to carry ClickHouse, and
# ClickHouse has no Kubernetes deployment in this repository at all — no Helm chart, no manifest,
# nothing in Terraform. Standing up an r5.xlarge that nothing can schedule onto would be a bill with
# no workload behind it. Add it in the change that gives ClickHouse a chart.
#
# Until 2026-08-29 there was ONE undifferentiated group on t3.large — an instance type that appears
# in none of the four the spec names — with a single min/max shared by everything. Nothing tested it,
# which is why a spec written in four parts had been implemented as one for so long.
#
# The ai pool is TAINTED. Without it, Kubernetes treats a larger node as ordinary capacity and packs
# ordinary web pods onto the expensive instances the AI services are meant to have to themselves;
# the AI charts carry the matching toleration. system and app are untainted: app is where anything
# unlabelled should land, and making it exclusive would strand every chart that has not opted in.
locals {
  node_groups = {
    system = {
      instance_types = ["t3.medium"]
      desired_size   = 2
      min_size       = 2
      max_size       = 2
      taints         = []
    }
    app = {
      instance_types = ["t3.xlarge"]
      desired_size   = 3
      min_size       = 3
      max_size       = 10
      taints         = []
    }
    ai = {
      instance_types = ["t3.2xlarge"]
      desired_size   = 1
      min_size       = 1
      max_size       = 4
      taints = [{
        key    = "workload"
        value  = "ai"
        effect = "NO_SCHEDULE"
      }]
    }
  }
}

resource "aws_eks_node_group" "pools" {
  for_each = local.node_groups

  cluster_name    = aws_eks_cluster.main.name
  node_group_name = "${var.cluster_name}-${each.key}"
  node_role_arn   = aws_iam_role.nodes.arn
  subnet_ids      = var.private_subnet_ids
  instance_types  = each.value.instance_types

  scaling_config {
    desired_size = each.value.desired_size
    min_size     = each.value.min_size
    max_size     = each.value.max_size
  }

  update_config {
    max_unavailable = 1
  }

  dynamic "taint" {
    for_each = each.value.taints
    content {
      key    = taint.value.key
      value  = taint.value.value
      effect = taint.value.effect
    }
  }

  # `workload` is what the charts' nodeAffinity selects on. `role` is kept for anything that still
  # matches the old single-group label.
  labels = {
    role     = "worker"
    workload = each.key
    env      = var.environment
  }

  tags = var.tags
  depends_on = [
    aws_iam_role_policy_attachment.node_worker,
    aws_iam_role_policy_attachment.node_cni,
    aws_iam_role_policy_attachment.node_ecr,
  ]
}

# ─── EKS Add-ons ─────────────────────────────────────────────────────────────
resource "aws_eks_addon" "vpc_cni" {
  cluster_name  = aws_eks_cluster.main.name
  addon_name    = "vpc-cni"
  addon_version = "v1.16.4-eksbuild.2"
}

resource "aws_eks_addon" "coredns" {
  cluster_name  = aws_eks_cluster.main.name
  addon_name    = "coredns"
  addon_version = "v1.11.1-eksbuild.4"
  depends_on    = [aws_eks_node_group.pools]
}

resource "aws_eks_addon" "kube_proxy" {
  cluster_name  = aws_eks_cluster.main.name
  addon_name    = "kube-proxy"
  addon_version = "v1.29.1-eksbuild.2"
}

resource "aws_eks_addon" "ebs_csi_driver" {
  cluster_name  = aws_eks_cluster.main.name
  addon_name    = "aws-ebs-csi-driver"
  addon_version = "v1.28.0-eksbuild.1"
}
