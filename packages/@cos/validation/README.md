# @cos/validation

Shared `class-validator` decorators for API input validation.

## Purpose

Provides reusable validation decorators for DTOs across all NestJS services. All API inputs must be validated using `class-validator` + `class-transformer` (QM-4) — never hand-written `if` checks alone. Shared decorators live here to prevent duplication.

## Public API

```typescript
import {
  IsCurrencyCode,
  IsDecimalString,
  IsUUIDParam,
  IsISODate,
  IsPositiveDecimal,
} from '@cos/validation';
```

### `@IsCurrencyCode()`

Validates ISO 4217 currency codes (e.g. `THB`, `USD`). 3-letter uppercase string.

### `@IsDecimalString(options?)`

Validates decimal number strings with configurable precision (e.g. `"2850.0000"`). Rejects native JS numbers at DTO boundary — enforces `@cos/financial` usage downstream.

### `@IsUUIDParam()`

Validates UUID v4 path/query parameters. Combines `@IsUUID('4')` with a trimming transform.

### `@IsISODate()`

Validates ISO 8601 date strings (`YYYY-MM-DD`). Used for `start_date`, `end_date` fields.

### `@IsPositiveDecimal()`

Validates that a decimal string represents a positive number (> 0). Used for quantities and unit prices.

## Dependencies

- `class-validator` — base decorators
- `class-transformer` — `@Transform` for sanitisation

## Configuration

No environment variables.

## Usage

```typescript
import { IsDecimalString, IsCurrencyCode } from '@cos/validation';
import { IsNotEmpty } from 'class-validator';

export class CreateBoqItemDto {
  @IsNotEmpty()
  description: string;

  @IsDecimalString({ maxDecimalPlaces: 4 })
  unit_cost: string; // "2850.0000"

  @IsCurrencyCode()
  currency_code: string; // "THB"
}
```

## Notes

- Only validates format and type — business rule validation (e.g. budget thresholds) belongs in the service layer
- Mobile: safe to import (pure JS decorators, no Node.js runtime dependencies)
