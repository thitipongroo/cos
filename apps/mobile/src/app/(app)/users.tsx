// Tenant Admin — Users tab (§32.7 Mobile Dark Surfaces; PO decision 2026-07-28 adds the Tenant Admin
// shell to the dark set). Lists the tenant's active users with role + MFA status from GET /users
// (TENANT_ADMIN only, spec §14.3). Invite is a PO-approved first-pass placeholder — the full mobile
// invite flow (mockup 04_tenant_admin/00_home/03_invite_user) is a follow-up; the button surfaces the
// action without pretending the flow exists.

import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  StyleSheet,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { getUsers, type TenantUser } from '../../api/users';
import { useT } from '../../i18n';
import { darkColors, fontFamily, spacing, touchTarget, typography } from '../../theme/tokens';

/** Two-letter monogram from a display name — falls back to "?" when the name is empty. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

export default function UsersScreen() {
  const t = useT();
  const [users, setUsers] = useState<TenantUser[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    getUsers()
      .then((rows) => {
        if (active) setUsers(rows);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const onInvite = (): void => {
    Alert.alert(t('adminUsers.inviteTitle'), t('adminUsers.inviteSoon'));
  };

  return (
    <View style={styles.container} testID="tenant-admin-users">
      <View style={styles.header}>
        <Text style={styles.sectionLabel}>{t('adminUsers.title')}</Text>
        {users ? (
          <Text style={styles.count} testID="users-count">
            {t('adminUsers.count', { count: users.length })}
          </Text>
        ) : null}
      </View>

      <TouchableOpacity
        style={styles.inviteBtn}
        onPress={onInvite}
        testID="invite-user-button"
        accessibilityRole="button"
      >
        <MaterialIcons name="person-add" size={20} color={darkColors.onPrimary} />
        <Text style={styles.inviteText}>{t('adminUsers.invite')}</Text>
      </TouchableOpacity>

      {users == null && !error ? (
        <ActivityIndicator color={darkColors.primary} style={styles.loading} />
      ) : error ? (
        <Text style={styles.empty} testID="users-error">
          {t('adminUsers.error')}
        </Text>
      ) : users && users.length === 0 ? (
        <Text style={styles.empty} testID="users-empty">
          {t('adminUsers.empty')}
        </Text>
      ) : (
        <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          {users!.map((u) => (
            <View key={u.user_id} style={styles.card} testID={`user-row-${u.user_id}`}>
              {u.photo_url ? (
                <Image source={{ uri: u.photo_url }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarText}>{initials(u.display_name)}</Text>
                </View>
              )}
              <View style={styles.info}>
                <Text style={styles.name} numberOfLines={1}>
                  {u.display_name}
                </Text>
                <Text style={styles.email} numberOfLines={1}>
                  {u.email ?? '—'}
                </Text>
              </View>
              <View style={styles.meta}>
                <View style={styles.roleBadge}>
                  <Text style={styles.roleText}>{u.role}</Text>
                </View>
                {u.mfa_enabled ? (
                  <MaterialIcons
                    name="verified-user"
                    size={16}
                    color={darkColors.success}
                    style={styles.mfaIcon}
                    accessibilityLabel={t('adminUsers.mfaOn')}
                  />
                ) : null}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: darkColors.bg, padding: spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionLabel: {
    fontSize: typography.label.fontSize,
    fontFamily: fontFamily.semibold,
    color: darkColors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  count: {
    fontSize: typography.label.fontSize,
    fontFamily: fontFamily.medium,
    color: darkColors.muted,
  },
  inviteBtn: {
    minHeight: touchTarget.primaryButton,
    flexDirection: 'row',
    gap: spacing.xs,
    backgroundColor: darkColors.primary,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  inviteText: {
    color: darkColors.onPrimary,
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.semibold,
  },
  loading: { marginTop: spacing.xl },
  empty: {
    marginTop: spacing.xl,
    textAlign: 'center',
    color: darkColors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.caption.fontSize,
  },
  list: { gap: spacing.sm, paddingBottom: spacing.lg },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: darkColors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: darkColors.border,
    padding: spacing.sm,
  },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: darkColors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: darkColors.text,
    fontFamily: fontFamily.semibold,
    fontSize: typography.caption.fontSize,
  },
  info: { flex: 1, minWidth: 0 },
  name: {
    color: darkColors.text,
    fontFamily: fontFamily.semibold,
    fontSize: typography.body.fontSize,
  },
  email: {
    color: darkColors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.label.fontSize,
  },
  meta: { alignItems: 'flex-end', gap: spacing.xs },
  roleBadge: {
    backgroundColor: darkColors.elevated,
    borderRadius: 6,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  roleText: {
    color: darkColors.muted,
    fontFamily: fontFamily.medium,
    fontSize: 11,
    letterSpacing: 0.4,
  },
  mfaIcon: {},
});
