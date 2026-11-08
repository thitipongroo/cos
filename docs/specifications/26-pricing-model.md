---
title: 'Pricing Model'
version: '1.3.0'
status: Active
last_updated: '2026-11-01'
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
  - [26.1.1 External Collaborator Pricing (Vendor Portal)](#2611-external-collaborator-pricing-vendor-portal)
  - [26.1.2 Free Trial](#2612-free-trial)
- [26.2 Revenue](#262-revenue)

---

## 26.1 SaaS Pricing

> Decision record — product owner, 2026-11-01. Replaces the earlier per-project + per-seat SMB model and
> the per-user Mid-market model, which were never offered: the published price list
> (construction-os.io/#pricing) has sold flat plan prices with unlimited users since launch. ADR-109.

**Plans are priced by concurrent project capacity, with unlimited users on every plan.** There is no seat
fee on any plan; users of the tenant and external collaborators (26.1.1) are never counted or billed.

| `platform."PlanType"` | Tier       | Active projects | Monthly price (THB, excl. VAT) | Users     | Database                 |
| --------------------- | ---------- | --------------- | ------------------------------ | --------- | ------------------------ |
| `LITE`                | SMB        | 1               | 4,900                          | Unlimited | Shared DB + RLS (§7.1)   |
| `STARTER`             | SMB        | 3               | 15,000                         | Unlimited | Shared DB + RLS (§7.1)   |
| `PROFESSIONAL`        | Mid-market | 10              | 45,000                         | Unlimited | Shared DB + RLS (§7.1)   |
| `ENTERPRISE`          | Enterprise | Unlimited       | Annual contract, quoted        | Unlimited | Dedicated DB (§7.1, §7.8) |

- **Tier names.** "SMB" in other specifications means `LITE` + `STARTER`; "Mid-market" means
  `PROFESSIONAL`; "Enterprise" means `ENTERPRISE`. Nothing outside this section needs renaming
- **Active project** = a project whose status is `DRAFT`, `ACTIVE` or `ON_HOLD`. `COMPLETED` (treated as
  archived by `construction.project.archived.v1`) and `CANCELLED` projects do not count
- **Enforcement.** Creating a project that would exceed the plan's limit is refused with `COS-PLAN-001`
  (409). A plan change to a tier whose limit is below the tenant's current active-project count is refused
  with `COS-PLAN-002` (409) — the tenant completes or cancels projects first; no project is ever closed
  automatically. The creation check is behind the `s1.project.plan-project-limit` feature flag (QM-15, default
  OFF until rollout)
- **Annual billing.** `LITE`, `STARTER` and `PROFESSIONAL` may be paid annually at 15% off the monthly
  price. `ENTERPRISE` is an annual contract with a platform fee and usage-based AI pricing
- **Prices** exclude 7% VAT. They are the published list prices; commercial terms are in the Terms of
  Service (construction-os.io/terms)

AI Usage Pricing Unit :

AI consumption is metered at the tenant level and billed per token consumed across all
LLM API calls (input + output tokens combined) :

| Tier                          | AI Pricing Model                                                          | Included Quota    |
| ----------------------------- | ------------------------------------------------------------------------- | ----------------- |
| Shared SaaS — SMB (`LITE`, `STARTER`)   | Included in plan up to monthly token quota; overage charged per 1K tokens | 500K tokens/month |
| Shared SaaS — Mid-market (`PROFESSIONAL`) | Included in plan up to monthly token quota; overage charged per 1K tokens | 5M tokens/month   |
| Dedicated Tenant / Enterprise | Negotiated per contract; usage reported monthly                           | Custom            |

- Token counting follows the LLM provider's tokenization (OpenAI GPT-4o and gpt-4o-mini by default; additional
  providers accessible via `LLMProvider` interface — see 22-ai-architecture section 22.5)
- OCR and voice transcription are metered separately per page and per minute respectively
- Token usage is visible to Tenant Admin in the platform usage dashboard
- See 14-api-architecture section 14.2 for AI API rate limiting defaults

### 26.1.1 External Collaborator Pricing (Vendor Portal)

> Decision record — resolved by product owner 2026-07-13 (closes the §26 external-user pricing gap;
> chosen from four options after competitive research). Governs how the external parties (vendors /
> subcontractors) invited into a tenant's projects via the Vendor Portal (ADR-030) are priced.

**Decision: external collaborators are FREE and UNLIMITED on every plan.** The inviting tenant's
subscription absorbs them; external users are **never** counted or billed. Since 2026-11-01 no plan has
seat billing at all (26.1), so this holds by construction. This applies to all tiers (SMB / Mid-market /
Enterprise).

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
`platform.vendor_trading_relationships`), 26.1 (no seat billing on any plan),
QM-7 rate limits, 28-ecosystem-expansion 28.2 (future vendor-side monetization).

### 26.1.2 Free Trial

> Decision record — product owner, 2026-11-01. ADR-109; lifecycle and enforcement in
> [07-multi-tenant-architecture §7.10](07-multi-tenant-architecture.md#710-trial-tenant-lifecycle).

- `LITE`, `STARTER` and `PROFESSIONAL` can be tried free for **30 days** with no credit card. Nothing is
  ever charged automatically
- A trial is opened by a SYSTEM_ADMIN from a request made on construction-os.io/trial (sales-assisted).
  Self-service signup is a later phase
- At day 30 the tenant becomes **read-only for 30 days**: users can view and export data but not create,
  edit or approve. At day 60 the tenant is marked for deletion and deleted by a SYSTEM_ADMIN per
  `docs/runbooks/trial-tenant-deletion.md`
- Converting to a paid plan at any point keeps all trial data; the plan-change rule in 26.1 applies

---

## 26.2 Revenue

Streams :

- SaaS subscription
- AI usage
- Vendor marketplace fees (Phase 3 — Marketplace Economy; see 28-ecosystem-expansion section 28.2)
- Financing/referral fees (Phase 4 — Financial Infrastructure; see 28-ecosystem-expansion section 28.2)
- API usage
- Enterprise support

> 📎 See also: [13-product-architecture](13-product-architecture.md)
> · [14-api-architecture](14-api-architecture.md) · [25-go-to-market](25-go-to-market.md)
> · [28-ecosystem-expansion](28-ecosystem-expansion.md)
