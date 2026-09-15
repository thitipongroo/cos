// Canonical event: platform.central_price_catalog.updated.v1
// Source: docs/architecture/adr/061-rakaklang-central-pricing.md §Events ("CentralPriceCatalogUpdated")
// Emitted by: CentralPricesAdminService, through the outbox, when a SYSTEM_ADMIN file import or a
// CentralPriceAdapter sync inserts or updates catalog rows. An attempt that changes nothing emits nothing.
//
// Platform-scope: the envelope's tenant_id is the 'platform' sentinel (the catalog is shared by every
// tenant and belongs to none), so the event rides the shared platform.events topic.

import type { BaseEventEnvelope } from '@cos/types';

/** ADR-061 source — Avro enum CentralPriceSource. Symbols may only be appended. */
export type CentralPriceSource = 'MANUAL_IMPORT' | 'GOV_API';

export interface CentralPriceCatalogUpdatedPayload {
  run_id: string; // UUID of the platform.central_price_sync_runs row that made the change
  source: CentralPriceSource;
  effective_period: string; // ADR-061 year/version, e.g. "2569"
  records_inserted: number;
  records_updated: number;
}

export type CentralPriceCatalogUpdatedEvent = BaseEventEnvelope<CentralPriceCatalogUpdatedPayload>;
