// <TrialBanner /> — the free-trial strip under the top bar (§7.10, ADR-109).
//
// A countdown while the trial runs, and once it has ended, why a save is refused (403 COS-PLAN-003) while reading
// and exporting still work. Renders nothing for a paying tenant, offline before the first read, or when the read
// fails — a banner that guesses is worse than none. Read once per mount and whenever the app comes back online:
// the daily job changes the status, and a phone left open overnight should notice.
//
// No in-app checkout exists (plans are sold by the team, ADR-109), so the strip carries the two ways to choose one:
// the published price list and a mail to sales naming the tenant (`TRIAL_CONTACT`, shared with the web app).

import { useEffect } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { TRIAL_CONTACT, trialBanner, trialContactMailto } from '@cos/ui-logic';
import { getMyTenant } from '../api/tenant';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useI18n } from '../i18n';
import { trialBannerCopy } from '../lib/trialBanner';
import { useTenantStore } from '../store/tenantStore';
import { usePalette } from '../theme/usePalette';
import { fontFamily, spacing } from '../theme/tokens';

export function TrialBanner() {
  const { t, formatDate } = useI18n();
  const p = usePalette();
  const { isOnline } = useNetworkStatus();
  // In the shared store, not local state: <Fab /> and the sync runner read the same answer (useTenantReadOnly).
  const tenant = useTenantStore((st) => st.tenant);
  const setTenant = useTenantStore((st) => st.setTenant);

  useEffect(() => {
    if (!isOnline) return;
    let cancelled = false;
    getMyTenant().then(
      (data) => {
        if (!cancelled) setTenant(data);
      },
      () => undefined, // keep what was last read; the shell must not fail on this
    );
    return () => {
      cancelled = true;
    };
  }, [isOnline, setTenant]);

  const copy = trialBannerCopy(trialBanner(tenant, new Date()), (iso) => formatDate(iso));
  if (!copy) return null;
  const color = p[copy.tone];

  return (
    <View
      testID="trial-banner"
      accessibilityRole={copy.tone === 'danger' ? 'alert' : 'text'}
      style={[styles.banner, { backgroundColor: `${color}1A`, borderBottomColor: color }]}
    >
      <Text style={[styles.text, { color: p.text }]}>{t(copy.key, copy.values)}</Text>
      <View style={styles.links}>
        <Pressable
          testID="trial-banner-plans"
          accessibilityRole="link"
          hitSlop={8}
          onPress={() => void Linking.openURL(TRIAL_CONTACT.pricingUrl)}
        >
          <Text style={[styles.link, { color }]}>{t('trial.banner.seePlans')}</Text>
        </Pressable>
        <Pressable
          testID="trial-banner-contact"
          accessibilityRole="link"
          hitSlop={8}
          onPress={() =>
            void Linking.openURL(
              trialContactMailto(tenant?.tenant_code ?? '', t('trial.banner.mailSubject')),
            )
          }
        >
          <Text style={[styles.link, { color }]}>{t('trial.banner.contact')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  text: { fontFamily: fontFamily.medium, fontSize: 13, lineHeight: 13 * 1.4 },
  links: { flexDirection: 'row', gap: spacing.sm, marginTop: 4 },
  link: { fontFamily: fontFamily.semibold, fontSize: 13, textDecorationLine: 'underline' },
});
