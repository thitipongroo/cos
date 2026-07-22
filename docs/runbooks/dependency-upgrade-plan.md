# Dependency Upgrade Plan — Risk-Ordered

> Generated from a live version audit (versions confirmed against official registries:
> npm registry, PyPI, Go module proxy, Docker Hub registry API, vendor GitHub releases).
> Audit date: 2026-06-30. Re-confirm "latest" at execution time — registries move.

## Principles (apply to EVERY wave)

- **Order = lowest risk → highest risk.** Land safe waves first to keep a green baseline.
- **1 major = 1 PR.** Never bundle multiple major bumps — isolate for clean rollback.
- **Read the official migration guide first** for every major bump. Do not apply a major
  version without reading its actual breaking-change notes (no guessing).
- **CI must stay green** each wave: `lint → build → test → docker build`, plus QM-1 coverage
  100% line + 100% branch. Run `pnpm --filter @cos/backend test:cov`, `test:workflows`,
  `test:integration`; rebuild + test Python/Go services.
- **Rule 28:** after any manifest change run `pnpm install` and commit `pnpm-lock.yaml` in the
  same PR.
- **Spec-locked items (Wave D, E):** require an ADR + `docs/specifications/` + `context/*`
  update (Rule 37) and **product-owner approval (Rule 38)** BEFORE code changes.
- **Stateful infra (Wave F):** each upgrade requires backup + verified rollback script + a DR
  drill in staging (QM-12) and blue-green/canary rollout (QM-16); backward-compatible
  migrations only (QM-9).

## Reference table — pinned vs latest (2026-06-30)

Risk legend: 🟢 in-range/same-major · 🟡 same-major minor/patch · 🔴 ≥1 major behind ·
🔒 intentionally pinned (auditConfig / spec).

### npm

