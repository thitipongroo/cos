import { mapDelayForecast } from '../ai-risk-mapping';

describe('mapDelayForecast — DELAY_FORECAST → ProjectRisk fields (ADR-065)', () => {
  it('maps each known level to a symmetric likelihood × impact on the 5×5 register', () => {
    expect(mapDelayForecast({ delay_risk_level: 'LOW', risk_factors: [] }, null)).toMatchObject({
      likelihood: 2,
      impact: 2,
      category: 'SCHEDULE',
    });
    expect(mapDelayForecast({ delay_risk_level: 'MEDIUM', risk_factors: [] }, null)).toMatchObject({
      likelihood: 3,
      impact: 3,
    });
    expect(mapDelayForecast({ delay_risk_level: 'HIGH', risk_factors: [] }, null)).toMatchObject({
      likelihood: 4,
      impact: 4,
    });
    expect(
      mapDelayForecast({ delay_risk_level: 'CRITICAL', risk_factors: [] }, null),
    ).toMatchObject({ likelihood: 5, impact: 5 });
  });

  it('titles by level and folds factors + confidence into the description', () => {
    const out = mapDelayForecast(
      { delay_risk_level: 'HIGH', risk_factors: ['procurement slip', 'rain'] },
      '0.8700',
    );
    expect(out?.title).toBe('AI delay-risk: HIGH');
    expect(out?.description).toContain('procurement slip; rain');
    expect(out?.description).toContain('model confidence 0.8700');
  });

  it('handles no factors and no confidence', () => {
    const out = mapDelayForecast({ delay_risk_level: 'LOW', risk_factors: [] }, null);
    expect(out?.description).toContain('no factors reported');
    expect(out?.description).not.toContain('confidence');
  });

  it('tolerates a missing risk_factors array', () => {
    const out = mapDelayForecast({ delay_risk_level: 'LOW' } as never, null);
    expect(out?.description).toContain('no factors reported');
  });

  it('returns null for an unknown level (no unscored noise in the register)', () => {
    expect(mapDelayForecast({ delay_risk_level: 'WEIRD', risk_factors: [] }, null)).toBeNull();
  });
});
