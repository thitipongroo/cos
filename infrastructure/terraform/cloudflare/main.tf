terraform {
  required_version = ">= 1.7.0"
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
  backend "s3" {
    bucket = "cos-terraform-state"
    key    = "cloudflare/terraform.tfstate"
    region = "ap-southeast-1"
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# ── DNS records ────────────────────────────────────────────────────────────────
resource "cloudflare_record" "api" {
  zone_id = var.cloudflare_zone_id
  name    = "api"
  type    = "CNAME"
  value   = "alb.${var.environment}.construction-os.io"  # AWS ALB DNS name
  proxied = true  # Traffic through Cloudflare WAF
  ttl     = 1     # Automatic TTL when proxied
}

resource "cloudflare_record" "app" {
  zone_id = var.cloudflare_zone_id
  name    = "app"
  type    = "CNAME"
  value   = "alb.${var.environment}.construction-os.io"
  proxied = true
  ttl     = 1
}

# CredentialService public did:web host. Third-party verifiers resolve tenant DID documents and
# revocation status lists here; the hostname is embedded in every credential already issued.
resource "cloudflare_record" "credentials" {
  zone_id = var.cloudflare_zone_id
  name    = "credentials"
  type    = "CNAME"
  value   = "alb.${var.environment}.construction-os.io"
  proxied = true
  ttl     = 1
}

# ── TLS configuration ──────────────────────────────────────────────────────────
resource "cloudflare_zone_settings_override" "cos" {
  zone_id = var.cloudflare_zone_id
  settings {
    ssl                      = "strict"
    min_tls_version          = "1.3"
    tls_1_3                  = "on"
    automatic_https_rewrites = "on"
    always_use_https         = "on"
    opportunistic_encryption = "on"
    security_level           = "medium"
    browser_check            = "on"
    challenge_ttl            = 1800
  }
}
