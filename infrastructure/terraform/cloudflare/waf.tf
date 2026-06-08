# Cloudflare WAF configuration
# Source: spec §Phase 16 — CLOUD DEPLOYMENTS ONLY (Shared SaaS, Dedicated Tenant)
# Architecture: Internet → Cloudflare Edge → AWS ALB → EKS Ingress → NestJS
# Plan: Cloudflare Pro minimum (Enterprise for large tenants)

# ── Managed rulesets ──────────────────────────────────────────────────────────
resource "cloudflare_ruleset" "managed_waf" {
  zone_id     = var.cloudflare_zone_id
  name        = "COS Managed WAF Rules"
  description = "Cloudflare Managed Ruleset + OWASP CRS for Construction OS"
  kind        = "zone"
  phase       = "http_request_firewall_managed"

  rules {
    action      = "execute"
    description = "Cloudflare Managed Rules (OWASP Top 10, known CVEs)"
    expression  = "true"
    action_parameters {
      id      = "efb7b8c949ac4650a09736fc376e9aee"  # Cloudflare Managed Ruleset
      version = "latest"
    }
  }

  rules {
    action      = "execute"
    description = "OWASP Core Rule Set — paranoia level 2"
    expression  = "true"
    action_parameters {
      id = "4814384a9e5d4991b9815dcfc25d2f1f"  # Cloudflare OWASP CRS
      overrides {
        action = "block"
        categories {
          category = "paranoia-level-2"
          action   = "block"
          enabled  = true
        }
      }
    }
  }
}

# ── Rate limiting rules ───────────────────────────────────────────────────────
# Source: spec §Phase 16 rate limits
resource "cloudflare_ruleset" "rate_limits" {
  zone_id     = var.cloudflare_zone_id
  name        = "COS Rate Limiting"
  description = "Rate limiting per spec §Phase 16 §5.5"
  kind        = "zone"
  phase       = "http_ratelimit"

  # Auth endpoints: 10 req/min per IP
  rules {
    action      = "block"
    description = "Auth endpoints: 10 req/min per IP"
    expression  = "(http.request.uri.path matches \"^/api/v[0-9]+/auth/\")"
    ratelimit {
      characteristics = ["ip.src"]
      period          = 60
      requests_per_period = 10
      mitigation_timeout  = 120
    }
  }

  # File uploads: 20 req/min per user (identified by CF-Connecting-IP + JWT sub in header)
  rules {
    action      = "block"
    description = "File upload: 20 req/min per IP"
    expression  = "(http.request.uri.path matches \"^/api/v[0-9]+/files/\")"
    ratelimit {
      characteristics = ["ip.src"]
      period          = 60
      requests_per_period = 20
      mitigation_timeout  = 60
    }
  }

  # General API: 100 req/min per IP
  rules {
    action      = "block"
    description = "General API: 100 req/min per IP"
    expression  = "(http.request.uri.path matches \"^/api/v[0-9]+/\")"
    ratelimit {
      characteristics = ["ip.src"]
      period          = 60
      requests_per_period = 100
      mitigation_timeout  = 60
    }
  }

  # Health/metrics: 60 req/min per IP
  rules {
    action      = "block"
    description = "Health/metrics: 60 req/min per IP"
    expression  = "(http.request.uri.path eq \"/health/live\" or http.request.uri.path eq \"/health/ready\")"
    ratelimit {
      characteristics = ["ip.src"]
      period          = 60
      requests_per_period = 60
      mitigation_timeout  = 30
    }
  }
}

# ── Custom rules: Construction OS ─────────────────────────────────────────────
resource "cloudflare_ruleset" "custom_waf" {
  zone_id     = var.cloudflare_zone_id
  name        = "COS Custom Security Rules"
  description = "Construction OS custom WAF rules"
  kind        = "zone"
  phase       = "http_request_firewall_custom"

  # Block requests without x-tenant-id header on API endpoints
  rules {
    action      = "block"
    description = "Block API requests without tenant header"
    expression  = <<-EOT
      (http.request.uri.path matches "^/api/v[0-9]+/(?!auth/)") and
      not (http.request.headers["x-tenant-id"][*] ne "")
    EOT
    logging { enabled = true }
  }

  # Block suspicious user agents
  rules {
    action      = "challenge"
    description = "Challenge suspicious scanners and bots"
    expression  = <<-EOT
      (cf.client.bot) and
      not (http.request.uri.path matches "^/health/")
    EOT
  }
}

# ── Origin protection: restrict ALB to Cloudflare IPs ────────────────────────
# Implemented via AWS security group rule in infrastructure/terraform/aws/
# This data source fetches current Cloudflare IP ranges for the security group
data "cloudflare_ip_ranges" "cloudflare" {}

output "cloudflare_ipv4_ranges" {
  description = "Current Cloudflare IPv4 ranges for AWS ALB security group"
  value       = data.cloudflare_ip_ranges.cloudflare.ipv4_cidr_blocks
}
