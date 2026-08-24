---
title: 'Multi-tenant Architecture'
version: '1.5.0'
status: Active
last_updated: '2026-06-05'
authors:
  - thitipongroo
related_docs:
  - 05-security-compliance.md
  - 06-rbac-permission-matrix.md
  - 08-enterprise-deployment.md
  - 11-database-schema.md
---

# 7. Multi-tenant Architecture

## Table of Contents

- [7.1 Tenant Isolation Model](#71-tenant-isolation-model)
  - [Shared DB + tenant_id](#shared-db--tenant_id)
  - [Dedicated DB](#dedicated-db)
- [7.2 Isolation Layers](#72-isolation-layers)
- [7.3 Kafka Topic Isolation](#73-kafka-topic-isolation)
- [7.4 Neo4j Multi-tenancy](#74-neo4j-multi-tenancy)
- [7.5 S3 File Isolation](#75-s3-file-isolation)
- [7.6 Tenant Provisioning Workflow](#76-tenant-provisioning-workflow)
- [7.7 PostgreSQL Schema Convention](#77-postgresql-schema-convention)
- [7.8 Enterprise Provisioning Workflow (Phase 25)](#78-enterprise-provisioning-workflow-phase-25)
- [7.9 Connection Pool Management](#79-connection-pool-management)

---

## 7.1 Tenant Isolation Model

### Shared DB + tenant_id

For SMB scale. **This is the MVP baseline and the standard implementation for all domain modules.**

Implementation standard:

- Every domain table MUST include `tenant_id UUID NOT NULL`
- All SQL queries MUST use schema-qualified table names (e.g., `procurement.vendors`, `projects.projects`)
- PostgreSQL Row Level Security (RLS) MUST be enabled on every domain table — see §7.7
- Application layer MUST also filter by `tenant_id` in every query as defense-in-depth
- Unqualified table names in SQL are prohibited

### Dedicated DB

For enterprise. Activated per tenant on contract — not automatic at plan upgrade.

Deployment-to-isolation mapping :

| Deployment Option        | Isolation Model       |
| ------------------------ | --------------------- |
| Shared SaaS — SMB        | Shared DB + tenant_id |
| Shared SaaS — Mid-market | Shared DB + tenant_id |
| Dedicated Tenant         | Dedicated DB          |
| Hybrid                   | Dedicated DB          |
| Fully On-premise         | Dedicated DB          |

#### dedicated_db_url column

`platform.tenants.dedicated_db_url VARCHAR(500) NULL`

- `NULL` — tenant uses shared DB (`DATABASE_URL` environment variable)
- non-`NULL` — tenant uses its own dedicated PostgreSQL instance at the stored URL

The column is set by SYSTEM_ADMIN at one of two points:

- **At tenant creation** (`POST /api/v1/admin/tenants`) — optional field; use when the dedicated DB is
  already provisioned before the tenant record is created.
- **After creation** (`PATCH /api/v1/admin/tenants/{tenantId}/dedicated-db`) — use when upgrading an
  existing tenant from shared DB to dedicated DB.

See runbook: `docs/runbooks/dedicated-db-provisioning.md`.

#### Routing mechanism — HTTP requests

Tenant context is resolved **during JWT authentication**, not in a pre-auth middleware.
NestJS runs middleware _before_ guards, so a pre-auth middleware cannot read `req.user`
(which the Passport `KeycloakJwtStrategy` / `JwtAuthGuard` populates). Resolution therefore
happens after auth (see ADR-031):

1. `KeycloakJwtStrategy.validate()` rejects tokens missing `tenant_id`/`role`, queries
   `platform.tenants` for `tenant_code` and `dedicated_db_url`, verifies the tenant is
   active, and attaches them to `req.user` (`AuthenticatedUser`).
2. `JwtAuthGuard.handleRequest()` publishes the authenticated context
   (`tenant_id, user_id, role, tenantCode, dedicatedDbUrl`) into CLS (AsyncLocalStorage via
   `nestjs-cls`). This is the **reliable** channel: under `@nestjs/platform-fastify` the request is
   cloned, so Passport's `req.user` does not survive into downstream guards / interceptors /
   providers. `ClsModule.forRoot({ global: true, middleware: { mount: true, useEnterWith: true } })`
   opens the context for every request (`useEnterWith: true` is required under Fastify, whose
   middleware does not await the rest of the request inside `cls.run()`). The global
   `TenantContextInterceptor` still projects `req.user.*` onto `req.{tenantId, userId, userRole,
tenantCode, dedicatedDbUrl}` as a secondary path for code that reads `req` directly (handlers fall
   back to CLS, e.g. `req.userId ?? clsUserId()`).
3. `TenantPrismaService` (a **singleton**) reads that context from CLS in `run()` and connects
   as the non-superuser **`app_user`** role (`APP_DATABASE_URL`, or `dedicatedDbUrl` for
   Enterprise) so RLS is actually enforced; each call is wrapped in a transaction that runs
   `SET LOCAL app.current_tenant_id`. It caches one `PrismaClient` per datasource URL. (It was
   originally request-scoped + read `req.user`; that broke under Fastify's request cloning)
4. All domain queries in that request use the resolved DB URL + role.

`platform.*` tables and cross-tenant/admin operations are always accessed via the privileged
`DATABASE_URL` (role `cos`) regardless of tier — they do **not** use `app_user`, and the
platform schema never moves to a dedicated DB.

> NOTE: a pre-auth `TenantMiddleware` was originally specified here; it is retained only as a type holder and is not
> registered, because middleware cannot see `req.user` under NestJS ordering.

#### Routing mechanism — non-HTTP paths (Temporal activities, Kafka consumers)

Temporal activities and Kafka consumers have no HTTP request context. They resolve the DB URL
by calling a tenant DB-URL resolution utility (`getDbUrlForTenant(tenantId)` in the tenant module):

1. Queries `platform.tenants.dedicated_db_url` using `DATABASE_URL` (platform DB — always shared)
2. Returns `dedicated_db_url` if non-NULL, else `DATABASE_URL`
3. PrismaClient is created with the resolved URL for that activity/consumer invocation

#### Platform schema isolation rule

`platform.*` tables (`platform.tenants`, `platform.users`, `platform.tenant_memberships`,
`platform.audit_logs`) are **always** on the shared DB. They are never replicated to or
accessed from a dedicated DB.

---

## 7.8 Enterprise Provisioning Workflow (Phase 25)

When an Enterprise tenant signs a contract, `EnterpriseProvisioningWorkflow` automates the
full dedicated DB setup. Defined in spec §15.7, Phase 25 command, and [34-enterprise-tenant-provisioning.md](34-enterprise-tenant-provisioning.md).

### Trigger paths

| Path        | Mechanism                                                                     |
| ----------- | ----------------------------------------------------------------------------- |
| Admin Panel | `PATCH /api/v1/admin/tenants/:tenantId/mark-contracted` (SYSTEM_ADMIN)        |
| CRM webhook | `POST /api/v1/platform/webhooks/enterprise-contract-signed` (generic payload) |

Both paths start the Temporal workflow directly via `TemporalClient.start()` and emit
`platform.enterprise.contract_signed.v1`.

### Workflow state machine

```text
PENDING
  → [createRdsActivity]       AWS SDK CreateDBInstance
      db.t3.medium, 100 GB GP3, per-tenant KMS key, VPC dedicated subnet group
      Compensation: DeleteDBInstance
PENDING
  → [runMigrationsActivity]   prisma migrate deploy against new DB URL
PENDING
  → [assignDedicatedDbActivity] SET platform.tenants.dedicated_db_url
      Compensation: SET dedicated_db_url = NULL
AWAITING_APPROVAL
  ← notify SYSTEM_ADMIN (in-app + email)
  ← wait for signal: approve | abort  (no timeout — waits indefinitely)
  → abort signal  → ABORTED  (compensation: assignDedicatedDb)
  → approve signal
PENDING
  → [migrateDataActivity]     pg_dump + psql from shared DB
      Conditional: skipped if tenant has no existing domain data
      No auto-compensation — SYSTEM_ADMIN must coordinate manually
PENDING
  → [verifyRoutingActivity]   test query against dedicated DB; assert non-NULL response
COMPLETED
  → emit platform.enterprise.db_provisioned.v1 { tenant_id, rds_endpoint }
```

### Idempotency requirement

Before starting the workflow, the service MUST check whether a workflow for the same
`tenant_id` is already running or completed. If so, reject with `409 Conflict`.
Use Temporal `workflowId = enterprise-provisioning-{tenant_id}` — Temporal enforces
uniqueness per workflow ID.

### RDS parameters (defaults — override per contract)

| Parameter         | Default value                            |
| ----------------- | ---------------------------------------- |
| Instance class    | `db.t3.medium`                           |
| Storage           | 100 GB GP3, auto-scale to 1 TB           |
| Backup retention  | 7 days                                   |
| Encryption        | Per-tenant KMS key (not shared)          |
| Naming convention | `cos-tenant-{tenant_code}-{environment}` |
| VPC               | Same VPC; dedicated subnet group         |
| Security group    | Allow EKS node SG on port 5432 only      |

See Terraform module: `infrastructure/terraform/modules/rds-tenant/`

---

## 7.2 Isolation Layers

Each isolation layer is fully specified in its authoritative section — this table is a summary with cross-references only.

| Layer                    | Mechanism                                                                           | Authoritative spec |
| ------------------------ | ----------------------------------------------------------------------------------- | ------------------ |
| Authentication isolation | Keycloak realm per tier; `tenant_id` + `role` claims enforced in JWT                | §5.4               |
| Data isolation           | `tenant_id` column on every domain table + PostgreSQL RLS                           | §7.1, §7.7         |
| Queue isolation          | Kafka topic prefix `{tenant_id}.` on all topics; `tenant_id` in message headers     | §7.3               |
| File isolation           | S3/MinIO key prefix `{tenant_id}/{project_id}/` on all objects                      | §7.5               |
| Encryption keys          | Per-tenant key stored in AWS Secrets Manager (cloud) / HashiCorp Vault (on-premise) | §7.6 step 7        |

---

## 7.3 Kafka Topic Isolation

Topic naming format :

- `{tenant_id}.{domain}.{entity}.{action}.{version}`
- Example: `tenant_abc.construction.task.created.v1`

Isolation by tier :

- SMB / Mid-market — shared Kafka **cluster/infrastructure**; topics are per-tenant using the `{tenant_id}.`
  prefix above; tenant_id is also enforced in message headers as a secondary validation guard; consumer validates header
  before processing
- Enterprise — dedicated Kafka namespace (MSK namespace isolation or separate MSK cluster for fully on-premise)

> 📎 See [15-event-driven-workflow §15.6](15-event-driven-workflow.md) for the canonical distinction between
> Kafka topic names (`{tenant_id}.domain.entity.action.v1`) and CloudEvents `type` field (`domain.entity.action.v1`).

Consumer group naming :

- Shared: `{service_name}.shared`
- Enterprise: `{service_name}.{tenant_id}`

Dead-letter queues :

- Tenant-scoped — DLQ for tenant A cannot receive messages from tenant B
- Naming: `{tenant_id}.dlq` — **one DLQ per tenant, not one per tenant-and-domain**. The isolation
  guarantee above is about tenants, and a single tenant-scoped DLQ satisfies it exactly; a DLQ per
  domain multiplied every tenant's topic count by the number of domains (ten) for a separation this
  spec never required. The originating domain remains recoverable from the `dlq.original_topic`
  header carried on every DLQ message.

Topic provisioning :

- **Created on first publish, not at tenant onboarding.** `KafkaProducer` creates a tenant's topic
  the first time an event needs it, so topic count scales with what a tenant actually uses rather
  than with customer headcount. Eagerly provisioning the whole catalogue cost 46 topics — 138
  partitions, 414 replicas at RF=3 — per tenant regardless of usage, which makes broker capacity a
  function of how many customers exist rather than how much traffic they generate.
- `auto.create.topics.enable` is **false** on all real brokers (MSK and Kubernetes), so creation is
  performed explicitly by the application, never implicitly by Kafka.
- **Exception — enterprise tier:** an enterprise tenant gets a dedicated namespace or cluster, so
  its topic count is bounded by one tenant's catalogue. Eager provisioning is retained there
  (`provisionKafkaTopicsActivity`), where the scaling argument above does not apply.

Topic lifecycle management :

**Retention policy (default):**

| Tier                              | Time Retention                             | Size Limit              | Scope                        |
| --------------------------------- | ------------------------------------------ | ----------------------- | ---------------------------- |
| SMB / Mid-market (shared cluster) | 7 days (`log.retention.hours=168`)         | 10 GB per partition     | AWS MSK topic-level config   |
| Enterprise (dedicated namespace)  | 30 days (default); negotiable per contract | 50 GB per partition     | Dedicated MSK cluster config |
| DLQ — SMB / Mid-market            | 14 days (2× the 7-day standard)            | Same as SMB tier        | AWS MSK topic-level config   |
| DLQ — Enterprise                  | 60 days (2× the 30-day standard)           | Same as Enterprise tier | Dedicated MSK cluster config |

**Topic provisioning — creation procedure:**

Topics are created **explicitly** — producers run with `allowAutoTopicCreation: false`; the broker's
auto-create is never relied upon. The full canonical event catalogue (§32.4) is materialised per
tenant, created idempotently at tenant onboarding:

1. **Per-tenant topic set:** one `{tenant_id}.{domain}.{entity}.{action}.v{N}` topic per
   **non-platform** canonical event type, plus a single `{tenant_id}.dlq` for the whole tenant.
2. **Shared platform topics** (created once, not per tenant): `platform.events` and `platform.dlq` (§15.7).
3. **Trigger:**
   - **SMB / Mid-market (shared cluster):** created **on first publish**, not at onboarding.
     `KafkaProducer` creates the topic the first time an event needs it and caches the fact for the
     process lifetime; the DLQ is created on a tenant's first failed message. Materialising the whole
     catalogue at onboarding was removed because it made broker capacity scale with customer count
     rather than traffic — 46 topics, 138 partitions, 414 replicas at RF=3 for every tenant,
     overwhelmingly never written to.
   - **Enterprise (dedicated namespace):** created by the Phase 25 `EnterpriseProvisioningWorkflow`
     (`provisionKafkaTopicsActivity`), after routing verification and before the
     `platform.enterprise.db_provisioned.v1` go-live event.
   - **Local development:** the seed script provisions the dev tenant, the `platform` pseudo-tenant
     (used by tenant-lifecycle `identity.*` events emitted with `tenant_id = "platform"`), and the
     shared platform topics.
4. **Idempotency:** creation is idempotent in both paths — `createTopics` resolves false when the
   topic already exists, so two services racing on a tenant's first event, a re-run of the seed, or
   an operator re-provisioning a cluster all produce no broker errors.

**Consumer subscription (shared cluster):** a shared-group consumer subscribes to each canonical
event type via a **per-tenant topic RegExp** (`^[^.]+\.{domain}\.{entity}\.{action}\.v{N}$`), so a
single `{service_name}.shared` group consumes every tenant's topics — including topics for tenants
onboarded after the consumer started. The `tenant_id` message header is validated against the
decoded envelope before processing; a missing or mismatched header routes the message to the DLQ.

**Tenant offboarding — topic cleanup procedure:**

When a tenant is deprovisioned, execute in this order:

1. Halt all consumer groups scoped to the tenant (`{service_name}.{tenant_id}` groups for Enterprise; for
   SMB / Mid-market, halt per-tenant processing at the service layer — shared consumer groups continue serving other tenants)
2. Wait for in-flight messages to drain — poll consumer lag until lag = 0, or timeout after 30 minutes, whichever
   comes first
3. Publish `platform.tenant.deprovisioned.v1` on the platform management topic (triggers downstream cleanup in all
   subscribing services)
4. **SMB / Mid-market:** messages carry `tenant_id` in headers — natural expiry per retention policy is preferred;
   if PDPA/GDPR requires immediate erasure, delete and recreate affected topic partitions (destructive — requires
   operator sign-off)
5. **Enterprise:** delete the dedicated Kafka namespace and all topics within it (irreversible; requires operator
   sign-off + 24-hour hold before execution)
6. Remove all Kafka ACL entries associated with the tenant
7. Record in the immutable audit log:
   `{ event: "kafka.tenant.topics.deleted", tenant_id, topic_count, namespace,deleted_at, operator }`

Note: Steps 4 and 5 are irreversible. Never execute without written deprovisioning authorization from the tenant
or a legal hold release.

---

## 7.4 Neo4j Multi-tenancy

Strategy :

- SMB / Mid-market — shared Neo4j database; all graph nodes include `tenant_id` property; all queries
  include `WHERE n.tenant_id = $tenant_id` guard clause enforced at service layer
- Enterprise — dedicated Neo4j database per tenant (Neo4j Enterprise supports multiple named databases per instance)

Query enforcement :

- The `tenant_id` guard clause is enforced in the Knowledge Graph Service — never passed as an external API parameter
- Integration tests validate that cross-tenant graph traversal returns zero results

---

## 7.5 S3 File Isolation

Key prefix format :

- `{tenant_id}/{project_id}/{file_type}/{filename}`
- Example: `tenant_abc/proj_001/drawings/floor-plan-v3.pdf`

Access controls :

- S3 bucket policy denies any request where the key prefix does not start with the caller's authorized tenant_id
- Pre-signed URLs are scoped to the tenant prefix — a URL for tenant A cannot access tenant B files
- Enterprise tenants may optionally use a dedicated S3 bucket; this is configured at tenant provisioning time

---

## 7.6 Tenant Provisioning Workflow

Steps :

1. Tenant registration request received (via platform admin API)
2. Tenant record created in `tenants` table with unique `tenant_id` (UUID)
3. Keycloak assignment: shared realm for SMB/mid-market; dedicated realm created for enterprise.
   **Protocol mappers MUST be configured** on every realm (shared or dedicated) per `05-security-compliance`
   §5.4.2 — mappers for `tenant_id`, `user_id`, and `role` are required before any user can authenticate.
   Missing mappers cause Kong Gateway to reject all requests.
4. Database provisioning:
   - SMB: no migration needed — `tenant_id` already in all tables
   - Mid-market: no migration needed — same Shared DB + tenant_id model as SMB
   - Enterprise: new database provisioned and migrated
5. Kafka namespace initialized
6. S3 prefix initialized (zero-byte marker object written to confirm access)
7. Encryption key generated and stored, keyed by `tenant_id` — AWS Secrets Manager (cloud deployments);
   HashiCorp Vault (on-premise and hybrid deployments — see 04-tech-stack section 4.4)
8. Default roles seeded per RBAC matrix (see 06-rbac-permission-matrix)
9. Provisioning event published: `platform.tenant.provisioned.v1`
10. Welcome notification dispatched to tenant admin (see 19-notification-architecture)

---

## 7.7 PostgreSQL Schema Convention

One named PostgreSQL schema per domain module. All schemas are global (shared across tenants); tenant isolation is
enforced by `tenant_id` column + RLS.

### Schema registry

| PostgreSQL Schema     | Module / Purpose                           | tenant_id required                                                  | Notes                                                                                |
| --------------------- | ------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `platform`            | Identity, Tenant system                    | No (cross-tenant)                                                   | Holds `tenants`, `users`, `tenant_memberships`, `audit_logs`                         |
| `projects`            | Project Management                         | Yes                                                                 |                                                                                      |
| `boq`                 | Bill of Quantities                         | Yes                                                                 |                                                                                      |
| `procurement`         | Procurement                                | Yes                                                                 |                                                                                      |
| `site_ops`            | Site Operations                            | Yes                                                                 |                                                                                      |
| `finance`             | Finance                                    | Yes                                                                 |                                                                                      |
| `files`               | File Service                               | Yes                                                                 |                                                                                      |
| `notifications`       | Notification Service                       | Yes (nullable on `notification_templates` — null = system template) |                                                                                      |
| `equipment`           | Equipment Service                          | Yes                                                                 |                                                                                      |
| `workforce`           | Workforce Service                          | Yes                                                                 |                                                                                      |
| `ai`                  | AI Token Tracking                          | Yes                                                                 |                                                                                      |
| `equipment_telemetry` | IoT Telemetry (TimescaleDB)                | Yes                                                                 | Hypertable — partitioned by `recorded_at`                                            |
| `workforce_telemetry` | Attendance / Biometric (TimescaleDB)       | Yes                                                                 | Hypertable — partitioned by `recorded_at`                                            |
| `digital_twin`        | Digital Twin / IoT (TimescaleDB, Phase 24) | Yes                                                                 | TwinState hypertable — partitioned by `recorded_at`; see `33-digital-twin-iot` §33.4 |

> **Future schemas (not yet provisioned):** CRM entities (Lead, Opportunity, Contact, Customer) and
> additional master-data entities (Material, etc.) in `11-database-schema` §11.2 receive their owning
> schema when implemented post-MVP (CRM UI is excluded from MVP per §21.6). Vendor master data lives in
> the `procurement` schema. Until then, those entities are spec-defined but not yet physical tables.

### RLS policy standard

Every domain table (all schemas except `platform`) MUST have RLS enabled, with **exactly one
`AS PERMISSIVE` policy** named `rls_tenant_isolation`:

```sql
ALTER TABLE {schema}.{table} ENABLE ROW LEVEL SECURITY;
ALTER TABLE {schema}.{table} FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_tenant_isolation ON {schema}.{table}
  AS PERMISSIVE
  FOR ALL
  TO app_user
  USING (
    -- NULLIF: an empty/unset GUC yields NULL → zero rows, instead of an
    -- "invalid input syntax for uuid" error (ADR-031).
    tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid
  )
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid);
```

**Use `AS PERMISSIVE`, not `AS RESTRICTIVE`**: PERMISSIVE policies are OR-combined,
RESTRICTIVE are AND-combined — but a _lone_ RESTRICTIVE policy grants no access at all (RESTRICTIVE
narrows; it never grants), so the table would deny every row. With exactly one policy per table the
OR/AND distinction is moot, so the canonical form is a single PERMISSIVE policy (matching AWS SaaS
Factory and Crunchy Data). Keep it to ONE tenant-isolation policy per table: a second permissive
"lookup/read-all" policy would OR-widen access across tenants. Defence-in-depth comes from the
non-owner `app_user` role + application-layer `WHERE tenant_id`, not from a second RLS policy.

`app.current_tenant_id` is set by the application at the start of every request before any query
executes (via `TenantPrismaService.run()`, which wraps each call in a transaction running
`SET LOCAL app.current_tenant_id`).

### Query convention

All SQL in repositories MUST use schema-qualified names:

```sql
-- Correct
SELECT * FROM procurement.vendors WHERE tenant_id = $1;
INSERT INTO finance.project_budgets (tenant_id, ...) VALUES ($1, ...);

-- Prohibited
SELECT * FROM vendors WHERE tenant_id = $1;
```

---

## 7.9 Connection Pool Management

Direct application-to-PostgreSQL connections do not scale in the shared-DB multi-tenant
model: each pod holds a connection pool, and with many tenants and replicas PostgreSQL
`max_connections` is exhausted. A connection pooler is mandatory.

### Pooler: PgBouncer

**PgBouncer is the required connection pooler** for all environments (local, staging, production).

| Deployment | Location                                                                        | Mode        |
| ---------- | ------------------------------------------------------------------------------- | ----------- |
| Local dev  | Docker Compose container (`cos-pgbouncer`)                                      | transaction |
| Kubernetes | `infrastructure/kubernetes/pgbouncer/` — Deployment + Service + ConfigMap + PDB | transaction |

Kubernetes PodDisruptionBudget: `minAvailable: 1`.

### Pool mode: transaction (REQUIRED)

`SET LOCAL app.current_tenant_id` is transaction-scoped and reverts on `COMMIT`/`ROLLBACK`,
making transaction pooling safe.

- **Session mode — PROHIBITED**: incompatible with horizontal pod autoscaling.
- **Statement mode — PROHIBITED**: incompatible with multi-statement transactions.

### Connection routing rule

Application `DATABASE_URL` must resolve to PgBouncer, never directly to PostgreSQL port `5432`.
An integration test must assert the connection string resolves to PgBouncer.

### Baseline configuration

| Parameter             | Value           | Notes                                             |
| --------------------- | --------------- | ------------------------------------------------- |
| `default_pool_size`   | 25 per database | Tune before Stage 2 based on Grafana observations |
| `max_client_conn`     | 1000            |                                                   |
| `server_idle_timeout` | 600 s           |                                                   |
| `pool_mode`           | transaction     | See above                                         |

### Grafana metrics (required)

`pgbouncer_pools_client_active`, `pgbouncer_pools_server_active`,
`pgbouncer_pools_client_waiting`, `pgbouncer_databases_pool_size`

Alert: fire P2 incident when `client_waiting > 10` sustained for > 30 seconds.

### Tenant scale limit

Before Stage 2 go-live, load-test the PgBouncer + PostgreSQL stack and record the maximum
concurrent tenants at acceptable latency in `docs/architecture/tenant-scale-limits.md`.
This threshold determines when database sharding evaluation must begin.

---

## References

| ID               | Title                                                              | Source                                                                          |
| ---------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| [IEEE 830]       | IEEE Recommended Practice for Software Requirements Specifications | IEEE Std 830-1998                                                               |
| [PostgreSQL-RLS] | PostgreSQL Row Security Policies                                   | [ddl-rowsecurity](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) |
| [Kafka]          | Apache Kafka Documentation                                         | [kafka/documentation](https://kafka.apache.org/documentation/)                  |
| [Neo4j]          | Neo4j Graph Database Documentation                                 | [neo4j/docs](https://neo4j.com/docs/)                                           |
| [Keycloak]       | Keycloak Server Documentation                                      | [keycloak/documentation](https://www.keycloak.org/documentation)                |
| [MinIO]          | MinIO Object Storage Documentation                                 | [min/docs](https://min.io/docs/minio/linux/index.html)                          |
| [Kubernetes]     | Kubernetes Documentation                                           | [kubernetes/docs](https://kubernetes.io/docs/home/)                             |

> 📎 See also: [05-security-compliance](05-security-compliance.md)
> · [06-rbac-permission-matrix](06-rbac-permission-matrix.md) · [08-enterprise-deployment](08-enterprise-deployment.md)
> · [11-database-schema](11-database-schema.md)
