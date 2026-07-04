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

### Module-wide reconciliation (completed)

The whole procurement module was subsequently aligned to the `/api/v1/procurement/*`
convention and §14's resource hierarchy:

- All RFQ / PO / quotation / lifecycle routes re-prefixed to `/api/v1/procurement/*`.
- Create + delivery + invoice flattened to tenant-level per §14 (`POST /procurement/
purchase-requests|rfqs|purchase-orders`, `POST /procurement/deliveries`,
  `POST /procurement/vendor-invoices`), with `po_id`/`project_id` carried in the body.
- Project-scoped list routes (`/api/v1/projects/:projectId/...`) were **removed**;
  per-project views use the tenant-wide lists with `?project_id=`.

### Vendors override

§14 originally placed vendors in a separate `/api/v1/vendors` "Vendor APIs" namespace.
By product-owner decision, vendors were **unified under `/api/v1/procurement/vendors`**
so the entire module shares one prefix. **§14 was updated** to match (no spec/impl drift).

### Negative

- Larger surface change (controller, DTOs, OpenAPI, web client, integration tests);
  mitigated by 100% unit-test coverage on the procurement controller/service/repository.
