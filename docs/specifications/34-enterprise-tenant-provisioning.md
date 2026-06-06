---
title: 'Enterprise Tenant Provisioning Automation'
version: '1.0.0'
status: Active
last_updated: '2026-06-06'
authors:
  - thitipongroo
related_docs:
  - 07-multi-tenant-architecture.md
  - 08-enterprise-deployment.md
  - 11-database-schema.md
  - 15-event-driven-workflow.md
  - 19-notification-architecture.md
  - 32-implementation-specifications.md
---

# 34. Enterprise Tenant Provisioning Automation

## Table of Contents

- [34.0 Standards Reference](#340-standards-reference)
- [34.1 Overview and Scope](#341-overview-and-scope)
- [34.2 Trigger Paths](#342-trigger-paths)
- [34.3 Workflow State Machine](#343-workflow-state-machine)
- [34.4 Activity Definitions](#344-activity-definitions)
- [34.5 Human Gate — AWAITING_APPROVAL](#345-human-gate--awaiting_approval)
- [34.6 CRM Webhook — Signature Verification](#346-crm-webhook--signature-verification)
- [34.7 Idempotency](#347-idempotency)
- [34.8 Infrastructure (IaC)](#348-infrastructure-iac)
- [34.9 Kafka Events](#349-kafka-events)
- [34.10 Notification Routing](#3410-notification-routing)
- [34.11 API Endpoints](#3411-api-endpoints)
- [34.12 Schema Isolation Rule](#3412-schema-isolation-rule)
- [34.13 Exit Criteria](#3413-exit-criteria)

---

## 34.0 Standards Reference

| Domain           | Standard                                | Version | Role                                                                                     |
| ---------------- | --------------------------------------- | ------- | ---------------------------------------------------------------------------------------- |
| Workflow engine  | Temporal                                | —       | Normative — durable execution, signal handlers, compensation                             |
| Event envelope   | CloudEvents                             | v1.0    | Normative — event envelope format (see 15-event-driven-workflow §15.6)                   |
| Event schema     | Apache Avro / Confluent Schema Registry | —       | Normative — schema format and compatibility (see 32-implementation-specifications §32.4) |
| Webhook security | HMAC-SHA256                             | —       | Normative — request signature verification for CRM webhook                               |
| IaC              | HashiCorp Terraform                     | ~> 5.0  | Normative — AWS RDS provisioning module                                                  |
| Database         | AWS RDS PostgreSQL 15                   | 15      | Normative — dedicated DB per Enterprise tenant                                           |

**Normative** = implementation must comply.

---

## 34.1 Overview and Scope

Phase 25 — Enterprise Tenant Provisioning Automation.

When an Enterprise tenant signs a contract, `EnterpriseProvisioningWorkflow` automates the
full dedicated RDS setup. This phase adds:

- Two trigger paths: Admin Panel PATCH endpoint and generic CRM webhook
- A Temporal workflow with 5 activities, human-in-the-loop gate, and compensation logic
- Terraform IaC module for per-tenant RDS instance
- Kafka events for provisioning lifecycle
- Notification routing to SYSTEM_ADMIN users

**Prerequisites:** Phase 2 (Auth + Tenant), Phase 8 (Event Infrastructure — Temporal + Kafka), Phase 20 (Notification Service).

---

## 34.2 Trigger Paths

Both paths start `EnterpriseProvisioningWorkflow` via `TemporalClient.start()` and emit
`platform.enterprise.contract_signed.v1`.

| Path        | Endpoint                                                    | Actor        | Auth                         |
| ----------- | ----------------------------------------------------------- | ------------ | ---------------------------- |
| Admin Panel | `PATCH /api/v1/admin/tenants/:tenantId/mark-contracted`     | SYSTEM_ADMIN | JWT Bearer                   |
| CRM webhook | `POST /api/v1/platform/webhooks/enterprise-contract-signed` | CRM system   | HMAC-SHA256 signature header |

### Admin Panel path

Request body (optional):

```json
{ "contractReference": "CRM-CONTRACT-2026-00142" }
```

`contractReference` — string, maxLength 255. Stored in the Kafka event payload.

### CRM webhook path

Header: `X-Webhook-Signature: sha256=<hex>`

Body: any JSON payload containing `tenant_id` (UUID) and optionally `contract_reference` (string).

Actor is recorded as `"system"` for audit purposes.

---

## 34.3 Workflow State Machine

Task queue: `enterprise-provisioning`
Workflow ID: `enterprise-provisioning-{tenantId}`

```text
START
  │
  ▼
CREATING_RDS ──[createRdsActivity]──────────────────── AWS CreateDBInstance
  │                                                     Compensation: DeleteDBInstance
  ▼
RUNNING_MIGRATIONS ──[runMigrationsActivity]─────────── prisma migrate deploy
  │
  ▼
ASSIGNING_DB ──[assignDedicatedDbActivity]────────────── SET tenants.dedicated_db_url
  │                                                      Compensation: SET dedicated_db_url = NULL
  ▼
AWAITING_APPROVAL ◄── notify all SYSTEM_ADMIN (in-app + email)
  │                    wait indefinitely for signal
  ├── abort signal ──► ABORTING ──[compensateAssignDedicatedDb]──► ABORTED
  │
  └── approve signal
          │
          ▼
      MIGRATING_DATA ──[migrateDataActivity]──────────── pg_dump + psql (conditional)
          │
          ▼
      VERIFYING ──[verifyRoutingActivity]─────────────── test query → dedicated DB
          │
          ▼
      COMPLETED ──[emitProvisionedEventActivity]────────── emit db_provisioned.v1
```

Signals: `approve`, `abort`
Query: `workflowState` — returns current state string

---

## 34.4 Activity Definitions

| #   | Activity                         | State after        | Description                                                                                                       | Compensation                             |
| --- | -------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 1   | `createRdsActivity`              | CREATING_RDS       | AWS `CreateDBInstance` — PostgreSQL 15, db.t3.medium, 100 GB GP3, per-tenant KMS key                              | `DeleteDBInstance`                       |
| 2   | `runMigrationsActivity`          | RUNNING_MIGRATIONS | `prisma migrate deploy` against new DB URL via `execSync`                                                         | None                                     |
| 3   | `assignDedicatedDbActivity`      | ASSIGNING_DB       | `UPDATE platform.tenants SET dedicated_db_url = ?`                                                                | `SET dedicated_db_url = NULL`            |
| —   | `notifyAwaitingApprovalActivity` | AWAITING_APPROVAL  | Insert notification rows for all SYSTEM_ADMIN users                                                               | None                                     |
| 4   | `migrateDataActivity`            | MIGRATING_DATA     | `pg_dump` from shared DB + `psql` to dedicated DB. **Conditional:** skipped if tenant has no existing domain data | None — SYSTEM_ADMIN coordinates manually |
| 5   | `verifyRoutingActivity`          | VERIFYING          | Run test query against dedicated DB; assert non-NULL response                                                     | None                                     |
| —   | `emitProvisionedEventActivity`   | COMPLETED          | Publish `platform.enterprise.db_provisioned.v1` Kafka event                                                       | None                                     |

Activities 4 and 5 only execute after `approve` signal. On `abort` signal, only compensation
for Activity 3 runs (`compensateAssignDedicatedDbActivity`).

---

## 34.5 Human Gate — AWAITING_APPROVAL

After Activity 3 completes:

1. `notifyAwaitingApprovalActivity` queries all users with role `SYSTEM_ADMIN` and inserts
   one notification record per user.
2. Workflow pauses at `await condition(() => approved || aborted)` — **no timeout**.
3. SYSTEM_ADMIN sends signal via Admin Panel or API:
   - `approve` → continue to Activities 4-5
   - `abort` → run compensation, reach ABORTED state

---

## 34.6 CRM Webhook — Signature Verification

Environment variable: `PLATFORM_WEBHOOK_SECRET`

Verification algorithm:

1. Capture raw request body as `Buffer` via Fastify `addContentTypeParser`.
2. Compute `expectedSig = "sha256=" + HMAC-SHA256(secret, rawBody).hexDigest()`.
3. Compare `X-Webhook-Signature` header vs `expectedSig` using `timingSafeEqual`.
4. Missing secret or missing rawBody → `500 Internal Server Error`.
5. Missing or invalid signature → `401 Unauthorized`.

---

## 34.7 Idempotency

Before starting the workflow:

- Check tenant exists, `plan_type === 'ENTERPRISE'`, `is_active === true`, `dedicated_db_url === null`.
- Call `TemporalClient.start()` with `workflowId = enterprise-provisioning-{tenantId}`.
- If workflow already exists, Temporal throws `WorkflowExecutionAlreadyStartedError` → respond `409 Conflict`.

---

## 34.8 Infrastructure (IaC)

Terraform module: `infrastructure/terraform/modules/rds-tenant/`

| File           | Purpose                                                            |
| -------------- | ------------------------------------------------------------------ |
| `main.tf`      | Security group, subnet group, RDS instance, Secrets Manager secret |
| `variables.tf` | 11 input variables                                                 |
| `outputs.tf`   | 4 outputs: endpoint, port, secret ARN, SG ID                       |
| `README.md`    | Module usage documentation                                         |

### RDS instance configuration

| Parameter              | Value                                                  |
| ---------------------- | ------------------------------------------------------ |
| Engine                 | PostgreSQL 15                                          |
| Instance class         | `db.t3.medium` (default; negotiable per contract)      |
| Storage type           | GP3                                                    |
| Allocated storage      | 100 GB (auto-scales to 1 TB)                           |
| Encryption             | KMS — per-tenant key (`kms_key_arn` variable)          |
| Multi-AZ               | `true` in `prod`, `false` otherwise                    |
| Deletion protection    | `true` in `prod`                                       |
| Backup retention       | 7 days (default)                                       |
| Network access         | Port 5432 from EKS node security group only            |
| Connection URL storage | AWS Secrets Manager (`cos/tenant/{code}/{env}/db-url`) |

Resource naming: `cos-tenant-{tenant_code}-{environment}`

---

## 34.9 Kafka Events

All platform-level events are published to the shared `platform.events` topic.
Namespace: `com.constructionos.events.platform`

### platform.enterprise.contract_signed.v1

Emitted when a contract is marked signed (either trigger path).

Avro schema: `packages/@cos/shared/src/avro/platform.enterprise.contract_signed.v1.avsc`

| Field                        | Type              | Required | Description                                          |
| ---------------------------- | ----------------- | -------- | ---------------------------------------------------- |
| `event_id`                   | string (UUID)     | Yes      | Unique event identifier                              |
| `event_type`                 | string            | Yes      | `"platform.enterprise.contract_signed.v1"`           |
| `event_version`              | string            | Yes      | `"1"`                                                |
| `actor_id`                   | string            | Yes      | SYSTEM_ADMIN `user_id` or `"system"` for CRM webhook |
| `occurred_at`                | string (ISO 8601) | Yes      | Event timestamp                                      |
| `correlation_id`             | string (UUID)     | Yes      | Trace correlation                                    |
| `trace_id`                   | string \| null    | No       | OpenTelemetry trace ID                               |
| `span_id`                    | string \| null    | No       | OpenTelemetry span ID                                |
| `payload.tenant_id`          | string (UUID)     | Yes      | Tenant being provisioned                             |
| `payload.contract_reference` | string \| null    | No       | External contract ID from CRM or system              |

### platform.enterprise.db_provisioned.v1

Emitted when `verifyRoutingActivity` passes (workflow COMPLETED).

Avro schema: `packages/@cos/shared/src/avro/platform.enterprise.db_provisioned.v1.avsc`

| Field                  | Type              | Required | Description                                                      |
| ---------------------- | ----------------- | -------- | ---------------------------------------------------------------- |
| `event_id`             | string (UUID)     | Yes      | Unique event identifier                                          |
| `event_type`           | string            | Yes      | `"platform.enterprise.db_provisioned.v1"`                        |
| `event_version`        | string            | Yes      | `"1"`                                                            |
| `actor_id`             | string            | Yes      | `"system"` (workflow-generated)                                  |
| `occurred_at`          | string (ISO 8601) | Yes      | Event timestamp                                                  |
| `correlation_id`       | string (UUID)     | Yes      | Trace correlation                                                |
| `trace_id`             | string \| null    | No       | OpenTelemetry trace ID                                           |
| `span_id`              | string \| null    | No       | OpenTelemetry span ID                                            |
| `payload.tenant_id`    | string (UUID)     | Yes      | Tenant whose dedicated DB is now live                            |
| `payload.rds_endpoint` | string            | Yes      | RDS hostname (e.g. `cos-tenant-acme-prod.xxx.rds.amazonaws.com`) |

---

## 34.10 Notification Routing

See §19.8 of `19-notification-architecture.md` for full routing table.

| Event                                    | Roles        | In-app | Email |
| ---------------------------------------- | ------------ | ------ | ----- |
| `platform.enterprise.contract_signed.v1` | SYSTEM_ADMIN | Yes    | Yes   |
| `platform.enterprise.db_provisioned.v1`  | SYSTEM_ADMIN | Yes    | Yes   |
| Workflow human gate (AWAITING_APPROVAL)  | SYSTEM_ADMIN | Yes    | Yes   |

---

## 34.11 API Endpoints

Full OpenAPI specs:

- Admin endpoint: `docs/api/tenant.openapi.yaml` — `PATCH /admin/tenants/{tenantId}/mark-contracted`
- CRM webhook: `docs/api/platform-webhooks.openapi.yaml` — `POST /platform/webhooks/enterprise-contract-signed`

### PATCH /api/v1/admin/tenants/:tenantId/mark-contracted

- Auth: JWT Bearer, role `SYSTEM_ADMIN`
- Body: `{ contractReference?: string }` (maxLength 255)
- `202 Accepted`: `{ message, workflowId, tenantId }`
- `409 Conflict`: workflow already running or completed
- `400 Bad Request`: tenant not ENTERPRISE, not active, or already provisioned
- `404 Not Found`: tenant not found

### POST /api/v1/platform/webhooks/enterprise-contract-signed

- Auth: `X-Webhook-Signature: sha256=<hex>` (HMAC-SHA256)
- Body: JSON containing `tenant_id` (UUID) and optionally `contract_reference`
- `202 Accepted`: `{ message, workflowId, tenantId }`
- `401 Unauthorized`: invalid or missing signature
- `409 Conflict`: workflow already running or completed

---

## 34.12 Schema Isolation Rule

`platform.*` tables (including `platform.tenants`) always reside on the **shared database**.
They are NEVER moved to a tenant's dedicated DB during `migrateDataActivity`.

Only tenant-owned domain data (in the tenant's own schema) is eligible for migration.

---

## 34.13 Exit Criteria

All of the following must be true before Phase 25 is considered complete:

| #   | Criterion                                                                           | Evidence                 |
| --- | ----------------------------------------------------------------------------------- | ------------------------ |
| 1   | This spec file exists at `docs/specifications/34-enterprise-tenant-provisioning.md` | `ls`                     |
| 2   | `§19.8` added to `19-notification-architecture.md`                                  | `grep "19.8"`            |
| 3   | `mark-contracted` endpoint in `docs/api/tenant.openapi.yaml`                        | `grep "mark-contracted"` |
| 4   | `docs/api/platform-webhooks.openapi.yaml` exists                                    | `ls`                     |
| 5   | `infrastructure/terraform/modules/rds-tenant/README.md` exists                      | `ls`                     |
| 6   | `platform.enterprise.contract_signed.v1.avsc` exists                                | `ls`                     |
| 7   | `platform.enterprise.db_provisioned.v1.avsc` exists                                 | `ls`                     |
| 8   | `mark-contracted.dto.ts` exists                                                     | `ls`                     |
| 9   | `PATCH :tenantId/mark-contracted` in `tenant.controller.ts`                         | `grep`                   |
| 10  | `markAsEnterpriseContracted` in `tenant.service.ts`                                 | `grep`                   |
| 11  | `platform-webhook.controller.ts` exists with `@HttpCode(202)`                       | `grep`                   |
| 12  | `platform-webhook.service.ts` with `timingSafeEqual`                                | `grep`                   |
| 13  | `platform-webhook.module.ts` exists                                                 | `ls`                     |
| 14  | `PlatformWebhookModule` imported in `app.module.ts`                                 | `grep`                   |
| 15  | Fastify `addContentTypeParser` in `main.ts`                                         | `grep`                   |
| 16  | `enterprise-provisioning.workflow.ts` with `approveSignal`, `abortSignal`           | `grep`                   |
| 17  | `enterprise-provisioning.activities.ts` with all 8 activity functions               | `grep`                   |
| 18  | `enterprise-provisioning.worker.ts` with task queue `enterprise-provisioning`       | `grep`                   |
| 19  | `notification.service.ts` maps `platform.enterprise.*` → `SYSTEM_ADMIN`             | `grep`                   |
| 20  | `main.tf` exists with `aws_db_instance` resource                                    | `ls` + `grep`            |
| 21  | `variables.tf` exists with 11 variables                                             | `ls` + `grep`            |
| 22  | `outputs.tf` exists with 4 outputs                                                  | `ls` + `grep`            |
| 23  | `@aws-sdk/client-rds` in `backend/package.json`                                     | `grep`                   |
| 24  | `pnpm-lock.yaml` updated (client-rds present)                                       | `grep`                   |
| 25  | `enterprise-provisioning.workflow.spec.ts` covers approve + abort paths             | `ls`                     |
| 26  | `platform-webhook.service.spec.ts` covers 6 HMAC test cases                         | `ls`                     |

---

## References

| ID          | Title                                                     | Source                                                                                                             |
| ----------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [Temporal]  | Temporal Workflow Documentation                           | [docs.temporal.io](https://docs.temporal.io/)                                                                      |
| [AWS RDS]   | Amazon RDS for PostgreSQL User Guide                      | [docs.aws.amazon.com/rds](https://docs.aws.amazon.com/rds/)                                                        |
| [Terraform] | HashiCorp Terraform AWS Provider Documentation            | [registry.terraform.io/providers/hashicorp/aws](https://registry.terraform.io/providers/hashicorp/aws/latest/docs) |
| [Avro]      | Apache Avro Specification                                 | [avro.apache.org](https://avro.apache.org/docs/current/spec.html)                                                  |
| [HMAC]      | RFC 2104 — HMAC: Keyed-Hashing for Message Authentication | IETF                                                                                                               |

> See also: [07-multi-tenant-architecture](07-multi-tenant-architecture.md) · [15-event-driven-workflow](15-event-driven-workflow.md) · [19-notification-architecture](19-notification-architecture.md) · [32-implementation-specifications](32-implementation-specifications.md)
