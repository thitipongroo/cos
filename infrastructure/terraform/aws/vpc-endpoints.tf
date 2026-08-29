# CLOUD: AWS — replace with GCP/on-prem equivalent
#
# VPC endpoints, added 2026-08-29 so the EKS worker nodes stop needing an open path to the internet
# for AWS's own APIs.
#
# WHY. The node security group's egress was `protocol = "-1"` to 0.0.0.0/0 until the IaC scanner was
# switched on and flagged it (Trivy AWS-0104). It was narrowed to TCP/443 and DNS, but 443 to
# anywhere is still 443 to anywhere: the reason it had to stay open was that image pulls, STS, the
# EKS API and log shipping all leave the VPC. With these endpoints they no longer do — the traffic
# resolves to an ENI inside the private subnets and never reaches the NAT gateway.
#
# WHAT REMAINS PUBLIC, deliberately: api.openai.com and the OS/language package mirrors. There is no
# AWS endpoint for a third-party host, so one TCP/443 rule to 0.0.0.0/0 survives and AWS-0104 stays
# in .trivyignore.yaml for that single rule. Closing it needs an egress proxy with an allowlist —
# a different piece of infrastructure, not a tighter CIDR.
#
# COST, stated plainly because it is the reason this was not done earlier: five interface endpoints
# across three AZs is fifteen ENIs, each billed hourly, plus per-GB processing. The NAT gateways stay
# (the public destinations still need them), so this ADDS cost rather than replacing it. What it buys
# is that AWS API traffic no longer transits the internet gateway and no longer depends on an
# egress rule wide enough to reach anything else.

locals {
  # Interface endpoints the nodes actually use. Deliberately short: an endpoint for a service nothing
  # calls is fifteen ENIs of pure cost.
  #   ecr.api / ecr.dkr  image pulls — BOTH are required; dkr alone cannot authenticate
  #   sts                IRSA: every pod that assumes a role
  #   eks                the kubelet and the autoscaler reaching the control plane
  #   logs               CloudWatch Logs shipping
  interface_endpoints = toset(["ecr.api", "ecr.dkr", "sts", "eks", "logs"])
}

# Endpoint ENIs accept 443 from the worker nodes and from nothing else.
resource "aws_security_group" "vpc_endpoints" {
  name        = "cos-vpce-sg-${var.environment}"
  description = "HTTPS from EKS worker nodes to the interface endpoints"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "HTTPS from worker nodes"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [module.eks.node_security_group_id]
  }

  # No egress: an endpoint ENI answers requests and originates nothing. AWS denies all egress when
  # no egress block is present, so its absence IS the rule.

  tags = merge(var.tags, { Name = "cos-vpce-sg-${var.environment}" })
}

resource "aws_vpc_endpoint" "interface" {
  for_each = local.interface_endpoints

  vpc_id             = aws_vpc.main.id
  service_name       = "com.amazonaws.${var.aws_region}.${each.key}"
  vpc_endpoint_type  = "Interface"
  subnet_ids         = aws_subnet.private[*].id
  security_group_ids = [aws_security_group.vpc_endpoints.id]
  # Without this the endpoint exists but nothing resolves to it: callers keep using the public
  # hostname and keep leaving through the NAT gateway, and the whole change is inert.
  private_dns_enabled = true

  tags = merge(var.tags, { Name = "cos-vpce-${each.key}-${var.environment}" })
}

# S3 is a GATEWAY endpoint — a route-table entry, not an ENI. No hourly charge and no security
# group; it is attached to the private route tables. ECR stores image layers in S3, so an ECR
# endpoint without this one still sends every layer through the NAT gateway.
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = aws_route_table.private[*].id

  tags = merge(var.tags, { Name = "cos-vpce-s3-${var.environment}" })
}

# The AWS-managed prefix list for S3 in this region. Looked up rather than hard-coded: AWS adds and
# removes ranges, and a copied CIDR list silently stops matching when they do.
data "aws_prefix_list" "s3" {
  name = "com.amazonaws.${var.aws_region}.s3"
}
