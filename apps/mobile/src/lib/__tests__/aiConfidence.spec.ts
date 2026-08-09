import {
  confidenceBand,
  confidencePercent,
  HIGH_CONFIDENCE_MIN,
  MEDIUM_CONFIDENCE_MIN,
} from '../aiConfidence';

describe('confidenceBand', () => {
  it('uses the platform band edges from spec §33.8', () => {
    expect(HIGH_CONFIDENCE_MIN).toBe(0.9);
    expect(MEDIUM_CONFIDENCE_MIN).toBe(0.7);
  });

  it('bands a healthy report by its number', () => {
    expect(confidenceBand(0.98, false)).toBe('HIGH');
    expect(confidenceBand(0.9, false)).toBe('HIGH');
    expect(confidenceBand(0.89, false)).toBe('MEDIUM');
    expect(confidenceBand(0.7, false)).toBe('MEDIUM');
    expect(confidenceBand(0.69, false)).toBe('LOW');
  });

  it("lets the server's low_confidence verdict override a high number", () => {
    // The gateway sets this when the model returned unusable output; the number that came with it
    // means nothing, and the client does not second-guess the server on its own output.
    expect(confidenceBand(0.99, true)).toBe('LOW');
  });

  it('reports UNKNOWN rather than guessing when there is no number', () => {
    expect(confidenceBand(null, false)).toBe('UNKNOWN');
    expect(confidenceBand(undefined, false)).toBe('UNKNOWN');
    expect(confidenceBand(Number.NaN, false)).toBe('UNKNOWN');
  });
});

describe('confidencePercent', () => {
  it('rounds to whole percent — finer granularity separates nothing actionable', () => {
    expect(confidencePercent(0.858)).toBe(86);
    expect(confidencePercent(0.87)).toBe(87);
    expect(confidencePercent(1)).toBe(100);
  });

  it('has nothing to print when the report carried no number', () => {
    expect(confidencePercent(null)).toBeNull();
    expect(confidencePercent(undefined)).toBeNull();
    expect(confidencePercent(Number.NaN)).toBeNull();
  });
});
