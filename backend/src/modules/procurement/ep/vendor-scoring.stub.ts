// Vendor Scoring Stub — Phase 5
// DECIDED (spec Phase 5 Decisions): 3 criteria — on-time delivery, quality, price competitiveness.
// Weights: TENANT_ADMIN configures via vendor_score_weights table (default: equal 1/3 each).
// Interface: { score(vendorId, criteria): VendorScore }
// Grade thresholds: A≥90, B≥75, C≥60, D≥45, F<45 (platform defaults; TENANT_ADMIN can override)
// Trigger: implement when analytics dashboard requires vendor performance reports (Phase 14).

export interface ScoreCriteria {
  name: 'on_time_delivery' | 'quality' | 'price';
  weight: number; // 0–1; weights must sum to 1
  value: number; // 0–100 score for this criterion
}

export type VendorGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface VendorScore {
  vendorId: string;
  totalScore: number;
  breakdown: ScoreCriteria[];
  grade: VendorGrade;
}

export interface VendorScoringAdapter {
  score(vendorId: string, criteria: ScoreCriteria[]): VendorScore;
}

// STUB — not implemented until trigger condition met
export class VendorScoringStub implements VendorScoringAdapter {
  score(vendorId: string, _criteria: ScoreCriteria[]): VendorScore {
    throw new Error(
      `VendorScoring not yet implemented for vendor ${vendorId}. ` +
        'Trigger: analytics dashboard requires vendor performance reports (Phase 14). ' +
        'Implement with weighted criteria scoring (spec Phase 5 Decisions).',
    );
  }
}
