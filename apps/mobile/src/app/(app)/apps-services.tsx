// Apps & Services (mockup 04_tenant_admin/01_home/02_quick_action_button/03_system_integration/
// 01_application_and_services/00_apps_and_services; §32.7 dark). A catalogue of the platform's app
// modules, admin tools and integration extensions, opened from the Quick Commands overlay.
//
// Honest wiring (PO decision 2026-07-29): only the two that are real, admin-facing features navigate —
// User Management → /users, System Settings → /system-settings. Every other card is a catalogue entry
// with no built screen yet (core modules are field-role features; the extensions have no backend
// integration API), so tapping opens an honest per-item "coming soon". The decorative "AI Enhanced" /
// "Phase 5" tier badges follow the mockup. Search filters every section by name; empty sections hide.
// The screen renders no top bar of its own — the global TopBar shows the title + a Back arrow.

import { useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useT } from '../../i18n';
import {
  darkColors,
  fontFamily,
  plateRadius,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../theme/tokens';

type IconName = keyof typeof MaterialIcons.glyphMap;

// Core module tiles (mockup grid). accent tints the icon chip; badge is a decorative tier label.
const CORE_MODULES: { key: string; icon: IconName; accent: string; badge?: string }[] = [
  { key: 'siteReports', icon: 'assignment', accent: darkColors.primary },
  { key: 'issueManagement', icon: 'report-problem', accent: darkColors.warning },
  { key: 'inventory', icon: 'inventory-2', accent: darkColors.muted },
  { key: 'bimViewer', icon: 'view-in-ar', accent: darkColors.cyan, badge: 'aiEnhanced' },
  { key: 'drone', icon: 'flight', accent: darkColors.cyan, badge: 'phase5' },
];

// Admin tools (list rows). route !== null → real screen; null → coming soon.
const ADMIN_TOOLS: { key: string; icon: IconName; route: '/users' | '/system-settings' | null }[] =
  [{ key: 'auditLogs', icon: 'history-edu', route: null }];

// Integration extensions (list cards) — the three connectors, ordered LINE → BIM 360 → ERP.
const EXTENSIONS: { key: string; icon: IconName; accent: string; badge?: boolean }[] = [
  { key: 'line', icon: 'chat-bubble', accent: darkColors.success },
  { key: 'bim360Ext', icon: 'view-in-ar', accent: darkColors.cyan, badge: true },
  { key: 'erp', icon: 'hub', accent: darkColors.muted },
];

export default function AppsServicesScreen(): React.JSX.Element {
  const t = useT();
  const router = useRouter();
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const match = (nameKey: string): boolean => q === '' || t(nameKey).toLowerCase().includes(q);

  const core = useMemo(
    () => CORE_MODULES.filter((m) => match(`appsServices.module.${m.key}`)),
    [q],
  );
  const tools = useMemo(
    () => ADMIN_TOOLS.filter((m) => match(`appsServices.module.${m.key}`)),
    [q],
  );
  const exts = useMemo(() => EXTENSIONS.filter((m) => match(`appsServices.module.${m.key}`)), [q]);

  const comingSoon = (nameKey: string): void =>
    Alert.alert(t(nameKey), t('appsServices.comingSoon'));

  const onTool = (m: (typeof ADMIN_TOOLS)[number]): void => {
    if (m.route) router.push(m.route);
    else comingSoon(`appsServices.module.${m.key}`);
  };

  return (
    <View style={styles.root} testID="apps-services">
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Search */}
        <View style={styles.searchBox}>
          <MaterialIcons name="search" size={20} color={darkColors.muted} />
          <TextInput
            testID="apps-search"
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder={t('appsServices.searchPlaceholder')}
            placeholderTextColor={darkColors.muted}
            autoCorrect={false}
          />
        </View>

        {/* Core modules */}
        {core.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader label={t('appsServices.coreModules')} />
            <View style={styles.grid}>
              {core.map((m) => (
                <Pressable
                  key={m.key}
                  style={styles.moduleCard}
                  onPress={() => comingSoon(`appsServices.module.${m.key}`)}
                  testID={`apps-module-${m.key}`}
                  accessibilityRole="button"
                >
                  {m.badge ? (
                    <MaterialIcons
                      name="auto-awesome"
                      size={44}
                      color={`${darkColors.cyan}1F`}
                      style={styles.moduleSparkle}
                    />
                  ) : null}
                  <View style={[styles.moduleIcon, { backgroundColor: `${m.accent}22` }]}>
                    <MaterialIcons name={m.icon} size={22} color={m.accent} />
                  </View>
                  <Text style={styles.moduleName}>{t(`appsServices.module.${m.key}`)}</Text>
                  {m.badge ? (
                    <Text style={styles.moduleBadge}>{t(`appsServices.badge.${m.badge}`)}</Text>
                  ) : null}
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {/* Admin tools */}
        {tools.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader label={t('appsServices.adminTools')} />
            <View style={styles.rows}>
              {tools.map((m) => (
                <Pressable
                  key={m.key}
                  style={styles.toolRow}
                  onPress={() => onTool(m)}
                  testID={`apps-tool-${m.key}`}
                  accessibilityRole="button"
                >
                  <View style={styles.toolLeft}>
                    <View style={styles.toolIcon}>
                      <MaterialIcons name={m.icon} size={22} color={darkColors.text} />
                    </View>
                    <Text style={styles.toolName}>{t(`appsServices.module.${m.key}`)}</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={22} color={darkColors.muted} />
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {/* Extensions */}
        {exts.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader label={t('appsServices.extensions')} />
            <View style={styles.rows}>
              {exts.map((m) => (
                <Pressable
                  key={m.key}
                  style={styles.extCard}
                  onPress={() => comingSoon(`appsServices.module.${m.key}`)}
                  testID={`apps-ext-${m.key}`}
                  accessibilityRole="button"
                >
                  <View style={[styles.extIcon, { backgroundColor: `${m.accent}1A` }]}>
                    <MaterialIcons name={m.icon} size={26} color={m.accent} />
                    {m.badge ? (
                      <View style={styles.extBadgeDot}>
                        <MaterialIcons name="auto-awesome" size={12} color={darkColors.onPrimary} />
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.extText}>
                    <Text style={styles.extName}>{t(`appsServices.module.${m.key}`)}</Text>
                    <Text style={styles.extDesc}>{t(`appsServices.ext.${m.key}`)}</Text>
                  </View>
                  {m.badge ? (
                    <MaterialIcons name="open-in-new" size={20} color={darkColors.cyan} />
                  ) : null}
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {core.length === 0 && tools.length === 0 && exts.length === 0 ? (
          <Text style={styles.empty}>{t('appsServices.noMatch')}</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

function SectionHeader({ label }: { label: string }): React.JSX.Element {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.sectionRule} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: darkColors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.xl },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: darkColors.surface,
    borderRadius: radius.lg,
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

  section: { gap: spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sectionLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: darkColors.muted,
  },
  sectionRule: { flex: 1, height: 1, backgroundColor: darkColors.border },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  moduleCard: {
    width: '47%',
    flexGrow: 1,
    backgroundColor: darkColors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: darkColors.border,
    padding: spacing.md,
    gap: spacing.md,
    minHeight: 120,
    overflow: 'hidden',
  },
  moduleSparkle: { position: 'absolute', top: -4, right: -4 },
  moduleIcon: {
    width: 40,
    height: 40,
    borderRadius: plateRadius(40),
    alignItems: 'center',
    justifyContent: 'center',
  },
  moduleName: {
    fontFamily: fontFamily.semibold,
    fontSize: typography.label.fontSize,
    color: darkColors.text,
    marginTop: 'auto',
  },
  moduleBadge: {
    fontFamily: fontFamily.bold,
    fontSize: 9,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: darkColors.cyan,
    marginTop: -6,
  },

  rows: { gap: spacing.sm },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: darkColors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: darkColors.border,
    padding: spacing.md,
    minHeight: touchTarget.listItem,
  },
  toolLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1, minWidth: 0 },
  toolIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: darkColors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolName: {
    fontFamily: fontFamily.medium,
    fontSize: typography.body.fontSize,
    color: darkColors.text,
  },

  extCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: darkColors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: darkColors.border,
    padding: spacing.md,
  },
  extIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  extBadgeDot: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: darkColors.cyan,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: darkColors.surface,
  },
  extText: { flex: 1, minWidth: 0, gap: 2 },
  extName: {
    fontFamily: fontFamily.semibold,
    fontSize: typography.label.fontSize,
    color: darkColors.text,
  },
  extDesc: { fontFamily: fontFamily.regular, fontSize: 12, color: darkColors.muted },

  empty: { textAlign: 'center', color: darkColors.muted, fontSize: 14, marginTop: spacing.md },
});
