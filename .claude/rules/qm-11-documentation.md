---
paths:
  - "**/README.md"
  - "docs/architecture/adr/**"
  - "CHANGELOG.md"
  - "docs/api/*.openapi.yaml"
  - "docs/runbooks/**"
---

# QM-11 — Documentation Standards

Indexed in: `context.md` §QUALITY MANDATES

- Every new module must have a `README.md` with: purpose, public API, dependencies, configuration, usage example
- Every architectural decision must be recorded in `docs/architecture/adr/` as an ADR (Architecture Decision Record) using the format: `docs/architecture/adr/NNN-title.md` (template in `docs/architecture/adr/000-template.md`)
- Every breaking change to a public API or Kafka schema must update `CHANGELOG.md` with a `BREAKING CHANGE:` entry
- OpenAPI spec per service (`docs/api/{service}.openapi.yaml`, e.g. `docs/api/auth.openapi.yaml`) must be auto-generated and kept in sync with code — CI fails if spec is stale
- Every runbook must be tested (executed end-to-end in staging) within 30 days before its corresponding Stage transition
