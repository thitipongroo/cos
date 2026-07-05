# @cos/test-utils

Shared test utilities for Construction OS integration and unit tests. Provides testcontainers setup, database reset helpers, and test data factories used across all `services/` and `backend/` packages.

Introduced in Phase 18. Required per QM-11 — see spec §30.13.

## Purpose

- **Testcontainers** — start/stop real infrastructure containers (PostgreSQL, Redis, Kafka, Neo4j, MinIO, ClickHouse, Schema Registry) in integration test suites
- **DB reset** — truncate all domain schemas and optionally reseed between tests
- **Factories** — produce minimal valid payloads (seed data + request DTOs) using the factory_bot pattern; spread overrides to customise any field

## Public API

### containers.ts

```ts
startContainers(opts: TestContainersOptions): Promise<TestContainers>
stopContainers(containers: TestContainers): Promise<void>

// URL helpers
getPostgresUrl(c: StartedPostgreSqlContainer): string
getRedisUrl(c: StartedRedisContainer): string
getKafkaBroker(c: StartedKafkaContainer): string
getNeo4jUrl(c: StartedNeo4jContainer): string
getSchemaRegistryUrl(c: StartedTestContainer): string
getClickHouseUrl(c: StartedClickHouseContainer): string
```

`TestContainersOptions` flags (all optional, default `false`):

| Flag             | Container started                                       |
| ---------------- | ------------------------------------------------------- |
| `postgres`       | PostgreSQL 16                                           |
| `redis`          | Redis 7                                                 |
| `kafka`          | Kafka 7.6 (KRaft mode)                                  |
| `schemaRegistry` | Confluent Schema Registry 7.6 + Kafka on shared network |
| `neo4j`          | Neo4j 5 Community                                       |
| `minio`          | MinIO (latest)                                          |
| `clickhouse`     | ClickHouse 24.4                                         |

### db-reset.ts

```ts
truncateAllTables(client: Client): Promise<void>
resetAndSeed(client: Client, seed: (client: Client) => Promise<void>): Promise<void>
```

Truncates all tables in these PostgreSQL schemas: `platform`, `projects`, `finance`, `procurement`, `workforce`, `equipment`, `documents`, `safety`, `analytics`. Disables foreign-key constraints during truncation.

### factories.ts

**Seed factories** (insert directly into DB via `pg` client):

```ts
buildTenant(overrides?): TenantSeed
buildUser(tenantId, overrides?): UserSeed
buildProject(tenantId, overrides?): ProjectSeed
buildDocument(tenantId, projectId, userId, overrides?): DocumentSeed
buildInvoice(tenantId, projectId, overrides?): InvoiceSeed
```

**Request DTO factories** (POST body for HTTP integration tests):

```ts
buildCreateProjectDto(overrides?): CreateProjectDto
buildCreateVendorDto(overrides?): CreateVendorDto
buildCreatePurchaseRequestDto(overrides?): CreatePurchaseRequestDto
buildCreateRfqDto(projectId, overrides?): CreateRfqDto
buildCreatePurchaseOrderDto(vendorId, projectId, overrides?): CreatePurchaseOrderDto
buildCreateBoqItemDto(categoryId, overrides?): CreateBoqItemDto
buildSetBudgetDto(overrides?): SetBudgetDto
buildCreateSiteReportDto(projectId, overrides?): CreateSiteReportDto
buildCreateWorkerDto(overrides?): CreateWorkerDto
```

All factories produce minimal required fields only. Pass overrides to customise specific fields without rebuilding the entire object.

## Dependencies

| Package                      | Version | Purpose                        |
| ---------------------------- | ------- | ------------------------------ |
| `testcontainers`             | ^10.9.0 | Base container runtime         |
| `@testcontainers/postgresql` | ^10.9.0 | PostgreSQL container           |
| `@testcontainers/redis`      | ^10.9.0 | Redis container                |
| `@testcontainers/kafka`      | ^10.9.0 | Kafka (KRaft) container        |
| `@testcontainers/neo4j`      | ^10.9.0 | Neo4j container                |
| `@testcontainers/minio`      | ^10.9.0 | MinIO container                |
| `@testcontainers/clickhouse` | ^10.9.0 | ClickHouse container           |
| `pg`                         | ^8.21.0 | PostgreSQL client for DB reset |

## Configuration

No environment variables required. Docker must be running on the host machine before calling `startContainers`.

Container images are pulled on first use. For CI environments, pre-pull images in the CI image or cache layer to avoid cold-start timeouts.

## Usage example

```ts
import { Client } from 'pg';
import {
  startContainers,
  stopContainers,
  getPostgresUrl,
  resetAndSeed,
  buildTenant,
  buildUser,
  buildCreateProjectDto,
} from '@cos/test-utils';

let containers: Awaited<ReturnType<typeof startContainers>>;
let pgClient: Client;

beforeAll(async () => {
  containers = await startContainers({ postgres: true });
  pgClient = new Client({ connectionString: getPostgresUrl(containers.postgres!) });
  await pgClient.connect();
});

afterAll(async () => {
  await pgClient.end();
  await stopContainers(containers);
});

beforeEach(async () => {
  await resetAndSeed(pgClient, async (client) => {
    const tenant = buildTenant();
    const user = buildUser(tenant.id);
    await client.query(
      `INSERT INTO platform.tenants (id, name, slug, tier, active, created_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [tenant.id, tenant.name, tenant.slug, tenant.tier, tenant.active, tenant.created_at],
    );
    await client.query(
      `INSERT INTO platform.users (id, tenant_id, email, name, role, created_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [user.id, user.tenant_id, user.email, user.name, user.role, user.created_at],
    );
  });
});

it('creates a project', async () => {
  const dto = buildCreateProjectDto({ project_name: 'My Project' });
  // ... POST to API and assert
});
```
