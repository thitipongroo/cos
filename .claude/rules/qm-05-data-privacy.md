---
paths:
  - "**/*.prisma"
  - "backend/prisma/**"
  - "docs/policies/**"
  - "backend/src/modules/identity/**"
  - "backend/src/modules/platform/**"
---

# QM-5 — Data Privacy & Compliance

Indexed in: `context.md` §QUALITY MANDATES

- **Data classification** — all data must be classified as one of: `PUBLIC`, `INTERNAL`, `CONFIDENTIAL`, `RESTRICTED`;
  classification tagged in Prisma schema comments; access control enforced per classification level
- **PDPA (Thailand)** — Personal Data Protection Act B.E. 2562:
  - All PII fields must be tagged in Prisma schema with `@pdpa(category: "...")` comment
  - Consent must be captured before any PII is stored
  - Data subject rights (access, deletion, portability) must be implementable for each PII entity
  - Retain personal data for no longer than the purpose requires — define retention in `docs/policies/data-retention-policy.md`
- **GDPR (EU)** — applies when any EU resident's data is processed:
  - Same PII tagging rules as PDPA
  - Data Processing Agreements (DPAs) required for all third-party processors
  - Right to erasure must be implementable within 30 days; implementation strategy: anonymization-in-place preferred
    over cascade delete (preserves aggregate analytics)
  - Erasure spans TWO systems, and both halves are required (TDD OQ-48): the database columns AND the Keycloak account.
    Anonymising `platform.users` alone leaves the person named in the identity provider (username = their email on Path
    B / phone on Path A, plus email and display name) and still able to log in. `KeycloakAdminService.eraseUser`
    disables, logs out every session, and overwrites those fields; the realm sets `editUsernameAllowed: true` so the
    username can be overwritten at all. A Keycloak failure is reported via `keycloak_erase_failed`, never rolled back —
    the database half cannot be undone. Per-table statements, their required ORDER, and the two-level audit trail: spec
    §11.4
- **CCPA (California, USA)** — applies when California residents are served:
  - "Do not sell my personal information" opt-out must be implementable
- **SOC 2 Type II** — platform must be SOC 2 Type II ready by Stage 3; controls tracked in
  `docs/registers/soc2-controls.md`; every new feature reviewed against SOC 2 trust criteria (Security, Availability,
  Confidentiality) before merge
- **Cross-border data transfer**: Thai-origin data must not leave the `ap-southeast-7` (Bangkok) region —
  `ap-southeast-1` (Singapore) is the DR/fallback — without explicit product owner approval and legal review; data
  residency rules per region defined in `docs/policies/data-residency-policy.md` (region decision: GLOB-001, spec §8.8 +
  §5.6)
- PII must never appear in logs, traces, or error messages — use `[REDACTED]` or masked values
