// Role permissions (mockup 04_tenant_admin/01_home/02_quick_action_button/02_invite_user/
// 02_role_permissions; §32.7 dark). Reached from the Invite-user "View permissions" link.
//
// Real data: the module → access breakdown is DERIVED from the backend's authoritative RBAC matrix
// (GET /auth/roles/:role/permissions → ROLE_PERMISSIONS, spec §6.4), not the mockup's illustrative
// values — so it reflects what the role can actually do (e.g. PROJECT_MANAGER: Procurement = FULL
// because it holds procurement:approve, Site Operations = RW, and no Safety module at all). Access
// level is derived per resource: any `*`/`approve` grant → FULL, else `write` → RW, else read → R.
// Per-module descriptions are generic per-resource labels (not role-specific narratives). The CORE_AI
// banner is kept as the mockup drew it, including its "98% CONFIDENCE" badge (PO decision 2026-07-29).
// The screen renders no top bar of its own — the global TopBar shows "Role permissions" + a Back arrow.

import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getRolePermissions } from '../../api/roles';
import { useT } from '../../i18n';
import { darkColors, fontFamily, spacing, touchTarget, typography } from '../../theme/tokens';

type IconName = keyof typeof MaterialIcons.glyphMap;
type Level = 'FULL' | 'RW' | 'R';

/** SITE_ENGINEER → "Site Engineer" (mirrors invite-user / users — role labels are formatted). */
function formatRole(role: string): string {
  return role
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}

// Resource metadata — label + icon are the real RBAC resource keys (permissions.ts); the description is
// a generic, role-independent summary of the resource (PO decision 2026-07-29). Order is the canonical
// display order; resources the role does not hold are simply omitted.
const RESOURCE_ORDER = [
  'project',
  'boq',
  'procurement',
  'finance',
  'site-ops',
  'inspection',
  'issue',
  'task',
  'safety',
  'vendor',
  'crm',
  'analytics',
  'ai',
] as const;

const RESOURCE_META: Record<string, { icon: IconName; labelKey: string; descKey: string }> = {
  project: { icon: 'architecture', labelKey: 'res.project.label', descKey: 'res.project.desc' },
  boq: { icon: 'list-alt', labelKey: 'res.boq.label', descKey: 'res.boq.desc' },
  procurement: {
    icon: 'local-shipping',
    labelKey: 'res.procurement.label',
    descKey: 'res.procurement.desc',
  },
  finance: {
    icon: 'account-balance-wallet',
    labelKey: 'res.finance.label',
    descKey: 'res.finance.desc',
  },
  'site-ops': { icon: 'foundation', labelKey: 'res.siteOps.label', descKey: 'res.siteOps.desc' },
  inspection: {
    icon: 'fact-check',
    labelKey: 'res.inspection.label',
    descKey: 'res.inspection.desc',
  },
  issue: { icon: 'report-problem', labelKey: 'res.issue.label', descKey: 'res.issue.desc' },
  task: { icon: 'checklist', labelKey: 'res.task.label', descKey: 'res.task.desc' },
  safety: { icon: 'health-and-safety', labelKey: 'res.safety.label', descKey: 'res.safety.desc' },
  vendor: { icon: 'storefront', labelKey: 'res.vendor.label', descKey: 'res.vendor.desc' },
  crm: { icon: 'groups', labelKey: 'res.crm.label', descKey: 'res.crm.desc' },
  analytics: { icon: 'insights', labelKey: 'res.analytics.label', descKey: 'res.analytics.desc' },
  ai: { icon: 'auto-awesome', labelKey: 'res.ai.label', descKey: 'res.ai.desc' },
};

/** Derive the per-resource access level from the granted `resource:action` set (spec §6.4). */
function deriveModules(permissions: string[]): { resource: string; level: Level }[] {
  const wildcardAll = permissions.includes('*:*');
  const byResource = new Map<string, Set<string>>();
  for (const p of permissions) {
    const [res, act] = p.split(':');
    if (res === '*' || !res) continue;
    if (!byResource.has(res)) byResource.set(res, new Set());
    byResource.get(res)?.add(act);
  }
  // Known resources first (canonical order), then any unknown ones the matrix may add later.
  const extras = [...byResource.keys()].filter((r) => !RESOURCE_ORDER.includes(r as never));
  const resources = wildcardAll
    ? [...RESOURCE_ORDER]
    : [...RESOURCE_ORDER.filter((r) => byResource.has(r)), ...extras];

  return resources.map((resource) => {
    let level: Level = 'R';
    if (wildcardAll) {
      level = 'FULL';
    } else {
      const acts = byResource.get(resource) ?? new Set<string>();
      if (acts.has('*') || acts.has('approve')) level = 'FULL';
      else if (acts.has('write')) level = 'RW';
      else level = 'R';
    }
    return { resource, level };
  });
}

const LEVEL_STYLE: Record<Level, { color: string; labelKey: string }> = {
  FULL: { color: darkColors.success, labelKey: 'rolePermissions.level.full' },
  RW: { color: darkColors.cyan, labelKey: 'rolePermissions.level.rw' },
  R: { color: darkColors.muted, labelKey: 'rolePermissions.level.r' },
};

