# compliance

NestJS module hosting the compliance audit workflow stub for SOC 2 Type II, ISO 27001 and PDPA.

## Purpose

Owns `ComplianceAuditWorkflow` (Phase 16) — the Temporal workflow that drives a certification audit
cycle. The audit is triggered 6 months before a target certification date. Source:
`00_master` §Phase 16; `05-security-compliance` §5.3.1.

## Public API

This module exposes **no HTTP routes**. Its surface is the workflow and its service:

```text
ComplianceAuditService     — starts / inspects a compliance audit run
ComplianceAuditException   — typed exception thrown by the stub (Type A fail-fast)
workflows/                 — Temporal workflow + activities
```

Supported audit targets: `SOC2_TYPE_II`, `ISO_27001`, `PDPA`.

## Dependencies

- `@cos/logger` — structured logging
- Temporal (`@temporalio/*`) — durable workflow execution

## Configuration

No module-specific environment variables. Temporal connection settings are supplied by the shared
worker configuration.

## Usage

```typescript
// Stub behaviour (§32.9 Type A — fail-fast):
// logs WARN and throws ComplianceAuditException until the concrete
// audit integration is implemented.
await complianceAuditService.startAudit('SOC2_TYPE_II');
```

## Notes

- Stub pattern is **Type A** (log WARN + throw a typed exception). Type B (safe defaults) applies to
  IoT only — see `32-implementation-specifications` §32.9.
- Compliance documents that must exist before Phase 16 sign-off:
  `docs/compliance/soc2-controls.md`, `docs/compliance/data-flow-map.md`,
  `docs/compliance/data-retention-policy.md`.
- Test design: `docs/manual/35-test-design.md` §35.10.16.
