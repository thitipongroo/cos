# Construction OS — Personal Data Flow Map

> **Purpose:** Document how personal data (PII) flows between services for PDPA (Thailand) and
> GDPR compliance. Reviewed before Stage 1→2 transition and before each Stage gate thereafter.
> Source: QM-5; spec §05-security-compliance.

---

## Storage region — read this before any row below

Every storage location in this document resolves to the **tenant's home region**, not to one fixed
region. The assignment is authoritative in `docs/compliance/data-residency-policy.md` (referenced by
spec §5.6) and is recorded per tenant in `platform.tenants.data_region`, immutable after first write:

| Tenant origin   | Data-residency region        | DR region        |
| --------------- | ---------------------------- | ---------------- |
| Thai tenants    | `ap-southeast-7` (Bangkok)   | `ap-southeast-1` |
| EU tenants      | `eu-west-1` (Ireland)        | —                |
| Other / default | `ap-southeast-1` (Singapore) | —                |

The per-tenant residency region is **distinct from** the platform's primary compute/control-plane
region (`ap-southeast-7`, GLOB-001 §8.8) — a tenant's data stays in its own home region regardless of
where the control plane runs (spec §5.6).

> Corrected 2026-08-03: every flow below previously read `ap-southeast-1` unconditionally, which
> contradicted §5.6 and `data-residency-policy.md` for Thai tenants — PDPA requires Thai-origin data
> to stay in `ap-southeast-7`. The rows now say "tenant home region". The single deliberate
> exception is AWS SNS (§4 below), which is pinned to `ap-southeast-1` because that is the
> SMS-capable endpoint (spec §5.3.1) — do not "correct" it to match the others.

---

## Data classification

| Class              | Definition                                     | Examples                            |
| ------------------ | ---------------------------------------------- | ----------------------------------- |
| `PUBLIC`           | No harm if disclosed                           | Project name, BOQ category names    |
| `INTERNAL`         | Internal use only; not for external disclosure | Aggregate cost data, workflow state |
| `CONFIDENTIAL`     | Business-sensitive; restricted internal        | Vendor pricing, contract values     |
| `RESTRICTED` (PII) | Personal data — PDPA/GDPR subject              | Name, phone, national ID, location  |

---

## PII data categories (PDPA §6)

The **Implemented** column is the fact that governs the privacy notice: a category planned but not
yet collected must never be described to a data subject as collected (verified 2026-08-03 against
`backend/prisma/migrations/` and `backend/prisma/schema.prisma`).

| PDPA Category | Description                       | Implemented at Stage 1                                                   | @pdpa tag                      | Retention                    |
| ------------- | --------------------------------- | ------------------------------------------------------------------------ | ------------------------------ | ---------------------------- |
| `identity`    | Full name (ชื่อ-นามสกุล)          | **Yes** — `platform.users.display_name`, `workforce.workers.full_name`   | `@pdpa(category: "identity")`  | See data-retention-policy.md |
| `identity`    | Date of birth                     | **No** — no `date_of_birth` column exists in any migration               | —                              | —                            |
| `contact`     | Phone number, email address       | **Yes** — `platform.users`, `workforce.workers.contact_phone`            | `@pdpa(category: "contact")`   | See data-retention-policy.md |
| `national_id` | Thai national ID (เลขบัตรประชาชน) | **No** — no `national_id` column exists in any migration                 | —                              | —                            |
| `location`    | GPS coordinates                   | **Yes** — 5 tables, see §3 below                                         | `@pdpa(category: "location")`  | 90 days (attendance)         |
| `biometric`   | Face scan / fingerprint           | **No** — not in Stage 1; photos may incidentally contain faces (§5, §26) | `@pdpa(category: "biometric")` | N/A Stage 1                  |
| `financial`   | Worker daily rate                 | **Yes** — `workforce.project_workforce.daily_rate`                       | `@pdpa(category: "financial")` | 7 years (accounting law)     |
| `financial`   | Bank account                      | **No** — no bank-account column exists in any migration                  | —                              | —                            |

