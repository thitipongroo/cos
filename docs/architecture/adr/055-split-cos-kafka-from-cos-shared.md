# ADR-055: Split @cos/kafka out of @cos/shared

**Date:** 2026-08-22
**Status:** Accepted
**Deciders:** Product owner
**Tags:** architecture, mobile, infra

---

## Context

Rule 34 states that `@cos/shared` is imported by **all** platforms — React Native (Metro), the web
Service Worker and Node services — and therefore must contain no runtime import of a Node-only
package. Rule 34(c) is explicit that `OutboxPoller`, which polls a database, "must be moved to
`backend/src` — NOT placed in `@cos/shared`".

The package violated that rule in practice:

- `src/kafka/outbox.ts` imported the Node built-in `crypto`
- `package.json` declared `kafkajs`, `ioredis` and `prom-client` as **runtime** dependencies
- `src/kafka/schema-registry.client.ts` used `fs.readFileSync` and `path.join`

At the same time, `00_master` §Phase 8 `Generate:` instructs that the Kafka SDK — `KafkaProducer`,
`KafkaConsumer`, `OutboxPublisher` with `OutboxPoller` — be delivered _inside_ `@cos/shared`. Rule 34
and the Phase 8 command therefore contradicted each other, and the implementation followed the
phase command.

The breach was latent rather than active: `apps/mobile` imports nothing from `@cos/shared` today.
But `apps/mobile/tsconfig.json` carries a `@cos/shared` path alias, so the first mobile import of an
event type would have pulled `kafkajs` into the Metro bundle.

Recorded as docs/architecture/test-design/escalation-register.md §35.13 ESC-08; the failing case is `TC-P08-UNIT-016`.

## Decision

Split the package in two along the mobile-safety boundary:

| Package       | Contents                                                                                                                                                                                             | Consumers                       |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `@cos/shared` | Typed cross-service event payload contracts (`src/events/*.ts`) and the `BaseEventEnvelope` re-export                                                                                                | All platforms — **mobile-safe** |
| `@cos/kafka`  | `KafkaProducer`, `KafkaConsumer`, `OutboxPublisher`/`OutboxPoller`, `DlqPublisher`, `KafkaTopicProvisioner`, topic catalog, Prometheus metrics, Schema Registry client, and the Avro `.avsc` schemas | Node services only              |

- `@cos/shared` now declares exactly one runtime dependency, `@cos/types`, and every import in its
  sources is `import type`. It has no executable logic, so under Rule 35 it is exempt from a Jest
  config and a coverage gate — the same status as `@cos/types`.
- `@cos/kafka` carries the Node-only dependencies and its own 100% lines / 100% branches gate.
- `apps/mobile` keeps only the `@cos/shared` alias; no `@cos/kafka` alias exists for mobile.

## Rationale

- **The rule and the phase command had to be reconciled, and Rule 34 states the safety property.**
  A package cannot simultaneously be "imported by React Native" and "hold a Kafka client".
- **The split is preferred over Rule 34(c)'s literal instruction** (move only the outbox to
  `backend/src`), because moving only the outbox leaves `kafkajs`, `ioredis` and `prom-client` as
  runtime dependencies of `@cos/shared` — the package would still not be mobile-safe, and it would
  also split the Kafka SDK across two locations for no benefit.
- **Alternatives considered:**
  - _Move only `OutboxPoller`/`OutboxPublisher` to `backend/src` (literal Rule 34(c))._ Rejected —
    does not achieve mobile safety, as above.
  - _Keep one package and narrow Rule 34 to a "server-only subpath"._ Rejected — the guarantee then
    depends on every future import choosing the right subpath, which no gate enforces.
  - _Leave it, since mobile does not import it today._ Rejected — the alias is present, so the
    breach is one import away, and the contradiction between Rule 34 and Phase 8 would persist.

## Consequences

### Positive

- `@cos/shared` is verifiably mobile-safe: zero runtime imports, one workspace dependency.
- The Kafka SDK gains its own coverage gate (8 suites / 96 tests at 100/100).
- Avro schemas now sit beside the code that reads them; `copy:avro` targets `@cos/kafka/dist/avro`.

### Negative

- 19 source files and 19 spec files changed their import specifier from `@cos/shared` to
  `@cos/kafka`; `jest.mock('@cos/shared')` became `jest.mock('@cos/kafka')`.
- One more workspace package to version and build.
- `00_master` §Phase 1 (package list) and §Phase 8 (`Generate:`) required correction, since both
  named `@cos/shared` as the Kafka SDK home.

### Neutral

- No behaviour change: the SDK code itself is unchanged apart from `AVRO_DIR`, which now resolves
  `join(__dirname, 'avro')` instead of `join(__dirname, '../avro')` after the flattening.
- `@cos/shared` version bumped 0.1.0 → 0.2.0 to signal the removed exports.

## References

- Rule 33, Rule 34 — `.claude/rules/rule-33-34-package-boundaries.md`; Rule 35 — `.claude/rules/rule-35-package-test-infra.md` (moved out of `context.md` 2026-09-02; long form in `context/00_master_construction_os.md` §ROOT CAUSE PREVENTION RULES)
- `context/phases/phase-01-foundation-repository.md` (shared package boundaries), §Phase 8
- `docs/architecture/test-design/README.md` §35.13 ESC-08, `TC-P08-UNIT-016`
- `docs/specifications/32-implementation-specifications.md` §32.4 (event contracts)
