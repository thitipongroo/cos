---
paths:
  - "packages/@cos/**"
  - "apps/mobile/**"
  - "apps/web/**"
---

# Rules 33 & 34 — Package boundaries

Indexed in: `context.md` §GLOBAL EXECUTION RULES

- Rule 33 — Use `import type { X } from 'pkg'` when X is only used for TypeScript type annotations (not runtime). Prevents Metro/webpack from bundling Node.js-only packages into mobile/browser builds. (prevents mobile bundle failures)

- Rule 34 — the CLIENT-SAFE packages (`@cos/types`, `@cos/schemas`, `@cos/ui-logic`, `@cos/financial` — what apps/mobile and apps/web actually import) must never gain a runtime import of a Node.js-only package (PrismaClient, native addons, server frameworks); use `import type` for type-only references. The NODE-ONLY packages (`@cos/shared`, `@cos/database`, `@cos/logger`, `@cos/tracing`, `@cos/config`, `@cos/rbac`, `@cos/validation`, `@cos/test-utils`) may use Node built-ins, but must never appear in a client-safe package's dependencies. Amended 2026-08-27: the rule used to say `@cos/shared` was imported by all platforms — it is not, and never was in this repo (backend and file-service only). Enforced by `tests/conformance/events/06-rule-34.spec.ts`. (prevents mobile bundle failures)
  **And structurally since 2026-08-22 (ADR-055):** the Kafka SDK no longer lives in `@cos/shared`
  at all. `@cos/shared` is event payload **types only** — every import in it is `import type` and
  its sole dependency is `@cos/types`. KafkaProducer/Consumer, OutboxPublisher + OutboxPoller,
  DlqPublisher, the topic provisioner, the Prometheus metrics and the Schema Registry client, plus
  the Avro `.avsc` schemas, are in **`@cos/kafka`** — node-only, never aliased into apps/mobile.