> Corrected 2026-08-03: this table previously listed date of birth, national ID and bank account as
> collected categories. None of them exist in the schema, and the mobile privacy notice had repeated
> the claim to users. `@pdpa` tags currently exist only in `backend/prisma/schema.prisma` (9 tags,
> covering the `platform` and `files` schemas) — the domain schemas are raw-SQL migrations and carry
> no tags, so "all PII fields tagged in prisma/schema.prisma" was also untrue.

---

## Service data flow map

### 1. Identity service → Keycloak

```text
User registration (email/phone)
  ├── Stored: Keycloak user store (PostgreSQL — construction-os realm)
  ├── PII fields: email, phone, first_name, last_name
  ├── Encryption: Keycloak DB encrypted at rest (AES-256, SSE-KMS)
  ├── Residency: tenant home region (Thai tenants ap-southeast-7 — must not leave Thailand)
  └── Retention: active account lifetime + 30 days after deletion request
```

### 2. Workforce service → PostgreSQL (cos-db)

```text
Worker record creation
  ├── Stored: workforce.workers table (cos-db, tenant home region)
  ├── PII fields: full_name (RESTRICTED), contact_phone (RESTRICTED), employee_code
  │              NOTE: no national_id column exists — see the PII category table above
  ├── Pay rate: workforce.project_workforce.daily_rate (RESTRICTED); no bank account is stored
  ├── @pdpa tags: NOT tagged — workforce is a raw-SQL migration, not a Prisma model.
  │              Tags exist only for the platform + files schemas (schema.prisma).
  ├── Access: SITE_ENGINEER (own project), PROJECT_MANAGER (own project), ADMIN (tenant-wide)
  ├── Encryption: AES-256 at rest (RDS SSE-KMS)
  └── Retention: employment period + 2 years (Thai labor law)
```

### 3. Workforce + Site operations → GPS location data

GPS is captured on **five** tables, not only at check-in (migration
`20260705000001_geo_coordinates` adds nullable `latitude`/`longitude NUMERIC(9,6)` to each):

```text
Geo-tagged field activity
  ├── Check-in / check-out : workforce_telemetry.attendance_logs
  ├── Daily site reports   : site_ops.site_reports
  ├── Issues               : site_ops.issues
  ├── Safety incidents     : site_ops.incidents
  ├── Inspections          : site_ops.inspections
  ├── Stored: cos-db, tenant home region; coordinates are NULLABLE (a record may carry none)
  ├── PII category: location
  ├── Access: SITE_ENGINEER (own project), PROJECT_MANAGER (own project)
  ├── Reverse geocoding: /api/v1/geo/reverse → SELF-HOSTED Nominatim container
  │                      (mediagis/nominatim, Geofabrik Thailand extract, docker-compose.yml).
  │                      Coordinates never leave the deployment — NOT a third-party processor.
  └── Retention: 90 days for attendance (QM-5 §location), then aggregate to daily count.
                 Site reports / issues / incidents / inspections follow their OWN record
                 retention in data-retention-policy.md — their coordinates persist with the
                 parent record, they are NOT purged on the 90-day attendance schedule.
```

> Corrected 2026-08-03: this section previously named a `site_ops.check_ins` table, which does not
> exist in any migration, and described GPS as check-in/check-out only. Both errors had propagated
> into the mobile privacy notice, which told users their location was collected "at check-in and
> check-out only" and kept for 90 days.

### 4. Notification service → AWS SNS (SMS)

```text
OTP delivery (SITE_WORKER auth)
  ├── Data transmitted: phone number + OTP code
  ├── Processor: AWS SNS (ap-southeast-1 — SMS-capable endpoint, spec §5.3.1;
  │             pinned by capability, NOT a residency assignment)
  ├── DPA status: AWS DPA signed (standard AWS BAA/DPA)
  ├── Retention at processor: AWS SNS does not retain message content
  └── Log retention: OTP attempt log 30 days (audit), no phone number in log body
```

### 5. File service → AWS S3

