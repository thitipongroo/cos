---
paths:
  - "packages/@cos/financial/**"
  - "backend/src/modules/finance/**"
  - "backend/src/modules/boq/**"
  - "backend/src/modules/procurement/**"
  - "services/ai-gateway/reports/**"
  - "**/*.prisma"
---

# Financial Precision

Indexed in: `context/00_master_construction_os.md` §CROSS-CUTTING SPECIFICATIONS

> 📎 **Derived from:** `docs/specifications/32-implementation-specifications.md §32.5`

```text
FINANCIAL PRECISION RULES (apply to ALL monetary fields across ALL services):

Storage:

- All monetary amounts: DECIMAL(19, 4) in PostgreSQL
- Rationale: 4 decimal places for exchange rate calculations
- Currency: stored as ISO 4217 code (VARCHAR(3)), e.g. "THB", "USD"
- Never store money as FLOAT or DOUBLE — prohibited

Rounding:

- Default rounding mode: HALF_UP (standard commercial rounding)
- Tax calculation rounding: HALF_UP per line item, then sum
- Unit price × quantity: round final result to 4 decimal places
- Display rounding: 2 decimal places for UI (4 stored internally)

Multi-currency:

- System stores all amounts in original transaction currency
- Reporting currency: configurable per tenant (stored in tenant settings)
- Exchange rate: stored as DECIMAL(19, 6) — 6 decimal places
- Exchange rate source: Open Exchange Rates API

  Daily cache in Redis TTL 24h, fallback to last cached rate if API unavailable

- Currency conversion calculation: original_amount × exchange_rate,

  rounded to 4 decimal places

Arithmetic library:

- TypeScript/Node.js: use 'decimal.js' library — never use native JS floats
- Python: use Python 'decimal' module with ROUND_HALF_UP context
- All monetary calculations must be performed with decimal library,

  not native float arithmetic

Prohibited:

- Never store money as integer (cents) without explicit spec
- Never use JavaScript Number for monetary calculations
- Never round intermediate values — round only final results

```
