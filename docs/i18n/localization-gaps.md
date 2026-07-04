# Construction OS — i18n Localization Gaps

> **Purpose:** Track Thai-specific (TH-SPECIFIC) business rules and locale behaviors that have no
> international equivalent. Tagged with `// i18n: TH-SPECIFIC` in source code. Reviewed before
> each Stage transition. Source: QM-3.

---

## How to use this file

When you encounter a Thai-specific business rule in code, add a `// i18n: TH-SPECIFIC` comment
in the source file **and** add an entry to this document.

| Column         | Meaning                                                         |
| -------------- | --------------------------------------------------------------- |
| Rule           | Short name used in code comments                                |
| Domain         | Which app / module it affects                                   |
| Description    | What the rule is and why it differs from international behavior |
| Implementation | Where it is implemented                                         |
| Status         | `IMPLEMENTED` / `PARTIAL` / `OPEN`                              |

---

## Active gaps

### TH-001 — Buddhist Era (B.E.) calendar display

| Field          | Value                                                                                                                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rule           | `BUDDHIST_ERA_DISPLAY`                                                                                                                                                                  |
| Domain         | All — web, mobile, API date display                                                                                                                                                     |
| Description    | Thai users expect B.E. year (e.g., 2568 not 2025). Use `Intl.DateTimeFormat` with `calendar: 'buddhist'` for `th-TH` locale. Never hardcode Gregorian year arithmetic for Thai display. |
| Implementation | `apps/web/src/lib/i18n/date-format.ts`, `apps/mobile/src/utils/dateFormat.ts`                                                                                                           |
| Status         | OPEN                                                                                                                                                                                    |

### TH-002 — VAT 7% construction invoices

| Field          | Value                                                                                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rule           | `THAI_VAT_CONSTRUCTION`                                                                                                                                                 |
| Domain         | Finance module — invoices, POs, BOQ costing                                                                                                                             |
| Description    | Thai construction contracts apply 7% VAT (as of B.E. 2567). VAT rate is a configurable system setting, not a hardcoded constant — rate may change by government decree. |
| Implementation | `backend/src/modules/finance/finance.constants.ts` — `DEFAULT_VAT_RATE_PCT = 7`                                                                                         |
| Status         | OPEN                                                                                                                                                                    |

### TH-003 — Thai baht (THB) currency display

| Field          | Value                                                                                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rule           | `THAI_BAHT_FORMAT`                                                                                                                                                                                            |
| Domain         | All monetary display                                                                                                                                                                                          |
| Description    | Display format: `฿1,234,567.89` (symbol prefix, comma thousands separator, 2 decimal places for display — stored as DECIMAL(19,4)). Use `Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' })`. |
| Implementation | `packages/@cos/financial/src/format.ts`                                                                                                                                                                       |
| Status         | OPEN                                                                                                                                                                                                          |

### TH-004 — Thai national ID (บัตรประชาชน) validation

| Field          | Value                                                                                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Rule           | `THAI_NATIONAL_ID`                                                                                                                 |
| Domain         | Workforce module — employee identity verification                                                                                  |
| Description    | 13-digit Thai national ID with Luhn-like check digit. Workers at construction sites are required to present ID per Thai labor law. |
| Implementation | `packages/@cos/validation/src/thai-national-id.validator.ts`                                                                       |
| Status         | OPEN                                                                                                                               |

### TH-005 — Thai labor law overtime rules

| Field          | Value                                                                                                                                                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rule           | `THAI_OVERTIME_RULES`                                                                                                                                                                                            |
| Domain         | Workforce module — manpower cost calculation                                                                                                                                                                     |
| Description    | Thai Labor Protection Act B.E. 2541 §61–65: OT pay = 1.5× on weekdays, 2× on holidays, 3× on holidays if normal day's work is also required. Not a universal rule — must not be applied to non-Thai deployments. |
| Implementation | `backend/src/modules/workforce/workforce.service.ts`                                                                                                                                                             |
| Status         | OPEN                                                                                                                                                                                                             |

### TH-006 — Thai company tax registration (เลขที่ผู้เสียภาษี)

| Field          | Value                                                                                                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rule           | `THAI_TAX_ID`                                                                                                                                                         |
| Domain         | Tenant module, vendor module                                                                                                                                          |
| Description    | 13-digit Thai taxpayer ID (same format as national ID for individuals, different issuing authority for juristic persons). Required on all tax invoices (ใบกำกับภาษี). |
| Implementation | `packages/@cos/validation/src/thai-tax-id.validator.ts`                                                                                                               |
| Status         | OPEN                                                                                                                                                                  |

### TH-007 — Thai construction permit (ใบอนุญาตก่อสร้าง) reference number format

| Field          | Value                                                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rule           | `THAI_CONSTRUCTION_PERMIT`                                                                                                                                                |
| Domain         | Project module, compliance module                                                                                                                                         |
| Description    | Local authority (อบต./เทศบาล) issues permits in `{year}/{district-code}/{sequence}` format; no uniform national standard. Store as free-text, validate as non-empty only. |
| Implementation | `backend/src/modules/project/project.dto.ts`                                                                                                                              |
| Status         | OPEN                                                                                                                                                                      |

---

## Closed / resolved gaps

_None yet. Move entries here with resolution detail once IMPLEMENTED and verified._

---

## Review schedule

| Event                  | Action                                                                    |
| ---------------------- | ------------------------------------------------------------------------- |
| Stage 1 → Stage 2 gate | Review all OPEN items; must have PARTIAL or IMPLEMENTED before proceeding |
| Stage 2 → Stage 3 gate | All items must be IMPLEMENTED                                             |
| Annually (Jan)         | Review for new Thai regulatory changes                                    |
