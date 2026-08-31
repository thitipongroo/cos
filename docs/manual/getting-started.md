---
title: Construction OS — Getting Started
last_updated: 2026-08-07
---

# Getting Started

From a clean checkout to a running backend with seeded data.

## Prerequisites

Read from `package.json` and `context/00_master_construction_os.md` § Tooling on 2026-08-07:

| Tool     | Required                                                             | Where it is pinned                                                                       |
| -------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Node.js  | **≥ 24.0.0**                                                         | root `package.json` → `engines.node`; Docker images use `node:24-alpine`                 |
| pnpm     | **≥ 11.0.0** (11.x line)                                             | root `package.json` → `engines.pnpm`; `packageManager` pins the exact build via Corepack |
| Docker   | 24.x + Compose v2                                                    | `docker-compose.yml`                                                                     |
| Python 3 | for `apps/mobile/scripts/stitch-fullpage.py` and the Python services | `services/ai-*`                                                                          |

Only the pnpm **major** line (11) is normative — a patch or minor bump is not a spec deviation.

## First run

```bash
# 1. Environment file (two-file scheme, spec §08). The committed dev defaults already work;
#    staging/production never run from a file — secrets come from Vault / AWS Secrets Manager.
cp .env.example .env

# 2. Dependencies (repo root — this does NOT install apps/mobile, see below)
pnpm install

# 3. Infrastructure. `make docker-up` starts the ESSENTIAL tier only — PostgreSQL+TimescaleDB,
#    PgBouncer, Redis, Kafka, Schema Registry, MinIO. OpenSearch, Neo4j, ClickHouse, ClamAV,
#    Vault (dev), Keycloak, Temporal and EMQX sit behind the `full` Compose profile:
make docker-up-full

# 4. Migrations, then master data
make migrate
make seed

# 5. Backend in dev mode
make dev
```

`make help` lists every target. The ones you will use most:

| Target                                                           | What it does                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------- |
| `make dev` / `dev-backend` / `dev-web`                           | Turbo dev on the host (the day-to-day mode)             |
| `make docker-up` / `docker-up-full`                              | Infrastructure only / plus the optional tier            |
| `make docker-apps-up-full`                                       | App services in containers too (ADR-036 `apps` profile) |
| `make migrate` / `migrate-dev` / `seed`                          | Prisma deploy / dev migration / seed                    |
| `make test` / `test-unit` / `test-integration` / `test-coverage` | The test tiers                                          |
| `make lint` / `type-check` / `build`                             | The three CI gates you can run locally                  |
| `make ci-check`                                                  | Everything CI runs, in one target                       |

## Connect through PgBouncer, not PostgreSQL

QM-18 makes the pooler mandatory in **every** environment, in **transaction mode**. Session mode and
statement mode are prohibited — `SET LOCAL app.current_tenant_id`, which is how RLS scopes a request
to a tenant, is transaction-scoped and would leak or vanish under the other modes. The dev
`DATABASE_URL` in `.env.example` already points at PgBouncer (`localhost:6432`), not `5432`. The one
exception is `DIRECT_DATABASE_URL`, which Prisma migrations use to reach PostgreSQL directly.

## apps/mobile installs separately

`apps/mobile` is **excluded from the root pnpm workspace** (`!apps/mobile` in `pnpm-workspace.yaml`).
React Native + Expo + Metro + CocoaPods require a flat `node_modules`, which pnpm's isolated linker
breaks. It is its own workspace root with `nodeLinker: hoisted` in
`apps/mobile/pnpm-workspace.yaml` — note that pnpm 10/11 reads the linker setting from **that file,
not `.npmrc`**.

```bash
cd apps/mobile && pnpm install
```

This exclusion is required, not a deviation. See [mobile.md](mobile.md).

## Verifying the setup

```bash
curl http://localhost:3000/api/v1/health/live     # backend liveness
curl http://localhost:3000/api/v1/health/ready    # dependencies reachable
make test-unit                                    # fast, no Docker needed
```

Coverage is enforced at **100% lines and 100% branches** (QM-1). `pnpm --filter @cos/backend test:cov`
runs the parallel unit suite; Temporal `*.workflow.spec.ts` run **serially** via
`pnpm --filter @cos/backend test:workflows` (parallel `TestWorkflowEnvironment` time-skipping servers
starve each other).

> 📎 Root [`README.md`](../../README.md) § Getting Started for the same flow with more detail on the
> Docker Compose profiles · [tech-stack.md](tech-stack.md) for what each container is.
