// Pure logic for the project risk register heat map (ADR-065 / §20:426). Kept out of the React
// component so it carries a 100% QM-1 unit gate (jest.config collectCoverageFrom); the component only
// renders what this returns.
//
// A 5×5 register: risk_score = likelihood × impact (1–25). The standard banding of that matrix:
//   critical 15–25 · high 8–14 · medium 4–7 · low 1–3.

export type RiskBand = 'low' | 'medium' | 'high' | 'critical';

export function scoreBand(score: number): RiskBand {
  if (score >= 15) return 'critical';
  if (score >= 8) return 'high';
  if (score >= 4) return 'medium';
  return 'low';
}

export interface HeatCell {
  likelihood: number; // 1–5 (column)
  impact: number; // 1–5 (row)
  score: number; // likelihood × impact
  band: RiskBand;
  count: number; // risks sitting on this cell
}

/**
 * Build the 5×5 grid: rows run impact 5→1 (high impact on top, matrix convention), columns run
 * likelihood 1→5 (left to right). Each cell carries its score, band, and how many risks land on it.
 */
export function buildHeatGrid(
  risks: ReadonlyArray<{ likelihood: number; impact: number }>,
): HeatCell[][] {
  const grid: HeatCell[][] = [];
  for (let impact = 5; impact >= 1; impact--) {
    const row: HeatCell[] = [];
    for (let likelihood = 1; likelihood <= 5; likelihood++) {
      const score = likelihood * impact;
      const count = risks.filter((r) => r.likelihood === likelihood && r.impact === impact).length;
      row.push({ likelihood, impact, score, band: scoreBand(score), count });
    }
    grid.push(row);
  }
  return grid;
}
