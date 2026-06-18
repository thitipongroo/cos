# Procurement tenant-wide list endpoints (AIP-132 / AIP-159) under `/api/v1/procurement/*`

**Date:** 2026-06-18
**Status:** Accepted
**Deciders:** Product owner, engineering
**Tags:** architecture | api

---

## Context

The web operational client (spec §20.7.3) requires tenant-wide procurement
"inbox" views — all purchase requests, RFQs, purchase orders, and deliveries for
the authenticated tenant. The Phase 5 backend, however, only exposed
**project-scoped** list routes (`GET /api/v1/projects/:projectId/purchase-requests`,
`.../rfqs`, `.../purchase-orders`) and had **no list endpoint for deliveries**
(only `POST .../deliveries` to record one).

Meanwhile spec §14 (Procurement APIs) already documented a tenant-wide
`GET /api/v1/procurement/purchase-requests` ("List PRs, filterable by status,
project"). So the spec already intended tenant-wide collections; the
implementation had drifted to project-scoped-only.

Two questions had to be resolved:

1. How should a global list be served when the resource is normally accessed
   under a parent (project)?
2. What URL convention should these endpoints use?

## Decision

1. Add **server-side tenant-wide List endpoints with query-parameter filtering**,
   following Google AIP-132 (Standard List) and AIP-159 (Reading across
   collections — list a sub-resource across all parents). Tenant isolation is
   enforced by PostgreSQL RLS + the JWT `tenant_id`, so a flat collection is
   tenant-safe without a `project_id` in the path.

   - `GET /api/v1/procurement/purchase-requests?status=&project_id=&page=&limit=`
   - `GET /api/v1/procurement/rfqs?status=&project_id=&page=&limit=`
   - `GET /api/v1/procurement/purchase-orders?status=&project_id=&page=&limit=`
   - `GET /api/v1/procurement/deliveries?po_id=&page=&limit=`
   - `GET /api/v1/procurement/purchase-orders/:poId/deliveries` (nested by-parent list)

2. The **canonical path prefix is `/api/v1/procurement/...`** (matching spec §14),
   not a flat `/api/v1/<resource>`.

We rejected two alternatives:

- **Client-side aggregation** (fetch all projects, then fetch each project's
  sub-collections and merge) — an anti-pattern: N+1 requests, no server-side
  pagination/sort/filter, does not scale.
- **Forcing a project selector in the UI** — degrades the §20.7.3 tenant-wide
  inbox UX and contradicts how enterprise procurement tools (Coupa, Ariba,
  Procore) expose global inboxes.

## Rationale

The List + cross-collection-read pattern is the established standard
(Google AIP-132/159; Microsoft REST guidelines; Stripe list pattern). RLS already
guarantees tenant scoping, so the flat collection is the simplest correct design.
Spec §14 is authoritative and already used the `/procurement/` prefix, so aligning
to it removes a spec/implementation discrepancy rather than inventing a new one.

## Consequences

### Positive

- Tenant-wide procurement inboxes are served by correct, paginated, filterable
  server endpoints; the web client needs no aggregation hacks.
- Implementation matches spec §14 for these endpoints.

### Negative / Follow-up

- **Module-wide prefix debt:** other existing procurement routes (`/api/v1/vendors`,
  `POST /api/v1/rfqs`, `POST /api/v1/purchase-orders`, `/api/v1/purchase-orders/:poId`,
  `/api/v1/rfqs/:rfqId/quotations`, and the project-scoped `/api/v1/projects/:projectId/...`
  routes) still do **not** use the `/procurement/` prefix that §14 specifies. This
  record aligns only the newly added list endpoints. Full module-wide alignment
  (re-prefixing the existing routes and reconciling the project-scoped resource
  hierarchy with §14) is a separate, larger change tracked as follow-up debt.
