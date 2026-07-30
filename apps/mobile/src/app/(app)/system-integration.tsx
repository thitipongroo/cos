// System integration — connector picker (mockup 04_tenant_admin/01_home/02_quick_action_button/
// 03_system_integration/00_tenant_new_integration; §32.7 dark). Opened from the Quick Commands
// "New System Integration" action.
//
// A catalogue of the integration TYPES the platform offers (LINE Messaging API, Autodesk BIM 360,
// ERP Connect) — there is no backend integration API yet and each connector's configuration flow is a
// separate, not-yet-built mockup, so tapping a card opens an honest "coming soon" note per connector
// (PO decision 2026-07-29); the sub-flows get wired as they are implemented. The CORE_AI banner is kept
// as the mockup drew it, including "98% Confidence" (PO decision 2026-07-29 — "full"). The mockup's
// stock enterprise photo is replaced with a gradient band + its caption (no external/placeholder image).
// No top bar of its own — the global TopBar shows the screen title + a Back arrow.

import { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  Image,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { useT } from '../../i18n';
import { darkColors, fontFamily, spacing, touchTarget, typography } from '../../theme/tokens';
// Bundled server-room photo for the enterprise band (PO decision 2026-07-29).
import enterpriseBg from '../../../assets/tenant-admin/server_room.jpg';

type IconName = keyof typeof MaterialIcons.glyphMap;

// Integration types offered (the mockup's three connectors). accent is each product's brand colour.
const CONNECTORS: { key: string; icon: IconName; accent: string }[] = [
  { key: 'line', icon: 'chat', accent: '#06C755' },
  { key: 'bim360', icon: 'view-in-ar', accent: darkColors.cyan },
  { key: 'erp', icon: 'account-balance-wallet', accent: darkColors.primary },
];

export default function SystemIntegrationScreen(): React.JSX.Element {
  const t = useT();
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const connectors = useMemo(
    () =>
      CONNECTORS.filter(
        (c) => q === '' || t(`systemIntegration.${c.key}.name`).toLowerCase().includes(q),
      ),
    [q, t],
  );

  const onConnector = (key: string): void =>
    Alert.alert(t(`systemIntegration.${key}.name`), t('systemIntegration.comingSoon'));

  return (
    <View style={styles.root} testID="system-integration">
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.subtitle}>{t('systemIntegration.subtitle')}</Text>

        {/* Search */}
        <View style={styles.searchBox}>
          <MaterialIcons name="search" size={20} color={darkColors.muted} />
          <TextInput
            testID="integration-search"
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder={t('systemIntegration.searchPlaceholder')}
            placeholderTextColor={darkColors.muted}
            autoCorrect={false}
          />
        </View>

        {/* CORE_AI banner (kept as the mockup drew it — PO decision 2026-07-29) */}
        <View style={styles.aiPanel}>
          <View style={styles.aiIcon}>
            <MaterialIcons name="auto-awesome" size={22} color={darkColors.cyan} />
          </View>
          <View style={styles.aiText}>
            <Text style={styles.aiTitle}>{t('systemIntegration.aiTitle')}</Text>
            <Text style={styles.aiBody}>
              {t('systemIntegration.aiBody')}
              {'  |  '}
              <Text style={styles.aiConfidence}>{t('systemIntegration.aiConfidence')}</Text>
            </Text>
          </View>
        </View>

        {/* Connector cards */}
        <View style={styles.list}>
          {connectors.map((c) => (
            <Pressable
              key={c.key}
              style={styles.card}
              onPress={() => onConnector(c.key)}
              testID={`integration-${c.key}`}
              accessibilityRole="button"
            >
              <View style={[styles.accentBar, { backgroundColor: c.accent }]} />
              <View style={styles.cardTop}>
                <View style={[styles.cardIcon, { backgroundColor: `${c.accent}1A` }]}>
                  <MaterialIcons name={c.icon} size={26} color={c.accent} />
                </View>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{t(`systemIntegration.${c.key}.badge`)}</Text>
                </View>
              </View>
              <Text style={styles.cardName}>{t(`systemIntegration.${c.key}.name`)}</Text>
              <Text style={styles.cardDesc}>{t(`systemIntegration.${c.key}.desc`)}</Text>
            </Pressable>
          ))}
          {connectors.length === 0 ? (
            <Text style={styles.empty}>{t('systemIntegration.noMatch')}</Text>
          ) : null}
        </View>

        {/* Enterprise-ready band — bundled server-room photo + a bottom-weighted scrim for legibility. */}
        <View style={styles.enterprise}>
          <Image source={enterpriseBg} style={StyleSheet.absoluteFill} resizeMode="cover" />
          <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 100 100">
            <Defs>
              <LinearGradient id="entScrim" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={darkColors.bg} stopOpacity={0.15} />
                <Stop offset="0.5" stopColor={darkColors.bg} stopOpacity={0.5} />
                <Stop offset="1" stopColor={darkColors.bg} stopOpacity={0.94} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100" height="100" fill="url(#entScrim)" />
          </Svg>
          <Text style={styles.enterpriseTag}>{t('systemIntegration.enterpriseTag')}</Text>
          <Text style={styles.enterpriseText}>{t('systemIntegration.enterpriseText')}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: darkColors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },

  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: typography.body.fontSize,
    color: darkColors.muted,
  },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: darkColors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: darkColors.border,
    paddingHorizontal: spacing.md,
    height: touchTarget.formInput + 4,
  },
  searchInput: {
    flex: 1,
    color: darkColors.text,
    fontFamily: fontFamily.regular,
    fontSize: typography.body.fontSize,
  },

  aiPanel: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: `${darkColors.cyan}0D`,
    borderLeftWidth: 4,
    borderLeftColor: darkColors.cyan,
    borderRadius: 16,
    padding: spacing.md,
  },
  aiIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: `${darkColors.cyan}22`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiText: { flex: 1, gap: 2, justifyContent: 'center' },
  aiTitle: {
    fontFamily: fontFamily.bold,
    fontSize: typography.label.fontSize,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: darkColors.cyan,
  },
  aiBody: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    color: darkColors.text,
  },
  aiConfidence: { fontFamily: fontFamily.semibold, color: darkColors.cyan },

  list: { gap: spacing.md, marginTop: spacing.xs },
  card: {
    backgroundColor: darkColors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: darkColors.border,
    padding: spacing.lg,
    paddingLeft: spacing.lg + 6,
    overflow: 'hidden',
  },
  accentBar: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 6 },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: darkColors.elevated,
    borderWidth: 1,
    borderColor: darkColors.border,
  },
  badgeText: {
    fontFamily: fontFamily.bold,
    fontSize: 9,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: darkColors.muted,
  },
  cardName: {
    fontFamily: fontFamily.bold,
    fontSize: typography.title.fontSize,
    color: darkColors.text,
    marginBottom: 4,
  },
  cardDesc: {
    fontFamily: fontFamily.regular,
    fontSize: typography.caption.fontSize,
    lineHeight: 20,
    color: darkColors.muted,
  },
  empty: { textAlign: 'center', color: darkColors.muted, fontSize: 14, marginTop: spacing.md },

  enterprise: {
    marginTop: spacing.lg,
    height: 168,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: darkColors.border,
    backgroundColor: darkColors.elevated,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    padding: spacing.lg,
  },
  enterpriseTag: {
    fontFamily: fontFamily.bold,
    fontSize: typography.label.fontSize,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: darkColors.primary,
    marginBottom: 4,
  },
  enterpriseText: {
    fontFamily: fontFamily.semibold,
    fontSize: typography.body.fontSize,
    color: darkColors.text,
  },
});
