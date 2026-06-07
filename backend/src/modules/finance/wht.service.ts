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

    const rate = Number(rule.rate);
    const whtAmount = amount
      .times(new Decimal(rate.toString()))
      .dividedBy(new Decimal('100'))
      .toDecimalPlaces(4);

    // globalThis.crypto.randomUUID() is available in Node.js ≥19 without imports.
    const certificateRef = `WHT-${globalThis.crypto.randomUUID()}`;

    logger.info(
      { jurisdiction, vendorType, rate, whtAmount: whtAmount.toFixed(4), certificateRef },
      'wht.calculated',
    );

    return { whtAmount, rate, certificateRef };
  }
}
