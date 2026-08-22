// WhtService — Phase 7
// Withholding Tax calculation using the wht_rules table.
// Per spec §13.3: Thailand default 3% services / 5% rent; TENANT_ADMIN configures
// other jurisdictions via wht_rules table. Do NOT hardcode rates.
// Interface: calculate(amount, vendorType, jurisdiction): WHTResult
// certificateRef is generated here and stored in payments.wht_certificate_ref.

import { Injectable, Scope, NotFoundException } from '@nestjs/common';
import { Decimal } from '@cos/financial';
import { createLogger } from '@cos/logger';
import { FinanceRepository } from './finance.repository';

const logger = createLogger('wht-service');

export interface WHTResult {
  whtAmount: Decimal;
  rate: number;
  certificateRef: string;
}

@Injectable({ scope: Scope.REQUEST })
export class WhtService {
  constructor(private readonly repo: FinanceRepository) {}

  /**
   * Calculate withholding tax for a payment.
   *
   * @param amount       Payment amount (Decimal)
   * @param vendorType   Maps to service_type in wht_rules (e.g. "services", "rent", "royalties")
   * @param jurisdiction ISO 3166-1 alpha-2 code (e.g. "TH", "SG", "MY")
   */
  async calculate(amount: Decimal, vendorType: string, jurisdiction: string): Promise<WHTResult> {
    const rule = await this.repo.findWhtRule(jurisdiction, vendorType);
    if (!rule) {
      throw new NotFoundException(
        `No active WHT rule found for jurisdiction=${jurisdiction} service_type=${vendorType}`,
      );
    }

    // Straight from the stored value into Decimal. The previous form went through
    // `Number(rule.rate)` and back out via `.toString()`; for a numeric(5,2) column that round-trip
    // is in fact lossless across the column's entire range, but master:991 asks that money never
    // touch a JS number at all, and a rule that has to be defended with a range proof every time it
    // is read is a rule that will eventually be read wrong.
    const rate = new Decimal(rule.rate);
    const whtAmount = amount.times(rate).dividedBy(new Decimal('100')).toDecimalPlaces(4);

    // globalThis.crypto.randomUUID() is available in Node.js ≥19 without imports.
    const certificateRef = `WHT-${globalThis.crypto.randomUUID()}`;

    logger.info(
      {
        jurisdiction,
        vendorType,
        rate: rate.toString(),
        whtAmount: whtAmount.toFixed(4),
        certificateRef,
      },
      'wht.calculated',
    );

    // WHTResult.rate stays a number for its callers; it is derived from the Decimal rather than
    // being the source the arithmetic ran on.
    return { whtAmount, rate: rate.toNumber(), certificateRef };
  }
}
