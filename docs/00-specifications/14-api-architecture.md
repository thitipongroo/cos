---
title: "API Architecture"
version: "1.2.0"
status: Active
last_updated: "2026-05-25"
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

---

## 14.1 API Philosophy

Everything is API-first.

All internal services communicate via :

- gRPC
- Event streams
- REST/GraphQL external APIs

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

| Tier | Requests / minute (per tenant) | Requests / minute (per API key) | Burst allowance |
| --- | --- | --- | --- |
| Shared SaaS — SMB | 1,000 | 200 | 2× for up to 10 seconds |
| Shared SaaS — Mid-market | 5,000 | 1,000 | 2× for up to 10 seconds |
| Dedicated Tenant / Enterprise | Configurable (default 20,000) | Configurable (default 5,000) | Configurable |

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
    "page": 1,
    "per_page": 50,
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

The patterns below define the shape for each API category. OpenAPI 3.x specs
are maintained in `docs/api/`:

| Domain | OpenAPI File | Scope |
| --- | --- | --- |
| Authentication | [auth.openapi.yaml](../api/auth.openapi.yaml) | MVP |
| Projects | [projects.openapi.yaml](../api/projects.openapi.yaml) | MVP |
| Procurement | [procurement.openapi.yaml](../api/procurement.openapi.yaml) | MVP |
| Financial | [finance.openapi.yaml](../api/finance.openapi.yaml) | MVP |
| Bill of Quantities | [boq.openapi.yaml](../api/boq.openapi.yaml) | MVP |
| Workforce | [workforce.openapi.yaml](../api/workforce.openapi.yaml) | MVP |
| Equipment | [equipment.openapi.yaml](../api/equipment.openapi.yaml) | MVP |
| Files | [files.openapi.yaml](../api/files.openapi.yaml) | MVP |
| Notifications | [notifications.openapi.yaml](../api/notifications.openapi.yaml) | MVP |
| Site | [site.openapi.yaml](../api/site.openapi.yaml) | Planned — MVP |
| Safety | [safety.openapi.yaml](../api/safety.openapi.yaml) | Planned — MVP |
| AI | [ai.openapi.yaml](../api/ai.openapi.yaml) | Planned — MVP |
| CRM | [crm.openapi.yaml](../api/crm.openapi.yaml) | Planned — MVP |
| Vendor | [vendor.openapi.yaml](../api/vendor.openapi.yaml) | Planned — MVP |
| Digital Twin | [digital-twin.openapi.yaml](../api/digital-twin.openapi.yaml) | **Post-MVP — Phase 5 / Year 5+** (see 28-ecosystem-expansion section 28.2) |

The endpoint patterns below serve as the canonical reference; OpenAPI files are the
machine-readable contracts derived from these patterns.

---

#### Project APIs

| Method | Path | Description | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/v1/projects` | List projects for tenant (paginated) | Any role |
| `POST` | `/api/v1/projects` | Create project | Executive, PM, Tenant Admin |
| `GET` | `/api/v1/projects/{project_id}` | Get project detail | Any role |
| `PATCH` | `/api/v1/projects/{project_id}` | Update project (status, budget, dates) | PM, Executive |
| `GET` | `/api/v1/projects/{project_id}/tasks` | List tasks for project | Any role |
| `POST` | `/api/v1/projects/{project_id}/tasks` | Create task | PM, Site Engineer |

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

| Method | Path | Description | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/v1/procurement/purchase-requests` | List PRs (filterable by status, project) | Any role |
| `POST` | `/api/v1/procurement/purchase-requests` | Create PR | PM, Site Engineer, Procurement Officer |
| `POST` | `/api/v1/procurement/rfqs` | Create RFQ from PR | Procurement Officer |
| `GET` | `/api/v1/procurement/rfqs/{rfq_id}/quotations` | List vendor quotations for RFQ | Any role |
| `POST` | `/api/v1/procurement/purchase-orders` | Create PO from selected quotation | Procurement Officer |
| `PATCH` | `/api/v1/procurement/purchase-orders/{po_id}/approve` | Approve PO (triggers approval workflow) | PM, Finance, Executive |
| `POST` | `/api/v1/procurement/deliveries` | Record delivery against PO | Procurement Officer, Site Engineer |
| `POST` | `/api/v1/procurement/vendor-invoices` | Create vendor invoice against PO | Procurement Officer, Finance |

---

#### Financial APIs

| Method | Path | Description | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/v1/finance/budget/{project_id}` | Get budget summary with spent vs. allocated | Any role |
| `GET` | `/api/v1/finance/cost-transactions` | List cost transactions (filterable by project, category, date range) | Any role |
| `POST` | `/api/v1/finance/billing` | Create client billing invoice (AR) | Finance |
| `PATCH` | `/api/v1/finance/billing/{billing_id}/approve` | Approve billing (triggers approval workflow) | PM, Executive |
| `POST` | `/api/v1/finance/payments` | Record payment against vendor invoice | Finance |
| `GET` | `/api/v1/finance/cashflow-forecast/{project_id}` | Get cash flow forecast | Executive, PM, Finance |

---

#### Site APIs

| Method | Path | Description | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/v1/site/reports` | List daily site reports (filterable by project, date) | Any role |
| `POST` | `/api/v1/site/reports` | Submit daily site report | PM, Site Engineer |
| `GET` | `/api/v1/site/reports/{report_id}` | Get site report detail | Any role |
| `POST` | `/api/v1/site/inspections` | Submit QC inspection result | PM, Site Engineer, Safety Officer |
| `GET` | `/api/v1/site/permits` | List permits (filterable by project, type, status) | Any role |
| `POST` | `/api/v1/site/permits` | Create permit request | PM, Safety Officer |

