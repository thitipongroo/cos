// CentralPriceAdapter — the ingestion seam for a government price source (ADR-061 §Ingestion).
//
// Strategy pattern, the shape §13.3 gives ERPIntegration: one interface, one concrete adapter per
// upstream, chosen by DI. CentralPricesAdminService depends on this interface only; the provider bound to
// CENTRAL_PRICE_ADAPTER in CentralPricesModule is the one that runs.
//
// Today that is EgpCentralPriceAdapter, a stub (product-owner decision D9, 2026-09-15): ADR-061 records
// that กรมบัญชีกลาง / e-GP public-API availability is unverified, so there is nothing to call. File import
// is the working path. A real adapter replaces the stub's binding — and deletes the stub file in the same
// change (§32.9 Stub Implementation Rules).

import type { CentralPriceRecordInput } from '../central-price-rows';

/** DI token for the active adapter. */
export const CENTRAL_PRICE_ADAPTER = Symbol('CENTRAL_PRICE_ADAPTER');

export type CentralPriceFetchResult =
  /** No usable upstream. Recorded as a NOT_CONFIGURED run; nothing is written to the catalog. */
  | { outcome: 'NOT_CONFIGURED'; message: string }
  /** The upstream was reached and failed. Recorded as a FAILED run; nothing is written. */
  | { outcome: 'FAILED'; error_code: string; message: string }
  /**
   * A price list for one period. Every record goes through the same validation as a file row, and is
   * written with source GOV_API.
   */
  | {
      outcome: 'FETCHED';
      effective_period: string;
      source_ref: string | null;
      records: CentralPriceRecordInput[];
    };

export interface CentralPriceAdapter {
  /** Shown on the register's API-Sync panel and stored as the run's source_name. */
  readonly name: string;
  /** Whether a sync could reach an upstream at all. Must not perform I/O. */
  isConfigured(): boolean;
  /** Pull the current price list. Must resolve — failures are reported through the result, not thrown. */
  fetch(): Promise<CentralPriceFetchResult>;
}