export default function RolePermissionsScreen(): React.JSX.Element {
  const t = useT();
  const router = useRouter();
  const { role: roleParam } = useLocalSearchParams<{ role: string }>();
  const role = typeof roleParam === 'string' ? roleParam : '';

  const [permissions, setPermissions] = useState<string[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    if (role === '') {
      setError(true);
      return;
    }
    setError(false);
    setPermissions(null);
    getRolePermissions(role)
      .then((res) => active && setPermissions(res.permissions))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [role]);

  const modules = useMemo(() => (permissions ? deriveModules(permissions) : []), [permissions]);

  const roleDesc = role ? t(`inviteUser.roleDesc.${role}`) : '';

  return (
    <View style={styles.root} testID="role-permissions">
      <ScrollView contentContainerStyle={styles.content}>
        {/* Hero — role name + description */}
        <View style={styles.hero}>
          <Text style={styles.heroName}>{formatRole(role)}</Text>
          {roleDesc ? <Text style={styles.heroDesc}>{roleDesc}</Text> : null}
        </View>

        {/* CORE_AI assistant banner (kept as the mockup drew it — PO decision 2026-07-29) */}
        <View style={styles.aiPanel}>
          <View style={styles.aiHeader}>
            <MaterialIcons name="smart-toy" size={22} color={darkColors.cyan} />
            <View style={styles.aiHeaderText}>
              <Text style={styles.aiTitle}>{t('rolePermissions.aiTitle')}</Text>
              <Text style={styles.aiBody}>{t('rolePermissions.aiBody')}</Text>
            </View>
          </View>
          <View style={styles.aiFooter}>
            <View style={styles.aiConfidence}>
              <MaterialIcons name="verified" size={14} color={darkColors.cyan} />
              <Text style={styles.aiConfidenceText}>{t('rolePermissions.aiConfidence')}</Text>
            </View>
            <Text style={styles.aiVerified}>{t('rolePermissions.aiVerified')}</Text>
          </View>
        </View>

        {/* Permission modules */}
        {error ? (
          <Text style={styles.state} testID="role-permissions-error">
            {t('rolePermissions.error')}
          </Text>
        ) : permissions === null ? (
          <ActivityIndicator color={darkColors.cyan} style={styles.state} />
        ) : modules.length === 0 ? (
          <Text style={styles.state}>{t('rolePermissions.empty')}</Text>
        ) : (
          <View style={styles.list}>
            {modules.map(({ resource, level }) => {
              const meta = RESOURCE_META[resource];
              const ls = LEVEL_STYLE[level];
              return (
                <View key={resource} style={styles.card} testID={`role-perm-${resource}`}>
                  <View style={styles.cardLeft}>
                    <View style={styles.cardIcon}>
                      <MaterialIcons
                        name={meta?.icon ?? 'lock'}
                        size={22}
                        color={darkColors.muted}
                      />
                    </View>
                    <View style={styles.cardText}>
                      <Text style={styles.cardTitle}>
                        {meta ? t(meta.labelKey) : resource.toUpperCase()}
                      </Text>
                      <Text style={styles.cardDesc}>{meta ? t(meta.descKey) : ''}</Text>
                    </View>
                  </View>
                  <View style={styles.cardRight}>
                    <View style={[styles.badge, { backgroundColor: `${ls.color}22` }]}>
                      <Text style={[styles.badgeText, { color: ls.color }]}>{level}</Text>
                    </View>
                    <Text style={[styles.levelLabel, { color: ls.color }]}>{t(ls.labelKey)}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Footer — back to the invitation */}
      <View style={styles.footer}>
        <Pressable
          style={styles.backBtn}
          onPress={() => router.back()}
          testID="role-permissions-back"
          accessibilityRole="button"
        >
          <MaterialIcons name="arrow-back" size={20} color={darkColors.onPrimary} />
          <Text style={styles.backText}>{t('rolePermissions.backToInvite')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: darkColors.bg },
  content: { padding: spacing.lg, paddingBottom: 120 },

  hero: {
    backgroundColor: darkColors.surface,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: darkColors.primary,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  heroName: {
    fontFamily: fontFamily.bold,
    fontSize: typography.title.fontSize,
    color: darkColors.text,
    marginBottom: 4,
  },
  heroDesc: {
    fontFamily: fontFamily.regular,
    fontSize: typography.body.fontSize,
    lineHeight: 22,
    color: darkColors.muted,
  },

  aiPanel: {
    backgroundColor: `${darkColors.cyan}1A`,
    borderWidth: 1,
    borderColor: `${darkColors.cyan}4D`,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  aiHeader: { flexDirection: 'row', gap: spacing.sm },
  aiHeaderText: { flex: 1 },
  aiTitle: {
    fontFamily: fontFamily.bold,
    fontSize: typography.label.fontSize,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: darkColors.cyan,
  },
  aiBody: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    color: darkColors.muted,
    marginTop: 4,
  },
  aiFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: `${darkColors.cyan}1A`,
  },
  aiConfidence: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  aiConfidenceText: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: darkColors.cyan,
  },
  aiVerified: { fontFamily: fontFamily.regular, fontSize: 10, color: darkColors.muted },

  list: { gap: spacing.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: darkColors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: darkColors.border,
    padding: spacing.sm,
    minHeight: touchTarget.listItem,
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1, minWidth: 0 },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: darkColors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { flex: 1, minWidth: 0 },
  cardTitle: {
    fontFamily: fontFamily.semibold,
    fontSize: typography.label.fontSize,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: darkColors.text,
  },
  cardDesc: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 16,
    color: darkColors.muted,
  },
  cardRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontFamily: fontFamily.bold, fontSize: 10, letterSpacing: 0.5 },
  levelLabel: { fontFamily: fontFamily.semibold, fontSize: 11 },

  state: { marginTop: spacing.xl, textAlign: 'center', color: darkColors.muted, fontSize: 14 },

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
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: touchTarget.primaryButton + 8,
    borderRadius: 12,
    backgroundColor: darkColors.primary,
  },
  backText: {
    fontFamily: fontFamily.bold,
    fontSize: typography.label.fontSize,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: darkColors.onPrimary,
  },
});