---

#### Workforce APIs

| Method | Path | Description | Auth |
| --- | --- | --- | --- |
| `POST` | `/api/v1/workforce/check-in` | Record worker check-in | PM, Site Engineer |
| `PATCH` | `/api/v1/workforce/check-in/{attendance_id}/check-out` | Record worker check-out | PM, Site Engineer |
| `GET` | `/api/v1/workforce/attendance` | List attendance records (filterable by project, date) | Any role |

---

#### Equipment APIs

| Method | Path | Description | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/v1/equipment` | List equipment (filterable by project, type, status) | Any role |
| `POST` | `/api/v1/equipment` | Register equipment | PM, Procurement Officer |
| `GET` | `/api/v1/equipment/{equipment_id}` | Get equipment detail | Any role |
| `PATCH` | `/api/v1/equipment/{equipment_id}` | Update equipment status or assignment | PM, Site Engineer |
| `POST` | `/api/v1/equipment/usage-logs` | Record equipment usage against a project | PM, Site Engineer |
| `GET` | `/api/v1/equipment/usage-logs` | List equipment usage logs (filterable by equipment, project, date) | Any role |

---

#### Files APIs

| Method | Path | Description | Auth |
| --- | --- | --- | --- |
| `POST` | `/api/v1/files/upload` | Upload file; returns `file_id` and signed download URL | Any role |
| `GET` | `/api/v1/files/{file_id}` | Get file metadata and a short-lived download URL | Any role |
| `DELETE` | `/api/v1/files/{file_id}` | Delete file (soft-delete; hard-delete by Tenant Admin only) | Tenant Admin |
| `GET` | `/api/v1/projects/{project_id}/files` | List files attached to a project (filterable by type, uploader) | Any role |

---

#### Safety APIs

| Method | Path | Description | Auth |
| --- | --- | --- | --- |
| `POST` | `/api/v1/safety/incidents` | Report safety incident | Site Engineer, Safety Officer |
| `PATCH` | `/api/v1/safety/incidents/{incident_id}/acknowledge` | Acknowledge incident | Safety Officer |
| `GET` | `/api/v1/safety/checklists` | List safety checklists | Any role |
| `POST` | `/api/v1/safety/checklists` | Submit completed safety checklist | Site Engineer, Safety Officer |

---

#### AI APIs

All AI endpoints are under `/api/v1/ai/` with separate token-rate limiting
(see section 14.2 and `26-pricing-model` section 26.1).

| Method | Path | Description | Auth |
| --- | --- | --- | --- |
| `POST` | `/api/v1/ai/report/generate` | Generate daily site report draft from raw inputs | PM, Site Engineer |
| `POST` | `/api/v1/ai/documents/summarize` | Summarize uploaded document | Any role |
| `POST` | `/api/v1/ai/documents/ocr` | Extract text from image or PDF | Any role |
| `POST` | `/api/v1/ai/voice/transcribe` | Transcribe voice note to text | Any role |
| `POST` | `/api/v1/ai/copilot/query` | Query the AI Copilot with context (RAG-backed) | Any role |

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

| Method | Path | Description | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/v1/crm/leads` | List leads | Executive, CRM / Sales Manager |
| `POST` | `/api/v1/crm/leads` | Create lead | CRM / Sales Manager |
| `POST` | `/api/v1/crm/opportunities` | Create opportunity from lead | CRM / Sales Manager |
| `PATCH` | `/api/v1/crm/opportunities/{id}/convert` | Convert opportunity to Customer | CRM / Sales Manager |

---

#### Vendor APIs

| Method | Path | Description | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/v1/vendors` | List vendors | Any role |
| `POST` | `/api/v1/vendors` | Register vendor | Procurement Officer |
| `GET` | `/api/v1/vendors/{vendor_id}` | Get vendor detail with rating | Any role |
| `GET` | `/api/v1/vendors/{vendor_id}/quotations` | List quotation history for vendor | Any role |

---

## 14.4 API Versioning

Strategy :

- URL path versioning — /api/v1/, /api/v2/
- Version is mandatory in all public API paths
- Internal service-to-service gRPC versioned via proto package (e.g., construction.project.v1)

Lifecycle :

- Minimum 12 months deprecation notice before a version is sunset
- At least 2 major versions supported simultaneously at all times
- Deprecated version returns Deprecation and Sunset headers in every response

Breaking vs Non-breaking :

- Non-breaking (new optional fields, new endpoints) — same version, no notice required
- Breaking (remove field, rename field, change response shape) — new major version required

---

## References

| ID | Title | Source |
| --- | --- | --- |
| [IEEE 830] | IEEE Recommended Practice for Software Requirements Specifications | IEEE Std 830-1998 |
| [REST-RFC] | Hypertext Transfer Protocol — HTTP/1.1 | RFC 7231 |
| [JWT-RFC] | JSON Web Token (JWT) | RFC 7519 |
| [OAuth2] | The OAuth 2.0 Authorization Framework | RFC 6749 |
| [OpenAPI] | OpenAPI Specification v3.1.0 | [spec.openapis.org/oas/v3.1.0](https://spec.openapis.org/oas/v3.1.0) |
| [Kong] | Kong Gateway Documentation | [docs.konghq.com](https://docs.konghq.com/) |
| [gRPC] | gRPC Protocol Documentation | [grpc.io/docs](https://grpc.io/docs/) |
| [GraphQL] | GraphQL Specification | [spec.graphql.org](https://spec.graphql.org/) |

> 📎 See also: [03-system-design](03-system-design.md) · [13-product-architecture](13-product-architecture.md) · [15-event-driven-workflow](15-event-driven-workflow.md) · [26-pricing-model](26-pricing-model.md)
