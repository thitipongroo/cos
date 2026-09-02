---
paths:
  - "infrastructure/terraform/**"
---

# QM-13 — Multi-Region Architecture

Indexed in: `context.md` §QUALITY MANDATES

> Stage 1–3: architect for multi-region, do not implement prematurely. Stage 4+: required.

**Stage 1–3 (design constraints — enforce now):**

- No region-specific strings or ARNs hardcoded in business logic — all via environment variables
- No assumption of single-region in database schema design or API contracts
- UTC storage and user-locale display enforced globally (QM-3) — no timezone assumptions

**Stage 4+ (required implementation — multi-region Terraform module):**

- Active-passive multi-region: primary `ap-southeast-7` (Bangkok, Thailand); DR region `ap-southeast-1` (Singapore)
  defined via multi-region Terraform module before Stage 4 begins (GLOB-001, spec §8.8)
- Global traffic routing via Route 53 latency-based routing or CloudFront
- Data residency enforced per QM-5: Thai-origin data remains in `ap-southeast-7` (Bangkok) unless product owner approves
  otherwise with legal sign-off
- Cross-region replication strategy (read replicas vs. active-active) decided in an ADR before implementation begins
- Each region must independently pass Phase 19 automated checks before receiving production traffic
