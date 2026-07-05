// Locale store — QM-3. Holds the chosen UI locale (default 'th', fallback 'en') and
// persists it in expo-secure-store, following the authStore persistence pattern.

import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { Locale } from '../i18n/translate';
import { DEFAULT_LOCALE } from '../i18n/translate';

const LOCALE_KEY = 'cos_locale';

interface LocaleState {
  locale: Locale;

  /** Load the persisted locale on app launch; keeps the default when none is stored. */
  hydrate: () => Promise<void>;

  /** Switch locale and persist the choice. */
  setLocale: (locale: Locale) => Promise<void>;
}

export const useLocaleStore = create<LocaleState>((set) => ({
  locale: DEFAULT_LOCALE,

  hydrate: async () => {
    const stored = await SecureStore.getItemAsync(LOCALE_KEY);
    if (stored === 'th' || stored === 'en') {
      set({ locale: stored });
    }
  },

  setLocale: async (locale) => {
    set({ locale });
    await SecureStore.setItemAsync(LOCALE_KEY, locale);
  },
}));
