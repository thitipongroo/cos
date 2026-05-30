---
title: "Multi-tenant Architecture"
version: "1.4.0"
status: Active
last_updated: "2026-05-27"
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
  - [Schema-per-tenant](#schema-per-tenant)
  - [Dedicated DB](#dedicated-db)
- [7.2 Isolation Layers](#72-isolation-layers)
- [7.3 Kafka Topic Isolation](#73-kafka-topic-isolation)
- [7.4 Neo4j Multi-tenancy](#74-neo4j-multi-tenancy)
- [7.5 S3 File Isolation](#75-s3-file-isolation)
- [7.6 Tenant Provisioning Workflow](#76-tenant-provisioning-workflow)

---

## 7.1 Tenant Isolation Model

### Shared DB + tenant_id

For SMB scale.

### Schema-per-tenant

For mid-market.

### Dedicated DB

For enterprise.

Deployment-to-isolation mapping :

| Deployment Option | Isolation Model |
| --- | --- |
| Shared SaaS — SMB | Shared DB + tenant_id |
| Shared SaaS — Mid-market | Schema-per-tenant |
| Dedicated Tenant | Dedicated DB |
| Hybrid | Dedicated DB |
| Fully On-premise | Dedicated DB |

---

## 7.2 Isolation Layers

Layers :

- Authentication isolation
- Data isolation
- Queue isolation
- File isolation
- Encryption keys per tenant

---

## 7.3 Kafka Topic Isolation

Topic naming format :

- `{tenant_id}.{domain}.{entity}.{action}.{version}`
- Example: `tenant_abc.construction.task.created.v1`

Isolation by tier :

- SMB / Mid-market — shared Kafka **cluster/infrastructure**; topics are per-tenant using the `{tenant_id}.` prefix above; tenant_id is also enforced in message headers as a secondary validation guard; consumer validates header before processing
- Enterprise — dedicated Kafka namespace (MSK namespace isolation or separate MSK cluster for fully on-premise)

> 📎 See [15-event-driven-workflow §15.6](15-event-driven-workflow.md) for the canonical distinction between Kafka topic names (`{tenant_id}.domain.entity.action.v1`) and CloudEvents `type` field (`domain.entity.action.v1`).

Consumer group naming :

- Shared: `{service_name}.shared`
- Enterprise: `{service_name}.{tenant_id}`

Dead-letter queues :

- Tenant-scoped — DLQ for tenant A cannot receive messages from tenant B
- Naming: `{tenant_id}.{domain}.dlq`

Topic lifecycle management :

**Retention policy (default):**

| Tier | Time Retention | Size Limit | Scope |
| --- | --- | --- | --- |
| SMB / Mid-market (shared cluster) | 7 days (`log.retention.hours=168`) | 10 GB per partition | AWS MSK topic-level config |
| Enterprise (dedicated namespace) | 30 days (default); negotiable per contract | 50 GB per partition | Dedicated MSK cluster config |
| DLQ topics (all tiers) | 14 days (double normal — extends reprocessing window) | Same as tier | Same as tier |

**Tenant offboarding — topic cleanup procedure:**

When a tenant is deprovisioned, execute in this order:

1. Halt all consumer groups scoped to the tenant (`{service_name}.{tenant_id}` groups for Enterprise; for SMB / Mid-market, halt per-tenant processing at the service layer — shared consumer groups continue serving other tenants)
2. Wait for in-flight messages to drain — poll consumer lag until lag = 0, or timeout after 30 minutes, whichever comes first
3. Publish `platform.tenant.deprovisioned.v1` on the platform management topic (triggers downstream cleanup in all subscribing services)
4. **SMB / Mid-market:** messages carry `tenant_id` in headers — natural expiry per retention policy is preferred; if PDPA/GDPR requires immediate erasure, delete and recreate affected topic partitions (destructive — requires operator sign-off)
5. **Enterprise:** delete the dedicated Kafka namespace and all topics within it (irreversible; requires operator sign-off + 24-hour hold before execution)
6. Remove all Kafka ACL entries associated with the tenant
7. Record in the immutable audit log: `{ event: "kafka.tenant.topics.deleted", tenant_id, topic_count, namespace, deleted_at, operator }`

Note: Steps 4 and 5 are irreversible. Never execute without written deprovisioning authorization from the tenant or a legal hold release.

---

## 7.4 Neo4j Multi-tenancy

Strategy :

- SMB / Mid-market — shared Neo4j database; all graph nodes include `tenant_id` property; all queries include `WHERE n.tenant_id = $tenant_id` guard clause enforced at service layer
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
3. Keycloak assignment: shared realm for SMB/mid-market; dedicated realm created for enterprise
4. Database provisioning:
   - SMB: no migration needed — `tenant_id` already in all tables
   - Mid-market: new schema created and migrated
   - Enterprise: new database provisioned and migrated
5. Kafka namespace initialized
6. S3 prefix initialized (zero-byte marker object written to confirm access)
7. Encryption key generated and stored, keyed by `tenant_id` — AWS Secrets Manager (cloud deployments); HashiCorp Vault (on-premise and hybrid deployments — see 04-tech-stack section 4.4)
8. Default roles seeded per RBAC matrix (see 06-rbac-permission-matrix)
9. Provisioning event published: `platform.tenant.provisioned.v1`
10. Welcome notification dispatched to tenant admin (see 19-notification-architecture)

---

## References

| ID | Title | Source |
| --- | --- | --- |
| [IEEE 830] | IEEE Recommended Practice for Software Requirements Specifications | IEEE Std 830-1998 |
| [PostgreSQL-RLS] | PostgreSQL Row Security Policies | [postgresql.org/docs/current/ddl-rowsecurity.html](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) |
| [Kafka] | Apache Kafka Documentation | [kafka.apache.org/documentation](https://kafka.apache.org/documentation/) |
| [Neo4j] | Neo4j Graph Database Documentation | [neo4j.com/docs](https://neo4j.com/docs/) |
| [Keycloak] | Keycloak Server Documentation | [keycloak.org/documentation](https://www.keycloak.org/documentation) |
| [MinIO] | MinIO Object Storage Documentation | [min.io/docs/minio/linux/index.html](https://min.io/docs/minio/linux/index.html) |
| [Kubernetes] | Kubernetes Documentation | [kubernetes.io/docs/home](https://kubernetes.io/docs/home/) |

> 📎 See also: [05-security-compliance](05-security-compliance.md) · [06-rbac-permission-matrix](06-rbac-permission-matrix.md) · [08-enterprise-deployment](08-enterprise-deployment.md) · [11-database-schema](11-database-schema.md)
