import {
  resolvePalette,
  clampProgress,
  isDeterminate,
  formatPercent,
  progressWidth,
  aiMotifEnabled,
  listRowWidths,
  accessibilityLabel,
  LIST_SKELETON_ROWS,
} from '../loadingState';
import { colors, darkColors } from '../../theme/tokens';

describe('resolvePalette', () => {
  it('maps the dark theme onto the --cos-dark-* tokens, with the AI cyan accent', () => {
    const palette = resolvePalette('dark');

    expect(palette.surface).toBe(darkColors.surface);
    expect(palette.text).toBe(darkColors.text);
    expect(palette.muted).toBe(darkColors.muted);
    expect(palette.primary).toBe(darkColors.primary);
    expect(palette.accent).toBe(darkColors.cyan);
    expect(palette.syncing).toBe(darkColors.syncing);
  });

  it('maps the light theme onto the --mobile-* tokens, with no accent', () => {
    const palette = resolvePalette('light');

    expect(palette.surface).toBe(colors.surface);
    expect(palette.text).toBe(colors.textPrimary);
    expect(palette.muted).toBe(colors.textSecondary);
    expect(palette.primary).toBe(colors.primary);
    expect(palette.syncing).toBe(colors.syncing);
    // §32.7 defines no cyan in the light mobile set — the AI motif is dark-only.
    expect(palette.accent).toBeNull();
  });

  it('tints skeleton bars off the palette rather than introducing a new token', () => {
    expect(resolvePalette('light').skeleton).toBe('rgba(108, 108, 112, 0.18)');
    expect(resolvePalette('dark').skeleton).toBe('rgba(148, 163, 184, 0.18)');
  });
});

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

  it('renders the clamped value as a percentage width', () => {
    expect(progressWidth(42)).toBe('42%');
    expect(progressWidth(0)).toBe('0%');
    expect(progressWidth(-5)).toBe('0%');
    expect(progressWidth(150)).toBe('100%');
  });
});

describe('aiMotifEnabled', () => {
  it('enables the motif for the ai variant on dark (§32.7 Exception 2)', () => {
    expect(aiMotifEnabled('ai', 'dark')).toBe(true);
  });

  it('disables the motif for the ai variant on light — no cyan token exists there', () => {
    expect(aiMotifEnabled('ai', 'light')).toBe(false);
  });

  it('disables the motif for every non-ai variant, dark included', () => {
    expect(aiMotifEnabled('widget', 'dark')).toBe(false);
    expect(aiMotifEnabled('list', 'dark')).toBe(false);
    expect(aiMotifEnabled('micro', 'dark')).toBe(false);
    expect(aiMotifEnabled('widget', 'light')).toBe(false);
  });
});

describe('listRowWidths', () => {
  it('gives each of the three mockup rows a distinct ragged width', () => {
    expect(listRowWidths(0)).toEqual({ title: '60%', subtitle: '40%' });
    expect(listRowWidths(1)).toEqual({ title: '75%', subtitle: '25%' });
    expect(listRowWidths(2)).toEqual({ title: '50%', subtitle: '60%' });
  });

  it('wraps, so a caller rendering more rows than the mockup still gets ragged widths', () => {
    expect(listRowWidths(3)).toEqual(listRowWidths(0));
    expect(listRowWidths(4)).toEqual(listRowWidths(1));
  });

  it('stacks three rows by default', () => {
    expect(LIST_SKELETON_ROWS).toBe(3);
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
