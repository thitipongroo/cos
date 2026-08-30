# CLOUD: AWS — replace with GCP/on-prem equivalent
#
# Egress domain filtering, added 2026-08-29 to close the last AWS-0104 finding.
#
# THE PROBLEM. The worker-node security group needed one rule allowing TCP/443 to 0.0.0.0/0. The VPC
# endpoints in vpc-endpoints.tf took AWS's own APIs off the internet, but ten third-party hosts
# remain, and every one of them sits behind a CDN — Cloudflare, Google, Akamai — so there is no
# stable IP range to put in a CIDR. A security group filters by address; the requirement is by name.
#
# WHAT THIS DOES. Network Firewall inspects the TLS ClientHello and matches on SNI, so the allowlist
# below is enforced by hostname. The security-group rule stays open on 443 — a security group cannot
# express this — and AWS-0104 therefore stays in .trivyignore.yaml. What changes is that the finding
# now describes a rule sitting BEHIND a domain allowlist rather than an open path to the internet.
#
# ROUTING. Traffic goes private subnet -> firewall endpoint -> NAT gateway -> IGW, and every hop
# stays inside one AZ. The same-AZ constraint is not a preference: Network Firewall is STATEFUL, so a
# flow whose reply returns through a different AZ's endpoint is seen as an unsolicited packet and
# dropped. That is why there is a firewall subnet, and a route table, per AZ rather than one shared.
#
# COST, stated plainly: one firewall endpoint per AZ billed hourly, plus per-GB inspection, on top of
# the NAT gateways which remain. This buys the difference between "any host on the internet" and
# "these eleven names".

locals {
  # Every public host production code actually reaches, verified from the code and from the SDKs as
  # installed — not from documentation, which is how api-data.line.me was nearly missed.
  #
  #   api.openai.com                  ai-gateway  LLM + embeddings
  #   api.openweathermap.org          ai-gateway  weather for the delay-risk context
  #   oauth2.googleapis.com           backend     Google service-account token exchange
  #   www.googleapis.com              backend     Google service-account APIs
  #   playintegrity.googleapis.com    backend     Play Integrity device attestation
  #   www.apple.com                   backend     Apple App Attest root certificate
  #   openexchangerates.org           backend     FX rates
  #   api.sendgrid.com                backend     email (@sendgrid/mail, SENDGRID_BASE_URL)
  #   api.line.me                     backend     LINE messaging (@line/bot-sdk)
  #   api-data.line.me                backend     LINE content endpoint — a SECOND host the same SDK
  #                                               uses; allowing only api.line.me breaks media
  #   exp.host                        backend     Expo push (expo-server-sdk)
  #
  # OS and language package mirrors are deliberately NOT here. Nothing installs packages at runtime —
  # that happens in the image build, in CI. An earlier comment in modules/eks/main.tf claimed they
  # were needed; it was wrong, and it made the open rule look more necessary than it was.
  egress_allowed_domains = [
    "api.openai.com",
    "api.openweathermap.org",
    "oauth2.googleapis.com",
    "www.googleapis.com",
    "playintegrity.googleapis.com",
    "www.apple.com",
    "openexchangerates.org",
    "api.sendgrid.com",
    "api.line.me",
    "api-data.line.me",
    "exp.host",
  ]
}

resource "aws_subnet" "firewall" {
  count             = length(var.firewall_subnet_cidrs)
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.firewall_subnet_cidrs[count.index]
  availability_zone = var.availability_zones[count.index]
  tags              = merge(var.tags, { Name = "cos-firewall-${var.availability_zones[count.index]}" })
}

resource "aws_networkfirewall_rule_group" "egress_domains" {
  name     = "cos-egress-allowlist-${var.environment}"
  type     = "STATEFUL"
  capacity = 100

  rule_group {
    rules_source {
      rules_source_list {
        generated_rules_type = "ALLOWLIST"
        target_types         = ["TLS_SNI"]
        targets              = local.egress_allowed_domains
      }
    }
  }

  tags = var.tags
}

resource "aws_networkfirewall_firewall_policy" "egress" {
  name = "cos-egress-policy-${var.environment}"

  firewall_policy {
    # DROP, not ALERT. An allowlist whose default action is to pass logs the violation and lets it
    # through, which reads as enforcement in a dashboard and is not.
    stateless_default_actions          = ["aws:forward_to_sfe"]
    stateless_fragment_default_actions = ["aws:forward_to_sfe"]
    stateful_default_actions           = ["aws:drop_established", "aws:alert_established"]

    stateful_engine_options {
      rule_order = "STRICT_ORDER"
    }

    stateful_rule_group_reference {
      resource_arn = aws_networkfirewall_rule_group.egress_domains.arn
      priority     = 1
    }
  }

  tags = var.tags
}

resource "aws_networkfirewall_firewall" "egress" {
  name                = "cos-egress-fw-${var.environment}"
  firewall_policy_arn = aws_networkfirewall_firewall_policy.egress.arn
  vpc_id              = aws_vpc.main.id

  # Guards against `terraform destroy` quietly removing the only thing enforcing the allowlist.
  delete_protection = true

  dynamic "subnet_mapping" {
    for_each = aws_subnet.firewall[*].id
    content {
      subnet_id = subnet_mapping.value
    }
  }

  tags = var.tags
}

# ─── Routing ────────────────────────────────────────────────────────────────
# private -> firewall endpoint -> NAT -> IGW, all within one AZ.

locals {
  # The firewall exposes one VPC endpoint per subnet it was given. sync_states is keyed by AZ, so
  # this maps AZ name -> endpoint id for the route lookups below.
  firewall_endpoints = {
    for s in tolist(aws_networkfirewall_firewall.egress.firewall_status[0].sync_states) :
    s.availability_zone => s.attachment[0].endpoint_id
  }
}

# Private subnets send internet-bound traffic to the firewall, not to the NAT gateway. This REPLACES
# the 0.0.0.0/0 -> NAT route in main.tf's private route table.
resource "aws_route" "private_to_firewall" {
  count                  = length(var.private_subnet_cidrs)
  route_table_id         = aws_route_table.private[count.index].id
  destination_cidr_block = "0.0.0.0/0"
  vpc_endpoint_id        = local.firewall_endpoints[var.availability_zones[count.index]]
}

# Inspected traffic continues to the NAT gateway in the same AZ.
resource "aws_route_table" "firewall" {
  count  = length(var.firewall_subnet_cidrs)
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main[count.index].id
  }

  tags = merge(var.tags, { Name = "cos-firewall-rt-${var.availability_zones[count.index]}" })
}

resource "aws_route_table_association" "firewall" {
  count          = length(var.firewall_subnet_cidrs)
  subnet_id      = aws_subnet.firewall[count.index].id
  route_table_id = aws_route_table.firewall[count.index].id
}

# Return traffic from the NAT gateway must re-enter through the SAME firewall endpoint, or the
# stateful engine never sees the second half of the flow and drops it. This is the edge route table
# on the internet gateway.
resource "aws_route_table" "igw_ingress" {
  vpc_id = aws_vpc.main.id

  dynamic "route" {
    for_each = var.public_subnet_cidrs
    content {
      cidr_block      = route.value
      vpc_endpoint_id = local.firewall_endpoints[var.availability_zones[index(var.public_subnet_cidrs, route.value)]]
    }
  }

  tags = merge(var.tags, { Name = "cos-igw-ingress-rt-${var.environment}" })
}

resource "aws_route_table_association" "igw_ingress" {
  gateway_id     = aws_internet_gateway.main.id
  route_table_id = aws_route_table.igw_ingress.id
}
