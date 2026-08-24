import { scoreBand, buildHeatGrid } from '../riskHeatMap';

describe('scoreBand — standard 5×5 matrix banding', () => {
  it('bands each score range', () => {
    expect(scoreBand(1)).toBe('low');
    expect(scoreBand(3)).toBe('low');
    expect(scoreBand(4)).toBe('medium');
    expect(scoreBand(7)).toBe('medium');
    expect(scoreBand(8)).toBe('high');
    expect(scoreBand(14)).toBe('high');
    expect(scoreBand(15)).toBe('critical');
    expect(scoreBand(25)).toBe('critical');
  });
});

describe('buildHeatGrid', () => {
  it('is a 5×5 grid with impact 5→1 rows and likelihood 1→5 columns', () => {
    const grid = buildHeatGrid([]);
    expect(grid).toHaveLength(5);
    expect(grid[0]).toHaveLength(5);
    // Top-left = high impact (5), low likelihood (1); bottom-right = impact 1, likelihood 5.
    expect(grid[0][0]).toMatchObject({ impact: 5, likelihood: 1, score: 5 });
    expect(grid[4][4]).toMatchObject({ impact: 1, likelihood: 5, score: 5 });
    // The true top-right corner is the max score (5×5=25, critical).
    expect(grid[0][4]).toMatchObject({ impact: 5, likelihood: 5, score: 25, band: 'critical' });
  });

  it('counts risks onto their (likelihood, impact) cell', () => {
    const grid = buildHeatGrid([
      { likelihood: 5, impact: 5 },
      { likelihood: 5, impact: 5 },
      { likelihood: 1, impact: 1 },
    ]);
    expect(grid[0][4].count).toBe(2); // impact 5, likelihood 5
    expect(grid[4][0].count).toBe(1); // impact 1, likelihood 1
    expect(grid[2][2].count).toBe(0); // an empty cell
  });
});
