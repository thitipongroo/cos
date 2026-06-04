// Avalara AvaTax Integration Stub — Phase 5
// DECIDED (spec §13.3 / Phase 5 Decision): Avalara AvaTax API for tax calculation.
// Interface: { calculate(amount, currency, fromAddress, toAddress, lineItems, tenantId): TaxResult }
// WHT rules: Thailand default 3% services / 5% rent; TENANT_ADMIN configures other
//            jurisdictions via wht_rules table (spec §13.3).
// Trigger: implement when first tenant requires tax calculation on invoice/PO generation.
// WHTResult flows through this stub; AvaTax handles cross-border; WHT is a post-AvaTax step.

import type Decimal from 'decimal.js';

export interface TaxLineItem {
  description: string;
  quantity: string; // DECIMAL(10,4) as string
  unit_price: string; // DECIMAL(19,4) as string
  amount: string; // DECIMAL(19,4) as string
}

export interface TaxAddress {
  line1: string;
  city: string;
  region: string; // state/province code
  postal_code: string;
  country: string; // ISO 3166-1 alpha-2
}

export interface TaxResult {
  total_tax: string; // DECIMAL(19,4) as string
  currency_code: string;
  lines: Array<{
    description: string;
    tax_amount: string;
    tax_rate: number;
  }>;
}

export interface WHTResult {
  whtAmount: Decimal;
  rate: number;
  certificateRef: string;
}

export interface AvalaraTaxAdapter {
  calculate(
    amount: string,
    currency: string,
    fromAddress: TaxAddress,
    toAddress: TaxAddress,
    lineItems: TaxLineItem[],
    tenantId: string,
  ): Promise<TaxResult>;
}

// STUB — not implemented until trigger condition met
export class AvalaraTaxStub implements AvalaraTaxAdapter {
  async calculate(
    _amount: string,
    _currency: string,
    _fromAddress: TaxAddress,
    _toAddress: TaxAddress,
    _lineItems: TaxLineItem[],
    tenantId: string,
  ): Promise<TaxResult> {
    throw new Error(
      `AvalaraTax not yet implemented for tenant ${tenantId}. ` +
        'Trigger: first tenant requires tax calculation on invoice/PO generation. ' +
        'Implement using Avalara AvaTax API (spec §13.3).',
    );
  }
}
