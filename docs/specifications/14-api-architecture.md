---
title: 'API Architecture'
version: '1.4.0'
status: Active
last_updated: '2026-06-20'
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

| Domain             | OpenAPI File                                     | Scope                                                                                                                  |
| ------------------ | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Authentication     | [auth](../api/auth.openapi.yaml)                 | MVP                                                                                                                    |
| Tenant Management  | [tenant](../api/tenant.openapi.yaml)             | MVP                                                                                                                    |
| Projects           | [project](../api/project.openapi.yaml)           | MVP                                                                                                                    |
| Procurement        | [procurement](../api/procurement.openapi.yaml)   | MVP                                                                                                                    |
| Financial          | [finance](../api/finance.openapi.yaml)           | MVP                                                                                                                    |
| Bill of Quantities | [BOQ](../api/boq.openapi.yaml)                   | MVP                                                                                                                    |
| Workforce          | [workforce](../api/workforce.openapi.yaml)       | MVP                                                                                                                    |
| Equipment          | [equipment](../api/equipment.openapi.yaml)       | MVP                                                                                                                    |
| Files              | [file](../api/file.openapi.yaml)                 | MVP                                                                                                                    |
| Notifications      | [notification](../api/notification.openapi.yaml) | MVP                                                                                                                    |
| Site               | [site-ops](../api/site-ops.openapi.yaml)         | MVP                                                                                                                    |
| Safety             | [safety](../api/safety.openapi.yaml)             | MVP                                                                                                                    |
| AI                 | [ai](../api/ai.openapi.yaml)                     | MVP                                                                                                                    |
| CRM                | [crm](../api/crm.openapi.yaml)                   | MVP                                                                                                                    |
| Vendor Portal      | [vendor](../api/vendor.openapi.yaml)             | MVP - external vendor self-service (RFQ / quotation / PO status / invoice). Internal vendor mgmt is under Procurement. |
| Knowledge Graph    | [graph](../api/graph.openapi.yaml)               | MVP (Phase 13)                                                                                                         |
| Analytics          | [analytics](../api/analytics.openapi.yaml)       | MVP (Phase 14)                                                                                                         |
| Digital Twin       | [digital-twin](../api/digital-twin.openapi.yaml) | **Post-MVP — Phase 24 (SaaS maturity Stage 5 / Year 5+)** (not created before Phase 24 begins)                         |
| Offline Sync       | [sync](../api/sync.openapi.yaml)                 | MVP (Phase 10) — the device↔server transport, not a domain. Added to this table 2026-08-24.                            |
| Master Data        | [master-data](../api/master-data.openapi.yaml)   | MVP — tenant-controlled vocabularies (materials, work/issue/cost categories). Added 2026-08-24.                        |
| Geo                | [geo](../api/geo.openapi.yaml)                   | MVP — reverse geocoding against the in-cluster Nominatim. Added 2026-08-24.                                            |

The endpoint patterns below serve as the canonical reference;
OpenAPI files are the machine-readable contracts derived from these patterns.

---

#### Authentication APIs

Two authentication paths (authoritative spec: `05-security-compliance` §5.4):

- **Path A** — phone + 6-digit SMS OTP. The COS identity service performs OTP send/verify only;
  after verification it obtains the JWT from **Keycloak via Direct Grant** (`grant_type=password`,
  ephemeral credential) — the token is **Keycloak-signed (RS256)**. Keycloak is the single source of
  truth for JWT signing on both paths (master Phase 2; `05-security-compliance` §5.4).
- **Path B** — email + password via Keycloak OIDC: JWT issued by Keycloak (RS256). MFA (TOTP)
  required for `TENANT_ADMIN` and `FINANCE`.

**Which users may use which path is `05-security-compliance` §5.4.4, not this section.** Since
2026-08-21 both paths are open to all roles except `TENANT_ADMIN` and `FINANCE`, which are Path B
only. The earlier "Path A for field workers / Path B for office roles" wording described a
convention, not a restriction, and is not repeated here.

| Method | Path                            | Description                                                                   | Auth         |
| ------ | ------------------------------- | ----------------------------------------------------------------------------- | ------------ |
| `POST` | `/api/v1/auth/otp/request`      | Request SMS OTP — Path A (any role except `TENANT_ADMIN` / `FINANCE`, §5.4.4) | Public       |
| `POST` | `/api/v1/auth/otp/verify`       | Verify OTP; returns `access_token` + `refresh_token`                          | Public       |
| `POST` | `/api/v1/auth/refresh`          | Refresh access token using refresh token                                      | Public       |
| `POST` | `/api/v1/auth/logout`           | Revoke refresh token                                                          | Bearer token |
| `POST` | `/api/v1/auth/mfa/enroll`       | Initiate TOTP enrollment — returns `otpauth://` URI for QR code               | Bearer token |
| `POST` | `/api/v1/auth/mfa/verify`       | Confirm TOTP code to complete enrollment; sets `mfa_enabled = true`           | Bearer token |
| `POST` | `/api/v1/auth/mfa/authenticate` | Verify TOTP during login (`TENANT_ADMIN`, `FINANCE` — Path B only per §5.4.4) | Bearer token |

Five further routes on this controller, tabled 2026-08-24 — they had run since their ADRs shipped,
named in no §14 table and carried by no OpenAPI document:

| Method | Path                                         | Description                                                       | Auth         |
| ------ | -------------------------------------------- | ----------------------------------------------------------------- | ------------ |
| `POST` | `/api/v1/auth/step-up/request`               | Send a 6-digit code to re-prove possession — ADR-078              | Bearer token |
| `POST` | `/api/v1/auth/step-up/verify`                | Exchange the code for a single-use, 5-minute action token         | Bearer token |
| `POST` | `/api/v1/auth/devices/attestation-challenge` | Mint a single-use nonce for Play Integrity / App Attest — ADR-083 | Bearer token |
| `GET`  | `/api/v1/auth/devices/{device_id}/trust`     | Advisory trust score for the caller's OWN device — ADR-081        | Bearer token |
| `GET`  | `/api/v1/auth/roles/{role}/permissions`      | The §6.4 grant set for a role, read-only                          | Bearer token |

Three properties are load-bearing and easy to erode:

