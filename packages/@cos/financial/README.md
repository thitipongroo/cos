# @cos/financial

Decimal.js monetary calculation utilities enforcing the Construction OS Financial Precision Spec.

## Purpose

All monetary calculations platform-wide must use this package. Never use native JavaScript `number` or `float` for money. The spec requires `DECIMAL(19,4)` storage with `HALF_UP` rounding throughout.

Mutation testing required for all exported functions (QM-1): `stryker` mutation score ≥ 70%.

## Public API

```typescript
import {
  Decimal,
  calculateLineTotal,
  convertCurrency,
  sumDecimals,
  roundMoney,
  PRECISION,
  EXCHANGE_RATE_PRECISION,
} from '@cos/financial';
```

### `calculateLineTotal(quantity, unitPrice): Decimal`

`ROUND(quantity × unitPrice, 4)` using `HALF_UP`. Used for BOQ items and PO line items.

### `convertCurrency(amount, exchangeRate): Decimal`

`ROUND(amount × exchangeRate, 4)` using `HALF_UP`. Exchange rate stored as `DECIMAL(19,6)`.

### `sumDecimals(values): Decimal`

Sums an array of `Decimal` values. Never use `Array.reduce` with native numbers.

### `roundMoney(value, places?): Decimal`

Rounds to `places` decimal places (default 4) with `HALF_UP`.

### `PRECISION = 4` / `EXCHANGE_RATE_PRECISION = 6`

Storage precision constants — use when setting `toDecimalPlaces`.

## Dependencies

- `decimal.js` — arbitrary-precision decimal arithmetic

## Configuration

No environment variables. Globally sets `Decimal.set({ rounding: Decimal.ROUND_HALF_UP })` on import.

## Usage

```typescript
import { calculateLineTotal, Decimal } from '@cos/financial';

const qty = new Decimal('150.0000');
const price = new Decimal('2850.0000');
const total = calculateLineTotal(qty, price);
// → Decimal('427500.0000')

// Display (2 decimal places for UI)
console.log(total.toFixed(2)); // "427500.00"
```

**Prohibited:**

```typescript
// ❌ Never do this
const total = 150 * 2850; // floating point — violates QM-4
const total = qty.toNumber() * price.toNumber(); // same problem
```

## Notes

- `Decimal` is re-exported for convenience — always import from `@cos/financial`, not directly from `decimal.js`
- All PostgreSQL monetary columns: `DECIMAL(19,4)` — store `value.toFixed(4)` as string
- Tax calculation via EP-FINANCE-001 (Avalara) — this package handles arithmetic only
