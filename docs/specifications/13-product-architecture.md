---
title: 'Product Architecture'
version: '1.1.0'
status: Active
last_updated: '2026-05-25'
authors:
  - thitipongroo
related_docs:
  - 03-system-design.md
  - 06-rbac-permission-matrix.md
  - 14-api-architecture.md
  - 21-mvp-scope.md
---

# 13. Product Architecture

## Table of Contents

- [13.1 Product Layering](#131-product-layering)
  - [Layer 1 — Core Platform](#layer-1--core-platform)
  - [Layer 2 — Construction Modules](#layer-2--construction-modules)
  - [Layer 3 — Intelligence Layer](#layer-3--intelligence-layer)
  - [Layer 4 — Ecosystem Layer](#layer-4--ecosystem-layer)
- [13.2 Product Packaging](#132-product-packaging)
  - [SMB Package](#smb-package)
  - [Mid-market Package](#mid-market-package)
  - [Enterprise Package](#enterprise-package)

---

## 13.1 Product Layering

### Layer 1 — Core Platform

Foundation :

- Identity
- Permissions
- Tenant isolation
- Audit logs
- Notifications
- Workflow engine
- Document engine (OCR, version management, format conversion, drawing viewer — implemented by Document Service in 03-system-design section 3.2; sits above the File Service storage layer)
- API gateway
- Event bus

### Layer 2 — Construction Modules

Modules :

- CRM
- Project Management
- BOQ Engine
- Procurement
- Site Operations
- Workforce
- Quality Control
- Safety
- Equipment
- Finance
- Asset Management

### Layer 3 — Intelligence Layer

Services :

- AI Copilot
- Forecasting engine
- Risk scoring
- Schedule prediction
- Cost anomaly detection
- Knowledge graph
- Recommendation engine

### Layer 4 — Ecosystem Layer

Channels :

- Vendor portal
- Contractor portal
- Customer portal
- API marketplace
- BIM integrations
- IoT integrations
- ERP integrations

---

## 13.2 Product Packaging

### SMB Package

Features :

- Basic project management
- Procurement
- Cost tracking
- Mobile app

### Mid-market Package

Features :

- Multi-project
- Workflow automation
- AI forecasting (Layer B Analytical AI — activates when Layer B is released post-MVP; see 22-ai-architecture section 22.2 and 21-mvp-scope section 21.4)
- Advanced finance

### Enterprise Package

Features :

- Multi-entity
- Custom workflows
- Data lake
- AI orchestration
- Private deployment
- SSO/SAML
- Compliance tooling

---

## 13.3 Financial Compliance Integrations

### Tax Calculation — Avalara AvaTax

**Decision:** Avalara AvaTax API is the tax calculation engine for Construction OS.

| Attribute            | Value                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------- |
| Provider             | Avalara AvaTax (cloud-based tax compliance SaaS)                                              |
| Scope                | VAT, GST, Sales Tax — jurisdiction-specific rates calculated at PO and invoice creation       |
| Integration point    | POST to AvaTax REST API with transaction details; returns `taxAmount` + line-level breakdown  |
| Tenant configuration | `avalara_account_id` + `avalara_license_key` stored per tenant in AWS Secrets Manager / Vault |
| Phase                | Phase 5 — activate when tenant issues first taxable invoice                                   |
| Trigger              | Invoice creation or PO generation requiring tax calculation                                   |

Avalara handles multi-jurisdiction tax compliance globally — the platform does not implement tax rate tables internally.

---

### Withholding Tax (WHT) Rules

**Decision:** Default rules for Thailand; TENANT_ADMIN configures for other jurisdictions.

**Thailand defaults (pre-seeded at tenant provisioning):**

| Vendor type        | WHT rate |
| ------------------ | -------- |
| Services (general) | 3%       |
| Rent / property    | 5%       |

**Other jurisdictions:** TENANT_ADMIN configures rates via WHT rules table:

```sql
-- wht_rules table schema
  rule_id          UUID PK
  tenant_id        UUID NOT NULL
  jurisdiction_code VARCHAR(10) NOT NULL   — ISO 3166-1 alpha-2 (e.g. TH, SG, MY)
  service_type     VARCHAR(100) NOT NULL   — e.g. "services", "rent", "royalties"
  rate             DECIMAL(5,2) NOT NULL   — e.g. 3.00 = 3%
  is_active        BOOLEAN DEFAULT true
  UNIQUE: (tenant_id, jurisdiction_code, service_type)
```

WHT is calculated as a hook inside the Avalara AvaTax flow. WHT certificate reference number is tracked in `payments.wht_certificate_ref`.

---

### ERP Integration — Strategy Pattern

**Decision:** Strategy pattern with a common `ERPIntegration` interface and one concrete adapter per ERP system. Each ERP system has its own STUB pending a real customer onboarding with that system.

**Common interface (all adapters implement this):**

```typescript
interface ERPIntegration {
  postCostTransaction(tx: CostTransaction): Promise<ERPPostingResult>;
  postInvoice(invoice: VendorInvoice): Promise<ERPPostingResult>;
  syncVendor(vendor: Vendor): Promise<void>;
}
```

**Three adapter stubs (each STUB until customer with that ERP onboards):**

| Adapter         | ERP System                                         |
| --------------- | -------------------------------------------------- |
| SAPAdapter      | SAP Business One / S/4HANA — webhook + iDoc format |
| OracleAdapter   | Oracle Fusion Finance — REST API                   |
| DynamicsAdapter | Microsoft Dynamics 365 Finance — REST API          |

Each adapter is implemented only when the first tenant using that ERP system requests integration.
API credentials, field mappings, and authentication are configured per-tenant in AWS Secrets Manager / Vault.

For stub implementation behaviour (Type A — fail-fast), see `32-implementation-specifications` §32.9.

---

## 13.4 Domain Integrations

### CRM Integration — Strategy Pattern

**Decision:** Generic webhook receiver + per-CRM field mapper (Strategy pattern). Each CRM system has its own STUB pending a real tenant that uses that CRM.

**Data flow (one direction only — CRM → COS):**

```text
CRM (won deal) → webhook POST → COS webhook receiver → createProjectFromLead() → Project created
```

**Common interface (all adapters implement this):**

```typescript
interface CRMIntegration {
  createProjectFromLead(crmLeadId: string, tenantId: string): Promise<Project>;
}
```

**Three adapter stubs (each STUB until tenant with that CRM onboards):**

| Adapter           | CRM System                                           |
| ----------------- | ---------------------------------------------------- |
| SalesforceAdapter | Salesforce REST API — won Opportunity → project      |
| HubSpotAdapter    | HubSpot Webhooks — deal stage "Closed Won" → project |
| PipedriveAdapter  | Pipedrive Webhooks — deal status "won" → project     |

Field mapping (CRM deal fields → COS project fields) is configured per-tenant per-CRM system.

For stub implementation behaviour (Type A — fail-fast), see `32-implementation-specifications` §32.9.

---

### BIM Integration — IFC Parser

**Decision:** Accept IFC format (ISO 16739-1:2018 — platform-agnostic open standard).
Implement IFC parser first; any BIM software that exports IFC is compatible (Revit, ArchiCAD, Trimble, etc.).

**File format:** IFC 2x3 minimum; IFC 4.0 preferred (see `33-digital-twin-iot` §33.2 normative standards).

**Two integration points:**

**Phase 3 — Project Structure Import:**

```typescript
interface BIMProjectStructure {
  importProjectStructure(
    bimFileUrl: string,
    projectId: string,
    tenantId: string,
  ): Promise<BIMStructureResult>;
}
// BIMStructureResult: { phasesCreated, milestonesCreated, unmappedElements[] }
// IFC mapping: IfcBuildingStorey → project phases, IfcSpace → milestones
```

**Phase 4 — BOQ Auto-population:**

```typescript
interface BIMQuantities {
  importQuantities(
    bimFileUrl: string,
    boqVersionId: string,
    tenantId: string,
  ): Promise<BIMImportResult>;
}
// BIMImportResult: { itemsCreated, itemsUpdated, unmappedElements[], confidence }
// IFC mapping: IfcElement quantities → BOQ line items (unit, quantity, unit_price placeholder)
```

**Implementation path:**

1. IFC.js (open-source parser — `@thatopen/engine` or `web-ifc`) — platform-agnostic, handles all BIM software
2. Autodesk Forge API / Trimble Connect API — optional vendor-specific connectors (add only if a tenant requires cloud-based BIM platform sync)

Both integration points ship as stubs until a tenant requests IFC import.
For stub implementation behaviour (Type A — fail-fast), see `32-implementation-specifications` §32.9.

---

## 13.5 Additional Integration Decisions

### API Monetization

**Decision:** Kong Gateway usage plans — quota per tenant tier enforced via Kong rate limiting plugin.

| Tier       | Monthly API call quota           | Overage action                    |
| ---------- | -------------------------------- | --------------------------------- |
| SMB        | 50,000 calls/month               | Block (429) + notify TENANT_ADMIN |
| Mid-market | 100,000 calls/month              | Block (429) + notify TENANT_ADMIN |
| Enterprise | Configurable (default 1,000,000) | Configurable (warn or block)      |

Quota tracked via Kong usage plans plugin; metering data fed to ClickHouse for billing analytics (Phase 14).

**Per-API-key quota (marketplace integrations):**

Each OAuth2 client credentials API key is subject to an additional per-key monthly cap, independent of the tenant total. No single key may consume more than 20% of the tenant's monthly quota.

| Tier       | Per-API-key monthly limit                    | Overage action                    |
| ---------- | -------------------------------------------- | --------------------------------- |
| SMB        | 10,000 calls/month per key                   | Block (429) + notify TENANT_ADMIN |
| Mid-market | 20,000 calls/month per key                   | Block (429) + notify TENANT_ADMIN |
| Enterprise | Configurable (default 200,000/month per key) | Configurable (warn or block)      |

Kong enforces both limits simultaneously: tenant total quota and per-key quota. A request is rejected if either is exceeded.

> **Scope:** Monthly quota applies to **external API traffic only** — third-party integrations authenticating via OAuth2 client credentials flow (ERP adapters, CRM webhooks, marketplace integrations, developer API keys). Internal web and mobile app traffic (authenticated via user JWT from Keycloak/COS identity service) is **not subject to monthly quota** and is governed solely by the per-minute rate limits in `14-api-architecture` §14.2.
>
> Kong distinguishes traffic by auth method: requests using OAuth2 client credentials (`client_id` + `client_secret`) are metered against the quota; requests using user Bearer JWTs are not.

---

### Construction Financing

**Decision:** Invoice factoring — tenant submits outstanding invoices to fintech partner; receives advance payment.

| Attribute       | Value                                                                                          |
| --------------- | ---------------------------------------------------------------------------------------------- |
| Model           | Invoice factoring (AR factoring)                                                               |
| Data flow       | COS exports invoice data → fintech partner API → advance payment ref returned                  |
| Interface       | `ConstructionFinancing.submitFactoringApplication(invoiceId, tenantId): Promise<FinancingRef>` |
| Trigger         | Implement when first tenant requests invoice factoring with a specific fintech partner         |
| Fintech partner | PO decision required — per-partner adapter (Strategy pattern, same as ERP integration)         |

For stub implementation behaviour (Type A — fail-fast until fintech partner is contracted),
see `32-implementation-specifications` §32.9.

---

### Biometric Check-In

**Decision:** Generic SDK interface — any biometric hardware vendor SDK implements the same interface.

```typescript
interface BiometricCheckIn {
  verifyCheckIn(workerId: string, projectId: string, method: BiometricMethod): Promise<boolean>;
}
type BiometricMethod = 'FINGERPRINT' | 'FACE_ID' | 'IRIS';
```

Vendor SDK is injected via DI at deployment time. No vendor is selected at the platform level — each site configures their vendor adapter. Credentials and SDK config stored per-site in AWS Secrets Manager / Vault.

---

### IoT Device Integration

**Decision:** MQTT 5.0 protocol (already normative in `33-digital-twin-iot` §33.2).

| Attribute       | Value                                                        |
| --------------- | ------------------------------------------------------------ |
| Protocol        | MQTT 5.0 (OASIS Standard 2019)                               |
| QoS             | QoS 1 minimum for telemetry; QoS 2 for critical state events |
| Topic structure | `cos/v1/devices/{device_id}/telemetry`                       |
| Broker          | AWS IoT Core (cloud) / EMQX (on-premise)                     |
| Interface       | `IoTIntegration.publishTelemetry(deviceId, payload): void`   |
| Trigger         | Implement when first tenant deploys GPS-tracked equipment    |

> 📎 See also: [03-system-design](03-system-design.md) · [06-rbac-permission-matrix](06-rbac-permission-matrix.md) · [14-api-architecture](14-api-architecture.md) · [21-mvp-scope](21-mvp-scope.md)
