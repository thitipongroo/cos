// Tenant Admin — System Settings (mockup 04_tenant_admin/04_settings/01_system_settings; §32.7 dark).
// Reached from the "Settings" bottom-nav tab. Honest data policy ("ถ้าไม่รู้ ห้ามเดา"):
//   REAL, persisted:
//     - Organization Info: name + code from GET /tenant (the caller's own tenant, scoped by JWT).
//     - LINE Notification: the on/off toggle (notifications_enabled) and the channel token
//       (line_channel_token) are read from GET /tenant/settings and saved via PATCH /tenant/settings.
//     - System language: the LanguageSwitcher actually switches th⇄en.
//   PLACEHOLDERS (full mockup layout, but no fabricated data — PO decision 2026-07-28):
//     - Brand logo upload + primary-colour picker, Autodesk BIM 360 sync, Security policy, and
//       Delete-tenant are not built on mobile yet; each opens an honest "not available yet" notice.
//     - The mockup's "AI System Insight" showed an invented "token expires in 3 days / 98% confidence".
//       There is no such signal, so the card renders its shell with an honest empty state — never the
//       fabricated prediction.
// The org-code copy button uses the OS's own text-selection (no clipboard dependency): tapping it
// selects the code so the native Copy affordance appears — it never fakes a "copied" confirmation.

import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Switch,
  Pressable,
  StyleSheet,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { getMyTenant, type MyTenant } from '../../api/tenant';
import { LoadingBoundary } from '../../components/LoadingBoundary';
import { getSettings, updateSettings, type TenantSettings } from '../../api/settings';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';
import { useT } from '../../i18n';
import { darkColors, fontFamily, spacing, touchTarget, typography } from '../../theme/tokens';

const LINE_GREEN = '#00C300';
const BIM_BLUE = '#0696D7';

