output "zone_id" {
  description = "Cloudflare Zone ID"
  value       = var.cloudflare_zone_id
  sensitive   = false
}

output "api_dns_record_id" {
  description = "DNS record ID for api.construction-os.io"
  value       = cloudflare_record.api.id
}

output "app_dns_record_id" {
  description = "DNS record ID for app.construction-os.io"
  value       = cloudflare_record.app.id
}

output "managed_waf_ruleset_id" {
  description = "Managed WAF ruleset ID"
  value       = cloudflare_ruleset.managed_waf.id
}

output "rate_limit_ruleset_id" {
  description = "Rate limiting ruleset ID"
  value       = cloudflare_ruleset.rate_limits.id
}

output "cloudflare_ipv4_cidr_blocks" {
  description = "Cloudflare IPv4 CIDR blocks — use for AWS ALB security group ingress rules"
  value       = data.cloudflare_ip_ranges.cloudflare.ipv4_cidr_blocks
}