- **A step-up confirms an already-authenticated caller; it never authenticates one.** The action
  token it issues is not a session and can never be exchanged for one — it is bound to one user and
  one action, lives 5 minutes, and is consumed on first use.
- **The attestation challenge is consumed on use, and a mismatch records no attestation rather than
  refusing enrolment.** Attestation never blocks (ADR-054); a token not bound to a nonce this server
  issued would otherwise be replayable indefinitely.
- **The trust score is ADVISORY.** It never revokes a device and never blocks a login — §22.3 bars a
  model from executing a transition that requires a human, and ADR-081 holds the property while the
  scorer is rules so a regression cannot become a lockout. `scoredBy` names the scorer because
  ADR-081 forbids calling the rule-based path AI-derived.

---

#### Project APIs

| Method  | Path                                  | Description                            | Auth                        |
| ------- | ------------------------------------- | -------------------------------------- | --------------------------- |
| `GET`   | `/api/v1/projects`                    | List projects for tenant (paginated)   | Any role                    |
| `POST`  | `/api/v1/projects`                    | Create project                         | Executive, PM, Tenant Admin |
| `GET`   | `/api/v1/projects/mine`               | The caller's own project memberships   | Any role                    |
| `GET`   | `/api/v1/projects/user/{user_id}`     | A named user's project memberships     | Tenant Admin                |
| `GET`   | `/api/v1/projects/{project_id}`       | Get project detail                     | Any role                    |
| `PATCH` | `/api/v1/projects/{project_id}`       | Update project (status, budget, dates) | PM, Executive               |
| `GET`   | `/api/v1/projects/{project_id}/tasks` | List tasks for project                 | Any role                    |
| `POST`  | `/api/v1/projects/{project_id}/tasks` | Create task                            | PM, Site Engineer           |
| `PATCH` | `/api/v1/tasks/{task_id}`             | Update task progress / status          | SW, SE, PM, Admin           |

`/projects/mine` and `/projects/user/{user_id}` answer the same question from two directions — which
projects a person belongs to. They are separate endpoints because the authorisation differs, not the
data: `mine` is scoped by the JWT and needs no role, while asking about **another** person is a
`TENANT_ADMIN` action. That is why it is a gated path rather than an optional `?user_id` on
`/projects/mine` — a query parameter that silently changes who you are asking about is the shape that
gets shipped without a guard. A tenant admin needs it to offboard someone: before deactivating a user
you have to know what they are still on. Both are tenant-scoped like every other read, so an admin
cannot ask about a user in another tenant.

