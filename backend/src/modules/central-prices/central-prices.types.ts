// ราคากลาง central prices — the shapes the API returns (ADR-061).
//
// Keys are snake_case because they are the table's columns and the queries are raw SQL: `$queryRaw`
// hands back raw column names, and a camelCase type here would describe a shape that never exists at
// runtime (see TenantSummaryRow in tenant.service.ts for the time that happened).

// The shapes live in @cos/types (client-safe) so the web panel and this module share one declaration.

export type {
  CentralPriceSource,
  CentralPriceStatus,
  SyncRunKind,
  SyncRunOutcome,
  CentralPriceRow,
  CentralPriceListResponse,
  CentralPriceSearchResponse,
  SyncRun,
  SyncStatusResponse,
  RejectedRow,
  ImportResult,
} from '@cos/types';

export type { CentralPriceReference } from './public/boq-central-price';
