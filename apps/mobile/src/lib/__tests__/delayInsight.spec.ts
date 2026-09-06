import { delayFactorList, delayFactors, delayLevel } from '../delayInsight';

describe('delayLevel', () => {
  it('returns the level word the report carried', () => {
    expect(delayLevel({ delay_risk_level: 'HIGH' })).toBe('HIGH');
  });

  it('trims it — a padded enum is still that enum', () => {
    expect(delayLevel({ delay_risk_level: '  CRITICAL  ' })).toBe('CRITICAL');
  });

  it('returns null when the field is missing', () => {
    expect(delayLevel({})).toBeNull();
  });

  it('returns null when the field is not a string', () => {
    // A schema change that turned the level into an object must not print "[object Object]".
    expect(delayLevel({ delay_risk_level: { value: 'HIGH' } })).toBeNull();
  });

  it('treats a blank level as absent rather than as a chip with nothing in it', () => {
    expect(delayLevel({ delay_risk_level: '   ' })).toBeNull();
  });
});

describe('delayFactors', () => {
  it('bullets every factor, in the order the report gave them', () => {
    expect(delayFactors({ risk_factors: ['Rebar delivery slipped', 'Rain forecast Thu'] })).toBe(
      '• Rebar delivery slipped\n• Rain forecast Thu',
    );
  });

  it('shows ALL of them, not just the first', () => {
    // The panel has no prose above it, so the factors are the finding — see the module note.
    const out = delayFactors({ risk_factors: ['a', 'b', 'c'] });
    expect(out?.split('\n')).toHaveLength(3);
  });

  it('trims each factor', () => {
    expect(delayFactors({ risk_factors: ['  spaced  '] })).toBe('• spaced');
  });

  it('drops non-strings and blanks rather than bulleting an empty line', () => {
    expect(delayFactors({ risk_factors: ['real', '', '   ', 42, null] })).toBe('• real');
  });

  it('returns null when the field is missing', () => {
    expect(delayFactors({})).toBeNull();
  });

  it('returns null when the field is not an array', () => {
    expect(delayFactors({ risk_factors: 'Rebar delivery slipped' })).toBeNull();
  });

  it('returns null when the array holds nothing usable, so the panel says it carried no summary', () => {
    expect(delayFactors({ risk_factors: [] })).toBeNull();
    expect(delayFactors({ risk_factors: [1, 2] })).toBeNull();
  });

  it('never falls back to the constant disclaimer', () => {
    // `disclaimer` is boilerplate the model did not choose; printing it as the body would present it
    // as a finding.
    expect(
      delayFactors({ disclaimer: 'AI-generated estimate — verify with project schedule' }),
    ).toBeNull();
  });
});

describe('delayFactorList', () => {
  // The executive Tasks screen draws one CARD per factor, so it needs the items rather than the
  // paragraph `delayFactors` joins for the shared panel. Same filtering, different shape.
  it('returns the factors in order, trimmed', () => {
    expect(delayFactorList({ risk_factors: ['  Rain  ', 'Rebar late'] })).toEqual([
      'Rain',
      'Rebar late',
    ]);
  });

  it('drops blanks and non-strings rather than rendering empty cards', () => {
    expect(delayFactorList({ risk_factors: ['Real', '   ', 7, null, undefined, {}] })).toEqual([
      'Real',
    ]);
  });

  it('returns an empty list when the report carried no factors', () => {
    expect(delayFactorList({ risk_factors: [] })).toEqual([]);
    expect(delayFactorList({})).toEqual([]);
    expect(delayFactorList({ risk_factors: 'HIGH' })).toEqual([]);
  });

  it('agrees with delayFactors about which items survive', () => {
    // Two readers over one field: if they ever disagreed, the panel and the feed would show the
    // same report differently.
    const content = { risk_factors: ['One', '  ', 'Two'] };
    const joined = delayFactorList(content)
      .map((f) => `• ${f}`)
      .join('\n');
    expect(joined).toBe(delayFactors(content));
  });
});
