# 30. Vendor Portal brought into MVP (network-identity, two-tier external access)

Date: 2026-06-20

## Status

Accepted

## Context

§28.2 "Phase 2 — External Collaboration" lists the **Vendor portal** ("vendors receive RFQs,
submit quotations, track PO status, submit invoices. No platform account required to respond to
RFQs — frictionless onboarding") with a **Year 1–2 / Post-MVP** timeline. §13.1 classifies it as a
**Layer 4 — Ecosystem** channel, and §21 does not list it in MVP scope. By product-owner decision
(this increment) the Vendor Portal is **brought into MVP now** — overriding the §28 Year 1–2
timeline and adding it to §21 MVP scope. The §13.1 Layer-4 (Ecosystem) classification is **not**
overridden: a Vendor Portal is still architecturally an ecosystem channel — it is only delivered
early.

The HOW was unspecified across §05/§06/§11/§20 (no external identity model, no external auth
mechanism, no external role, no portal pages). Design options were researched against world-class
patterns and a model was chosen by the product owner:

- **Business-network identity** — SAP Ariba Network / Coupa: one supplier holds a single network
  identity linked to many buyers via "trading relationships" (a supplier is a first-class network
  participant, not a sub-user of one buyer).
- **Centralised identity + per-org membership** — Auth0 B2B Organizations: an external partner has
  one central identity and per-organization memberships; no single tenant owns/deletes that identity.
- **Magic-link (passwordless)** — single-use, cryptographically-signed token, 5–15 min expiry,
  HTTPS-only; suited to low-frequency vendor portals; upgrade to an account for ongoing work.

This aligns with the platform's existing identity pattern: `platform.users` (centralised identity)

- `platform.tenant_memberships` (user ↔ tenant ↔ `CosRole`), and existing token infrastructure
  (`platform.otp_audit`).

## Decision

**1. Network identity (cross-tenant), in `platform.*` — outside tenant RLS.** New
`platform.vendor_identities` — a centralised vendor-contact identity (email, display_name,
keycloak_user_id NULL until a Tier-2 account is claimed). Unlike `platform.users` it has **no home
`tenant_id`**: a vendor is a cross-tenant network participant. This resolves the
one-vendor-↔-many-tenants conflict with the tenant-per-RLS model (ADR-008): vendor identity lives
at the platform layer, never inside a tenant's RLS scope.

**2. Trading relationship (the buyer↔vendor link).** New `platform.vendor_trading_relationships`
(vendor_identity_id ↔ tenant_id ↔ `procurement.vendors.vendor_id`), analogous to
`platform.tenant_memberships`. `UNIQUE(tenant_id, vendor_identity_id)`. This binds the network
identity to the existing **tenant-scoped** `procurement.vendors` record (the internal
vendor-management entity, ADR-022). One vendor identity → many relationships → many tenants.

**3. Two-tier external access.**

- **Tier 1 (frictionless, no account — §28/§27):** respond to an RFQ via a single-use,
  HMAC-signed magic-link token (5–15 min expiry, HTTPS-only). New `procurement.rfq_invitations`
  (rfq_id, vendor_identity_id or email, token_hash, expires_at, status) holds the invitation +
  token. No Keycloak account required.
- **Tier 2 (lightweight session — option A):** responding to an RFQ grants a vendor session token
  (HMAC-signed, carrying `vendor_identity_id`) returned in the quotation response, used with an
  `x-vendor-tenant-id` header to track PO status and submit invoices. No Keycloak account in MVP
  (`vendor_identities.keycloak_user_id` stays NULL); a full account claim is a later enhancement.

**4. RBAC — `VENDOR_PORTAL` is a separate principal, not a `CosRole`.** The 12 `CosRole` values are
all internal; an external vendor must never receive an internal role. `VENDOR_PORTAL` is a distinct
authorization context, scoped by `vendor_identity_id` + trading relationship to: only RFQs the
vendor was invited to, POs on a linked relationship, and the vendor's own invoices. Access is
enforced by relationship/ownership checks, **not** tenant RLS (the data being read stays
tenant-scoped; the vendor's view is filtered by relationship).

**5. Separate frontend — `(vendor)` route group.** External users are not placed in the internal
`AppShell`. A separate Next.js `(vendor)` route group with a minimal external shell (no internal
nav/role switcher), matching Ariba Network / Coupa Supplier Portal / Procore (external portal is a
separate surface).

**6. Capabilities (§28) reuse existing internal entities.** receive RFQ (`procurement.rfqs`),
submit quotation (reuse `submitQuotation`), track PO status (reuse `procurement.purchase_orders`),
submit invoice (reuse `finance.vendor_invoices` / AP). The vendor-portal module exposes these
behind the `VENDOR_PORTAL` principal; it does not duplicate the procurement/finance data model.

## Consequences

- §28 and §21 are updated: Vendor Portal is MVP; the §28 Year 1–2 timeline note is overridden. §13.1
  is unchanged — the Layer-4 Ecosystem classification still holds (delivered early, not reclassified).
- New `platform.vendor_identities`, `platform.vendor_trading_relationships`, and
  `procurement.rfq_invitations` tables (§11). Vendor identity sits outside tenant RLS by design.
- New `VENDOR_PORTAL` principal (§06) and external magic-link auth (§05) — the first external,
  non-`CosRole` authorization context on the platform.
- `vendor.openapi.yaml` (today a stub) is populated to the implemented surface; §14 "Vendor Portal"
  row moves from Post-MVP to MVP.
- A new `(vendor)` Next.js route group; §20.7 gains a Vendor Portal page inventory.

## Alternatives rejected

- **Per-tenant guest user** (vendor invited as a scoped guest in each tenant, reusing tenant
  RLS/`CosRole`): simplest, but the same vendor gets a separate identity per tenant, no cross-tenant
  network effect, and it contradicts the §27 network-effect moat ("frictionless onboarding; no
  account required to receive RFQ"). Rejected.
- **Token-only, no accounts at all** (every action via a per-transaction magic-link, no persistent
  vendor identity): maximally frictionless, but cannot support ongoing PO-status tracking or a
  vendor invoice history — it delivers only one of the four §28 capabilities. Rejected.
