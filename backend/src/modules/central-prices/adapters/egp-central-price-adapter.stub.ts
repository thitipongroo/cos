// e-GP / กรมบัญชีกลาง central price adapter — STUB (ADR-061; product-owner decision D9, 2026-09-15).
//
// DECIDED (ADR-061 §Ingestion): a CentralPriceAdapter pulls ราคากลาง from กรมบัญชีกลาง / e-GP "when a usable
// source exists". Public-API availability is UNVERIFIED — no endpoint, contract or credential is named
// anywhere in docs/specifications/ or docs/architecture/ — so this adapter makes no network call.
// Trigger to replace it: a verified e-GP (or กรมบัญชีกลาง) price API with a documented contract.
//
// WHY IT RETURNS INSTEAD OF THROWING. §32.9 Type A says a non-critical stub logs WARN and throws. D9
// decided this seam reports "not configured": the register's Force Retry Sync runs it, and the honest
// result of that button today is a recorded NOT_CONFIGURED run, not a 500. It still logs WARN, and it
// still never returns an empty success — NOT_CONFIGURED writes nothing and cannot be mistaken for "the
// upstream had no prices" (the silent-corruption case §32.9 exists to prevent).

import { createLogger } from '@cos/logger';
import type { CentralPriceAdapter, CentralPriceFetchResult } from './central-price-adapter';

const logger = createLogger('egp-central-price-adapter');

export const EGP_ADAPTER_NAME = 'e-GP (กรมบัญชีกลาง)';

// STUB — not implemented until trigger condition met
export class EgpCentralPriceAdapter implements CentralPriceAdapter {
  readonly name = EGP_ADAPTER_NAME;

  isConfigured(): boolean {
    return false;
  }

  async fetch(): Promise<CentralPriceFetchResult> {
    logger.warn(
      { adapter: 'EgpCentralPriceAdapter', method: 'fetch' },
      'e-GP central price adapter not configured — no verified กรมบัญชีกลาง / e-GP price API (ADR-061); file import is the working path',
    );
    return {
      outcome: 'NOT_CONFIGURED',
      message:
        'The e-GP central price source is not configured: no verified กรมบัญชีกลาง / e-GP price API exists yet (ADR-061). Import a CSV or .xlsx file instead.',
    };
  }
}
