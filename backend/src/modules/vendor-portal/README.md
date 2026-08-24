# vendor-portal

NestJS module for external vendor self-service (two-tier, account-optional).

## Purpose

Lets an invited vendor open an RFQ, submit a quotation, track PO status and submit invoices without
being provisioned as a tenant user. Brought into MVP by ADR-030, overriding the
`28-ecosystem-expansion` Year 1–2 timeline. Reuses the existing procurement entities — no duplicate
data model. Source: `00_master` §Phase 5 Vendor Portal; `14-api-architecture` Vendor Portal.

## Public API

Tenant-side (issues the invitation — `PROCUREMENT_OFFICER`):

```text
POST /api/v1/procurement/rfqs/:rfqId/invitations   — invite a vendor (issues a magic link)
```

Vendor-side:

```text
GET  /api/v1/vendor/rfq/:token             — Tier 1: open invited RFQ (magic link, no account)
POST /api/v1/vendor/rfq/:token/quotation   — Tier 1: submit quotation → returns a Tier-2 session
GET  /api/v1/vendor/rfqs                   — Tier 2: list own RFQs
GET  /api/v1/vendor/quotations             — Tier 2: list own quotations
GET  /api/v1/vendor/purchase-orders        — Tier 2: track PO status
GET  /api/v1/vendor/invoices               — Tier 2: list own invoices
POST /api/v1/vendor/invoices               — Tier 2: submit invoice
```

Tier-2 requests carry a `Bearer` vendor session token plus `x-vendor-tenant-id`.

## Dependencies

- `@cos/rbac` — `VENDOR_PORTAL` principal handling (**not** a `CosRole`)
- `@cos/types` — shared enums
- `MagicLinkService` — HMAC token issue/verify (§5.4.3)
- `VendorAuthMiddleware` — resolves the vendor principal before the route handler
- `VendorIdentityRepository` — `platform.vendor_identities`,
  `platform.vendor_trading_relationships`
- Procurement entities — `rfqs`, `quotations`, `purchase_orders`, `invoices`,
  `procurement.rfq_invitations`

## Configuration

| Variable               | Description                                                 |
| ---------------------- | ----------------------------------------------------------- |
| `VENDOR_PORTAL_SECRET` | HMAC secret for magic-link tokens and vendor session tokens |

Injected from AWS Secrets Manager (cloud) or HashiCorp Vault (on-premise).

## Usage

```text
1. PROCUREMENT_OFFICER invites a vendor to an RFQ → magic link emailed to the vendor
2. Vendor opens GET /api/v1/vendor/rfq/<token>            (Tier 1 — no account)
3. Vendor submits POST /api/v1/vendor/rfq/<token>/quotation → receives a Tier-2 session
4. Vendor tracks POs and submits invoices with the Tier-2 session
```

## Notes

- **Scoping is by trading relationship, not tenant RLS.** A vendor principal sees only rows reachable
  through `platform.vendor_trading_relationships`; those platform tables are cross-tenant and carry
  no RLS policy (ADR-030, `06-rbac-permission-matrix` §6.8b).
- `VENDOR_PORTAL` is an external principal — it is never provisioned to a tenant and never appears in
  `tenant_memberships`.
- Magic-link tokens are stored as `token_hash` in `procurement.rfq_invitations`; the raw token is
  never persisted.
- OpenAPI spec: `docs/api/vendor.openapi.yaml`. Vendor pages: `20-ux-flow` §20.7.12 under `/vendor`.
- Test design: `docs/manual/35-test-design.md` §35.10.5.
