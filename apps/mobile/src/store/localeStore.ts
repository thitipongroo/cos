// Locale store — QM-3. Holds the chosen UI locale and persists it in expo-secure-store, following
// the authStore persistence pattern.
//
// The default is DEFAULT_LOCALE, which is 'en' (PO decision 2026-07-26, recorded in i18n/translate.ts
// and explicitly overriding QM-3's th-TH). This header said 'th' until 2026-08-20 — it was written
// before that decision and never updated, which made it a second, wrong statement of a default that
// only one file owns.

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