export default function SystemSettingsScreen(): React.JSX.Element {
  const t = useT();
  const [tenant, setTenant] = useState<MyTenant | null>(null);
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [error, setError] = useState(false);

  // LINE token: local editable copy + reveal state. Seeded once settings load.
  const [token, setToken] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [notify, setNotify] = useState(false);
  const codeRef = useRef<TextInput>(null);

  useEffect(() => {
    let active = true;
    Promise.all([getMyTenant(), getSettings()])
      .then(([tn, st]) => {
        if (!active) return;
        setTenant(tn);
        setSettings(st);
        setToken(st.line_channel_token ?? '');
        setNotify(st.notifications_enabled);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const soon = (): void => Alert.alert(t('systemSettings.soonTitle'), t('systemSettings.soonBody'));
  const onDeleteTenant = (): void =>
    Alert.alert(t('systemSettings.deleteTitle'), t('systemSettings.deleteBody'));

  // The org code is selectable, read-only text; tapping copy selects it so the OS Copy menu appears.
  const onCopyCode = (): void => codeRef.current?.focus();

  const onToggleNotify = (value: boolean): void => {
    const prev = notify;
    setNotify(value); // optimistic
    updateSettings({ notifications_enabled: value }).catch(() => {
      setNotify(prev);
      Alert.alert(t('systemSettings.saveErrorTitle'), t('systemSettings.saveErrorBody'));
    });
  };

  const onSaveToken = (): void => {
    if (!settings || token === (settings.line_channel_token ?? '')) return;
    const next = token.trim();
    updateSettings({ line_channel_token: next === '' ? null : next })
      .then(() => setSettings({ ...settings, line_channel_token: next === '' ? null : next }))
      .catch(() =>
        Alert.alert(t('systemSettings.saveErrorTitle'), t('systemSettings.saveErrorBody')),
      );
  };

  if (error) {
    return (
      <View style={[styles.root, styles.center]} testID="tenant-admin-settings">
        <Text style={styles.empty}>{t('systemSettings.error')}</Text>
      </View>
    );
  }
  return (
    <LoadingBoundary
      loading={!tenant || !settings}
      variant="widget"
      theme="dark"
      style={styles.root}
      testID="tenant-admin-settings"
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Title lives in the global TopBar (PO decision 2026-07-29 — main screens drop their in-content
            page header). */}
        {/* ── Organization Info (REAL: GET /tenant) ── */}
        <SectionHeader icon="business" label={t('systemSettings.orgSection')} />
        <View style={[styles.card, styles.cardLeftPrimary]}>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{t('systemSettings.orgName')}</Text>
            <View style={styles.readonlyInput}>
              <Text style={styles.readonlyText} numberOfLines={2}>
                {tenant?.tenant_name}
              </Text>
            </View>
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{t('systemSettings.orgCode')}</Text>
            <View style={styles.codeRow}>
              <TextInput
                ref={codeRef}
                testID="org-code"
                style={styles.codeInput}
                value={tenant?.tenant_code}
                editable={false}
                selectTextOnFocus
                showSoftInputOnFocus={false}
              />
              <Pressable
                style={styles.copyBtn}
                onPress={onCopyCode}
                testID="org-code-copy"
                accessibilityRole="button"
                accessibilityLabel={t('systemSettings.copyCode')}
              >
                <MaterialIcons name="content-copy" size={20} color={darkColors.primary} />
              </Pressable>
            </View>
          </View>
        </View>

        {/* ── Brand & Identity (PLACEHOLDER) ── */}
        <SectionHeader icon="palette" label={t('systemSettings.brandSection')} />
        <View style={[styles.card, styles.cardLeftCyan, styles.cardTight]}>
          <Pressable
            style={styles.rowBetween}
            onPress={soon}
            testID="brand-logo"
            accessibilityRole="button"
          >
            <View style={styles.rowLeft}>
              <View style={styles.logoPlate}>
                <MaterialIcons name="add-a-photo" size={24} color={darkColors.muted} />
              </View>
              <View style={styles.rowTextCol}>
                <Text style={styles.rowTitle}>{t('systemSettings.logoTitle')}</Text>
                <Text style={styles.rowSub}>{t('systemSettings.logoSub')}</Text>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={darkColors.muted} />
          </Pressable>
          <View style={styles.divider} />
          <View style={styles.rowBetween}>
            <View style={styles.rowLeft}>
              <View style={styles.colorSwatch} />
              <View style={styles.rowTextCol}>
                <Text style={styles.rowTitle}>{t('systemSettings.primaryColor')}</Text>
                <Text style={styles.rowSub}>{t('systemSettings.primaryColorValue')}</Text>
              </View>
            </View>
            <Pressable
              style={styles.pillBtn}
              onPress={soon}
              testID="brand-color"
              accessibilityRole="button"
            >
              <Text style={styles.pillBtnText}>{t('systemSettings.changeColor')}</Text>
            </Pressable>
          </View>
        </View>

        {/* ── External Integrations ── */}
        <SectionHeader icon="hub" label={t('systemSettings.integrationsSection')} />

        {/* LINE Notification (REAL: GET/PATCH /tenant/settings) */}
        <View style={[styles.card, { borderLeftWidth: 4, borderLeftColor: LINE_GREEN }]}>
          <View style={styles.rowBetween}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconPlate, { backgroundColor: `${LINE_GREEN}1A` }]}>
                <MaterialIcons name="chat" size={22} color={LINE_GREEN} />
              </View>
              <View style={styles.rowTextCol}>
                <Text style={styles.rowTitleBold}>{t('systemSettings.lineTitle')}</Text>
                <Text style={styles.rowSub}>{t('systemSettings.lineSub')}</Text>
              </View>
            </View>
            <Switch
              testID="line-toggle"
              value={notify}
              onValueChange={onToggleNotify}
              trackColor={{ false: darkColors.border, true: darkColors.primary }}
              thumbColor={notify ? darkColors.onPrimary : darkColors.muted}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{t('systemSettings.lineToken')}</Text>
            <View style={styles.codeRow}>
              <TextInput
                testID="line-token"
                style={styles.tokenInput}
                value={token}
                onChangeText={setToken}
                onEndEditing={onSaveToken}
                secureTextEntry={!revealed}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={t('systemSettings.lineTokenPlaceholder')}
                placeholderTextColor={darkColors.muted}
              />
              <Pressable
                style={styles.eyeBtn}
                onPress={() => setRevealed((r) => !r)}
                testID="line-token-eye"
                accessibilityRole="button"
                accessibilityLabel={t(
                  revealed ? 'systemSettings.hideToken' : 'systemSettings.showToken',
                )}
              >
                <MaterialIcons
                  name={revealed ? 'visibility-off' : 'visibility'}
                  size={20}
                  color={darkColors.muted}
                />
              </Pressable>
            </View>
          </View>
        </View>

        {/* Autodesk BIM 360 (PLACEHOLDER) */}
        <Pressable
          style={[
            styles.card,
            styles.rowBetween,
            { borderLeftWidth: 4, borderLeftColor: BIM_BLUE },
          ]}
          onPress={soon}
          testID="integration-bim360"
          accessibilityRole="button"
        >
          <View style={styles.rowLeft}>
            <View style={[styles.iconPlate, { backgroundColor: `${BIM_BLUE}1A` }]}>
              <MaterialIcons name="architecture" size={22} color={BIM_BLUE} />
            </View>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowTitleBold}>{t('systemSettings.bimTitle')}</Text>
              <Text style={styles.rowSub}>{t('systemSettings.bimSub')}</Text>
            </View>
          </View>
          <View style={styles.rowLeft}>
            <Text style={styles.bimAction}>{t('systemSettings.bimConnect')}</Text>
            <MaterialIcons name="chevron-right" size={22} color={darkColors.muted} />
          </View>
        </Pressable>

        {/* ── Others ── */}
        <Text style={styles.othersLabel}>{t('systemSettings.othersSection')}</Text>
        <View style={[styles.card, styles.cardTight]}>
          {/* Language (REAL) */}
          <View style={styles.rowBetween}>
            <View style={styles.rowLeft}>
              <MaterialIcons name="language" size={22} color={darkColors.muted} />
              <Text style={styles.rowTitle}>{t('systemSettings.language')}</Text>
            </View>
            <LanguageSwitcher />
          </View>
          <View style={styles.divider} />
          {/* Security policy (PLACEHOLDER) */}
          <Pressable
            style={styles.rowBetween}
            onPress={soon}
            testID="security-policy"
            accessibilityRole="button"
          >
            <View style={styles.rowLeft}>
              <MaterialIcons name="security" size={22} color={darkColors.muted} />
              <Text style={styles.rowTitle}>{t('systemSettings.securityPolicy')}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={darkColors.muted} />
          </Pressable>
          <View style={styles.divider} />
          {/* Delete tenant (PLACEHOLDER, destructive) */}
          <Pressable
            style={styles.rowBetween}
            onPress={onDeleteTenant}
            testID="delete-tenant"
            accessibilityRole="button"
          >
            <View style={styles.rowLeft}>
              <MaterialIcons name="delete-forever" size={22} color={darkColors.danger} />
              <Text style={[styles.rowTitle, { color: darkColors.danger }]}>
                {t('systemSettings.deleteTenant')}
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={darkColors.muted} />
          </Pressable>
        </View>

        {/* ── AI System Insight (honest empty state — no fabricated prediction) ── */}
        <View style={[styles.card, styles.aiCard]}>
          <View style={styles.rowLeftTop}>
            <MaterialIcons name="auto-awesome" size={20} color={darkColors.cyan} />
            <View style={styles.aiBody}>
              <Text style={styles.rowTitleBold}>{t('systemSettings.aiTitle')}</Text>
              <Text style={styles.aiText}>{t('systemSettings.aiEmpty')}</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </LoadingBoundary>
  );
}

