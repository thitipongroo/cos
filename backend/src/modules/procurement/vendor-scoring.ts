// Vendor Scoring adapter (G-W5) — the DECIDED algorithm from spec Phase 5 Decisions:
//   3 criteria (on_time_delivery, quality, price), each 0–100, combined by a weighted sum
//   (weights sum to 1; TENANT_ADMIN configures via vendor_score_weights, default 1/3 each).
//   Grade thresholds (platform defaults): A ≥ 90, B ≥ 75, C ≥ 60, D ≥ 45, F < 45.
//
// SCOPE NOTE (G-W5): this adapter computes the score FROM the criterion values it is given. How each
// criterion VALUE is derived from data (esp. `quality` and `price`) is NOT defined in the spec and is
// escalated to the product owner — this adapter therefore takes the values as input and does not
// invent a data-aggregation formula (context.md: UNSPECIFIED → do not guess).

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

export function gradeFor(totalScore: number): VendorGrade {
  if (totalScore >= 90) return 'A';
  if (totalScore >= 75) return 'B';
  if (totalScore >= 60) return 'C';
  if (totalScore >= 45) return 'D';
  return 'F';
}

export class VendorScoring implements VendorScoringAdapter {
  score(vendorId: string, criteria: ScoreCriteria[]): VendorScore {
    const totalScore = criteria.reduce((sum, c) => sum + c.weight * c.value, 0);
    return { vendorId, totalScore, breakdown: criteria, grade: gradeFor(totalScore) };
  }
}
