// Theme store — the app's colour mode. Default **dark** (product-owner decision 2026-08-04),
// switchable to light, persisted in expo-secure-store like localeStore/authStore.
//
// Why this exists at all: until now the palette was decided per screen. §32.7 gave the field app a
// LIGHT palette for outdoor sunlight visibility and listed the dark screens exhaustively (login, OTP,
// the verify overlay, Site Engineer Home, Tenant Admin Home, notification preferences, the drawer,
// and the Privacy Policy). The PO has now made dark the product default for every role, with light
// kept as a user-selectable option so the sunlight case the light palette was designed for is still
// reachable — it becomes a preference rather than a per-screen decision.
//
// Rollout is staged (PO 2026-08-04): the shell and the privacy/transparency screens read this store
// now; the remaining task screens are migrated after. While that is in progress a screen that has
// not been migrated still renders its own palette, so the shell can be dark over lighter content —
// that is expected mid-migration, not a bug to "fix" by reverting the shell.

import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

const THEME_KEY = 'cos_theme';

export type ThemeMode = 'dark' | 'light';

/** Product default (PO 2026-08-04). A fresh install starts dark. */
export const DEFAULT_THEME: ThemeMode = 'dark';

interface ThemeState {
  mode: ThemeMode;

  /** Load the persisted mode on app launch; keeps DEFAULT_THEME when none is stored. */
  hydrate: () => Promise<void>;

  /** Switch mode and persist the choice. */
  setMode: (mode: ThemeMode) => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: DEFAULT_THEME,

  hydrate: async () => {
    const stored = await SecureStore.getItemAsync(THEME_KEY);
    if (stored === 'dark' || stored === 'light') {
      set({ mode: stored });
    }
  },

  setMode: async (mode) => {
    set({ mode });
    await SecureStore.setItemAsync(THEME_KEY, mode);
  },
}));
