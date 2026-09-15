// PUBLIC API of the central-prices module (`public/`, tests/conformance/foundation/09-module-boundaries.spec.ts):
// what the BOQ module uses to link a line to a central price (ADR-061 Mode A / Mode B) — the reference shape and
// the two errors a BOQ request can meet. Everything else in the module stays private (R17, 2026-09-15).

import { HttpException, HttpStatus, UnprocessableEntityException } from '@nestjs/common';
import { centralPriceErrorBody } from '../central-price-errors';

/** The newest active, published price for an item code — what a BOQ line is linked to. */
export interface CentralPriceReference {
  price_id: string;
  code: string;
  unit: string;
  /** DECIMAL(19,4) as a string. */
  central_price: string;
  currency_code: string;
  effective_period: string;
}

/**
 * COS-CPRICE-006 · 422 — a BOQ line asked for the central price (use_central_price) and none can be
 * used: the line has no item code, no active published price exists for the code, or its currency is
 * not the line's.
 */
export function centralPriceUnavailable(
  message: string,
  details?: Record<string, unknown>,
): HttpException {
  return new UnprocessableEntityException(
    centralPriceErrorBody('COS-CPRICE-006', 'boq.centralPrice.error.unavailable', message, details),
  );
}

/** COS-CPRICE-007 · 400 — use_central_price and unit_cost were both sent; the request is ambiguous. */
export function unitCostWithCentralPrice(): HttpException {
  return new HttpException(
    centralPriceErrorBody(
      'COS-CPRICE-007',
      'boq.centralPrice.error.unitCostConflict',
      'Send either unit_cost or use_central_price: true, not both — with use_central_price the unit cost is taken from the central price.',
    ),
    HttpStatus.BAD_REQUEST,
  );
}
