jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  getItemAsync: jest.fn().mockResolvedValue(null),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

import * as SecureStore from 'expo-secure-store';
import { useThemeStore, DEFAULT_THEME } from '../themeStore';
import { paletteFor } from '../../theme/palette';

describe('themeStore (§32.7 colour mode)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useThemeStore.setState({ mode: DEFAULT_THEME });
  });

  // The product default, not an arbitrary starting value — PO decision 2026-08-04. A regression here
  // would silently ship every role the light field palette on first launch.
  it('defaults to dark', () => {
    expect(DEFAULT_THEME).toBe('dark');
    expect(useThemeStore.getState().mode).toBe('dark');
  });

  it('setMode updates state and persists the choice', async () => {
    await useThemeStore.getState().setMode('light');
    expect(useThemeStore.getState().mode).toBe('light');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('cos_theme', 'light');
  });

  it('setMode back to dark persists too', async () => {
    await useThemeStore.getState().setMode('light');
    await useThemeStore.getState().setMode('dark');
    expect(useThemeStore.getState().mode).toBe('dark');
    expect(SecureStore.setItemAsync).toHaveBeenLastCalledWith('cos_theme', 'dark');
  });

  it('hydrate restores a persisted light choice', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('light');
    await useThemeStore.getState().hydrate();
    expect(useThemeStore.getState().mode).toBe('light');
  });

  it('hydrate restores a persisted dark choice', async () => {
    useThemeStore.setState({ mode: 'light' });
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('dark');
    await useThemeStore.getState().hydrate();
    expect(useThemeStore.getState().mode).toBe('dark');
  });

  it('hydrate keeps the default when nothing is stored', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    await useThemeStore.getState().hydrate();
    expect(useThemeStore.getState().mode).toBe(DEFAULT_THEME);
  });

  it('hydrate ignores an unrecognised stored value', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('sepia');
    await useThemeStore.getState().hydrate();
    expect(useThemeStore.getState().mode).toBe(DEFAULT_THEME);
  });
});

describe('paletteFor', () => {
  // Both modes must fill every Palette key. A missing key renders as `undefined`, which React Native
  // silently treats as "no colour" — black text on a black surface rather than a visible failure.
  it('returns a fully-populated palette in both modes', () => {
    for (const mode of ['dark', 'light'] as const) {
      const p = paletteFor(mode);
      for (const [key, value] of Object.entries(p)) {
        // Hex or rgba() — §32.7 uses both (darkColors.border is a translucent hairline).
        expect(`${mode}.${key}=${String(value)}`).toMatch(
          /=(#[0-9A-Fa-f]{3,8}|rgba?\([\d.,\s]+\))$/,
        );
      }
    }
  });

  it('gives the two modes different backgrounds and text colours', () => {
    const dark = paletteFor('dark');
    const light = paletteFor('light');
    expect(dark.bg).not.toBe(light.bg);
    expect(dark.text).not.toBe(light.text);
  });

  // §32.7 keeps tap targets constant across modes so the brand action reads the same in sunlight.
  it('keeps the primary action colour constant across modes', () => {
    expect(paletteFor('dark').primary).toBe(paletteFor('light').primary);
  });
});
