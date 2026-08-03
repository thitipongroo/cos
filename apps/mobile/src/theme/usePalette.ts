// usePalette() — the hook every themed screen reads.
//
// Kept in its own module (not palette.ts) so the pure colour mapping stays importable from tests and
// StyleSheet factories without pulling in zustand.

import { useThemeStore } from '../store/themeStore';
import { paletteFor, type Palette } from './palette';

/** The active palette for the user's chosen mode (default dark, PO 2026-08-04). */
export function usePalette(): Palette {
  const mode = useThemeStore((s) => s.mode);
  return paletteFor(mode);
}

/** True when the app is in dark mode — for the handful of places that need the mode, not a colour. */
export function useIsDark(): boolean {
  return useThemeStore((s) => s.mode) === 'dark';
}

export type { Palette };
