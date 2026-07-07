import { VendorScoring, gradeFor } from '../vendor-scoring';
import type { ScoreCriteria } from '../vendor-scoring';

describe('VendorScoring (G-W5)', () => {
  const svc = new VendorScoring();

  it('combines criteria by weighted sum and grades the result', () => {
    const criteria: ScoreCriteria[] = [
      { name: 'on_time_delivery', weight: 1 / 3, value: 90 },
      { name: 'quality', weight: 1 / 3, value: 90 },
      { name: 'price', weight: 1 / 3, value: 90 },
    ];
    const result = svc.score('vendor-1', criteria);
    expect(result.vendorId).toBe('vendor-1');
    expect(Math.round(result.totalScore)).toBe(90);
    expect(result.grade).toBe('A');
    expect(result.breakdown).toHaveLength(3);
  });

  it('applies weights (not a plain average)', () => {
    const result = svc.score('vendor-2', [
      { name: 'on_time_delivery', weight: 0.5, value: 100 },
      { name: 'quality', weight: 0.25, value: 0 },
      { name: 'price', weight: 0.25, value: 0 },
    ]);
    expect(result.totalScore).toBe(50); // 0.5*100
    expect(result.grade).toBe('D');
  });

  it('gradeFor covers every threshold band', () => {
    expect(gradeFor(90)).toBe('A');
    expect(gradeFor(89.9)).toBe('B');
    expect(gradeFor(75)).toBe('B');
    expect(gradeFor(74)).toBe('C');
    expect(gradeFor(60)).toBe('C');
    expect(gradeFor(59)).toBe('D');
    expect(gradeFor(45)).toBe('D');
    expect(gradeFor(44)).toBe('F');
    expect(gradeFor(0)).toBe('F');
  });
});
