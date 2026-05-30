---
title: "Pricing Model"
version: "1.2.0"
status: Active
last_updated: "2026-05-27"
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

| Tier | AI Pricing Model | Included Quota |
| --- | --- | --- |
| Shared SaaS — SMB | Included in plan up to monthly token quota; overage charged per 1K tokens | 500K tokens/month |
| Shared SaaS — Mid-market | Included in plan up to monthly token quota; overage charged per 1K tokens | 5M tokens/month |
| Dedicated Tenant / Enterprise | Negotiated per contract; usage reported monthly | Custom |

- Token counting follows the LLM provider's tokenization (OpenAI GPT-4o and gpt-4o-mini by default; additional providers accessible via `LLMProvider` interface — see 22-ai-architecture section 22.5)
- OCR and voice transcription are metered separately per page and per minute respectively
- Token usage is visible to Tenant Admin in the platform usage dashboard
- See 14-api-architecture section 14.2 for AI API rate limiting defaults

---

## 26.2 Revenue

Streams :

- SaaS subscription
- AI usage
- Vendor marketplace fees  (Phase 3 — Marketplace Economy; see 28-ecosystem-expansion section 28.2)
- Financing/referral fees  (Phase 4 — Financial Infrastructure; see 28-ecosystem-expansion section 28.2)
- API usage
- Enterprise support

> 📎 See also: [13-product-architecture](13-product-architecture.md) · [14-api-architecture](14-api-architecture.md) · [25-go-to-market](25-go-to-market.md) · [28-ecosystem-expansion](28-ecosystem-expansion.md)
