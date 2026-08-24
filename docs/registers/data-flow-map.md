# Construction OS — Personal Data Flow Map

> **Purpose:** Document how personal data (PII) flows between services for PDPA (Thailand) and
> GDPR compliance. Reviewed before Stage 1→2 transition and before each Stage gate thereafter.
> Source: QM-5; spec §05-security-compliance.

---

## Storage region — read this before any row below

Every storage location in this document resolves to the **tenant's home region**, not to one fixed
region. The assignment is authoritative in `docs/policies/data-residency-policy.md` (referenced by
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

| PDPA Category          | Description                       | Implemented at Stage 1                                                                                                    | @pdpa tag                        | Retention                    |
| ---------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ---------------------------- |
| `identity`             | Full name (ชื่อ-นามสกุล)          | **Yes** — `platform.users.display_name`, `workforce.workers.full_name`                                                    | `@pdpa(category: "identity")`    | See data-retention-policy.md |
| `identity`             | Name of an EXTERNAL person        | **Yes** — `crm.contacts.name`, `crm.leads.contact_name` (COS is **processor**, §9)                                        | `@pdpa(… role: "processor")`     | See data-retention-policy.md |
| `identity`             | Date of birth                     | **No** — no `date_of_birth` column exists in any migration                                                                | —                                | —                            |
| `contact`              | Phone number, email address       | **Yes** — `platform.users`, `workforce.workers.contact_phone`                                                             | `@pdpa(category: "contact")`     | See data-retention-policy.md |
| `contact`              | EXTERNAL person's phone / email   | **Yes** — `crm.contacts.email`/`.phone`, `procurement.vendors.contact_email`/`.contact_phone` (§9, §10)                   | `@pdpa(… role: "processor")`     | See data-retention-policy.md |
| `identity` / `contact` | Sole trader's tax id / address    | **Conditional** — `procurement.vendors.tax_id`/`.address` are personal data only where `vendor_type = 'INDIVIDUAL'` (§10) | `@pdpa(… conditional: …)`        | See data-retention-policy.md |
| `national_id`          | Thai national ID (เลขบัตรประชาชน) | **No** — no `national_id` column exists in any migration                                                                  | —                                | —                            |
| `location`             | GPS coordinates                   | **Yes** — 5 tables, see §3 below                                                                                          | `@pdpa(category: "location")`    | 90 days (attendance)         |
| `biometric`            | Face scan / fingerprint           | **No** — not in Stage 1; photos may incidentally contain faces (§5, §26)                                                  | `@pdpa(category: "biometric")`   | N/A Stage 1                  |
| `financial`            | Worker daily rate                 | **Yes** — `workforce.project_workforce.daily_rate`                                                                        | `@pdpa(category: "financial")`   | 7 years (accounting law)     |
| `financial`            | Hours worked                      | **Yes** — `workforce_telemetry.timesheets.regular_hours`, `.overtime_hours`                                               | `@pdpa(category: "financial")`   | 2 years (labor law)          |
| `financial`            | Payslip / salary paid             | **No** — no payroll table exists; `finance.payments` is invoice-keyed with no personal payee                              | —                                | —                            |
| `financial`            | Bank account                      | **No** — no bank-account column exists in any migration                                                                   | —                                | —                            |
| `operational`          | Actions the user performed        | **Yes** — `platform.audit_logs.actor_id`, `files.files.uploaded_by`, `finance.payments.recorded_by`                       | `@pdpa(category: "operational")` | See data-retention-policy.md |

> Corrected 2026-08-03: this table previously listed date of birth, national ID and bank account as
> collected categories. None of them exist in the schema, and the mobile privacy notice had repeated
> the claim to users.
>
> Updated 2026-08-04: the earlier note here said `@pdpa` tags "exist only in
> `backend/prisma/schema.prisma` (9 tags, covering the `platform` and `files` schemas) — the domain
> schemas are raw-SQL migrations and carry no tags". Migration `20260803000001_tag_pii_columns` had
> already made that untrue on the day it was written: it tags the domain schemas with
> `COMMENT ON COLUMN`, which reaches a table however it was created and survives a schema dump.
> `20260804000005_tag_pii_columns_v2` extends the set to the columns the PDPA export collector reads
> — `timesheets` hours, `issues.created_by`/`assigned_to`, and `finance.payments.recorded_by`.
>
> `finance.payments` sits under `operational`, not `financial`: it is invoice-keyed, so the only
> personal datum is _who keyed the entry in_ — an action, exactly like `audit_logs.actor_id`. The
> amount columns are deliberately untagged and are never exported into an individual's archive; that
> money is the organisation's, not the recorder's.
>
> **Updated 2026-08-16 — EXTERNAL people were missing from this map entirely.** Both earlier tagging
> passes scoped themselves to what the PDPA export collector reads, and that collector is keyed by
> `userId`: it answers "what does the platform hold about this ACCOUNT HOLDER". CRM contacts, CRM
> leads and the named contact person at a vendor have no account, so no query reached them and
> nothing prompted a tag — leaving this table reading as though the platform held no personal data
> about them. It does. `20260816000002_tag_external_party_pii` tags those columns and §9/§10 below
> record the flows. **"It is only business contact data" was considered and rejected as a basis for
> leaving them out**: Singapore's PDPA §4(5) exempts business contact information used for B2B, but
> **Thailand's PDPA has no such exemption** — its definition covers any data enabling identification
> of a person, directly or indirectly, and it follows the GDPR model here rather than Singapore's.
> The role differs, not the obligation: see § Controller and processor roles.

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
  ├── Hours worked: workforce_telemetry.timesheets.regular_hours / .overtime_hours (RESTRICTED)
  │              Rate and hours are both exported; neither half alone tells a worker what
  │              their work was worth. There is no payroll table in this schema.
  ├── @pdpa tags: tagged via COMMENT ON COLUMN (20260803000001, extended by 20260804000005).
  │              A comment reaches a table however it was created, so a raw-SQL migration
  │              is taggable — Prisma-model attributes were never the only route.
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

### 9. CRM → PostgreSQL (cos-db) — EXTERNAL people, COS as processor

```text
Leads, contacts and opportunities a tenant records about prospective customers
  ├── Stored: PostgreSQL `crm` schema (crm.leads, crm.contacts, crm.opportunities)
  ├── PII fields: contacts.name (RESTRICTED, NOT NULL — every row identifies someone),
  │               contacts.email, contacts.phone, leads.contact_name
  ├── NOT PII: leads.company — a juristic person is not a data subject under the PDPA
  ├── Data subject: an EXTERNAL person with no platform account
  ├── Role: TENANT is controller (it decides to record them and why); COS is PROCESSOR
  ├── Written by: CRM_SALES_MANAGER / TENANT_ADMIN via POST /api/v1/crm/{leads,contacts}
  ├── Isolation: RLS `rls_tenant_isolation` — a contact is visible to one tenant only
  ├── Cross-border: none — stays in the tenant home region
  └── Subject rights: routed to the tenant, which holds the tooling (ADR-090)
```

### 10. Procurement → vendor contact person, COS as processor

```text
The named person a tenant deals with at a supplier
  ├── Stored: PostgreSQL `procurement.vendors`
  ├── PII fields: contact_email, contact_phone (a PERSON's work address and number —
  │               the company is not the data subject, that person is)
  ├── CONDITIONAL PII: tax_id, address — personal data only where
  │                    vendor_type = 'INDIVIDUAL' (sole trader). A consumer of the @pdpa
  │                    tags MUST read vendor_type first; treating every row as personal
  │                    would put a company's tax id into an individual's archive.
  ├── vendor_type is NULLABLE and NOT backfilled: nothing in the schema distinguishes a
  │                    sole trader from a company, and a guess mislabels a real person's
  │                    tax id as company data. NULL = not recorded, never "juristic".
  ├── Role: TENANT is controller; COS is PROCESSOR
  ├── Isolation: RLS `rls_tenant_isolation`; UNIQUE (tenant_id, vendor_code)
  └── Subject rights: routed to the tenant (ADR-090)
```

---

## Controller and processor roles

**This map describes two different relationships, and conflating them is the mistake §9 and §10 were
added to prevent.**

| Data                                                   | Controller | COS's role     | Who answers a data subject                                |
| ------------------------------------------------------ | ---------- | -------------- | --------------------------------------------------------- |
| Platform accounts, workers, site operations (§1–§8)    | COS        | **Controller** | COS, via `POST /api/v1/users/me/data-export` (PDPA-10/11) |
| Tenant-entered records about EXTERNAL people (§9, §10) | **Tenant** | **Processor**  | The tenant, using tooling COS provides (ADR-090)          |

The table above §Third-party processors lists processors **COS sends data to**. This section is the
opposite direction — where COS is itself the processor, for its own tenants. Both exist, and PDPA §40
imposes a record-keeping duty on a processor independently of the controller's, which is why the
§9/§10 columns are tagged rather than left out on the grounds that someone else is the controller.

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

| Right                        | PDPA Article | Implementation                                                                           | Status |
| ---------------------------- | ------------ | ---------------------------------------------------------------------------------------- | ------ |
| Right to access              | §30          | `POST` + `GET /api/v1/users/me/data-export` · `GET …/:id/download` (ADR-078)             | DONE   |
| Right to erasure             | §33          | `DELETE /api/v1/identity/me` → anonymization                                             | OPEN   |
| Right to portability         | §31          | Same endpoints, `format: JSON \| CSV`                                                    | DONE   |
| Right to object              | §32          | Marketing opt-out (not applicable Stage 1)                                               | N/A    |
| Right to restrict processing | §34          | Account suspension (ADMIN action)                                                        | OPEN   |
| Right to withdraw consent    | §19          | `POST /api/v1/users/me/consents` — grant and withdrawal on the identical route (ADR-079) | DONE   |

Access and portability became `DONE` on 2026-08-05, when `s1.identity.data-export` reached 100% and
its fallback was flipped ON. They were `PARTIAL` until then: the mechanism was complete, but a flag
that ships OFF means the right is not exercisable. See `pdpa-controls.md` PDPA-10/11 — if that flag
is ever left off, both rows revert to `PARTIAL`. The route prefix is `users/me`, not the
`identity/me` this table carried until 2026-08-05 — ADR-078 rejected that path.

All subject rights requests must be fulfilled within **30 days** per PDPA §32.

---

## Review schedule

| Event                           | Reviewer              | Action                                                  |
| ------------------------------- | --------------------- | ------------------------------------------------------- |
| Stage 1 → Stage 2 gate          | Product owner + legal | Review all OPEN DPA items; sign OpenAI + Cloudflare DPA |
| Stage 2 → Stage 3 gate          | External DPO          | Full data flow audit against PDPA requirements          |
| Annually                        | Product owner         | Review new processors; update map                       |
| Any new third-party integration | Engineering lead      | Add processor row before integration goes to production |
