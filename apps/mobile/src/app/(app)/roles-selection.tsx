// Roles selection (mockup 04_tenant_admin/00_home/02_quick_action_button/01_invite_user/
// 03_roles_selection; §32.7 dark). Full-screen role picker opened from Invite-user's "Show more roles".
//
// Shows the REAL assignable CosRole set (everything except the cross-tenant SYSTEM_ADMIN — 11 roles),
// searchable, single-select (createUser takes one role). The primary/support grouping and the
// Chief/Lead/Field/HSE tier badges are decorative and follow the mockup (PO decision 2026-07-29 — kept);
// roles the mockup did not badge stay unbadged rather than inventing tiers for them. Role names are the
// formatted enum, descriptions reuse invite-user's roleDesc copy. The CORE_AI banner is kept as the
// mockup drew it, including "98% Confidence" / "Source: Tenant Policy v4.2" (PO decision 2026-07-29).
// CONFIRM writes the choice to the invite-role store; Invite-user picks it up and the picker pops.

import { useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CosRole } from '@cos/types';
import { useInviteRoleStore } from '../../store/inviteRoleStore';
import { useT } from '../../i18n';
import { darkColors, fontFamily, spacing, touchTarget, typography } from '../../theme/tokens';

type IconName = keyof typeof MaterialIcons.glyphMap;

/** SITE_ENGINEER → "Site Engineer" (mirrors invite-user / users). */
function formatRole(role: string): string {
  return role
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}

// Primary vs support grouping + tier badges follow the mockup (decorative — there is no tier in the data
// model). Roles the mockup did not show are placed under "support" with no badge (not invented).
const PRIMARY_ROLES: CosRole[] = [
  CosRole.EXECUTIVE,
  CosRole.PROJECT_MANAGER,
  CosRole.SITE_ENGINEER,
];
const SUPPORT_ROLES: CosRole[] = [
  CosRole.PROCUREMENT_OFFICER,
  CosRole.SAFETY_OFFICER,
  CosRole.FINANCE,
  CosRole.CRM_SALES_MANAGER,
  CosRole.PROC_MANAGER,
  CosRole.SITE_WORKER,
  CosRole.TENANT_ADMIN,
  CosRole.VIEWER,
];
const TOTAL = PRIMARY_ROLES.length + SUPPORT_ROLES.length; // 11 assignable roles (ex-SYSTEM_ADMIN)

const BADGE: Partial<Record<CosRole, { key: string; color: string }>> = {
  [CosRole.EXECUTIVE]: { key: 'rolesSelection.badge.chief', color: darkColors.primary },
  [CosRole.PROJECT_MANAGER]: { key: 'rolesSelection.badge.lead', color: darkColors.cyan },
  [CosRole.SITE_ENGINEER]: { key: 'rolesSelection.badge.field', color: darkColors.success },
  [CosRole.SAFETY_OFFICER]: { key: 'rolesSelection.badge.hse', color: darkColors.warning },
};

