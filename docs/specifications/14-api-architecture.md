---
title: 'API Architecture'
version: '1.3.0'
status: Active
last_updated: '2026-06-10'
authors:
  - thitipongroo
related_docs:
  - 03-system-design.md
  - 13-product-architecture.md
  - 15-event-driven-workflow.md
  - 26-pricing-model.md
---

# 14. API Architecture

## Table of Contents

- [14.1 API Philosophy](#141-api-philosophy)
- [14.2 API Gateway](#142-api-gateway)
- [14.3 Public APIs](#143-public-apis)
  - [Standard Response Envelope](#standard-response-envelope)
  - [Canonical Endpoint Patterns by Category](#canonical-endpoint-patterns-by-category)
- [14.4 API Versioning](#144-api-versioning)
- [14.5 Kong Traffic Authentication and Quota Enforcement](#145-kong-traffic-authentication-and-quota-enforcement)

---

## 14.1 API Philosophy

Everything is API-first.

All internal services communicate via :

- Event streams
- REST external APIs

### 14.1.1 Ecosystem Interoperability Protocol (INT-001)

**Decision:** Layered hybrid — REST + AsyncAPI 3.1. GraphQL excluded.
**Resolved:** 2026-06-10

| Protocol           | Scope                                               | Rationale                                                                  |
| ------------------ | --------------------------------------------------- | -------------------------------------------------------------------------- |
| REST (OpenAPI 3.1) | Synchronous external APIs — supplier, RFQ, document | Universal for ERP/procurement portals; OpenAPI 3.1 mandated platform-wide  |
| AsyncAPI 3.1       | Event-based ecosystem — notifications, order status | Pairs with Confluent Schema Registry + Avro; v3.1 stable as of 31 Jan 2026 |
| GraphQL            | Excluded                                            | Schema versioning complexity; unpredictable query cost; REST is sufficient |

**Industry precedent (2026):** Autodesk Construction Cloud, Procore API, SAP Business Network.

**Webhook delivery:** Events serialised as Avro internally; deserialized to JSON at the Kong Gateway
layer before delivery to external webhook subscribers who cannot consume Avro directly.

---

## 14.2 API Gateway

Responsibilities :

- Authentication
- Rate limiting
- Tenant routing
- API analytics
- Request validation
- API monetization

Rate Limiting Defaults (Kong Gateway, configurable per tenant tier) :

| Tier                          | Requests / minute (per tenant) | Requests / minute (per API key) | Burst allowance         |
| ----------------------------- | ------------------------------ | ------------------------------- | ----------------------- |
| Shared SaaS — SMB             | 1,000                          | 200                             | 2× for up to 10 seconds |
| Shared SaaS — Mid-market      | 5,000                          | 1,000                           | 2× for up to 10 seconds |
| Dedicated Tenant / Enterprise | Configurable (default 20,000)  | Configurable (default 5,000)    | Configurable            |

- Limits are enforced at Kong Gateway per `tenant_id` claim in the JWT
- Exceeding the limit returns HTTP 429 Too Many Requests with a `Retry-After` header
- AI API endpoints (`/api/v1/ai/*`) have separate per-tenant token-per-minute limits
  defined in the AI usage quota (see 26-pricing-model section 26.1)
- Limits are tunable per tenant by the Tenant Admin via platform admin API

---

## 14.3 Public APIs

All endpoints follow the pattern: `GET|POST|PUT|PATCH|DELETE /api/v1/{resource}`

Auth header required on all endpoints: `Authorization: Bearer <JWT>`
JWT must contain `tenant_id` claim — Kong Gateway rejects requests without it.

### Standard Response Envelope

```json
{
  "data": { ... },
  "meta": {
    "tenant_id": "tenant_abc",
    "request_id": "uuid",
    "timestamp": "2026-05-24T08:00:00Z"
  },
  "pagination": {
    "limit": 50,
    "offset": 0,
    "page": 1,
    "total": 234
  }
}

```

Error response:

```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Project proj_001 not found",
    "request_id": "uuid"
  }
}
```

### Canonical Endpoint Patterns by Category

The patterns below define the shape for each API category. OpenAPI specs are maintained in `docs/api/`:

| Domain             | OpenAPI File                                     | Scope                                                                                          |
| ------------------ | ------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Authentication     | [auth](../api/auth.openapi.yaml)                 | MVP                                                                                            |
| Tenant Management  | [tenant](../api/tenant.openapi.yaml)             | MVP                                                                                            |
| Projects           | [project](../api/project.openapi.yaml)           | MVP                                                                                            |
| Procurement        | [procurement](../api/procurement.openapi.yaml)   | MVP                                                                                            |
| Financial          | [finance](../api/finance.openapi.yaml)           | MVP                                                                                            |
| Bill of Quantities | [BOQ](../api/boq.openapi.yaml)                   | MVP                                                                                            |
| Workforce          | [workforce](../api/workforce.openapi.yaml)       | MVP                                                                                            |
| Equipment          | [equipment](../api/equipment.openapi.yaml)       | MVP                                                                                            |
| Files              | [file](../api/file.openapi.yaml)                 | MVP                                                                                            |
| Notifications      | [notification](../api/notification.openapi.yaml) | MVP                                                                                            |
| Site               | [site-ops](../api/site-ops.openapi.yaml)         | Planned — MVP                                                                                  |
| Safety             | [safety](../api/safety.openapi.yaml)             | Planned — MVP                                                                                  |
| AI                 | [ai](../api/ai.openapi.yaml)                     | Planned — MVP                                                                                  |
| CRM                | [crm](../api/crm.openapi.yaml)                   | Planned — MVP                                                                                  |
| Vendor             | [vendor](../api/vendor.openapi.yaml)             | Planned — MVP                                                                                  |
| Knowledge Graph    | [graph](../api/graph.openapi.yaml)               | MVP (Phase 13)                                                                                 |
| Analytics          | [analytics](../api/analytics.openapi.yaml)       | MVP (Phase 14)                                                                                 |
| Digital Twin       | [digital-twin](../api/digital-twin.openapi.yaml) | **Post-MVP — Phase 24 (SaaS maturity Stage 5 / Year 5+)** (not created before Phase 24 begins) |

The endpoint patterns below serve as the canonical reference; OpenAPI files are the
machine-readable contracts derived from these patterns.

---

#### Authentication APIs

Two authentication paths (authoritative spec: `05-security-compliance` §5.4):

- **Path A** — SMS OTP for field workers (`SITE_WORKER`, `SITE_ENGINEER`): phone + 6-digit OTP.
  The COS identity service performs OTP send/verify only; after verification it obtains the JWT
  from **Keycloak via Direct Grant** (`grant_type=password`, ephemeral credential) — the token is
  **Keycloak-signed (RS256)**. Keycloak is the single source of truth for JWT signing on both paths
  (master Phase 2; `05-security-compliance` §5.4).
- **Path B** — Email + password for office roles via Keycloak OIDC: JWT issued by Keycloak
  (RS256). MFA (TOTP) required for `TENANT_ADMIN` and `FINANCE`.

| Method | Path                            | Description                                                         | Auth         |
| ------ | ------------------------------- | ------------------------------------------------------------------- | ------------ |
| `POST` | `/api/v1/auth/otp/request`      | Request SMS OTP — Path A field workers                              | Public       |
| `POST` | `/api/v1/auth/otp/verify`       | Verify OTP; returns `access_token` + `refresh_token`                | Public       |
| `POST` | `/api/v1/auth/refresh`          | Refresh access token using refresh token                            | Public       |
| `POST` | `/api/v1/auth/logout`           | Revoke refresh token                                                | Bearer token |
| `POST` | `/api/v1/auth/mfa/enroll`       | Initiate TOTP enrollment — returns `otpauth://` URI for QR code     | Bearer token |
| `POST` | `/api/v1/auth/mfa/verify`       | Confirm TOTP code to complete enrollment; sets `mfa_enabled = true` | Bearer token |
| `POST` | `/api/v1/auth/mfa/authenticate` | Verify TOTP during login — Path B only (`TENANT_ADMIN`, `FINANCE`)  | Bearer token |

---

#### Project APIs

| Method  | Path                                  | Description                            | Auth                        |
| ------- | ------------------------------------- | -------------------------------------- | --------------------------- |
| `GET`   | `/api/v1/projects`                    | List projects for tenant (paginated)   | Any role                    |
| `POST`  | `/api/v1/projects`                    | Create project                         | Executive, PM, Tenant Admin |
| `GET`   | `/api/v1/projects/{project_id}`       | Get project detail                     | Any role                    |
| `PATCH` | `/api/v1/projects/{project_id}`       | Update project (status, budget, dates) | PM, Executive               |
| `GET`   | `/api/v1/projects/{project_id}/tasks` | List tasks for project                 | Any role                    |
| `POST`  | `/api/v1/projects/{project_id}/tasks` | Create task                            | PM, Site Engineer           |
| `PATCH` | `/api/v1/tasks/{task_id}`             | Update task progress / status          | SW, SE, PM, Admin           |

Example request — create project:

```json
POST /api/v1/projects
{
  "project_name": "Silom Tower Phase 2",
  "project_type": "commercial",
  "budget": 45000000,
  "start_date": "2026-06-01",
  "end_date": "2027-12-31"
}

```

---

#### Procurement APIs

| Method  | Path                                                  | Description                              | Auth                                   |
| ------- | ----------------------------------------------------- | ---------------------------------------- | -------------------------------------- |
| `GET`   | `/api/v1/procurement/purchase-requests`               | List PRs (filterable by status, project) | Any role                               |
| `POST`  | `/api/v1/procurement/purchase-requests`               | Create PR                                | PM, Site Engineer, Procurement Officer |
| `POST`  | `/api/v1/procurement/rfqs`                            | Create RFQ from PR                       | Procurement Officer                    |
| `GET`   | `/api/v1/procurement/rfqs`                            | List RFQs (filterable: status, project)  | Any role                               |
| `GET`   | `/api/v1/procurement/rfqs/{rfq_id}/quotations`        | List vendor quotations for RFQ           | Any role                               |
| `POST`  | `/api/v1/procurement/purchase-orders`                 | Create PO from selected quotation        | Procurement Officer                    |
| `GET`   | `/api/v1/procurement/purchase-orders`                 | List POs (filterable: status, project)   | Any role                               |
| `PATCH` | `/api/v1/procurement/purchase-orders/{po_id}/approve` | Approve PO (triggers approval workflow)  | PM, Finance, Executive                 |
| `POST`  | `/api/v1/procurement/deliveries`                      | Record delivery against PO               | Procurement Officer, Site Engineer     |
| `GET`   | `/api/v1/procurement/deliveries`                      | List deliveries (filterable: PO)         | Any role                               |
| `POST`  | `/api/v1/procurement/vendor-invoices`                 | Create vendor invoice against PO         | Procurement Officer, Finance           |

---

#### Financial APIs

| Method  | Path                                             | Description                            | Auth                           |
| ------- | ------------------------------------------------ | -------------------------------------- | ------------------------------ |
| `GET`   | `/api/v1/finance/budget/{project_id}`            | Budget summary with lines              | FINANCE, PM, EXEC, ADMIN       |
| `POST`  | `/api/v1/finance/budget/{project_id}`            | Create or update project budget        | FINANCE, ADMIN                 |
| `POST`  | `/api/v1/finance/budget/{project_id}/lines`      | Add a budget line                      | FINANCE, ADMIN                 |
| `GET`   | `/api/v1/finance/cost-transactions`              | List cost transactions (tenant-wide)   | FINANCE, PM, EXEC, ADMIN       |
| `POST`  | `/api/v1/finance/payments`                       | Record payment vs a vendor invoice     | FINANCE, ADMIN                 |
| `GET`   | `/api/v1/finance/payments`                       | List payments / AP queue (tenant-wide) | FINANCE, PM, EXEC, ADMIN       |
| `GET`   | `/api/v1/finance/reports/variance`               | Budget variance across projects        | FINANCE, EXEC, ADMIN           |
| `POST`  | `/api/v1/finance/customers`                      | Register a client/customer             | FINANCE, PM, CRM, ADMIN        |
| `GET`   | `/api/v1/finance/customers`                      | List customers                         | FINANCE, PM, EXEC, PROC, ADMIN |
| `POST`  | `/api/v1/finance/contracts`                      | Create a contract                      | PM, ADMIN                      |
| `GET`   | `/api/v1/finance/contracts`                      | List contracts (filterable by project) | FINANCE, PM, EXEC, PROC, ADMIN |
| `POST`  | `/api/v1/finance/billing`                        | Create client billing (AR) — DRAFT     | FINANCE, ADMIN                 |
| `GET`   | `/api/v1/finance/billing`                        | List client billings (tenant-wide)     | FINANCE, PM, EXEC, PROC, ADMIN |
| `GET`   | `/api/v1/finance/billing/{billing_id}`           | Get a client billing                   | FINANCE, PM, EXEC, PROC, ADMIN |
| `PATCH` | `/api/v1/finance/billing/{billing_id}/approve`   | Approve billing (DRAFT → ISSUED, §15)  | PM, EXEC, ADMIN                |
| `POST`  | `/api/v1/finance/ar-receipts`                    | Record client payment (billing → PAID) | FINANCE, ADMIN                 |
| `GET`   | `/api/v1/finance/cashflow-forecast/{project_id}` | 13-week direct-method cash forecast    | FINANCE, PM, EXEC, ADMIN       |

---

#### Site APIs

| Method  | Path                                         | Description                                           | Auth                             |
| ------- | -------------------------------------------- | ----------------------------------------------------- | -------------------------------- |
| `GET`   | `/api/v1/site/reports`                       | List daily site reports (filterable by project, date) | Any role                         |
| `POST`  | `/api/v1/site/reports`                       | Submit daily site report                              | SW, Site Engineer, PM, Admin     |
| `GET`   | `/api/v1/site/reports/{report_id}`           | Get site report detail                                | Any role                         |
| `POST`  | `/api/v1/site/reports/sync`                  | Bulk offline sync (per-item conflict status)          | SW, Site Engineer, PM, Admin     |
| `POST`  | `/api/v1/site/reports/{report_id}/materials` | Log material consumption                              | SW, Site Engineer, PM, Admin     |
| `GET`   | `/api/v1/site/issues`                        | List issues (filterable by severity, status, project) | Read roles + Safety              |
| `POST`  | `/api/v1/site/issues`                        | Create a site issue                                   | SW, Site Engineer, PM, Admin     |
| `PATCH` | `/api/v1/site/issues/{issue_id}`             | Update issue (field-level merge)                      | SW, SE, PM, Safety, Admin        |
| `POST`  | `/api/v1/site/inspections`                   | Submit QC inspection result                           | Site Engineer, Safety, Admin     |
| `GET`   | `/api/v1/site/inspections`                   | List inspection results (filter project, status)      | Exec, PM, SE, Safety, Admin      |
| `GET`   | `/api/v1/site/inspections/{inspection_id}`   | Get inspection result                                 | Exec, PM, SE, Safety, Admin      |
| `PATCH` | `/api/v1/site/inspections/{inspection_id}`   | Approve / request re-inspection (status transition)   | PM, Site Engineer, Safety, Admin |
| `GET`   | `/api/v1/site/conflict-records`              | List unresolved conflict records                      | Site Engineer, PM, Admin         |
| `PATCH` | `/api/v1/site/conflict-records/{id}/resolve` | Mark conflict record resolved                         | Site Engineer, PM, Admin         |
| `GET`   | `/api/v1/site/checklists`                    | List safety checklists (complete via inspections)     | SW, SE, PM, Safety, Admin        |
| `GET`   | `/api/v1/site/permits`                       | List permits (filterable by project, type, status)    | Any role                         |
| `POST`  | `/api/v1/site/permits`                       | Create permit request                                 | PM, Safety Officer               |

---

#### Workforce APIs

| Method  | Path                                                   | Description                                           | Auth              |
| ------- | ------------------------------------------------------ | ----------------------------------------------------- | ----------------- |
| `POST`  | `/api/v1/workforce/check-in`                           | Record worker check-in                                | PM, Site Engineer |
| `PATCH` | `/api/v1/workforce/check-in/{attendance_id}/check-out` | Record worker check-out                               | PM, Site Engineer |
| `GET`   | `/api/v1/workforce/attendance`                         | List attendance records (filterable by project, date) | Any role          |

---

#### Equipment APIs

| Method  | Path                               | Description                                                        | Auth                    |
| ------- | ---------------------------------- | ------------------------------------------------------------------ | ----------------------- |
| `GET`   | `/api/v1/equipment`                | List equipment (filterable by project, type, status)               | Any role                |
| `POST`  | `/api/v1/equipment`                | Register equipment                                                 | PM, Procurement Officer |
| `GET`   | `/api/v1/equipment/{equipment_id}` | Get equipment detail                                               | Any role                |
| `PATCH` | `/api/v1/equipment/{equipment_id}` | Update equipment status or assignment                              | PM, Site Engineer       |
| `POST`  | `/api/v1/equipment/usage-logs`     | Record equipment usage against a project                           | PM, Site Engineer       |
| `GET`   | `/api/v1/equipment/usage-logs`     | List equipment usage logs (filterable by equipment, project, date) | Any role                |

---

#### Files APIs

| Method   | Path                                  | Description                                                                                                         | Auth         |
| -------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------ |
| `POST`   | `/api/v1/files/upload`                | Upload file; returns `file_id` and signed download URL                                                              | Any role     |
| `GET`    | `/api/v1/files/{file_id}`             | Get file metadata and a short-lived download URL                                                                    | Any role     |
| `DELETE` | `/api/v1/files/{file_id}`             | Soft-delete file; automatic hard-delete from MinIO 30 days later (see `09-data-architecture` File Lifecycle Policy) | Tenant Admin |
| `GET`    | `/api/v1/projects/{project_id}/files` | List files attached to a project (filterable by type, uploader)                                                     | Any role     |

---

#### Safety APIs

| Method  | Path                                                 | Description                       | Auth                          |
| ------- | ---------------------------------------------------- | --------------------------------- | ----------------------------- |
| `POST`  | `/api/v1/safety/incidents`                           | Report safety incident            | Site Engineer, Safety Officer |
| `PATCH` | `/api/v1/safety/incidents/{incident_id}/acknowledge` | Acknowledge incident              | Safety Officer                |
| `GET`   | `/api/v1/safety/checklists`                          | List safety checklists            | Any role                      |
| `POST`  | `/api/v1/safety/checklists`                          | Submit completed safety checklist | Site Engineer, Safety Officer |

---

#### AI APIs

All AI endpoints are under `/api/v1/ai/` with separate token-rate limiting
(see section 14.2 and `26-pricing-model` section 26.1).

| Method | Path                             | Description                                      | Auth              |
| ------ | -------------------------------- | ------------------------------------------------ | ----------------- |
| `POST` | `/api/v1/ai/report/generate`     | Generate daily site report draft from raw inputs | PM, Site Engineer |
| `POST` | `/api/v1/ai/documents/summarize` | Summarize uploaded document                      | Any role          |
| `POST` | `/api/v1/ai/documents/ocr`       | Extract text from image or PDF                   | Any role          |
| `POST` | `/api/v1/ai/voice/transcribe`    | Transcribe voice note to text                    | Any role          |
| `POST` | `/api/v1/ai/copilot/query`       | Query the AI Copilot with context (RAG-backed)   | Any role          |

Example — generate report:

```json
POST /api/v1/ai/report/generate
{
  "project_id": "proj_001",
  "report_date": "2026-05-24",
  "raw_notes": "งานเทพื้นชั้น 3 เสร็จ 80% แรงงาน 25 คน",
  "language": "th"
}

```

---

#### CRM APIs (Schema-built; UI post-MVP)

| Method  | Path                                     | Description                     | Auth                           |
| ------- | ---------------------------------------- | ------------------------------- | ------------------------------ |
| `GET`   | `/api/v1/crm/leads`                      | List leads                      | Executive, CRM / Sales Manager |
| `POST`  | `/api/v1/crm/leads`                      | Create lead                     | CRM / Sales Manager            |
| `POST`  | `/api/v1/crm/opportunities`              | Create opportunity from lead    | CRM / Sales Manager            |
| `PATCH` | `/api/v1/crm/opportunities/{id}/convert` | Convert opportunity to Customer | CRM / Sales Manager            |

---

#### Vendor APIs

| Method | Path                                                 | Description                       | Auth                |
| ------ | ---------------------------------------------------- | --------------------------------- | ------------------- |
| `GET`  | `/api/v1/procurement/vendors`                        | List vendors                      | Any role            |
| `POST` | `/api/v1/procurement/vendors`                        | Register vendor                   | Procurement Officer |
| `GET`  | `/api/v1/procurement/vendors/{vendor_id}`            | Get vendor detail with rating     | Any role            |
| `GET`  | `/api/v1/procurement/vendors/{vendor_id}/quotations` | List quotation history for vendor | Any role            |

---

#### User Management APIs

Managed by **Tenant Admin** (FULL permission — see `06-rbac-permission-matrix` §6.4).
All endpoints are tenant-scoped via JWT `tenant_id` claim; a Tenant Admin can only
manage users within their own tenant.

Path A users (SITE_ENGINEER — the authoritative field-worker role per `06-rbac-permission-matrix` §6.2) are identified by phone number.
Path B users (all other roles) are identified by email address and require a
corresponding Keycloak account in the tenant's realm.

| Method  | Path                                 | Description                                                                   | Auth         |
| ------- | ------------------------------------ | ----------------------------------------------------------------------------- | ------------ |
| `GET`   | `/api/v1/users`                      | List all users in the tenant (paginated)                                      | Tenant Admin |
| `POST`  | `/api/v1/users`                      | Create a user within the tenant; emits `identity.user.created.v1`             | Tenant Admin |
| `PATCH` | `/api/v1/users/{user_id}/role`       | Change a user's role within the tenant; emits `identity.user.role_changed.v1` | Tenant Admin |
| `PATCH` | `/api/v1/users/{user_id}/deactivate` | Deactivate a user (revokes access, preserves data)                            | Tenant Admin |

Request body — create user (Path A, phone OTP):

```json
POST /api/v1/users
{
  "display_name": "สมชาย ใจดี",
  "phone_number": "+66812345678",
  "role": "SITE_ENGINEER"
}
```

Request body — create user (Path B, email / Keycloak):

```json
POST /api/v1/users
{
  "display_name": "วิชัย รุ่งเรือง",
  "email": "wichai@acmecorp.co.th",
  "role": "PROJECT_MANAGER"
}
```

Request body — change role:

```json
PATCH /api/v1/users/{user_id}/role
{
  "role": "FINANCE"
}
```

Kafka events emitted:

| Event                           | Trigger                                       |
| ------------------------------- | --------------------------------------------- |
| `identity.user.created.v1`      | `POST /api/v1/users` succeeds                 |
| `identity.user.role_changed.v1` | `PATCH /api/v1/users/{user_id}/role` succeeds |

---

## 14.4 API Versioning

Strategy :

- URL path versioning — /api/v1/, /api/v2/
- Version is mandatory in all public API paths

Lifecycle :

- Minimum 12 months deprecation notice before a version is sunset
- At least 2 major versions supported simultaneously at all times
- Deprecated version returns Deprecation and Sunset headers in every response
- Sunset dates and tenant notification log: `docs/api/deprecation-schedule.md`
- Tenants must be notified ≥ 90 days before sunset via email + in-app banner (Notification Service)

Breaking vs Non-breaking :

- Non-breaking (new optional fields, new endpoints) — same version, no notice required
- Breaking (remove field, rename field, change response shape) — new major version required

---

## 14.5 Kong Traffic Authentication and Quota Enforcement

### Authentication Plugin

Kong Gateway uses the `jwt` plugin on all `/api/v1/*` routes. **Keycloak signs all user JWTs**
(both Path A via Direct Grant and Path B via OIDC — master Phase 2; §5.4), so the plugin validates
signatures against a single JWKS endpoint:

| Issuer         | JWKS Endpoint                                                  | Token Type                                          |
| -------------- | -------------------------------------------------------------- | --------------------------------------------------- |
| Keycloak realm | `{keycloak_base}/realms/{realm}/protocol/openid-connect/certs` | Path A + Path B user JWT; OAuth2 client credentials |

The COS identity service performs OTP send/verify only — it does **not** sign JWTs. Token `iss`
claim is validated against the Keycloak JWKS endpoint.

### Traffic Type Distinction

Kong identifies external OAuth2 client credential traffic by Consumer lookup on the `azp`
(Authorized Party) claim:

| Traffic Type                     | `iss`          | `azp`                     | `session_state` | Kong Consumer           |
| -------------------------------- | -------------- | ------------------------- | --------------- | ----------------------- |
| Internal — Path A (field worker) | Keycloak realm | absent                    | Present         | No — anonymous consumer |
| Internal — Path B (office user)  | Keycloak realm | `cos-web` or `cos-mobile` | Present         | No — anonymous consumer |
| External — marketplace / ERP     | Keycloak realm | registered `client_id`    | Absent          | Yes — matched consumer  |

`jwt` plugin is configured with:

```yaml
key_claim_name: azp
anonymous: <anonymous-consumer-id>
```

When `azp` is absent or does not match a registered Kong Consumer, Kong assigns the request
to the anonymous consumer. The anonymous consumer has per-minute rate limiting only —
monthly quota plugin does not fire.

### Kong Consumer and Consumer Group Model

External API clients (marketplace integrations, ERP adapters) are provisioned as Kong
Consumers at API key issuance. Each consumer maps to one Keycloak `client_id`.

**Provisioning sequence (at marketplace API key issuance):**

1. Create Keycloak OAuth2 client (client credentials grant) → generate `client_id` + `client_secret`
2. Create Kong Consumer: `username = {client_id}`, `custom_id = {tenant_id}:{client_id}`
3. Register JWT credential on consumer: `key = {client_id}`, validated via Keycloak JWKS
4. Add consumer to Consumer Group `external-{tenant_id}` (create group if it does not exist)
5. Apply per-API-key monthly `rate-limiting` plugin to the consumer (§13.5 per-key quota table)

Tenant-level monthly quota is enforced at the Consumer Group level — one group per tenant,
covering all external consumers of that tenant:

| Limit                     | Enforced at                           | Config source             |
| ------------------------- | ------------------------------------- | ------------------------- |
| Per-minute                | Route `/api/v1/*` (all traffic)       | §14.2 rate limit table    |
| Monthly tenant quota      | Consumer Group `external-{tenant_id}` | §13.5 monthly quota table |
| Monthly per-API-key quota | Consumer (per `client_id`)            | §13.5 per-API-key table   |

A request is rejected (HTTP 429) if **any** of the three limits is exceeded.

### Plugin Stack Summary

| Plugin                                  | Applied at                            | Traffic scope                                    |
| --------------------------------------- | ------------------------------------- | ------------------------------------------------ |
| `jwt`                                   | Route (all `/api/v1/*`)               | All traffic — validates signature, `iss`, expiry |
| `rate-limiting` (per-minute)            | Route (all `/api/v1/*`)               | All traffic — burst / anti-abuse                 |
| `rate-limiting` (monthly tenant quota)  | Consumer Group `external-{tenant_id}` | External client credentials only                 |
| `rate-limiting` (monthly per-key quota) | Consumer (per `client_id`)            | External client credentials only                 |

---

## References

| ID         | Title                                                              | Source                                                               |
| ---------- | ------------------------------------------------------------------ | -------------------------------------------------------------------- |
| [IEEE 830] | IEEE Recommended Practice for Software Requirements Specifications | IEEE Std 830-1998                                                    |
| [REST-RFC] | Hypertext Transfer Protocol — HTTP/1.1                             | RFC 7231                                                             |
| [JWT-RFC]  | JSON Web Token (JWT)                                               | RFC 7519                                                             |
| [OAuth2]   | The OAuth 2.0 Authorization Framework                              | RFC 6749                                                             |
| [OpenAPI]  | OpenAPI Specification v3.1.0                                       | [spec.openapis.org/oas/v3.1.0](https://spec.openapis.org/oas/v3.1.0) |
| [Kong]     | Kong Gateway Documentation                                         | [docs.konghq.com](https://docs.konghq.com/)                          |
| [GraphQL]  | GraphQL Specification                                              | [spec.graphql.org](https://spec.graphql.org/)                        |

> 📎 See also: [03-system-design](03-system-design.md) · [13-product-architecture](13-product-architecture.md)
> · [15-event-driven-workflow](15-event-driven-workflow.md) · [26-pricing-model](26-pricing-model.md)