| Package                          | Pinned  | Latest  | Risk                                  |
| -------------------------------- | ------- | ------- | ------------------------------------- |
| typescript                       | ^6.0.3  | 6.0.3   | ✅ current                            |
| husky                            | ^9.1.7  | 9.1.7   | ✅ current                            |
| @nozbe/watermelondb              | ^0.28.0 | 0.28.0  | ✅ current                            |
| next-pwa                         | ^5.6.0  | 5.6.0   | ✅ current (effectively unmaintained) |
| turbo                            | ^2.9.18 | 2.10.1  | 🟡                                    |
| eslint                           | ^10.5.0 | 10.6.0  | 🟡                                    |
| prettier                         | ^3.8.4  | 3.9.4   | 🟡                                    |
| lint-staged                      | ^17.0.7 | 17.0.8  | 🟡                                    |
| @playwright/test                 | ^1.61.0 | 1.61.1  | 🟡                                    |
| @typescript-eslint/eslint-plugin | ^8.61.1 | 8.62.1  | 🟡                                    |
| @temporalio/*                    | ^1.9.0  | 1.18.1  | 🟡                                    |
| ioredis                          | ^5.3.0  | 5.11.1  | 🟡                                    |
| class-validator                  | ^0.14.0 | 0.15.1  | 🟡 (pre-1.0 — read changelog)         |
| decimal.js                       | ^10.4.0 | 10.6.0  | 🟡                                    |
| @tanstack/react-query            | ^5.40.0 | 5.101.2 | 🟡                                    |
| kafkajs                          | ^2.2.0  | 2.2.4   | 🟡                                    |
| jest                             | ^29.7.0 | 30.4.2  | 🔴 (dev/test)                         |
| @pact-foundation/pact            | ^16.5.0 | 17.0.0  | 🔴 (dev/test)                         |
| zod                              | ^3.22.0 | 4.4.3   | 🔴                                    |
| @prisma/client + prisma          | ^5.13.0 | 7.8.0   | 🔴 (two majors)                       |
| tailwindcss                      | ^3.4.0  | 4.3.2   | 🔴                                    |
| @nestjs/swagger                  | ^7.3.0  | 11.4.5  | 🔴                                    |
| @nestjs/throttler                | ^5.1.0  | 6.5.0   | 🔴                                    |
| @nestjs/* (core/common/…)        | ^10.3.0 | 11.1.27 | 🔴🔒 (fastify v4 lock)                |
| @opentelemetry/sdk-node          | ^0.51.0 | 0.219.0 | 🔴🔒                                  |
| next                             | ^14.2.0 | 16.2.9  | 🔴🔒                                  |
| react + react-dom                | ^18.3.0 | 19.2.7  | 🔴 (coupled to Next ≥15)              |
| expo                             | ~51.0.0 | 56.0.12 | 🔴🔒 (spec SDK 51)                    |
| react-native                     | 0.74.0  | 0.86.0  | 🔴🔒                                  |
| expo-router                      | ~3.5.0  | 56.2.11 | 🔴🔒                                  |

### Python (services)

| Package                          | Pinned                   | Latest  | Risk                                          |
| -------------------------------- | ------------------------ | ------- | --------------------------------------------- |
| pytesseract / pdf2image / Pillow | 0.3.13 / 1.17.0 / 12.2.0 | same    | ✅ current                                    |
| python-dotenv (ai-gateway)       | 1.2.2                    | 1.2.2   | ✅ current                                    |
| fastapi                          | 0.111–0.121              | 0.138.2 | 🟡                                            |
| uvicorn                          | 0.29.0                   | 0.49.0  | 🟡                                            |
| pydantic                         | 2.7.1                    | 2.13.4  | 🟡                                            |
| pydantic-settings                | 2.2.1                    | 2.14.2  | 🟡                                            |
| opentelemetry-sdk                | 1.24.0                   | 1.43.0  | 🟡 (coordinate w/ Wave D OTel)                |
| httpx                            | 0.27.0                   | 0.28.1  | 🟡                                            |
| python-dotenv (embedding/ocr)    | 1.0.0                    | 1.2.2   | 🟡                                            |
| asyncpg (>=0.29)                 | floor                    | 0.31.0  | 🟡                                            |
| redis-py (>=5.0)                 | floor                    | 8.0.1   | 🟡 (resolves across a major — read changelog) |
| aiokafka (>=0.11)                | floor                    | 0.14.0  | 🟡                                            |
| jinja2 (>=3.1)                   | floor                    | 3.1.6   | 🟡                                            |

### Go (services)

| Module                              | Pinned                  | Latest | Risk                               |
| ----------------------------------- | ----------------------- | ------ | ---------------------------------- |
| github.com/stretchr/testify         | 1.11.1                  | 1.11.1 | ✅ current                         |
| github.com/twmb/franz-go (coskafka) | 1.21.5 (kg + analytics) | verify | 🟢 migrated off sarama (regex sub) |
| go.opentelemetry.io/otel            | 1.43.0                  | 1.44.0 | 🟡                                 |
| github.com/neo4j/neo4j-go-driver/v5 | 5.24.0                  | 5.28.4 | 🟡                                 |
| go toolchain (go.mod directive)     | 1.25.11                 | 1.26.4 | 🔴 (needs Go 1.26 toolchain)       |

### Docker images

| Image                              | Pinned           | Latest stable                                                           | Same-major option | Risk              |
| ---------------------------------- | ---------------- | ----------------------------------------------------------------------- | ----------------- | ----------------- |
| hashicorp/vault                    | 1.16             | 1.21                                                                    | —                 | 🟡                |
| temporalio/auto-setup              | 1.24.0           | 1.29.7 (image tag — note: server release 1.31.1 ≠ auto-setup image tag) | —                 | 🟡                |
| temporalio/ui                      | 2.26.2           | 2.51.1                                                                  | —                 | 🟡                |
| redis                              | 7-alpine         | 8.8.0                                                                   | 7.4.9             | 🔴                |
| timescale/timescaledb (PostgreSQL) | latest-pg16      | PG 18 (TSDB 2.28.2 supports pg16–pg18)                                  | stay pg16         | 🔴                |
| confluentinc/cp-kafka              | 7.6.0            | 8.3.0 (= Kafka 4, KRaft)                                                | 7.9.8             | 🔴                |
| confluentinc/cp-schema-registry    | 7.6.0            | 8.3.0                                                                   | 7.9.8             | 🔴                |
| opensearchproject/opensearch       | 2.13.0           | 3.7.0                                                                   | 2.19.5            | 🔴                |
| neo4j                              | 5.19-community   | 2026.05.0-community                                                     | 5.26.27-community | 🔴                |
| clickhouse/clickhouse-server       | 24.3-alpine      | 26.5.4 (LTS 26.3)                                                       | —                 | 🔴                |
| quay.io/keycloak/keycloak          | 24.0.4           | 26.6.4                                                                  | —                 | 🔴                |
| minio/minio                        | latest (mutable) | pin explicit                                                            | —                 | ⚠ reproducibility |
| edoburu/pgbouncer                  | latest (mutable) | pin explicit                                                            | —                 | ⚠ reproducibility |
| clamav/clamav                      | stable (mutable) | pin explicit                                                            | —                 | ⚠ reproducibility |
| provectuslabs/kafka-ui             | latest (mutable) | pin explicit                                                            | —                 | ⚠ reproducibility |

---

## Wave A — Housekeeping + in-range bumps (lowest risk)

semver-compatible / same-major; refresh lockfile; run existing test suites.

- npm minors: turbo, eslint, prettier, lint-staged, @playwright/test, @typescript-eslint/_,
  @temporalio/_, ioredis, decimal.js, @tanstack/react-query, kafkajs
- npm watch-list (pre-1.0 minor — read changelog before bump): class-validator
- Python minors: fastapi, uvicorn, pydantic, pydantic-settings, opentelemetry-sdk, httpx,
  python-dotenv (embedding/ocr); floor bumps: asyncpg, aiokafka, jinja2
- Python watch-list: redis-py (`>=5.0` resolves to 8.0.1 — a major for the lib; pin + test)
- Go minors: otel 1.44.0, neo4j-driver 5.28.4 (sarama removed — both Go workers now use franz-go via coskafka)
- Infra same-major image bumps: vault 1.16→1.21, temporal auto-setup 1.24→1.29.7 (image tag;
  the temporal server GitHub release 1.31.1 does NOT map to an auto-setup image tag — verify the
  actual Docker Hub tag before bumping), ui 2.26→2.51.1
- Pin mutable image tags (minio, edoburu/pgbouncer, clamav, kafka-ui) — query current tag first

Verify: full `lint`/`build`/`test` + 100% coverage; `docker compose --profile full --profile apps up`
all healthy; rebuild + test Python/Go services.

## Wave B — Go toolchain + dev/test tooling majors (blast radius = CI/test only)

- Go toolchain 1.25→1.26 (requires Go 1.26 installed; rebuild + test both Go services)
- jest 29→30 (read jest 30 migration; config/runner changes)
- @pact-foundation/pact 16→17 (contract tests)

## Wave C — Runtime library majors (web/app; migration guide exists; no persistent data)

- zod 3→4 (codemod per guide)
- tailwindcss 3→4 (engine/PostCSS pipeline change — re-verify §32.7 token wiring; page must not
  render unstyled)
- prisma 5→7 (own step; read 5→6 AND 6→7 upgrade guides; data-access layer + generated client;
  run integration tests; verify migration backward-compat per QM-9)
- NOTE: react 18→19 is coupled to Next ≥15 → executed in Wave D, not here.

## Wave D — Framework majors, spec-locked (ADR + spec update + product-owner gate FIRST)

auditConfig records these as intentionally locked. Resolve the lock reason, write ADR, update
`docs/specifications/` + `context/*` (Rule 37), get product-owner approval (Rule 38), THEN:

- NestJS 10→11 (+ @nestjs/swagger 7→11, @nestjs/throttler 5→6, platform-fastify → fastify v5;
  removes several CVE-ignores in auditConfig)
- Next 14→16 + react/react-dom 18→19 (together)
- @opentelemetry/sdk-node 0.51→0.219 (coordinate with Python OTel + Go OTel + collector config)

## Wave E — Mobile native stack, spec-locked (product-owner + ADR required)

Spec pins Expo SDK 51 + `@skam22/watermelondb-expo-plugin@^51`. Update the spec first.

- Expo 51→56, react-native 0.74→0.86, expo-router 3.5→56, WatermelonDB plugin/simdjson/
  build-properties matched to SDK 56
- Rebuild custom dev-client; re-run Detox e2e; update the SDK-51-specific "Never" rules in
  `context.md`

## Wave F — Stateful infrastructure majors (highest operational risk; data + DR)

Each is its own isolated, staged rollout: backup + verified rollback + DR drill in staging
(QM-12), blue-green/canary (QM-16), backward-compatible (QM-9). Ordered by blast radius:

| Step | Upgrade                                          | Primary risk factor                                                          |
| ---- | ------------------------------------------------ | ---------------------------------------------------------------------------- |
| F1   | Keycloak 24→26                                   | auth-critical (QM-4); realm migration + Quarkus distro                       |
| F2   | OpenSearch 2→3                                   | reindex; JDK 21+ baseline                                                    |
| F3   | ClickHouse 24.3→26                               | analytics store; prefer LTS 26.3 path first                                  |
| F4   | Neo4j 5.19→                                      | interim to 5.26.27 (5.x line) first; CalVer 2026.x as a later round          |
| F5   | Redis 7→8                                        | cache/throttler/session; verify license terms                                |
| F6   | Confluent 7→8 (Kafka 4 KRaft, ZooKeeper removed) | event backbone; do cp-kafka + schema-registry together                       |
| F7   | PostgreSQL 16→18                                 | primary datastore; pg_upgrade/dump-restore + RLS + TimescaleDB pg18; do last |

Lower-risk interim for any stateful store not yet ready to cross a major: bump within the
current major line first (Redis 7.4.9, OpenSearch 2.19.5, Neo4j 5.26.27, Confluent 7.9.8).

## Items NOT to assume (confirm from official at execution time)

- Specific breaking-change APIs of each major — first action of each step is to read the
  official migration guide for that exact version jump.
- Current tags of mutable images (Wave A) — query before pinning.
- Resolved lockfile versions for 🟡 items — some may already be current; check `pnpm why` /
  lockfile at the start of Wave A.
- Node.js runtime (`node:24-alpine`) latest — not audited in this pass.