function SectionHeader({
  icon,
  label,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
}): React.JSX.Element {
  return (
    <View style={styles.sectionHeader}>
      <MaterialIcons name={icon} size={20} color={darkColors.cyan} />
      <Text style={styles.sectionTitle}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: darkColors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg, paddingBottom: 96 },
  empty: {
    color: darkColors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.caption.fontSize,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontFamily: fontFamily.semibold,
    fontSize: typography.title.fontSize,
    color: darkColors.text,
  },
  othersLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: typography.label.fontSize,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: darkColors.muted,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },

  card: {
    backgroundColor: darkColors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: darkColors.border,
    padding: spacing.md,
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  cardTight: { gap: 0, paddingVertical: 0 },
  cardLeftPrimary: { borderLeftWidth: 4, borderLeftColor: darkColors.primary },
  cardLeftCyan: { borderLeftWidth: 4, borderLeftColor: darkColors.cyan },

  field: { gap: 6 },
  fieldLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: typography.label.fontSize,
    color: darkColors.primary,
  },
  readonlyInput: {
    backgroundColor: darkColors.elevated,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: touchTarget.formInput,
    justifyContent: 'center',
  },
  readonlyText: {
    color: darkColors.text,
    fontFamily: fontFamily.regular,
    fontSize: typography.body.fontSize,
  },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  codeInput: {
    flex: 1,
    backgroundColor: darkColors.bg,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    height: touchTarget.formInput,
    color: darkColors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.caption.fontSize,
    letterSpacing: 1,
  },
  copyBtn: {
    width: touchTarget.formInput,
    height: touchTarget.formInput,
    borderRadius: 8,
    backgroundColor: darkColors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },

  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    minHeight: touchTarget.listItem,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1, minWidth: 0 },
  rowLeftTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  rowTextCol: { flex: 1, minWidth: 0 },
  rowTitle: {
    fontFamily: fontFamily.regular,
    fontSize: typography.body.fontSize,
    color: darkColors.text,
  },
  rowTitleBold: {
    fontFamily: fontFamily.semibold,
    fontSize: typography.body.fontSize,
    color: darkColors.text,
  },
  rowSub: {
    fontFamily: fontFamily.regular,
    fontSize: typography.label.fontSize,
    color: darkColors.muted,
    marginTop: 2,
  },
  divider: { height: 1, backgroundColor: darkColors.border },

  logoPlate: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: darkColors.elevated,
    borderWidth: 2,
    borderColor: darkColors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorSwatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: darkColors.primary,
    borderWidth: 2,
    borderColor: `${darkColors.text}1A`,
  },
  pillBtn: {
    paddingHorizontal: spacing.md,
    height: touchTarget.secondaryButton,
    borderRadius: 999,
    backgroundColor: `${darkColors.primary}1A`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillBtnText: {
    color: darkColors.primary,
    fontFamily: fontFamily.semibold,
    fontSize: typography.label.fontSize,
  },

  iconPlate: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenInput: {
    flex: 1,
    backgroundColor: darkColors.elevated,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    height: touchTarget.formInput,
    color: darkColors.text,
    fontFamily: fontFamily.regular,
    fontSize: typography.caption.fontSize,
  },
  eyeBtn: {
    width: touchTarget.formInput,
    height: touchTarget.formInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bimAction: {
    color: darkColors.warning,
    fontFamily: fontFamily.semibold,
    fontSize: typography.label.fontSize,
  },

  aiCard: {
    borderLeftWidth: 4,
    borderLeftColor: darkColors.cyan,
    backgroundColor: `${darkColors.cyan}0D`,
    marginTop: spacing.md,
  },
  aiBody: { flex: 1, gap: 4 },
  aiText: {
    fontFamily: fontFamily.regular,
    fontSize: typography.label.fontSize,
    lineHeight: 20,
    color: darkColors.muted,
  },
});