Recorded here 2026-08-22. Both were built and gated but named in no specification —
[OQ-21](../technical-design/README.md#open-questions-register). This paragraph also claimed they were
"documented in OpenAPI"; they were not, in this or any other file, until 2026-08-24.

**Project phases** (ADR-070) and the **risk register** (ADR-065) hang off a project and are tabled
in their own ADR sections below. Read is any authenticated tenant user for both; writing a phase is
PM or Tenant Admin, raising a risk additionally allows Site Engineer — a risk is usually noticed on
site — and editing or closing one narrows back to PM / Tenant Admin.

| Method  | Path                                   | Description                                  | Auth             |
| ------- | -------------------------------------- | -------------------------------------------- | ---------------- |
| `GET`   | `/api/v1/projects/{project_id}/phases` | List phases, ordered by `seq`                | Any role         |
| `POST`  | `/api/v1/projects/{project_id}/phases` | Create a phase (`seq` unique per project)    | PM, Tenant Admin |
| `PATCH` | `/api/v1/phases/{phase_id}`            | Update a phase (status / seq / name / dates) | PM, Tenant Admin |

The CURRENT phase is **not stored**. It is derived — the lowest-`seq` phase that is `IN_PROGRESS`,
else the lowest-`seq` phase not `COMPLETED`, else none — so there is no second place for it to be
wrong.

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

| Method  | Path                                                  | Description                                          | Auth                                   |
| ------- | ----------------------------------------------------- | ---------------------------------------------------- | -------------------------------------- |
| `GET`   | `/api/v1/procurement/purchase-requests`               | List PRs (filterable by status, project)             | Any role                               |
| `POST`  | `/api/v1/procurement/purchase-requests`               | Create PR                                            | PM, Site Engineer, Procurement Officer |
| `POST`  | `/api/v1/procurement/rfqs`                            | Create RFQ from PR                                   | Procurement Officer                    |
| `GET`   | `/api/v1/procurement/rfqs`                            | List RFQs (filterable: status, project)              | Any role                               |
| `GET`   | `/api/v1/procurement/rfqs/{rfq_id}/quotations`        | List vendor quotations for RFQ                       | Any role                               |
| `POST`  | `/api/v1/procurement/purchase-orders`                 | Create PO from selected quotation                    | Procurement Officer                    |
| `GET`   | `/api/v1/procurement/purchase-orders`                 | List POs (filterable: status, project)               | Any role                               |
| `PATCH` | `/api/v1/procurement/purchase-orders/{po_id}/approve` | Approve PO (triggers approval workflow)              | PM, Finance, Executive                 |
| `POST`  | `/api/v1/procurement/deliveries`                      | Record delivery against PO                           | Procurement Officer, Site Engineer     |
| `GET`   | `/api/v1/procurement/deliveries`                      | List deliveries (filterable: PO)                     | Any role                               |
| `POST`  | `/api/v1/procurement/vendor-invoices`                 | Create vendor invoice against PO                     | Procurement Officer, Finance           |
| `POST`  | `/api/v1/procurement/warehouses`                      | Create a warehouse — ADR-060                         | Procurement Officer, ADMIN             |
| `GET`   | `/api/v1/procurement/warehouses`                      | List warehouses                                      | Any role                               |
| `GET`   | `/api/v1/procurement/inventory`                       | Stock-on-hand (by warehouse/material; low-stock)     | Any role                               |
| `POST`  | `/api/v1/procurement/grn`                             | Goods receipt from a delivery (stock-only) — ADR-060 | Procurement Officer, Site Engineer     |
| `GET`   | `/api/v1/procurement/grn`                             | List goods-receipt notes                             | Any role                               |
| `POST`  | `/api/v1/procurement/stock-movements`                 | Issue / transfer / adjust stock — ADR-060            | Procurement Officer, Site Engineer     |
| `GET`   | `/api/v1/procurement/stock-movements`                 | Stock movement ledger                                | Any role                               |

Four further routes on this surface, tabled 2026-08-24:

| Method | Path                                                       | Description                                   | Auth                  |
| ------ | ---------------------------------------------------------- | --------------------------------------------- | --------------------- |
| `GET`  | `/api/v1/procurement/vendor-invoices/{invoice_id}`         | Get a vendor invoice                          | Read roles            |
| `POST` | `/api/v1/procurement/vendor-invoices/{invoice_id}/dispute` | Dispute it (→ DISPUTED)                       | Finance, Tenant Admin |
| `POST` | `/api/v1/procurement/vendor-invoices/{invoice_id}/note`    | Set the free-text note                        | Finance, Tenant Admin |
| `GET`  | `/api/v1/procurement/vendors/{vendor_id}/score`            | Scorecard (on-time / quality / price → grade) | Read roles            |

A dispute is a HOLD, not a rejection: it stops the invoice being paid while the disagreement is
open, and the invoice stays on the ledger. The scorecard is derived from the vendor's own delivery
and quotation history — there is no manually entered rating that can disagree with it.

---

#### Reference Pricing (ราคากลาง) APIs — ADR-061

| Method | Path                                       | Description                               | Auth         |
| ------ | ------------------------------------------ | ----------------------------------------- | ------------ |
| `POST` | `/api/v1/admin/central-prices/import`      | Import central-price catalog (CSV/Excel)  | SYSTEM_ADMIN |
| `GET`  | `/api/v1/central-prices`                   | Lookup central prices by code/description | Any role     |
| `GET`  | `/api/v1/boq/projects/{id}/price-variance` | BOQ-vs-ราคากลาง variance report           | Any role     |

---

#### Preconstruction (e-GP) APIs — ADR-062

| Method  | Path                                         | Description                             | Auth                       |
| ------- | -------------------------------------------- | --------------------------------------- | -------------------------- |
| `GET`   | `/api/v1/preconstruction/tenders`            | List tenders (filter by status)         | CRM/Sales, PM, EXEC, ADMIN |
| `POST`  | `/api/v1/preconstruction/tenders`            | Create tender (manual)                  | CRM/Sales, PM, ADMIN       |
| `POST`  | `/api/v1/preconstruction/tenders/sync`       | Pull tenders via EgpAdapter — ADR-062   | CRM/Sales, ADMIN           |
| `POST`  | `/api/v1/preconstruction/tenders/{id}/bids`  | Create a bid from BOQ                   | CRM/Sales, PM, ADMIN       |
| `POST`  | `/api/v1/preconstruction/bids/{id}/submit`   | Submit bid (adapter or manual)          | CRM/Sales, PM, EXEC, ADMIN |
| `PATCH` | `/api/v1/preconstruction/tenders/{id}/award` | Record WON/LOST (WON → create Contract) | CRM/Sales, EXEC, ADMIN     |

---

#### Permits & Licences APIs — ADR-064

| Method  | Path                          | Description                                             | Auth      |
| ------- | ----------------------------- | ------------------------------------------------------- | --------- |
| `GET`   | `/api/v1/permits`             | List permits/licences (`?type`/`?project_id`/`?status`) | Any role  |
| `POST`  | `/api/v1/permits`             | Record a permit / licence (incl. building permit)       | PM, ADMIN |
| `PATCH` | `/api/v1/permits/{id}/status` | Transition active / expired / revoked — ADR-064         | PM, ADMIN |

---

#### Project Risk Register APIs — ADR-065

| Method  | Path                                          | Description                                | Auth                     |
| ------- | --------------------------------------------- | ------------------------------------------ | ------------------------ |
| `GET`   | `/api/v1/projects/{id}/risks`                 | List risks (`?status` / `?category`)       | Any role                 |
| `POST`  | `/api/v1/projects/{id}/risks`                 | Raise a risk — ADR-065                     | PM, Site Engineer, ADMIN |
| `PATCH` | `/api/v1/projects/{id}/risks/{riskId}`        | Edit a risk (likelihood/impact/mitigation) | PM, ADMIN                |
| `PATCH` | `/api/v1/projects/{id}/risks/{riskId}/status` | Transition OPEN/MITIGATING/CLOSED/ACCEPTED | PM, ADMIN                |

---

#### Document-Control (site instruction / minutes / correspondence) APIs — ADR-066

| Method  | Path                                                            | Description                     | Auth                     |
| ------- | --------------------------------------------------------------- | ------------------------------- | ------------------------ |
| `GET`   | `/api/v1/projects/{id}/communications`                          | List records (`?type`)          | Any role                 |
| `POST`  | `/api/v1/projects/{id}/communications`                          | Create record — ADR-066         | PM, Site Engineer, ADMIN |
| `POST`  | `/api/v1/projects/{id}/communications/{recordId}/actions`       | Add an action item              | PM, Site Engineer, ADMIN |
| `PATCH` | `/api/v1/projects/{id}/communications/{recordId}/actions/{aid}` | Action item OPEN/DONE — ADR-066 | PM, Site Engineer, ADMIN |

---

#### Financial APIs

| Method  | Path                                             | Description                                                         | Auth                           |
| ------- | ------------------------------------------------ | ------------------------------------------------------------------- | ------------------------------ |
| `GET`   | `/api/v1/finance/budget/{project_id}`            | Budget summary with lines                                           | FINANCE, PM, EXEC, ADMIN       |
| `POST`  | `/api/v1/finance/budget/{project_id}`            | Create or update project budget                                     | FINANCE, ADMIN                 |
| `POST`  | `/api/v1/finance/budget/{project_id}/lines`      | Add a budget line                                                   | FINANCE, ADMIN                 |
| `GET`   | `/api/v1/finance/cost-transactions`              | List cost transactions (tenant-wide)                                | FINANCE, PM, EXEC, ADMIN       |
| `POST`  | `/api/v1/finance/payments`                       | Record payment vs a vendor invoice                                  | FINANCE, ADMIN                 |
| `GET`   | `/api/v1/finance/payments`                       | List payments / AP queue (tenant-wide)                              | FINANCE, PM, EXEC, ADMIN       |
| `PATCH` | `/api/v1/finance/payments/{payment_id}/approve`  | Approve pending payment (→ PROCESSED)                               | FINANCE, ADMIN                 |
| `GET`   | `/api/v1/finance/reports/variance`               | Budget variance across projects                                     | FINANCE, EXEC, ADMIN           |
| `POST`  | `/api/v1/finance/customers`                      | Register a client/customer                                          | FINANCE, PM, CRM, ADMIN        |
| `GET`   | `/api/v1/finance/customers`                      | List customers                                                      | FINANCE, PM, EXEC, PROC, ADMIN |
| `POST`  | `/api/v1/finance/contracts`                      | Create a contract                                                   | PM, ADMIN                      |
| `GET`   | `/api/v1/finance/contracts`                      | List contracts (filterable by project)                              | FINANCE, PM, EXEC, PROC, ADMIN |
| `POST`  | `/api/v1/finance/contracts/{id}/document`        | Attach contract doc (upload \| generate) — ADR-058                  | PM, EXEC, ADMIN                |
| `POST`  | `/api/v1/finance/contracts/{id}/sign`            | Contractor-side signature (PKI/VC) — ADR-058                        | PM, EXEC, ADMIN                |
| `POST`  | `/api/v1/finance/contracts/{id}/sign-links`      | Issue client magic-link to sign — ADR-058                           | PM, EXEC, ADMIN                |
| `POST`  | `/api/v1/finance/contracts/sign/{token}`         | External client signs via magic-link (tenant-mw excluded) — ADR-058 | magic-link token               |
| `GET`   | `/api/v1/finance/contracts/{id}/signatures`      | Signature audit trail                                               | FINANCE, PM, EXEC, PROC, ADMIN |
| `POST`  | `/api/v1/finance/contracts/{id}/activate`        | Put a fully-signed contract into force (SIGNED → ACTIVE) — ADR-058  | PM, ADMIN                      |
| `POST`  | `/api/v1/finance/contracts/{id}/terminate`       | Terminate a contract (SIGNED \| ACTIVE → TERMINATED) — ADR-058      | PM, ADMIN                      |
| `POST`  | `/api/v1/finance/contracts/{id}/variations`      | Create Variation Order (DRAFT) — ADR-059                            | PM, ADMIN                      |
| `GET`   | `/api/v1/finance/variations`                     | List VOs (tenant-wide; ?contract_id/project_id)                     | FINANCE, PM, EXEC, PROC, ADMIN |
| `PATCH` | `/api/v1/finance/variations/{id}/submit`         | DRAFT → SUBMITTED — ADR-059                                         | PM, ADMIN                      |
| `PATCH` | `/api/v1/finance/variations/{id}/approve`        | SUBMITTED → APPROVED (AR chain) → auto-adjust                       | PM, EXEC, ADMIN                |
| `PATCH` | `/api/v1/finance/variations/{id}/reject`         | SUBMITTED → REJECTED — ADR-059                                      | PM, EXEC, ADMIN                |
| `POST`  | `/api/v1/finance/claims`                         | Create a contractor claim — ADR-059                                 | PM, ADMIN                      |
| `GET`   | `/api/v1/finance/claims`                         | List claims (tenant-wide; ?contract_id)                             | FINANCE, PM, EXEC, PROC, ADMIN |
| `PATCH` | `/api/v1/finance/claims/{id}/accept`             | ACCEPTED → convert to VO — ADR-059                                  | PM, EXEC, ADMIN                |
| `PATCH` | `/api/v1/finance/claims/{id}/reject`             | Reject a claim — ADR-059                                            | PM, EXEC, ADMIN                |
| `POST`  | `/api/v1/finance/bonds`                          | Record a bank guarantee / bond — ADR-063                            | FINANCE, PM, ADMIN             |
| `GET`   | `/api/v1/finance/bonds`                          | List bonds (?contract_id/tender_id/status)                          | FINANCE, PM, EXEC, ADMIN       |
| `PATCH` | `/api/v1/finance/bonds/{id}/status`              | Transition ACTIVE/RELEASED/CALLED/EXPIRED — ADR-063                 | FINANCE, PM, ADMIN             |
| `POST`  | `/api/v1/finance/billing`                        | Create client billing (AR) — DRAFT                                  | FINANCE, ADMIN                 |
| `GET`   | `/api/v1/finance/billing`                        | List client billings (tenant-wide)                                  | FINANCE, PM, EXEC, PROC, ADMIN |
| `GET`   | `/api/v1/finance/billing/{billing_id}`           | Get a client billing                                                | FINANCE, PM, EXEC, PROC, ADMIN |
| `PATCH` | `/api/v1/finance/billing/{billing_id}/approve`   | Approve billing (DRAFT → ISSUED, §15)                               | PM, EXEC, ADMIN                |
| `POST`  | `/api/v1/finance/ar-receipts`                    | Record client payment (billing → PAID)                              | FINANCE, ADMIN                 |
| `GET`   | `/api/v1/finance/cashflow-forecast/{project_id}` | 13-week direct-method cash forecast                                 | FINANCE, PM, EXEC, ADMIN       |

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
| `POST`  | `/api/v1/site/issues/{issue_id}/escalate`    | Escalate an issue to the PM (in-app notification)     | SW, SE, PM, Safety, Admin        |

Escalation is open to everyone who can raise an issue, deliberately: the person who finds the
blocker is usually the one who needs it escalated, and a narrower list routes the decision through
whoever happens to hold a role. Tabled 2026-08-24.

---

#### Workforce APIs

| Method  | Path                                              | Description                         | Auth              |
| ------- | ------------------------------------------------- | ----------------------------------- | ----------------- |
| `POST`  | `/api/v1/workers`                                 | Register a worker                   | PM, Site Engineer |
| `GET`   | `/api/v1/workers`                                 | List workers (tenant-scoped)        | Any role          |
| `GET`   | `/api/v1/workers/{worker_id}`                     | Get worker detail                   | Any role          |
| `POST`  | `/api/v1/workers/{worker_id}/attendance`          | Record check-in / check-out         | PM, Site Engineer |
| `GET`   | `/api/v1/workers/{worker_id}/attendance`          | Attendance history (date range)     | Any role          |
| `POST`  | `/api/v1/projects/{project_id}/workforce`         | Allocate a worker to a project      | PM, Site Engineer |
| `GET`   | `/api/v1/projects/{project_id}/workforce`         | List project workforce              | Any role          |
| `GET`   | `/api/v1/projects/{project_id}/workforce/summary` | Manpower summary (analytics)        | Any role          |
| `POST`  | `/api/v1/timesheets`                              | Submit a timesheet                  | PM, Site Engineer |
| `PATCH` | `/api/v1/timesheets/{timesheet_id}/approve`       | Approve a timesheet                 | Site Engineer     |
| `GET`   | `/api/v1/workers/me`                              | The worker row linked to the caller | Any role          |

`/workers/me` is the bridge between an account and a worker row, so a field worker can check
themselves in without knowing their own `worker_id`. Scoped by the JWT — no parameter, so it cannot
be pointed at anyone else. Tabled 2026-08-24.

---

#### Equipment APIs

| Method  | Path                                                                  | Description                                          | Auth                    |
| ------- | --------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------- |
| `POST`  | `/api/v1/equipment`                                                   | Register equipment                                   | PM, Procurement Officer |
| `GET`   | `/api/v1/equipment`                                                   | List equipment (filterable by project, type, status) | Any role                |
| `GET`   | `/api/v1/equipment/{equipment_id}`                                    | Get equipment detail                                 | Any role                |
| `PATCH` | `/api/v1/equipment/{equipment_id}/status`                             | Update equipment status                              | PM, Site Engineer       |
| `POST`  | `/api/v1/equipment/{equipment_id}/assignments`                        | Assign equipment to a project                        | PM, Site Engineer       |
| `PATCH` | `/api/v1/equipment/{equipment_id}/assignments/{assignment_id}/return` | Return an equipment assignment                       | PM, Site Engineer       |
| `POST`  | `/api/v1/equipment/{equipment_id}/maintenance`                        | Log an equipment maintenance record                  | PM, Site Engineer       |
| `POST`  | `/api/v1/equipment/{equipment_id}/utilization`                        | Record equipment utilization                         | PM, Site Engineer       |
| `GET`   | `/api/v1/projects/{project_id}/equipment`                             | List equipment assigned to a project                 | Any role                |

---

#### Files APIs

| Method   | Path                                  | Description                                                                                                         | Auth         |
| -------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------ |
| `POST`   | `/api/v1/files/upload`                | Upload file; returns `file_id` and signed download URL                                                              | Any role     |
| `GET`    | `/api/v1/files/{file_id}`             | Get file metadata and a short-lived download URL                                                                    | Any role     |
| `DELETE` | `/api/v1/files/{file_id}`             | Soft-delete file; automatic hard-delete from MinIO 30 days later (see `09-data-architecture` File Lifecycle Policy) | Tenant Admin |
| `GET`    | `/api/v1/projects/{project_id}/files` | List files attached to a project (filterable by type, uploader)                                                     | Any role     |
| `GET`    | `/api/v1/files/{file_id}/annotation`  | Get the photo's annotation stroke list + `version` (404 if none) — powers re-editing                                | Any role     |

> **Writing an annotation has no REST endpoint.** It flows through the offline-sync path like every
> other field-editable entity: `POST /api/v1/sync/push` with `entity_type: "photo_annotation"`, which
> runs the `version`-based `CONFLICT_FLAGGED` check (ADR-056; §17.5). A dedicated `PUT` was considered
> and rejected as inconsistent with the seven entities already routed through `/sync/push`.
>
> **Write authorization: Site Worker, Site Engineer, PM, Tenant Admin** — the same set as the other
> field-editable entities pushed through `/sync/push` (`site_report`, `issue`, `material`). Reading an
> annotation stays "Any role", matching the `GET` row above (product-owner decision 2026-08-04; closes
> the gap noted in `backend/src/modules/sync/sync-authz.ts`, where `photo_annotation` previously carried
> no entry and therefore no role requirement beyond authentication). This satisfies the
> `writeNeverWiderThanRead` invariant that file asserts, since annotation reads are unrestricted.

---

#### Offline Sync APIs

The transport between a field device and the server. Specified in full in `17-offline-mobile-sync.md`
— §17.2 (the tenant-admin review queue), §17.5 (per-entity conflict rules), §17.9 (the delta pull).
Tabled here 2026-08-24: these six routes had run since Phase 10 named in no §14 table and carried by
no OpenAPI document, while the mobile client depended on all of them.

**Sync owns no entity.** `/sync/push` routes a mutation to the same service the equivalent REST
route calls, and `/sync/delta` reads the same tables the equivalent `GET`s read. The Auth column
below is therefore not a policy of its own: `SyncAuthGuard` mirrors, per entity type, the roles the
equivalent REST route enforces today (`sync-authz.ts`). Widening what a role may do belongs in that
REST controller, and sync follows it — otherwise `/sync/*` becomes an unguarded second door into
services whose authorisation lives entirely in a controller decorator.

| Method  | Path                                               | Description                                                | Auth                            |
| ------- | -------------------------------------------------- | ---------------------------------------------------------- | ------------------------------- |
| `GET`   | `/api/v1/sync/delta`                               | Pull changes since a cursor (`?since`, `?entity_types[]`)  | Mirrors each type's REST read   |
| `POST`  | `/api/v1/sync/push`                                | Push one queued mutation; applies the §17.5 strategy       | Mirrors each type's REST write  |
| `POST`  | `/api/v1/sync/resolve`                             | Same handler as `push`, under the name §17.4 uses          | Mirrors each type's REST write  |
| `POST`  | `/api/v1/sync/exhausted`                           | Report a mutation that exhausted its 5 retries — §17.2     | Mirrors the entity's REST write |
| `GET`   | `/api/v1/sync/exhaustions`                         | The review queue (`?status=PENDING\|RESOLVED`, newest 200) | Tenant Admin                    |
| `PATCH` | `/api/v1/sync/exhaustions/{exhaustion_id}/resolve` | Mark a queued record IMPORTED or DISCARDED — §17.2         | Tenant Admin                    |

Three properties of this surface are easy to get wrong and are settled here:

- **`/sync/exhausted` sits on the push controller, not the admin one.** Reporting that a safety
  incident failed to sync carries that incident's payload, so it needs the role that could have
  pushed it. The queue's own routes are Tenant Admin and live on a separate controller, because the
  guard reads a `GET` as a `delta` and would try to narrow `entity_types` out of the query string.
- **Resolving is a state change, never a delete.** §17.2 keeps the device's copy "until successfully
  synced or explicitly resolved by an admin" — the row is what tells the device it may stop holding
  the record. Deleting it strands the record on the phone permanently.
- **`deleted[]` is empty today.** It reads `platform.sync_tombstones`, and no delete path exists for
  any of the six pullable entities, so nothing records a tombstone yet.

---

#### Safety APIs

| Method  | Path                                                 | Description                            | Auth                         |
| ------- | ---------------------------------------------------- | -------------------------------------- | ---------------------------- |
| `POST`  | `/api/v1/safety/incidents`                           | Report safety incident                 | Site Engineer, Safety, Admin |
| `GET`   | `/api/v1/safety/incidents`                           | List incidents (project/status/sev)    | Exec, PM, SE, Safety, Admin  |
| `PATCH` | `/api/v1/safety/incidents/{incident_id}/acknowledge` | Acknowledge incident (OPEN→IN_PROG)    | Safety Officer, Admin        |
| `POST`  | `/api/v1/safety/permits`                             | Create a permit request (PENDING)      | Site Engineer, Safety, Admin |
| `GET`   | `/api/v1/safety/permits`                             | List permits (project/status)          | Exec, PM, SE, Safety, Admin  |
| `PATCH` | `/api/v1/safety/permits/{permit_id}/approve`         | Approve permit (§15.5; →ACTIVE)        | Safety, PM, Admin            |
| `PATCH` | `/api/v1/safety/permits/{permit_id}/reject`          | Reject permit (→REVOKED)               | Safety, PM, Admin            |
| `GET`   | `/api/v1/safety/checklists`                          | List safety checklists                 | Any role                     |
| `POST`  | `/api/v1/safety/checklists`                          | Submit completed safety checklist      | Site Engineer, Safety, Admin |
| `GET`   | `/api/v1/safety/compliance`                          | Compliance summary (incidents/permits) | Exec, PM, SE, Safety, Admin  |

---

#### AI APIs

AI / ML capabilities are served by three Python services — the AI Gateway
(`/api/v1/ai/*`, `/api/v1/rag/*`), the OCR pipeline (`/api/v1/ocr/*`), and the
embedding worker (`/api/v1/embeddings/*`) — each with separate token-rate limiting
(see section 14.2 and `26-pricing-model` section 26.1).

| Method | Path                                     | Description                                      | Auth                |
| ------ | ---------------------------------------- | ------------------------------------------------ | ------------------- |
| `POST` | `/api/v1/ai/completions`                 | LLM chat completion (prompt → text)              | Any role            |
| `POST` | `/api/v1/ai/reports/site-summary`        | Generate a daily site-summary report draft       | PM, Site Engineer   |
| `POST` | `/api/v1/ai/reports/procurement-summary` | Generate a procurement-summary report draft      | Procurement Officer |
| `POST` | `/api/v1/ai/reports/executive-summary`   | Generate an executive-summary report draft       | Executive           |
| `POST` | `/api/v1/ai/reports/delay-risk`          | Generate a delay-risk analysis report            | Executive, PM       |
| `GET`  | `/api/v1/ai/reports/history`             | List previously generated AI reports             | Any role            |
| `POST` | `/api/v1/rag/query`                      | RAG-backed contextual query (AI Copilot)         | Any role            |
| `POST` | `/api/v1/ocr/process`                    | Extract text from an image or PDF (OCR pipeline) | Any role            |
| `POST` | `/api/v1/embeddings/generate`            | Generate vector embeddings (internal/RAG)        | Any role            |

> Voice transcription (`21-mvp-scope` section 21.4) is a planned MVP AI feature; it is
> not yet exposed as a REST endpoint and will be added when the transcription provider
> is integrated.

Example — generate a site-summary report:

```json
POST /api/v1/ai/reports/site-summary
{
  "project_id": "proj_001",
  "report_date": "2026-05-24",
  "raw_notes": "งานเทพื้นชั้น 3 เสร็จ 80% แรงงาน 25 คน",
  "language": "th"
}

```

---

#### CRM APIs (MVP — UI + backend, ADR-029)

> CRM is MVP : `Lead → Opportunity → Customer`. `convert` wins the
> opportunity and creates a `finance.customers` row (the canonical Customer store). The
> `GET /crm/opportunities`, `GET /crm/contacts`, and `GET /crm/customers` read endpoints extend the
> original four to support the UI. Read = Executive + CRM/Sales Manager; write = CRM/Sales Manager.

| Method  | Path                                     | Description                                 | Auth                           |
| ------- | ---------------------------------------- | ------------------------------------------- | ------------------------------ |
| `GET`   | `/api/v1/crm/leads`                      | List leads (filterable by status)           | Executive, CRM / Sales Manager |
| `POST`  | `/api/v1/crm/leads`                      | Create lead                                 | CRM / Sales Manager            |
| `POST`  | `/api/v1/crm/opportunities`              | Create opportunity from lead (qualifies it) | CRM / Sales Manager            |
| `GET`   | `/api/v1/crm/opportunities`              | List opportunities (filterable by status)   | Executive, CRM / Sales Manager |
| `PATCH` | `/api/v1/crm/opportunities/{id}/convert` | Convert won opportunity to a Customer       | CRM / Sales Manager            |
| `POST`  | `/api/v1/crm/contacts`                   | Create a contact under a lead               | CRM / Sales Manager            |
| `GET`   | `/api/v1/crm/contacts`                   | List contacts (filterable by lead)          | Executive, CRM / Sales Manager |
| `GET`   | `/api/v1/crm/customers`                  | List customers (finance.customers)          | Executive, CRM / Sales Manager |

---

#### Vendor APIs

| Method | Path                                                 | Description                       | Auth                |
| ------ | ---------------------------------------------------- | --------------------------------- | ------------------- |
| `GET`  | `/api/v1/procurement/vendors`                        | List vendors                      | Any role            |
| `POST` | `/api/v1/procurement/vendors`                        | Register vendor                   | Procurement Officer |
| `GET`  | `/api/v1/procurement/vendors/{vendor_id}`            | Get vendor detail with rating     | Any role            |
| `GET`  | `/api/v1/procurement/vendors/{vendor_id}/quotations` | List quotation history for vendor | Any role            |

The rows above are the BUYER's view, under `/procurement/vendors`. The external portal is a separate
surface under `/vendor`, authenticated by a vendor token rather than a tenant JWT — the vendor has
no COS account. Both routes are scoped to the vendor the token names, with no `vendor_id` parameter,
precisely so one vendor cannot ask about another. Tabled 2026-08-24.

| Method | Path                        | Description                           | Auth         |
| ------ | --------------------------- | ------------------------------------- | ------------ |
| `GET`  | `/api/v1/vendor/rfqs`       | RFQs this vendor was invited to       | Vendor token |
| `GET`  | `/api/v1/vendor/quotations` | The vendor's own submitted quotations | Vendor token |

---

#### Geo APIs

| Method | Path                            | Description                               | Auth         |
| ------ | ------------------------------- | ----------------------------------------- | ------------ |
| `GET`  | `/api/v1/geo/reverse?lat=&lon=` | Reverse-geocode coordinates to an address | Bearer token |

**The geocoder is self-hosted** — Nominatim over the Geofabrik Thailand extract, in-cluster. A
coordinate is where a named worker stood at a named time, so sending it to a third-party geocoder
would export exactly the data PDPA treats most carefully, one lookup at a time, for a label.

`address` is null when the geocoder cannot answer, and that is a 200, not an error: a screen that
has coordinates can still show them, and failing the request would make an unavailable geocoder look
like an unavailable site report. Tabled 2026-08-24.

---

#### Master Data APIs

The tenant's controlled vocabularies. `09-data-architecture` §9.5 is the governing rule — every
transactional record references a master-data domain by key, and free text in a field that has one
is a defect. Tabled here 2026-08-24; the routes had run since Priority 0 Section D named in no §14
table.

**Read is every authenticated role; write is Tenant Admin.** The asymmetry is the point. A field
worker needs the list to fill a dropdown on every screen, and letting them add a row would defeat
the reason the vocabulary is controlled: two spellings of the same material become two materials,
and every downstream total splits in half.

| Method   | Path                           | Description                                     | Auth         |
| -------- | ------------------------------ | ----------------------------------------------- | ------------ |
| `GET`    | `/api/v1/materials`            | List active materials                           | Any role     |
| `POST`   | `/api/v1/materials`            | Create a material (unique `name` per tenant)    | Tenant Admin |
| `PATCH`  | `/api/v1/materials/{id}`       | Update a material (partial)                     | Tenant Admin |
| `DELETE` | `/api/v1/materials/{id}`       | Withdraw a material — SOFT delete               | Tenant Admin |
| `GET`    | `/api/v1/work-categories`      | List active work categories                     | Any role     |
| `POST`   | `/api/v1/work-categories`      | Create one (unique `code` per tenant)           | Tenant Admin |
| `PATCH`  | `/api/v1/work-categories/{id}` | Update `name` / `phase` / `is_active` only      | Tenant Admin |
| `GET`    | `/api/v1/issue-categories`     | List active issue categories                    | Any role     |
| `POST`   | `/api/v1/issue-categories`     | Create one (`severity_default`, default MEDIUM) | Tenant Admin |
| `GET`    | `/api/v1/cost-categories`      | List active cost categories                     | Any role     |
| `POST`   | `/api/v1/cost-categories`      | Create one (MATERIAL/LABOR/EQUIPMENT/OVERHEAD)  | Tenant Admin |

Two shapes here are deliberate and worth stating, because both look like omissions:

- **Withdrawal is a soft delete.** `DELETE /materials/{id}` sets `is_active = false`. Transactional
  records already reference the row by key: a purchase order from last year has to keep naming the
  material it was for, so removing the row would leave it pointing at nothing. Withdrawing keeps
  the material out of new dropdowns and changes no history.
- **A work category's `code` cannot be updated.** It is the key other records store; changing it
  would silently re-point every one of them. `name` is the label and is freely editable.

The four vocabularies live in four schemas, each beside the domain that consumes it —
`procurement.materials`, `site_ops.work_categories`, `site_ops.issue_categories`,
`finance.cost_categories` — all RLS-isolated per tenant.

---

#### User Management APIs

Managed by **Tenant Admin** (FULL permission — see `06-rbac-permission-matrix` §6.4).
All endpoints are tenant-scoped via JWT `tenant_id` claim; a Tenant Admin can only
manage users within their own tenant.

A user is created with the identifier for the path they will use: a **phone number** for Path A, or
an **email address** plus a Keycloak account in the tenant's realm for Path B. This is about which
identifier the account carries, not about which roles may use which path — that is
`05-security-compliance` §5.4.4. An account created with one identifier cannot use the other path
until the second is added; provisioning a user for both is not yet specified.

| Method  | Path                                 | Description                                                                   | Auth         |
| ------- | ------------------------------------ | ----------------------------------------------------------------------------- | ------------ |
| `GET`   | `/api/v1/users`                      | List all users in the tenant (paginated)                                      | Tenant Admin |
| `POST`  | `/api/v1/users`                      | Create a user within the tenant; emits `identity.user.created.v1`             | Tenant Admin |
| `PATCH` | `/api/v1/users/{user_id}/role`       | Change a user's role within the tenant; emits `identity.user.role_changed.v1` | Tenant Admin |
| `PATCH` | `/api/v1/users/{user_id}/deactivate` | Deactivate a user (revokes access, preserves data)                            | Tenant Admin |
| `GET`   | `/api/v1/tenant/settings`            | Get tenant settings (variance/retention defaults, LINE token, notif)          | Tenant Admin |
| `PATCH` | `/api/v1/tenant/settings`            | Update tenant settings (partial; §20.7.8, ADR-028)                            | Tenant Admin |

**The caller's own record** — `users/me`, one of this codebase's two self-service conventions
(`auth` for auth primitives, `users/me` for "the signed-in user's own record"). ADR-078 rejected a
third `/identity/me/...` namespace: it would leave the API with two ways to say "me". None of these
routes carries a role check — each scopes by the JWT's own `user_id` on top of RLS, so a caller
reaches only their own data. Tabled 2026-08-24.

| Method | Path                                                | Description                                          | Auth         |
| ------ | --------------------------------------------------- | ---------------------------------------------------- | ------------ |
| `GET`  | `/api/v1/users/me/consents`                         | Consent state for all five PDPA categories — ADR-079 | Bearer token |
| `POST` | `/api/v1/users/me/consents`                         | Record a grant or a withdrawal (append-only)         | Bearer token |
| `GET`  | `/api/v1/users/me/network-origin`                   | Own network origin + behavioural label — ADR-080     | Bearer token |
| `POST` | `/api/v1/users/me/data-export`                      | Request an export of own data (PDPA §30/§31)         | Bearer token |
| `GET`  | `/api/v1/users/me/data-export`                      | Own export requests and their status                 | Bearer token |
| `GET`  | `/api/v1/users/me/data-export/{export_id}/download` | Mint a short-lived signed URL for a finished export  | Bearer token |

- **Consent is append-only.** A grant and a withdrawal both insert a new row; the prior row is never
  mutated, so the history PDPA-22 requires survives. Withdrawal is forward-only — it stops future
  collection and does not delete what was lawfully collected while consent was live. That is
  erasure (PDPA-13), a different request. A category with no decision reports `granted: false`:
  PDPA §19 requires an affirmative act, so silence is never consent.
- **The network origin is derived at read time and never stored**, from the caller's own ingress IP
  — never from a parameter, which would make it a geo-IP lookup service for anyone with a session.
  The behavioural label is profiling and needs `operational` consent; without it the field is null
  ("Not enabled"), which a screen must render differently from `INSUFFICIENT_DATA`.
- **An export needs a step-up action token, and returns 202.** It reads across every domain schema
  through a Temporal workflow, so the response is the request's state, not the archive. The download
  mints a fresh signed URL per call rather than mailing a long-lived one — the archive holds every
  coordinate the subject was recorded at (ADR-078).

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

#### Platform Admin APIs (SYSTEM_ADMIN)

Cross-tenant platform administration — the `/admin` panel (§20.4). `SYSTEM_ADMIN` only; not
tenant-scoped (excluded from the tenant middleware). Contract: `tenant.openapi.yaml`.

| Method  | Path                                                | Description                                 | Auth         |
| ------- | --------------------------------------------------- | ------------------------------------------- | ------------ |
| `GET`   | `/api/v1/admin/tenants`                             | List all tenants on the platform (§20.4.1)  | System Admin |
| `POST`  | `/api/v1/admin/tenants`                             | Provision a new tenant (§20.4.2)            | System Admin |
| `PATCH` | `/api/v1/admin/tenants/{tenant_id}/dedicated-db`    | Assign a dedicated DB URL (§20.4.3)         | System Admin |
| `PATCH` | `/api/v1/admin/tenants/{tenant_id}/mark-contracted` | Mark Enterprise tenant contracted (§20.4.4) | System Admin |
| `PATCH` | `/api/v1/admin/tenants/{tenant_id}/deactivate`      | Deactivate a tenant (§20.4.5)               | System Admin |

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

**Identity forwarding.** The `jwt` plugin only _validates_ — it does not project claims. Services that
are reached directly through Kong and trust gateway-set identity headers (today: `file-service`) get an
explicit mapping on their route: client-supplied `x-tenant-id` / `x-user-id` / `x-user-role` are removed,
then re-added from the verified token's `tenant_id` / `user_id` / `role` claims (§5.4.1 — note `user_id`,
the platform user UUID, not `sub`). Without that mapping the headers are simply absent, which is how the
file upload route silently 401'd; see §5.9.4. `cos-backend` needs no mapping — it validates the JWT
itself (`KeycloakJwtStrategy`).

