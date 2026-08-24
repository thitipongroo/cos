// Edit permissions (mockup 04_tenant_admin/02_users/02_user_management/03_edit_permission; §32.7 dark).
// Reached from the Users action sheet / user profile "Edit permissions". Implements the real fix for
// "one person, several jobs" the industry-standard way (NIST RBAC / Keycloak union model): a user holds
// a PRIMARY role plus optional ADDITIONAL roles, and effective permissions = the UNION of every assigned
// role's ROLE_PERMISSIONS (spec §6.4). This is honest and actually enforced (RolesGuard falls back to a
// user's additional roles; PermissionsGuard unions them) — NOT the mockup's per-user CRUD toggles, which
// COS has no backing store for (permissions come from roles, never per-user overrides).
//
// The per-module READ/WRITE/APPROVE/DELETE matrix is a READ-ONLY reflection of the effective (union)
// permissions — it updates live as roles are toggled. The mockup's fabricated "92% confidence" AI
// recommendation is dropped for an honest shell. Save persists via PUT /users/:id/roles.

import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, Modal, StyleSheet, Alert } from 'react-native';
import { LoadingState } from '../../components/LoadingState';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getUserRoles, setUserRoles } from '../../api/users';
import { getRolePermissions } from '../../api/roles';
import { LoadingBoundary } from '../../components/LoadingBoundary';
import { loadProgress } from '../../lib/loadingState';
import { useT } from '../../i18n';
import {
  darkColors,
  fontFamily,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../theme/tokens';
import { formatRole } from '../../lib/formatRole';
import { darkScreen } from '../../theme/screenStyles';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

// Assignable roles (POST/PUT reject the cross-tenant SYSTEM_ADMIN) — mirrors invite-user / roles-selection.
const ASSIGNABLE_ROLES = [
  'PROJECT_MANAGER',
  'SITE_ENGINEER',
  'SITE_WORKER',
  'EXECUTIVE',
  'FINANCE',
  'PROCUREMENT_OFFICER',
  'PROC_MANAGER',
  'SAFETY_OFFICER',
  'CRM_SALES_MANAGER',
  'TENANT_ADMIN',
  'VIEWER',
];

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
const RESOURCE_META: Record<string, { icon: IconName; labelKey: string }> = {
  project: { icon: 'architecture', labelKey: 'res.project.label' },
  boq: { icon: 'list-alt', labelKey: 'res.boq.label' },
  procurement: { icon: 'local-shipping', labelKey: 'res.procurement.label' },
  finance: { icon: 'account-balance-wallet', labelKey: 'res.finance.label' },
  'site-ops': { icon: 'foundation', labelKey: 'res.siteOps.label' },
  inspection: { icon: 'fact-check', labelKey: 'res.inspection.label' },
  issue: { icon: 'report-problem', labelKey: 'res.issue.label' },
  task: { icon: 'checklist', labelKey: 'res.task.label' },
  safety: { icon: 'health-and-safety', labelKey: 'res.safety.label' },
  vendor: { icon: 'storefront', labelKey: 'res.vendor.label' },
  crm: { icon: 'groups', labelKey: 'res.crm.label' },
  analytics: { icon: 'insights', labelKey: 'res.analytics.label' },
  ai: { icon: 'auto-awesome', labelKey: 'res.ai.label' },
};
const ACTIONS = ['read', 'write', 'approve', 'delete'] as const;

/** Resources (canonical order) present in the union permission set; `*:*` shows every resource. */
function resourcesFor(perms: string[]): string[] {
  if (perms.includes('*:*')) return [...RESOURCE_ORDER];
  const present = new Set(perms.map((p) => p.split(':')[0]).filter((r) => r && r !== '*'));
  const known = RESOURCE_ORDER.filter((r) => present.has(r));
  const extras = [...present].filter((r) => !RESOURCE_ORDER.includes(r as never));
  return [...known, ...extras];
}
/** Which of READ/WRITE/APPROVE/DELETE the union grants for a resource (`*:*` and `resource:*` cover all). */
function crudFor(perms: string[], resource: string): boolean[] {
  const all = perms.includes('*:*') || perms.includes(`${resource}:*`);
  return ACTIONS.map((a) => all || perms.includes(`${resource}:${a}`));
}

export default function EditPermissionScreen(): React.JSX.Element {
  const t = useT();
  const router = useRouter();
  const params = useLocalSearchParams<{ user_id: string; display_name: string }>();
  const userId = typeof params.user_id === 'string' ? params.user_id : '';
  const name = typeof params.display_name === 'string' ? params.display_name : '';

  const [loading, setLoading] = useState(true);
  // Honest load progress: the roles and the per-role permission sets are two independent waits
  // (Rule 40) — the permission sets are one step because they resolve together.
  const [settled, setSettled] = useState(0);
  const LOAD_STEPS = 2;
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);

  const [primary, setPrimary] = useState<string>('');
  const [additional, setAdditional] = useState<string[]>([]);
  const [initial, setInitial] = useState<{ primary: string; additional: string[] }>({
    primary: '',
    additional: [],
  });
  const [permsByRole, setPermsByRole] = useState<Record<string, string[]>>({});
  const [pickerOpen, setPickerOpen] = useState(false);

  // Load the user's current roles + cache the permission grants of every assignable role (so the union
  // matrix updates instantly as roles are toggled).
  useEffect(() => {
    let active = true;
    if (userId === '') {
      setError(true);
      setLoading(false);
      return;
    }
    const step = <T,>(p: Promise<T>): Promise<T> => {
      // `.finally()` returns a NEW promise that rejects with the same reason, and the caller only
      // ever handles the original — so without this catch a failed load raises an unhandled
      // rejection. The counter is a side effect; it has no business reporting the failure again.
      void p
        .finally(() => {
          if (active) setSettled((n) => n + 1);
        })
        .catch(() => undefined);
      return p;
    };
    Promise.all([
      step(getUserRoles(userId)),
      step(
        Promise.all(
          ASSIGNABLE_ROLES.map((r) =>
            getRolePermissions(r).then((p) => [r, p.permissions] as const),
          ),
        ),
      ),
    ])
      .then(([roles, perms]) => {
        if (!active) return;
        setPrimary(roles.primary_role);
        setAdditional(roles.additional_roles);
        setInitial({ primary: roles.primary_role, additional: roles.additional_roles });
        setPermsByRole(Object.fromEntries(perms));
        setLoading(false);
      })
      .catch(() => {
        if (active) {
          setError(true);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const selectedRoles = useMemo(
    () => [primary, ...additional].filter(Boolean),
    [primary, additional],
  );
  const unionPerms = useMemo(
    () => [...new Set(selectedRoles.flatMap((r) => permsByRole[r] ?? []))],
    [selectedRoles, permsByRole],
  );
  const resources = useMemo(() => resourcesFor(unionPerms), [unionPerms]);
  const dirty =
    primary !== initial.primary ||
    additional.length !== initial.additional.length ||
    additional.some((r) => !initial.additional.includes(r));

  const choosePrimary = (role: string): void => {
    setPickerOpen(false);
    if (role === primary) return;
    // A role can't be both primary and additional.
    setAdditional((prev) => prev.filter((r) => r !== role));
    setPrimary(role);
  };
  const toggleAdditional = (role: string): void => {
    if (role === primary) return;
    setAdditional((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  };
  const resetAll = (): void => {
    setPrimary(initial.primary);
    setAdditional(initial.additional);
  };
  const onSave = (): void => {
    if (saving || primary === '') return;
    setSaving(true);
    setUserRoles(userId, primary, additional)
      .then(() => {
        // Terminal success screen (mockup 04_success_permission). router.replace so Back / the editor is
        // gone — the success screen owns what happens next.
        router.replace({
          pathname: '/permission-success',
          params: { user_id: userId, display_name: name },
        });
      })
      .catch(() => Alert.alert(t('editPermission.errorTitle'), t('editPermission.errorBody')))
      .finally(() => setSaving(false));
  };

  if (error) {
    return (
      <View style={[darkScreen.root, styles.center]} testID="edit-permission">
        <Text style={styles.errorText}>{t('editPermission.errorBody')}</Text>
      </View>
    );
  }

  return (
    <LoadingBoundary
      loading={loading}
      variant="widget"
      theme="dark"
      progress={loadProgress(settled, LOAD_STEPS) ?? undefined}
      style={darkScreen.root}
      testID="edit-permission"
    >
      <ScrollView contentContainerStyle={styles.content}>
        {/* AI shell — honest: the effective permissions are simply the union of the assigned roles. */}
        <View style={styles.aiCard}>
          <View style={darkScreen.iconRow}>
            <MaterialIcons name="psychology" size={16} color={darkColors.cyan} />
            <Text style={darkScreen.aiTitle}>{t('editPermission.aiTitle')}</Text>
          </View>
          <Text style={styles.aiBody}>
            {name !== '' ? `${name} — ` : ''}
            {t('editPermission.aiBody', { count: selectedRoles.length })}
          </Text>
        </View>

        {/* Primary role */}
        <Text style={styles.sectionLabel}>{t('editPermission.primaryRole')}</Text>
        <Pressable
          style={styles.dropdown}
          onPress={() => setPickerOpen(true)}
          testID="primary-role"
          // A closed picker, not a button that acts: it announces the role in force and that a tap
          // opens the list of alternatives.
          accessibilityRole="button"
          accessibilityLabel={t('editPermission.primaryRoleIs', { role: formatRole(primary) })}
          accessibilityState={{ expanded: pickerOpen }}
        >
          <Text style={styles.dropdownText}>{formatRole(primary)}</Text>
          <MaterialIcons name="expand-more" size={22} color={darkColors.muted} />
        </Pressable>

        {/* Additional roles (multi-select) */}
        <Text style={styles.sectionLabel}>{t('editPermission.additionalRoles')}</Text>
        <View style={styles.chipWrap}>
          {ASSIGNABLE_ROLES.filter((r) => r !== primary).map((r) => {
            const on = additional.includes(r);
            return (
              <Pressable
                key={r}
                style={[styles.chip, on && styles.chipOn]}
                onPress={() => toggleAdditional(r)}
                testID={`add-role-${r}`}
                // Additional roles are independent of one another — a checkbox each, not a radio
                // group, which is the difference from the primary-role picker above.
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={formatRole(r)}
              >
                {on ? <MaterialIcons name="check" size={14} color={darkColors.onPrimary} /> : null}
                <Text style={[darkScreen.chipText, on && styles.chipTextOn]}>{formatRole(r)}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Effective (union) module permissions — read-only reflection */}
        <View style={styles.matrixHead}>
          <Text style={styles.sectionLabel}>{t('editPermission.modules')}</Text>
          <Pressable
            onPress={resetAll}
            testID="reset-all"
            accessibilityRole="button"
            accessibilityLabel={t('editPermission.resetAll')}
          >
            <Text style={styles.resetText}>{t('editPermission.resetAll')}</Text>
          </Pressable>
        </View>
        {resources.map((res) => {
          const meta = RESOURCE_META[res];
          const crud = crudFor(unionPerms, res);
          return (
            <View key={res} style={styles.moduleCard}>
              <View style={styles.moduleHead}>
                <MaterialIcons name={meta?.icon ?? 'folder'} size={18} color={darkColors.cyan} />
                <Text style={styles.moduleName}>{meta ? t(meta.labelKey) : formatRole(res)}</Text>
              </View>
              <View style={styles.crudRow}>
                {ACTIONS.map((a, i) => (
                  <View key={a} style={styles.crudCell}>
                    <Text style={styles.crudLabel}>{t(`editPermission.${a}`)}</Text>
                    <View style={[styles.crudDot, crud[i] ? styles.crudOn : styles.crudOff]}>
                      {crud[i] ? (
                        <MaterialIcons name="check" size={14} color={darkColors.onPrimary} />
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <Pressable
          style={[styles.saveBtn, (!dirty || saving) && styles.saveBtnDisabled]}
          onPress={onSave}
          disabled={!dirty || saving}
          testID="save-roles"
          accessibilityRole="button"
          accessibilityLabel={t('editPermission.save')}
          // Off until something has changed, and while the write is in flight — where the button
          // shows a micro loader, which is a picture a screen reader cannot read.
          accessibilityState={{ disabled: !dirty || saving, busy: saving }}
        >
          {saving ? (
            <LoadingState variant="micro" theme="dark" tone="onPrimary" />
          ) : (
            <>
              <MaterialIcons name="save" size={20} color={darkColors.onPrimary} />
              <Text style={styles.saveText}>{t('editPermission.save')}</Text>
            </>
          )}
        </Pressable>
        <Pressable
          style={styles.cancelBtn}
          onPress={() => router.back()}
          testID="cancel-roles"
          accessibilityRole="button"
          accessibilityLabel={t('editPermission.cancel')}
        >
          <Text style={styles.cancelText}>{t('editPermission.cancel')}</Text>
        </Pressable>
      </View>

      {/* Primary-role picker */}
      <Modal
        visible={pickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerOpen(false)}
      >
        {/* The backdrop dismisses; the sheet swallows the tap so a press inside does not close it.
            The backdrop is labelled because on a screen reader it is the only way out of the sheet
            other than the system back gesture; the sheet itself is not a control and says so. */}
        <Pressable
          style={styles.backdrop}
          onPress={() => setPickerOpen(false)}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        >
          <Pressable style={styles.sheet} onPress={() => {}} accessible={false}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{t('editPermission.selectPrimary')}</Text>
            <ScrollView style={styles.sheetList}>
              {ASSIGNABLE_ROLES.map((r) => (
                <Pressable
                  key={r}
                  style={styles.sheetRow}
                  onPress={() => choosePrimary(r)}
                  testID={`pick-primary-${r}`}
                  // Exactly one primary role — a radio group, and the tick beside the row is the
                  // selected one.
                  accessibilityRole="radio"
                  accessibilityState={{ selected: r === primary }}
                  accessibilityLabel={formatRole(r)}
                >
                  <Text style={styles.sheetRowText}>{formatRole(r)}</Text>
                  {r === primary ? (
                    <MaterialIcons name="check" size={20} color={darkColors.primary} />
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </LoadingBoundary>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  errorText: { color: darkColors.muted, fontFamily: fontFamily.regular },
  content: { padding: spacing.lg, paddingBottom: 210, gap: spacing.sm },

  aiCard: {
    backgroundColor: `${darkColors.cyan}0D`,
    borderLeftWidth: 4,
    borderLeftColor: darkColors.cyan,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 4,
    marginBottom: spacing.xs,
  },
  aiBody: {
    fontFamily: fontFamily.regular,
    fontSize: typography.caption.fontSize,
    lineHeight: typography.caption.lineHeight,
    color: darkColors.text,
  },

  sectionLabel: {
    fontFamily: fontFamily.bold,
    fontSize: typography.label.fontSize,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: darkColors.muted,
    marginTop: spacing.sm,
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: touchTarget.formInput,
    paddingHorizontal: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: darkColors.surface,
    borderWidth: 1,
    borderColor: darkColors.border,
  },
  dropdownText: {
    fontFamily: fontFamily.semibold,
    fontSize: typography.body.fontSize,
    color: darkColors.text,
  },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: darkColors.surface,
    borderWidth: 1,
    borderColor: darkColors.border,
  },
  chipOn: { backgroundColor: darkColors.primary, borderColor: darkColors.primary },
  chipTextOn: { color: darkColors.onPrimary },

  matrixHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  resetText: {
    fontFamily: fontFamily.bold,
    fontSize: typography.label.fontSize,
    color: darkColors.cyan,
    marginTop: spacing.sm,
  },
  moduleCard: {
    backgroundColor: darkColors.surface,
    borderWidth: 1,
    borderColor: darkColors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  moduleHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  moduleName: {
    fontFamily: fontFamily.bold,
    fontSize: typography.body.fontSize,
    color: darkColors.text,
  },
  crudRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs },
  crudCell: { flex: 1, alignItems: 'center', gap: 6 },
  crudLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
    letterSpacing: 0.5,
    color: darkColors.muted,
  },
  crudDot: {
    width: 40,
    height: 24,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crudOn: { backgroundColor: darkColors.success },
  crudOff: { backgroundColor: darkColors.elevated, borderWidth: 1, borderColor: darkColors.border },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: darkColors.surface,
    borderTopWidth: 1,
    borderTopColor: darkColors.border,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: touchTarget.primaryButton + 8,
    borderRadius: radius.md,
    backgroundColor: darkColors.primary,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveText: {
    fontFamily: fontFamily.bold,
    fontSize: typography.label.fontSize,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: darkColors.onPrimary,
  },
  cancelBtn: {
    height: touchTarget.primaryButton + 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: darkColors.border,
  },
  cancelText: {
    fontFamily: fontFamily.bold,
    fontSize: typography.label.fontSize,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: darkColors.text,
  },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: darkColors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: darkColors.border,
    paddingBottom: spacing.xl,
    maxHeight: '70%',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: radius.sm,
    backgroundColor: darkColors.muted,
    opacity: 0.5,
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  sheetTitle: {
    fontFamily: fontFamily.bold,
    fontSize: typography.title.fontSize,
    color: darkColors.text,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  sheetList: { paddingHorizontal: spacing.lg },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: touchTarget.listItem,
    borderBottomWidth: 1,
    borderBottomColor: darkColors.border,
  },
  sheetRowText: {
    fontFamily: fontFamily.medium,
    fontSize: typography.body.fontSize,
    color: darkColors.text,
  },
});
