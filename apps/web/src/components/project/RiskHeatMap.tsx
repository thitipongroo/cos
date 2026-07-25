'use client';

import { buildHeatGrid, type RiskBand } from '../../lib/riskHeatMap';

// Band → cell colour. Cool (low) to hot (critical); the numbers are risk counts on each cell.
const BAND_CLASS: Record<RiskBand, string> = {
  low: 'bg-green-100 text-green-900',
  medium: 'bg-yellow-100 text-yellow-900',
  high: 'bg-orange-200 text-orange-900',
  critical: 'bg-red-300 text-red-950',
};

/** 5×5 likelihood × impact heat map for the risk register (ADR-065 / §20:426). Pure grid logic lives
 *  in lib/riskHeatMap (100% unit-gated); this only paints it. */
export function RiskHeatMap({
  risks,
  labels,
}: {
  risks: ReadonlyArray<{ likelihood: number; impact: number }>;
  labels: { impact: string; likelihood: string };
}) {
  const grid = buildHeatGrid(risks);
  return (
    <div className="flex items-stretch gap-2" data-testid="risk-heatmap">
      <span className="flex items-center text-xs font-semibold uppercase text-gray-500 [writing-mode:vertical-rl] rotate-180">
        {labels.impact}
      </span>
      <div>
        <div className="grid grid-cols-5 gap-1">
          {grid.flat().map((cell) => (
            <div
              key={`${cell.impact}-${cell.likelihood}`}
              title={`L${cell.likelihood} × I${cell.impact} = ${cell.score}`}
              className={`flex h-12 w-12 items-center justify-center rounded text-sm font-semibold ${BAND_CLASS[cell.band]}`}
            >
              {cell.count > 0 ? cell.count : ''}
            </div>
          ))}
        </div>
        <div className="mt-1 text-center text-xs font-semibold uppercase text-gray-500">
          {labels.likelihood} →
        </div>
      </div>
    </div>
  );
}