```text
Photo uploads (site reports, QC inspections)
  ├── Stored: S3/MinIO bucket cos-{tenant_id} — ONE bucket per tenant, tenant home region
  │           (services/file-service/src/services/minio.service.ts; master §Phase 9).
  │           Quarantined files move to cos-quarantine-{tenant_id}, purged after 30 days.
  ├── PII risk: photos may contain faces (biometric — PDPA §26)
  ├── Mitigation Stage 1: no facial recognition; photos stored with project access controls
  ├── Access: project team only (presigned URLs, 15-min TTL)
  ├── Encryption: SSE-KMS (customer-managed CMK)
  └── Retention: project lifetime + 1 year; then deleted unless legal hold
```

### 6. AI gateway → OpenAI API (external)

```text
Report generation (GPT-4o)
  ├── Data transmitted: project report content (sanitized — no PII)
  ├── PII policy: PII must be stripped before sending to LLM (HallucinationGuard pre-processing)
  ├── Processor: OpenAI (USA — cross-border transfer)
  ├── Basis for transfer: Data minimization (no PII sent); contractual safeguards (OpenAI DPA)
  ├── DPA status: OPEN — OpenAI DPA must be reviewed and signed before Stage 2
  └── Retention at processor: OpenAI API — not used for training (per OpenAI API terms)
```

### 7. Analytics service → ClickHouse

```text
Operational analytics
  ├── Stored: ClickHouse (self-hosted, tenant home region)
  ├── PII policy: no raw PII in analytics — only aggregate counts and IDs
  ├── user_id stored as UUID (pseudonymous, not directly identifying)
  ├── Retention: 90-day rolling window (recent analytics)
  └── Access: EXEC, PROJECT_MANAGER roles only
```

### 8. Knowledge graph → Neo4j

```text
Construction knowledge graph
  ├── Stored: Neo4j (self-hosted, tenant home region)
  ├── PII policy: no direct PII in graph nodes — entity IDs only
  ├── Relationships: project → task → worker_id (UUID pseudonymous)
  └── Access: internal service-to-service only
```

---

## Third-party processors

| Processor  | Service                       | Data Shared                     | DPA Status                      | Region                                         |
| ---------- | ----------------------------- | ------------------------------- | ------------------------------- | ---------------------------------------------- |
| AWS        | RDS, S3, Secrets Manager, EKS | All data                        | AWS DPA (standard) — SIGNED     | Tenant home region                             |
| AWS SNS    | OTP SMS delivery              | Phone number + OTP code         | AWS DPA (standard) — SIGNED     | `ap-southeast-1` (SMS-capable endpoint §5.3.1) |
| Keycloak   | Identity (self-hosted on EKS) | email, phone, name              | N/A (self-hosted)               | Tenant home region                             |
| OpenAI     | GPT-4o report generation      | Sanitized project text (no PII) | OPEN — must sign before Stage 2 | USA                                            |
| Cloudflare | WAF, CDN                      | IP address, HTTP headers        | Cloudflare DPA — OPEN           | Global edge                                    |
| Temporal   | Workflow state (self-hosted)  | Workflow payloads (no raw PII)  | N/A (self-hosted)               | Tenant home region                             |

---

## Data subject rights implementation

| Right                        | PDPA Article | Implementation                               | Status |
| ---------------------------- | ------------ | -------------------------------------------- | ------ |
| Right to access              | §30          | `GET /api/v1/identity/me/data-export`        | OPEN   |
| Right to erasure             | §33          | `DELETE /api/v1/identity/me` → anonymization | OPEN   |
| Right to portability         | §31          | `GET /api/v1/identity/me/data-export` → JSON | OPEN   |
| Right to object              | §32          | Marketing opt-out (not applicable Stage 1)   | N/A    |
| Right to restrict processing | §34          | Account suspension (ADMIN action)            | OPEN   |

All subject rights requests must be fulfilled within **30 days** per PDPA §32.

---

## Review schedule

| Event                           | Reviewer              | Action                                                  |
| ------------------------------- | --------------------- | ------------------------------------------------------- |
| Stage 1 → Stage 2 gate          | Product owner + legal | Review all OPEN DPA items; sign OpenAI + Cloudflare DPA |
| Stage 2 → Stage 3 gate          | External DPO          | Full data flow audit against PDPA requirements          |
| Annually                        | Product owner         | Review new processors; update map                       |
| Any new third-party integration | Engineering lead      | Add processor row before integration goes to production |
