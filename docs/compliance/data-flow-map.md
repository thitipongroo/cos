# Construction OS — Personal Data Flow Map

> **Purpose:** Document how personal data (PII) flows between services for PDPA (Thailand) and
> GDPR compliance. Reviewed before Stage 1→2 transition and before each Stage gate thereafter.
> Source: QM-5; spec §05-security-compliance.

---

## Data classification

| Class | Definition | Examples |
|-------|------------|---------|
| `PUBLIC` | No harm if disclosed | Project name, BOQ category names |
| `INTERNAL` | Internal use only; not for external disclosure | Aggregate cost data, workflow state |
| `CONFIDENTIAL` | Business-sensitive; restricted internal | Vendor pricing, contract values |
| `RESTRICTED` (PII) | Personal data — PDPA/GDPR subject | Name, phone, national ID, location |

---

## PII data categories (PDPA §6)

| PDPA Category | Description | @pdpa tag | Retention |
|---------------|-------------|-----------|-----------|
| `identity` | Full name (ชื่อ-นามสกุล), date of birth | `@pdpa(category: "identity")` | See data-retention-policy.md |
| `contact` | Phone number, email address | `@pdpa(category: "contact")` | See data-retention-policy.md |
| `national_id` | Thai national ID (เลขบัตรประชาชน) | `@pdpa(category: "national_id")` | See data-retention-policy.md |
| `location` | GPS coordinates (check-in/check-out) | `@pdpa(category: "location")` | 90 days |
| `biometric` | Face scan (future — not in Stage 1) | `@pdpa(category: "biometric")` | N/A Stage 1 |
| `financial` | Salary rate, bank account (workforce pay) | `@pdpa(category: "financial")` | 7 years (accounting law) |

---

## Service data flow map

### 1. Identity service → Keycloak

```
User registration (email/phone)
  ├── Stored: Keycloak user store (PostgreSQL — construction-os realm)
  ├── PII fields: email, phone, first_name, last_name
  ├── Encryption: Keycloak DB encrypted at rest (AES-256, SSE-KMS)
  ├── Cross-border: ap-southeast-1 only (Thai-origin data — QM-5)
  └── Retention: active account lifetime + 30 days after deletion request
```

### 2. Workforce service → PostgreSQL (cos-db)

```
Worker record creation
  ├── Stored: workforce.workers table (cos-db, ap-southeast-1)
  ├── PII fields: national_id (RESTRICTED), full_name (RESTRICTED), phone (RESTRICTED)
  ├── @pdpa tags: all PII fields tagged in prisma/schema.prisma
  ├── Access: SITE_ENGINEER (own project), PROJECT_MANAGER (own project), ADMIN (tenant-wide)
  ├── Encryption: AES-256 at rest (RDS SSE-KMS)
  └── Retention: employment period + 2 years (Thai labor law)
```

### 3. Site operations service → GPS location data

```
Mobile check-in (field worker)
  ├── Collected: GPS lat/lon at check-in and check-out
  ├── Stored: site_ops.check_ins table (cos-db, ap-southeast-1)
  ├── PII category: location
  ├── Access: SITE_ENGINEER (own project), PROJECT_MANAGER (own project)
  ├── Retention: 90 days (QM-5 §location)
  └── Aggregation: after 90 days, aggregate to daily count only (no GPS)
```

### 4. Notification service → AWS SNS (SMS)

```
OTP delivery (SITE_WORKER auth)
  ├── Data transmitted: phone number + OTP code
  ├── Processor: AWS SNS (ap-southeast-1)
  ├── DPA status: AWS DPA signed (standard AWS BAA/DPA)
  ├── Retention at processor: AWS SNS does not retain message content
  └── Log retention: OTP attempt log 30 days (audit), no phone number in log body
```

### 5. File service → AWS S3

```
Photo uploads (site reports, QC inspections)
  ├── Stored: S3 bucket cos-files-{env} (ap-southeast-1)
  ├── PII risk: photos may contain faces (biometric — PDPA §26)
  ├── Mitigation Stage 1: no facial recognition; photos stored with project access controls
  ├── Access: project team only (presigned URLs, 15-min TTL)
  ├── Encryption: SSE-KMS (customer-managed CMK)
  └── Retention: project lifetime + 1 year; then deleted unless legal hold
```

### 6. AI gateway → OpenAI API (external)

```
Report generation (GPT-4o)
  ├── Data transmitted: project report content (sanitized — no PII)
  ├── PII policy: PII must be stripped before sending to LLM (HallucinationGuard pre-processing)
  ├── Processor: OpenAI (USA — cross-border transfer)
  ├── Basis for transfer: Data minimization (no PII sent); contractual safeguards (OpenAI DPA)
  ├── DPA status: OPEN — OpenAI DPA must be reviewed and signed before Stage 2
  └── Retention at processor: OpenAI API — not used for training (per OpenAI API terms)
```

### 7. Analytics service → ClickHouse

```
Operational analytics
  ├── Stored: ClickHouse (self-hosted, ap-southeast-1)
  ├── PII policy: no raw PII in analytics — only aggregate counts and IDs
  ├── user_id stored as UUID (pseudonymous, not directly identifying)
  ├── Retention: 90-day rolling window (recent analytics)
  └── Access: EXEC, PROJECT_MANAGER roles only
```

### 8. Knowledge graph → Neo4j

```
Construction knowledge graph
  ├── Stored: Neo4j (self-hosted, ap-southeast-1)
  ├── PII policy: no direct PII in graph nodes — entity IDs only
  ├── Relationships: project → task → worker_id (UUID pseudonymous)
  └── Access: internal service-to-service only
```

---

## Third-party processors

| Processor | Service | Data Shared | DPA Status | Region |
|-----------|---------|-------------|------------|--------|
| AWS | RDS, S3, SNS, Secrets Manager, EKS | All data | AWS DPA (standard) — SIGNED | ap-southeast-1 |
| Keycloak | Identity (self-hosted on EKS) | email, phone, name | N/A (self-hosted) | ap-southeast-1 |
| OpenAI | GPT-4o report generation | Sanitized project text (no PII) | OPEN — must sign before Stage 2 |  USA |
| Cloudflare | WAF, CDN | IP address, HTTP headers | Cloudflare DPA — OPEN | Global edge |
| Temporal | Workflow state (self-hosted) | Workflow payloads (no raw PII) | N/A (self-hosted) | ap-southeast-1 |

---

## Data subject rights implementation

| Right | PDPA Article | Implementation | Status |
|-------|-------------|----------------|--------|
| Right to access | §30 | `GET /api/v1/identity/me/data-export` | OPEN |
| Right to erasure | §33 | `DELETE /api/v1/identity/me` → anonymization | OPEN |
| Right to portability | §31 | `GET /api/v1/identity/me/data-export` → JSON | OPEN |
| Right to object | §32 | Marketing opt-out (not applicable Stage 1) | N/A |
| Right to restrict processing | §34 | Account suspension (ADMIN action) | OPEN |

All subject rights requests must be fulfilled within **30 days** per PDPA §32.

---

## Review schedule

| Event | Reviewer | Action |
|-------|----------|--------|
| Stage 1 → Stage 2 gate | Product owner + legal | Review all OPEN DPA items; sign OpenAI + Cloudflare DPA |
| Stage 2 → Stage 3 gate | External DPO | Full data flow audit against PDPA requirements |
| Annually | Product owner | Review new processors; update map |
| Any new third-party integration | Engineering lead | Add processor row before integration goes to production |
