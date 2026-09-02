# ADR-036: Docker Compose `apps` profile for local application services

**Date:** 2026-06-28
**Status:** Accepted
**Deciders:** Product owner, Engineering Lead
**Tags:** infra

---

## Context

The Phase 1 spec (`context/phases/phase-01-foundation-repository.md` → Generate → "Docker Compose")
enumerates **only infrastructure** services for local dev (PostgreSQL/TimescaleDB, PgBouncer, Redis,
Kafka, Schema Registry, OpenSearch, Neo4j, ClickHouse, MinIO, Vault). The Phase 1 **Constraint** list,
however, states: _"all services must start with Docker Compose from day one."_

These two statements are in tension. `docker-compose.yml` defines infra only; the seven application
services — `backend` (NestJS), `file-service` (Fastify), `ai-gateway` / `ai-embedding-worker` /
`ai-ocr-pipeline` (FastAPI), `analytics-worker` / `kg-ingestion-worker` (Go) — start via `make dev`
(`turbo run dev`) on the host, not as Compose services. So "all services start with Docker Compose"
was true for one reading (the infra everything depends on) and false for another (every app service
is itself a Compose service).

Research into how large engineering orgs handle local dev (Shopify Spin, Uber Devpod, Monzo) shows the
at-scale pattern is _remote/cloud dev environments + run only a subset locally_, not "everything in
Compose." That pattern solves "too many services to fit on a laptop" — a problem Construction OS (one
modular monolith + six services) does not yet have. At this scale the idiomatic reconciliation is
Docker Compose **profiles**: keep one Compose file, start subsets selectively.

## Decision

Add the seven application services to `docker-compose.yml` under a new **`apps` profile**, alongside
the existing default (essential infra) and `full` (heavy infra) tiers:

- **Default** (`docker compose up`, `make docker-up`): essential infra only.
- **`full` profile** (`make docker-up-full`): all infra (OpenSearch, Neo4j, ClickHouse, ClamAV,
  Keycloak, Vault, Temporal, UIs).
- **`apps` profile** (`make docker-apps-up-full`): the seven app services. App services depend on heavy infra in
  the `full` profile, so the apps tier enables **both** profiles together:
  `docker compose --profile full --profile apps up`.

App service configuration:

- `build.context` / `dockerfile` reuse the **existing production Dockerfiles** (already present and
  built by CI `build-docker`).
- Environment **inherits the dev `.env`** (`env_file:` with `required: false`) and overrides only the
  **hostname-bearing variables** to Compose service-DNS (`pgbouncer`, `kafka:9092`, `redis`,
  `keycloak:8080`, `neo4j:7687`, `clickhouse:8123`, `opensearch:9200`, `minio:9000`, `temporal:7233`).
  Values are otherwise identical to what `make dev` already gives each app on the host — only the
  network address changes.
- Host ports are published **only for the three FastAPI HTTP services** (`ai-gateway`,
  `ai-embedding-worker`, `ai-ocr-pipeline`) plus `backend`/`file-service`; the two Go workers are
  Kafka/Neo4j consumers with no inbound HTTP and stay internal to the Compose network.
- `develop.watch` (`action: rebuild`) is wired per service for full-stack-in-Docker iteration.

`make dev` (turbo on host, with native hot-reload) remains the recommended **day-to-day** inner loop.
The `apps` profile is for parity / "run the whole stack in Docker" / satisfying the Phase 1 constraint
literally.

## Rationale

- **Profiles is Docker's built-in mechanism** for "one file, selective startup": services without a
  `profiles:` attribute always start; profiled services start only when their profile is enabled. This
  makes the constraint literally true (`--profile full --profile apps` starts everything) without
  slowing the default infra-only workflow.
- **`env_file` inheritance + hostname overrides** mirrors the host `make dev` environment exactly,
  rather than re-deriving every secret/config value (which would risk drift between host and container
  dev). Only networking is corrected.
- **Reuse existing production Dockerfiles** keeps the change additive — no new build artifacts.
- Alternatives rejected:
  - _Make `apps` self-contained (`--profile apps` alone)_ — would rely on subtle cross-profile
    `depends_on` auto-start semantics; co-enabling `full` is explicit and predictable.
  - _Remote/cloud dev environment (Shopify/Uber pattern)_ — solves a scale problem COS does not have
    yet; revisit at Stage 4+ (multi-region, larger team) per the graduation path below.
  - _Convert app services to dev-mode containers (ts-node-dev/uvicorn --reload) for sync-based
    hot-reload_ — larger change to Dockerfiles; `action: rebuild` works with the existing production
    images today. Sync-based hot-reload is a possible follow-up.

## Consequences

### Positive

- "All services start with Docker Compose" is now literally true via `make docker-apps-up-full`.
- Full-stack-in-Docker parity available for debugging cross-service issues without host toolchains.
- No change to the fast `make dev` workflow; default infra-only bring-up is unchanged.

### Negative

- App service images must build on dev machines for `make docker-apps-up-full` (CI already builds them, so low
  risk, but first bring-up is slow — Python/Go/Node multi-stage builds).
- `develop.watch` uses `action: rebuild` (full image rebuild on change), not instant sync — slower
  than native `make dev` hot-reload. Acceptable because `make dev` remains the primary loop.
- Bringing up `apps` requires `full` infra (~4 GB+ plus app containers); not for low-memory machines.

### Neutral

- The `apps` profile does not add an OpenTelemetry collector; `OTEL_EXPORTER_OTLP_ENDPOINT` export
  failures inside containers are non-fatal (matches host behavior when no collector runs).

## Graduation path

If service count grows until laptops/`apps` profile become impractical, move to local-Kubernetes dev
(Tilt/Skaffold) and ultimately a remote/cloud dev environment (the Shopify Spin / Uber Devpod
pattern). Evaluate at Stage 4+.

## References

- `context/phases/phase-01-foundation-repository.md` — Foundation Repository Command (Generate / Constraints)
- QM-18 (PgBouncer / connection pooling — app connects to `pgbouncer`, never `5432`)
- [Docker Compose profiles](https://docs.docker.com/compose/how-tos/profiles/)
- [Docker Compose Watch](https://docs.docker.com/compose/how-tos/file-watch/)
- Shopify Spin, Uber Devpod, Monzo — at-scale local-dev research (run subset / remote env)
