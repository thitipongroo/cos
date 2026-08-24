import {
  clampProgress,
  isDeterminate,
  formatPercent,
  progressWidth,
  accessibilityLabel,
} from '../loading-state';

describe('clampProgress', () => {
  it('returns null when progress is undefined (indeterminate)', () => {
    expect(clampProgress()).toBeNull();
    expect(clampProgress(undefined)).toBeNull();
  });

  it('returns null for NaN', () => {
    expect(clampProgress(Number.NaN)).toBeNull();
  });

  it('clamps below 0 to 0', () => {
    expect(clampProgress(-5)).toBe(0);
  });

  it('clamps above 100 to 100', () => {
    expect(clampProgress(150)).toBe(100);
  });

  it('passes an in-range value through, including the 0 and 100 boundaries', () => {
    expect(clampProgress(0)).toBe(0);
    expect(clampProgress(42)).toBe(42);
    expect(clampProgress(100)).toBe(100);
  });
});

describe('isDeterminate', () => {
  it('is true for a usable percentage', () => {
    expect(isDeterminate(0)).toBe(true);
    expect(isDeterminate(50)).toBe(true);
  });

  it('is false when there is no percentage', () => {
    expect(isDeterminate()).toBe(false);
    expect(isDeterminate(Number.NaN)).toBe(false);
  });
});

describe('formatPercent', () => {
  it('returns null when indeterminate', () => {
    expect(formatPercent()).toBeNull();
  });

  it('rounds to a whole-percent readout', () => {
    expect(formatPercent(42.4)).toBe('42%');
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(150)).toBe('100%');
  });
});

describe('progressWidth', () => {
  it('returns null when indeterminate', () => {
    expect(progressWidth()).toBeNull();
  });

  it('returns the clamped value as a percentage string', () => {
    expect(progressWidth(42)).toBe('42%');
    expect(progressWidth(-5)).toBe('0%');
  });
});

describe('accessibilityLabel', () => {
  it('returns the percentage alone when there is no label', () => {
    expect(accessibilityLabel(undefined, 50)).toBe('50%');
    expect(accessibilityLabel('', 50)).toBe('50%');
  });

  it('returns null when there is neither a label nor a percentage', () => {
    expect(accessibilityLabel(undefined, undefined)).toBeNull();
  });

  it('returns the label alone when the percentage is indeterminate', () => {
    expect(accessibilityLabel('Loading', undefined)).toBe('Loading');
  });

  it('joins label and percentage when both are present', () => {
    expect(accessibilityLabel('Loading', 50)).toBe('Loading 50%');
  });
});
