import {
  clampProgress,
  isDeterminate,
  formatPercent,
  progressWidth,
  aiMotifEnabled,
  tableColumnWidth,
  accessibilityLabel,
  TABLE_SKELETON_ROWS,
  TABLE_SKELETON_COLUMNS,
} from '../loadingState';

describe('clampProgress', () => {
  it('returns null when the caller omits progress (the indeterminate case)', () => {
    expect(clampProgress(undefined)).toBeNull();
    expect(clampProgress()).toBeNull();
  });

  it('returns null for NaN rather than rendering "NaN%"', () => {
    expect(clampProgress(NaN)).toBeNull();
  });

  it('clamps below 0 and above 100', () => {
    expect(clampProgress(-1)).toBe(0);
    expect(clampProgress(-100)).toBe(0);
    expect(clampProgress(101)).toBe(100);
    expect(clampProgress(1000)).toBe(100);
  });

  it('passes through in-range values, boundaries included', () => {
    expect(clampProgress(0)).toBe(0);
    expect(clampProgress(42)).toBe(42);
    expect(clampProgress(65.4)).toBe(65.4);
    expect(clampProgress(100)).toBe(100);
  });
});

describe('isDeterminate', () => {
  it('is false without a usable percentage', () => {
    expect(isDeterminate(undefined)).toBe(false);
    expect(isDeterminate(NaN)).toBe(false);
  });

  it('is true with a percentage, including 0', () => {
    expect(isDeterminate(0)).toBe(true);
    expect(isDeterminate(82)).toBe(true);
  });
});

describe('formatPercent', () => {
  it('returns null when indeterminate', () => {
    expect(formatPercent(undefined)).toBeNull();
    expect(formatPercent(NaN)).toBeNull();
  });

  it('rounds to a whole percent', () => {
    expect(formatPercent(65)).toBe('65%');
    expect(formatPercent(65.4)).toBe('65%');
    expect(formatPercent(65.5)).toBe('66%');
    expect(formatPercent(0)).toBe('0%');
  });

  it('formats clamped values', () => {
    expect(formatPercent(-5)).toBe('0%');
    expect(formatPercent(150)).toBe('100%');
  });
});

describe('progressWidth', () => {
  it('returns null when indeterminate', () => {
    expect(progressWidth(undefined)).toBeNull();
    expect(progressWidth(NaN)).toBeNull();
  });

  it('renders the clamped value as a CSS percentage width', () => {
    expect(progressWidth(42)).toBe('42%');
    expect(progressWidth(0)).toBe('0%');
    expect(progressWidth(-5)).toBe('0%');
    expect(progressWidth(150)).toBe('100%');
  });
});

describe('aiMotifEnabled', () => {
  it('enables the motif for the ai variant (§32.7 Exception 2)', () => {
    expect(aiMotifEnabled('ai')).toBe(true);
  });

  it('disables the motif for every other variant', () => {
    expect(aiMotifEnabled('widget')).toBe(false);
    expect(aiMotifEnabled('table')).toBe(false);
    expect(aiMotifEnabled('micro')).toBe(false);
  });
});

describe('tableColumnWidth', () => {
  it('gives each of the four mockup columns a distinct ragged width', () => {
    expect(tableColumnWidth(0)).toBe('w-24');
    expect(tableColumnWidth(1)).toBe('w-20');
    expect(tableColumnWidth(2)).toBe('w-16');
    expect(tableColumnWidth(3)).toBe('w-32');
  });

  it('wraps, so a caller with more columns than the mockup still gets ragged widths', () => {
    expect(tableColumnWidth(4)).toBe(tableColumnWidth(0));
    expect(tableColumnWidth(5)).toBe(tableColumnWidth(1));
  });

  it('renders three rows of four columns by default', () => {
    expect(TABLE_SKELETON_ROWS).toBe(3);
    expect(TABLE_SKELETON_COLUMNS).toBe(4);
  });
});

describe('accessibilityLabel', () => {
  it('returns null when there is nothing to announce', () => {
    expect(accessibilityLabel(undefined, undefined)).toBeNull();
    expect(accessibilityLabel()).toBeNull();
  });

  it('announces the percentage alone when the caller gave no label', () => {
    expect(accessibilityLabel(undefined, 42)).toBe('42%');
  });

  it('treats an empty label as no label', () => {
    expect(accessibilityLabel('', 42)).toBe('42%');
    expect(accessibilityLabel('', undefined)).toBeNull();
  });

  it('announces the label alone when indeterminate', () => {
    expect(accessibilityLabel('Refining results...')).toBe('Refining results...');
    expect(accessibilityLabel('Refining results...', NaN)).toBe('Refining results...');
  });

  it('appends the percentage to the label when determinate', () => {
    expect(accessibilityLabel('Refining results...', 82)).toBe('Refining results... 82%');
  });
});
