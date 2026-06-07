// AvaTax EP Stub — Phase 7
// DECIDED (spec §32.9 / Phase 7): Tax calculation via Avalara AvaTax API — NOT implemented yet.
// Type A stub: log WARN + throw NotImplementedException on every call.
// Activate when first tenant requires tax calculation in their jurisdiction.
// WHT (Withholding Tax) is a hook INSIDE the AvaTax flow — see wht.service.ts.

import { NotImplementedException } from '@nestjs/common';
import { createLogger } from '@cos/logger';

const logger = createLogger('avatax-stub');

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TaxAddress {
  street: string;
  city: string;
  region: string;
  country: string;
  postalCode: string;
}

export interface TaxLineItem {
  amount: string;
  quantity: number;
  itemCode?: string;
  description?: string;
}

export interface TaxResult {
  totalTax: string;
  totalTaxCalculated: string;
  taxLines: Array<{ lineNo: number; tax: string; rate: number }>;
}

// ─── Interface ────────────────────────────────────────────────────────────────

export interface AvaTaxClient {
  calculate(
    amount: string,
    currency: string,
    fromAddress: TaxAddress,
    toAddress: TaxAddress,
    lineItems: TaxLineItem[],
    tenantId: string,
  ): Promise<TaxResult>;
}

// ─── Stub ─────────────────────────────────────────────────────────────────────

export class AvaTaxStub implements AvaTaxClient {
  async calculate(
    amount: string,
    currency: string,
    _fromAddress: TaxAddress,
    _toAddress: TaxAddress,
    _lineItems: TaxLineItem[],
    tenantId: string,
  ): Promise<TaxResult> {
    logger.warn(
      { amount, currency, tenantId },
      'AvaTax not activated — implement when first tenant requires tax calculation',
    );
    throw new NotImplementedException('AvaTax not yet activated');
  }
}

export const AVATAX_CLIENT = Symbol('AVATAX_CLIENT');
