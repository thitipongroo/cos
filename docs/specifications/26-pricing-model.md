---
title: 'Pricing Model'
version: '1.2.0'
status: Active
last_updated: '2026-05-27'
authors:
  - thitipongroo
related_docs:
  - 13-product-architecture.md
  - 14-api-architecture.md
  - 25-go-to-market.md
  - 28-ecosystem-expansion.md
---

# 26. Pricing Model

## Table of Contents

- [26.1 SaaS Pricing](#261-saas-pricing)
- [26.2 Revenue](#262-revenue)

---

## 26.1 SaaS Pricing

SMB :

- Per active project (base fee per project in active status)
- Plus per active user/month (seat fee for each user above a minimum included count)

Both charges apply simultaneously — project count and user count are billed independently.
Specific rate values are set at commercial launch and are configurable per market.

Mid-market :

- Annual subscription
- Per active user

Enterprise :

- Annual contract
- Platform fee
- Usage-based AI pricing

AI Usage Pricing Unit :

AI consumption is metered at the tenant level and billed per token consumed across all
LLM API calls (input + output tokens combined) :

| Tier                          | AI Pricing Model                                                          | Included Quota    |
| ----------------------------- | ------------------------------------------------------------------------- | ----------------- |
| Shared SaaS — SMB             | Included in plan up to monthly token quota; overage charged per 1K tokens | 500K tokens/month |
| Shared SaaS — Mid-market      | Included in plan up to monthly token quota; overage charged per 1K tokens | 5M tokens/month   |
| Dedicated Tenant / Enterprise | Negotiated per contract; usage reported monthly                           | Custom            |

- Token counting follows the LLM provider's tokenization (OpenAI GPT-4o and gpt-4o-mini by default; additional providers accessible via `LLMProvider` interface — see 22-ai-architecture section 22.5)
- OCR and voice transcription are metered separately per page and per minute respectively
- Token usage is visible to Tenant Admin in the platform usage dashboard
- See 14-api-architecture section 14.2 for AI API rate limiting defaults

### 26.1.1 External Collaborator Pricing (Vendor Portal)

> Decision record — resolved by product owner 2026-07-13 (closes the §26 external-user pricing gap;
> chosen from four options after competitive research). Governs how the external parties (vendors /
> subcontractors) invited into a tenant's projects via the Vendor Portal (ADR-030) are priced.

**Decision: external collaborators are FREE and UNLIMITED on every plan.** The inviting tenant's
subscription absorbs them; external users are **never** counted toward the tenant's per-active-user
seat billing (26.1). This applies to all tiers (SMB / Mid-market / Enterprise).

**Rationale (competitive norm, verified 2026-07-13):** free unlimited external collaborators is the
market-winning model in construction SaaS, and it does not erode margin because pricing is decoupled
from external seats:

- **Procore** prices on Annual Construction Volume, not seats, and grants unlimited free collaborators
  ("We'll never charge you for adding more users"); it sustains ~80% gross margin with ~60% of 2M+ users
  being free collaborators, and ~40% of new customers originate from people who first used it free as a
  collaborator — i.e. free external is a land-and-expand lead-gen channel, not a cost drag.
- **Buildertrend** (subs free via Sub Center), **KANNA** and **ANDPAD** (unlimited free external/partner
  accounts, 他社アカウント無制限) use the same wedge. Seat-charging holdouts (Fieldwire, Autodesk Build)
  are the exception and draw cost-friction complaints.
- Charging external users is exactly KANNA's headline pricing wedge; matching free-unlimited neutralizes
  it directly.

**Scope (narrow, to bound cost-to-serve and abuse):** external principals are the `VENDOR_PORTAL`
principal (not a `CosRole`; ADR-030), scoped by `platform.vendor_trading_relationships` (NOT tenant
RLS). Free access is limited to Vendor Portal actions only:

- Tier-1 (magic-link): open an invited RFQ + submit a quotation.
- Tier-2 (vendor session): track PO status, list/submit own invoices.
- **No** access to internal modules, analytics/dashboards, offline sync, or any cross-tenant data. A
  vendor sees only the tenants that invited it.

**Abuse / cost controls:** Vendor Portal endpoints keep the QM-7 rate limits; Tier-2 sessions are
per-relationship scoped; no heavy/offline features are exposed to external users. These bound the
free-tier cost-to-serve (role scoping + rate limits — the standard mitigation).

**Explicitly deferred (do NOT do at MVP):** charging vendors directly (a two-sided / marketplace model)
is deferred to the Marketplace Economy (28-ecosystem-expansion section 28.2, Phase 3), where
**vendor marketplace fees** already exist as a future revenue stream (26.2). Charging suppliers
transaction fees at onboarding (the SAP Ariba "supplier tax" pattern) is avoided by design — Coupa,
DocuSign and BILL all position against it, and it would add friction to the network wedge above.

Cross-references: ADR-030 (Vendor Portal tiers + `platform.vendor_identities` /
`platform.vendor_trading_relationships`), 26.1 (per-active-user seat billing excludes external users),
QM-7 rate limits, 28-ecosystem-expansion 28.2 (future vendor-side monetization).

---

## 26.2 Revenue

Streams :

- SaaS subscription
- AI usage
- Vendor marketplace fees (Phase 3 — Marketplace Economy; see 28-ecosystem-expansion section 28.2)
- Financing/referral fees (Phase 4 — Financial Infrastructure; see 28-ecosystem-expansion section 28.2)
- API usage
- Enterprise support

> 📎 See also: [13-product-architecture](13-product-architecture.md) · [14-api-architecture](14-api-architecture.md) · [25-go-to-market](25-go-to-market.md) · [28-ecosystem-expansion](28-ecosystem-expansion.md)
