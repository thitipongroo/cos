---
title: Construction OS — Extension Points
last_updated: 2026-08-07
---

# Extension Points

An extension point (EP) is an integration the platform is designed for but has not activated —
a CRM, an ERP, a BIM parser, an IoT platform. They exist so a tenant-specific integration can be
dropped in without refactoring, and they have exactly one correct shape.

## Before you touch one

**Every EP decision is already made.** They are documented in `docs/specifications/` — §13.3–§13.5,
§22.6, and [`05-security-compliance.md`](../specifications/05-security-compliance.md) §5.3.1. Read
the decision before writing code. Do not invent an approach, and do not treat a missing
implementation as a missing decision.

If something genuinely is not specified anywhere:

- Mark it **`UNSPECIFIED`** and **stop**. Escalate to the product owner.
- Do **not** generate a stub, do not hallucinate the detail, do not proceed on an assumption.

That is different from an EP whose decision exists but whose implementation is deliberately deferred
— those get a stub, in one of exactly two shapes.

## The Integration Stub Pattern (§32.9)

| Type                                    | Behaviour                                                                                                 |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Type A** — everything not listed as B | Log `WARN` (integration name + method), then **throw a typed exception immediately**. Fail fast.          |
| **Type B** — IoT only                   | Log `WARN`, then **return safe defaults** so the service stays operational in a degraded but valid state. |

**Returning `null` or an empty value from a Type A stub is prohibited** — the caller may read it as
success and continue, which is how silent data corruption and invalid workflow state happen. Reaching
a Type A stub in production means a misconfiguration or a feature enabled before activation; failing
fast makes that visible immediately.

Type B is only what the phase spec explicitly says is Type B. **If the phase spec does not say Type
B, it is Type A.** Currently Type B: IoT Device (Phase 21+), Digital Twin IoT ingestion (Phase 24),
Digital Twin BIM import (Phase 24) — all specified in `33-digital-twin-iot.md`.

Stub rules: implement the **full** interface from the phase spec (no partial implementations), and
register it in the NestJS DI container from the phase that introduces it — so swapping in the real
adapter is a DI token change, not a refactor.

## Where the major EPs are resolved

| Extension point            | Decision                                                                                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CRM integration**        | Strategy pattern — generic webhook receiver + per-CRM field mapper. Salesforce / HubSpot / Pipedrive sub-stubs. One direction only: CRM won-deal → COS project (§13.4)                                  |
| **ERP integration**        | Strategy pattern — `postCostTransaction` / `postInvoice` / `syncVendor`. SAP / Oracle / Dynamics sub-stubs, each built when the first tenant on that ERP onboards (§13.3)                               |
| **BIM integration**        | IFC 4.3 (ISO 16739-1:2023) + buildingSMART; IFC.js parser, platform-agnostic. Structure import (Phase 3) and BOQ quantity import (Phase 4) share the parser (§13.4, INT-004)                            |
| **IoT platform**           | **RESOLVED — EMQX** open-source, self-hosted on EKS. Pipeline: device → EMQX → IoT Ingestion Worker → Kafka → TimescaleDB. EMQX's own Kafka bridge is a paid feature and is **not** used (§13.5, §33.8) |
| **LLM provider**           | `LLMProvider` interface — **never** call the OpenAI SDK directly. OpenAI GPT-4o primary; Claude and Ollama are drop-in swaps via the same interface (§22.6)                                             |
| **Cloud OCR**              | AWS Textract `AnalyzeDocument` (FORMS), IAM via EKS IRSA (§22.6)                                                                                                                                        |
| **Tax calculation**        | Avalara AvaTax. Thai WHT defaults 3% services / 5% rent; other jurisdictions configured per tenant in `wht_rules` — **never hardcode a rate** (§13.3)                                                   |
| **Currency conversion**    | Open Exchange Rates, Redis-cached 24 h, stale-while-revalidate on API failure. No custom FX logic                                                                                                       |
| **Biometric check-in**     | Generic SDK interface, vendor SDK injected via DI at deployment; credentials per site in Vault / AWS SM (§13.5)                                                                                         |
| **Enterprise SSO**         | Keycloak SAML 2.0 IdP configuration — admin console, **no code change** (Phase 2)                                                                                                                       |
| **Advanced ABAC**          | Custom NestJS `PolicyGuard`, swapped in via DI; the guard interface does not change (Phase 2)                                                                                                           |
| **Construction financing** | AR invoice factoring — export verified invoices to a fintech partner via a per-partner adapter (§13.5)                                                                                                  |
| **Carbon calculation**     | EN 15804 / ISO 21930 material factors + GHG Protocol Scope 1/2/3 reporting. The `boq_items.carbon_factor_kg_co2e` and `carbon_total_kg_co2e` columns are nullable capture hooks from Phase 4 (§33.4)    |

## Rules that apply to all of them

- **Never call a vendor SDK directly** from business logic — always through the interface.
- **Never invent** business logic, accounting rules, tax rules, BIM schemas, procurement approval
  chains, or workflow states beyond those in `00_master_construction_os.md` § WORKFLOW ENGINE SPEC.
- Credentials for any adapter live in **AWS Secrets Manager** (cloud) or **HashiCorp Vault**
  (on-premise), per tenant — never in code, never in a `.env` that ships.
- Adding an EP implementation is an architecture decision → it needs an **ADR** in
  [`docs/architecture/adr/`](../architecture/README.md) (QM-11), and Rule 29 says verify the ADR file
  exists before citing its number anywhere.

> 📎 [`specifications/32-implementation-specifications.md`](../specifications/32-implementation-specifications.md)
> §32.9 (the stub pattern, authoritative) ·
> [`specifications/13-product-architecture.md`](../specifications/13-product-architecture.md)
> §13.3–§13.5 · [`specifications/22-ai-architecture.md`](../specifications/22-ai-architecture.md)
> §22.6–§22.7 (AI provider decisions).
