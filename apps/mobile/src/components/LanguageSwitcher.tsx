// th/en language switcher (§20.5 / §20.6.2) — the mobile sibling of the web
// components/shell/LanguageSwitcher.tsx: shows the current locale's national flag + code and toggles
// to the other locale on press. QM-3 keeps the default locale th-TH; this only lets the user switch.
//
// The pre-auth login screen needs this because localeStore is only reachable from profile.tsx once
// signed in — without it a user (or a screenshot run) cannot leave Thai before authenticating.
//
// Flags live here rather than in lib/countries.ts FLAG_SVG: that map is keyed by *dialling* country
// for the phone picker, and a Union Jack is a language mark here, not a callable country.

import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { useI18n } from '../i18n';
import type { Locale } from '../i18n/translate';
import { darkColors, radius } from '../theme/tokens';

const TH_FLAG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 600"><path fill="#A51931" d="M0 0h900v600H0z"/><path fill="#F4F5F8" d="M0 100h900v400H0z"/><path fill="#2D2A4A" d="M0 200h900v200H0z"/></svg>`;

const GB_FLAG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><path fill="#012169" d="M0 0h640v480H0z"/><path fill="#FFF" d="m75 0 244 181L562 0h78v62L400 241l240 178v61h-80L320 301 81 480H0v-60l239-178L0 64V0h75z"/><path fill="#C8102E" d="m424 281 216 159v40L369 281h55zm-184 20 6 35L54 480H0l240-179zM640 0v3L391 191l2-44L590 0h50zM0 0l239 176h-60L0 42V0z"/><path fill="#FFF" d="M241 0v480h160V0zM0 160v160h640V160z"/><path fill="#C8102E" d="M0 193v96h640v-96zM273 0v480h96V0z"/></svg>`;

/** Flag shown for each locale: Thai flag for th, Union Jack for en (mirrors the web LOCALE_FLAG). */
const LOCALE_FLAG: Record<Locale, string> = { th: TH_FLAG, en: GB_FLAG };

export function LanguageSwitcher(): React.ReactElement {
  const { locale, setLocale, t } = useI18n();
  const next: Locale = locale === 'th' ? 'en' : 'th';
  return (
    <TouchableOpacity
      // Named for the locale it switches TO, matching profile.tsx's locale-<locale> chips.
      testID={`locale-${next}`}
      accessibilityRole="button"
      accessibilityLabel={t('profile.main.language')}
      style={styles.button}
      onPress={() => void setLocale(next)}
    >
      <SvgXml xml={LOCALE_FLAG[locale]} width={18} height={12} />
      <Text style={styles.code}>{locale.toUpperCase()}</Text>
    </TouchableOpacity>
  );
}

// Sits in the login header, which renders on the dark auth surface (§32.7 "Mobile Auth Screens").
const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: darkColors.border,
    borderRadius: radius.md,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  code: {
    fontSize: 12,
    fontWeight: '600',
    color: darkColors.muted,
  },
});
