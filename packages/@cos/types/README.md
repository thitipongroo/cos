# @cos/types

Shared TypeScript types, enums, and interfaces used across all platforms.

## Purpose

Single source of truth for domain enums and shared type definitions that are used across Node.js services, mobile (React Native), and PWA. Contains no executable logic — only TypeScript type declarations and plain enum objects. No runtime dependencies.

Exempt from jest coverage requirement (Rule 35 — no executable logic).

## Public API

```typescript
import { CosRole } from '@cos/types';
import type { BaseEventEnvelope } from '@cos/types';
import type { PaginationMeta, CursorPage } from '@cos/types';
```

### Role enum (spec §6.2 + §6.8)

```typescript
enum CosRole {
  // spec §6.2 — seeded at tenant provisioning
  SYSTEM_ADMIN = 'SYSTEM_ADMIN',
  TENANT_ADMIN = 'TENANT_ADMIN',
  EXECUTIVE = 'EXECUTIVE',
  PROJECT_MANAGER = 'PROJECT_MANAGER',
  PROCUREMENT_OFFICER = 'PROCUREMENT_OFFICER',
  FINANCE = 'FINANCE',
  SAFETY_OFFICER = 'SAFETY_OFFICER',
  SITE_ENGINEER = 'SITE_ENGINEER',
  CRM_SALES_MANAGER = 'CRM_SALES_MANAGER',
  // spec §6.8 — implementation sub-roles, assigned manually post-provisioning
  PROC_MANAGER = 'PROC_MANAGER',
  SITE_WORKER = 'SITE_WORKER',
  VIEWER = 'VIEWER',
}
```

### `BaseEventEnvelope`

```typescript
interface BaseEventEnvelope<T = unknown> {
  event_id: string; // UUID v4
  event_type: string; // canonical: {domain}.{entity}.{action}.v{N}
  event_version: string; // semver string e.g. "1.0"
  tenant_id: string;
  actor_id: string;
  occurred_at: string; // ISO 8601 UTC
  correlation_id: string;
  payload: T;
}
```

### Pagination types

```typescript
interface CursorPage<T> {
  data: T[];
  nextCursor?: string;
  hasMore: boolean;
}
interface PaginationMeta {
  total?: number;
  page?: number;
  limit: number;
}
```

## Dependencies

None. This package has zero runtime dependencies by design.

## Configuration

No environment variables.

## Usage

```typescript
// Mobile-safe import
import { CosRole } from '@cos/types';

// Type-only import where no runtime value needed
import type { BaseEventEnvelope } from '@cos/types';
```

## Notes

- Mobile-safe: no Node.js built-ins, no server frameworks, no native addons
- Import `BaseEventEnvelope` as `import type` in packages that don't need the runtime value
