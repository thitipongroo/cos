// ConstructionFinancing EP Stub — Phase 7
// DECIDED (spec §13.5 / Phase 7): Invoice factoring (AR factoring).
// COS exports verified invoice data → fintech partner API.
// Strategy pattern — per-partner adapter implemented on first tenant request.
// Candidates: Funding Societies (SEA), Validus (SEA).

import { NotImplementedException } from '@nestjs/common';
import { createLogger } from '@cos/logger';

const logger = createLogger('construction-financing');

// ─── Interface ────────────────────────────────────────────────────────────────

export interface FinancingRef {
  reference_id: string;
  partner: string;
  submitted_at: string;
}

export interface ConstructionFinancing {
  submitFactoringApplication(invoiceId: string, tenantId: string): Promise<FinancingRef>;
}

// ─── Stub ─────────────────────────────────────────────────────────────────────

export class ConstructionFinancingStub implements ConstructionFinancing {
  async submitFactoringApplication(invoiceId: string, tenantId: string): Promise<FinancingRef> {
    logger.warn(
      { invoiceId, tenantId },
      'ConstructionFinancing not activated — implement when first tenant requests invoice factoring',
    );
    throw new NotImplementedException('ConstructionFinancing not yet activated');
  }
}

export const CONSTRUCTION_FINANCING = Symbol('CONSTRUCTION_FINANCING');