**One exception, by design:** `credentials.construction-os.io` carries no `jwt` plugin. It exposes only
two unauthenticated GETs — `/tenants/:tenantId/did.json` and
`/tenants/:tenantId/status-lists/:statusListId` — because a third-party verifier resolving a W3C
credential holds no platform identity (BG-001, ADR-019). It is a separate host rather than a path under
`api.*` so nothing on `/api/v1/*` loses JWT enforcement; the route strips any client-supplied
`x-tenant-id`/`x-user-id`/`x-user-role` and is IP-rate-limited. CredentialService's `issue`, `verify`
and `revoke` are **not** routed at the edge at all — they are mesh-only (§5.9.8).

### Traffic Type Distinction

> ⚠️ **This subsection describes a gateway that is not deployed.** Verified 2026-08-22 —
> [OQ-46](../technical-design/README.md#open-questions-register).
> `infrastructure/kubernetes/kong/kong-declarative.yml` is referenced by no ArgoCD Application (every
> one targets a Helm chart or the otel overlays), there are no `KongPlugin` CRDs anywhere, no chart
> carries an Ingress template at all, and the repository's only `kind: Ingress` uses
> `ingressClassName: nginx`. Product-owner decision 2026-08-22: `/api/v1/ai` is routed by the backend
> rather than by Kong. This text is kept because it remains the only written statement of the
> intended external-API metering model.

Kong identifies external OAuth2 client credential traffic by Consumer lookup on the `azp`
(Authorized Party) claim:

| Traffic Type                     | `iss`          | `azp`                     | `session_state` | Kong Consumer           |
| -------------------------------- | -------------- | ------------------------- | --------------- | ----------------------- |
| Internal — Path A (Direct Grant) | Keycloak realm | `cos-backend`             | Present         | No — anonymous consumer |
| Internal — Path B (OIDC)         | Keycloak realm | `cos-web` or `cos-mobile` | Present         | No — anonymous consumer |
| External — marketplace / ERP     | Keycloak realm | registered `client_id`    | Absent          | Yes — matched consumer  |

`azp=cos-backend` on Path A is a **measured** value, not a specified one — `KeycloakAdminService`
mints the token with that client. The row previously read "absent". It matters here because it means
`cos-backend` must never be registered as a Kong Consumer: if it were, every Path A field worker would
be matched to a consumer and metered by the monthly quota plugin as though they were an external API
integration ([OQ-13](../technical-design/README.md#open-questions-register)).

`jwt` plugin is intended to be configured with:

```yaml
key_claim_name: azp
anonymous: <anonymous-consumer-id>
```

Neither line is present in `kong-declarative.yml` today — its `jwt` plugin blocks set
`claims_to_verify`, `header_names` and `secret_is_base64` only, leaving `key_claim_name` at its
default of `iss` and no anonymous consumer configured.

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