export default function RolesSelectionScreen(): React.JSX.Element {
  const t = useT();
  const router = useRouter();
  const { role: roleParam } = useLocalSearchParams<{ role: string }>();
  const setPendingRole = useInviteRoleStore((s) => s.setPendingRole);

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<CosRole | null>(
    typeof roleParam === 'string' && roleParam !== '' ? (roleParam as CosRole) : null,
  );

  const q = query.trim().toLowerCase();
  const match = (role: CosRole): boolean => q === '' || formatRole(role).toLowerCase().includes(q);
  const primary = useMemo(() => PRIMARY_ROLES.filter(match), [q]);
  const support = useMemo(() => SUPPORT_ROLES.filter(match), [q]);

  const onConfirm = (): void => {
    if (selected === null) return;
    setPendingRole(selected);
    router.back();
  };
  // Info → the real permission breakdown for the selected role (reuses role-permissions).
  const onInfo = (): void => {
    if (selected === null) {
      Alert.alert(t('rolesSelection.title'), t('rolesSelection.infoPickFirst'));
      return;
    }
    router.push({ pathname: '/role-permissions', params: { role: selected } });
  };

  const renderCard = (role: CosRole): React.JSX.Element => {
    const isSel = selected === role;
    const badge = BADGE[role];
    const icon: IconName = isSel ? 'check-circle' : 'radio-button-unchecked';
    return (
      <Pressable
        key={role}
        style={[styles.card, isSel && styles.cardActive]}
        onPress={() => setSelected(role)}
        testID={`roles-select-${role}`}
        accessibilityRole="radio"
        accessibilityState={{ selected: isSel }}
      >
        <View style={styles.cardText}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardName}>{formatRole(role)}</Text>
            {badge ? (
              <View style={[styles.badge, { backgroundColor: `${badge.color}1A` }]}>
                <Text style={[styles.badgeText, { color: badge.color }]}>{t(badge.key)}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.cardDesc}>{t(`inviteUser.roleDesc.${role}`)}</Text>
        </View>
        <MaterialIcons
          name={icon}
          size={22}
          color={isSel ? darkColors.cyan : darkColors.muted}
          style={styles.cardIcon}
        />
      </Pressable>
    );
  };

  return (
    <View style={styles.root} testID="roles-selection">
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Search */}
        <View style={styles.searchBox}>
          <MaterialIcons name="search" size={20} color={darkColors.muted} />
          <TextInput
            testID="roles-search"
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder={t('rolesSelection.searchPlaceholder')}
            placeholderTextColor={darkColors.muted}
            autoCorrect={false}
          />
        </View>

        {/* Section header */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionLabel}>{t('rolesSelection.available', { count: TOTAL })}</Text>
          <Pressable onPress={onInfo} testID="roles-info" accessibilityRole="button">
            <MaterialIcons name="info-outline" size={18} color={darkColors.cyan} />
          </Pressable>
        </View>

        {/* Primary roles */}
        <View style={styles.list}>{primary.map(renderCard)}</View>

        {/* Support roles */}
        {support.length > 0 ? (
          <>
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>{t('rolesSelection.supportRoles')}</Text>
              <View style={styles.dividerLine} />
            </View>
            <View style={styles.list}>{support.map(renderCard)}</View>
          </>
        ) : null}

        {primary.length === 0 && support.length === 0 ? (
          <Text style={styles.empty}>{t('rolesSelection.noMatch')}</Text>
        ) : null}

        {/* CORE_AI banner (kept as the mockup drew it — PO decision 2026-07-29) */}
        <View style={styles.aiPanel}>
          <View style={styles.aiHeaderRow}>
            <View style={styles.aiHeaderLeft}>
              <MaterialIcons name="psychology" size={20} color={darkColors.cyan} />
              <Text style={styles.aiTitle}>{t('rolesSelection.aiTitle')}</Text>
            </View>
            <View style={styles.aiBadge}>
              <Text style={styles.aiBadgeText}>{t('rolesSelection.aiConfidence')}</Text>
            </View>
          </View>
          <Text style={styles.aiBody}>{t('rolesSelection.aiBody')}</Text>
          <Text style={styles.aiSource}>{t('rolesSelection.aiSource')}</Text>
        </View>
      </ScrollView>

      {/* Footer — confirm */}
      <View style={styles.footer}>
        <Pressable
          style={[styles.confirmBtn, selected === null && styles.confirmBtnDisabled]}
          onPress={onConfirm}
          disabled={selected === null}
          testID="roles-confirm"
          accessibilityRole="button"
        >
          <Text style={styles.confirmText}>{t('rolesSelection.confirm')}</Text>
          <MaterialIcons name="verified-user" size={20} color={darkColors.onPrimary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: darkColors.bg },
  content: { padding: spacing.lg, paddingBottom: 120, gap: spacing.md },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: darkColors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: darkColors.border,
    paddingHorizontal: spacing.md,
    height: touchTarget.formInput,
  },
  searchInput: {
    flex: 1,
    color: darkColors.text,
    fontFamily: fontFamily.regular,
    fontSize: typography.body.fontSize,
  },

  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: darkColors.border,
    paddingBottom: spacing.xs,
  },
  sectionLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: typography.label.fontSize,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: darkColors.muted,
  },

  list: { gap: spacing.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    backgroundColor: darkColors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: darkColors.border,
    padding: spacing.md,
    minHeight: touchTarget.listItem,
  },
  cardActive: { borderColor: `${darkColors.cyan}80`, backgroundColor: darkColors.elevated },
  cardText: { flex: 1, minWidth: 0, gap: 4, paddingRight: spacing.sm },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  cardName: {
    fontFamily: fontFamily.semibold,
    fontSize: typography.body.fontSize,
    color: darkColors.primary,
  },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeText: {
    fontFamily: fontFamily.bold,
    fontSize: 9,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  cardDesc: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    color: darkColors.muted,
  },
  cardIcon: { marginTop: 2 },

  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, opacity: 0.5 },
  dividerLine: { flex: 1, height: 1, backgroundColor: darkColors.border },
  dividerText: {
    fontFamily: fontFamily.bold,
    fontSize: 9,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: darkColors.muted,
  },

  empty: { textAlign: 'center', color: darkColors.muted, fontSize: 14, marginTop: spacing.md },

  aiPanel: {
    marginTop: spacing.xs,
    backgroundColor: `${darkColors.cyan}0D`,
    borderLeftWidth: 4,
    borderLeftColor: darkColors.cyan,
    borderRadius: 12,
    padding: spacing.md,
    gap: 6,
  },
  aiHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  aiHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  aiTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: darkColors.cyan,
  },
  aiBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: `${darkColors.cyan}1A`,
  },
  aiBadgeText: { fontFamily: fontFamily.bold, fontSize: 9, color: darkColors.cyan },
  aiBody: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 18, color: darkColors.muted },
  aiSource: {
    fontFamily: fontFamily.regular,
    fontSize: 9,
    fontStyle: 'italic',
    color: darkColors.muted,
    opacity: 0.6,
    textAlign: 'right',
  },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    backgroundColor: darkColors.surface,
    borderTopWidth: 1,
    borderTopColor: darkColors.border,
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: touchTarget.primaryButton + 8,
    borderRadius: 12,
    backgroundColor: darkColors.primary,
  },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmText: {
    fontFamily: fontFamily.bold,
    fontSize: typography.label.fontSize,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: darkColors.onPrimary,
  },
});
