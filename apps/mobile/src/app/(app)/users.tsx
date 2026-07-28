// Tenant Admin — User Management (mockup 04_tenant_admin/02_users/01_user_management; §32.7 dark).
// Reached from the "Users" bottom-nav tab. Everything is REAL data from GET /users (TENANT_ADMIN-only,
// spec §14.3), never mockup placeholders:
//   - Search + role filter chips run client-side over the loaded users (roles derived from the data).
//   - Each card shows status (is_active), role, a short UID (from user_id), and the login method — OTP
//     when the account has a phone (Path A), Email otherwise (Path B).
//   - The User Audit card is a real, deterministic count: active users whose last_seen_at is older than
//     30 days (last_seen_at is written by JwtAuthGuard on every authenticated request). No fabricated
//     "95% confidence" — it is a count, not a prediction; it reads "all clear" when none are dormant.
//   - Invite (FAB) + the per-user more-actions are first-pass placeholders (PO decision 2026-07-28):
//     the create/edit/deactivate flows exist on the web console; the mobile flows are a follow-up.

import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Pressable,
  Image,
  StyleSheet,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { getUsers, type TenantUser } from '../../api/users';
import { useT } from '../../i18n';
import { darkColors, fontFamily, spacing, touchTarget, typography } from '../../theme/tokens';

const AUDIT_DORMANT_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

/** SITE_ENGINEER → "Site Engineer"; keeps the raw enum honest but readable in chips/badges. */
function formatRole(role: string): string {
  return role
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}

function isDormant(u: TenantUser): boolean {
  return (
    u.is_active && Date.now() - new Date(u.last_seen_at).getTime() > AUDIT_DORMANT_DAYS * DAY_MS
  );
}

export default function UsersScreen(): React.JSX.Element {
  const t = useT();
  const [users, setUsers] = useState<TenantUser[] | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');

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

  // Role chips derived from the actual data (never a hardcoded list that could drift from reality).
  const roles = useMemo(
    () => (users ? Array.from(new Set(users.map((u) => u.role))) : []),
    [users],
  );

  const filtered = useMemo(() => {
    if (!users) return [];
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
      const matchesQuery =
        q === '' ||
        u.display_name.toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q);
      return matchesRole && matchesQuery;
    });
  }, [users, query, roleFilter]);

  const dormant = useMemo(() => (users ? users.filter(isDormant) : []), [users]);

  const onInvite = (): void => Alert.alert(t('adminUsers.inviteTitle'), t('adminUsers.inviteSoon'));
  const onUserActions = (): void =>
    Alert.alert(t('adminUsers.actionsTitle'), t('adminUsers.actionsSoon'));
  const onAuditReview = (): void =>
    Alert.alert(
      t('adminUsers.auditTitle'),
      dormant.map((u) => `• ${u.display_name}`).join('\n') || t('adminUsers.auditClear'),
    );

  return (
    <View style={styles.root} testID="tenant-admin-users">
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Title lives in the global TopBar (PO decision 2026-07-29 — main screens drop their in-content
            page header). */}
        {/* Search */}
        <View style={styles.searchBox}>
          <MaterialIcons name="search" size={20} color={darkColors.muted} />
          <TextInput
            testID="users-search"
            style={styles.searchInput}
            placeholder={t('adminUsers.searchPlaceholder')}
            placeholderTextColor={darkColors.muted}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {/* Role filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          <FilterChip
            label={t('adminUsers.filterAll')}
            active={roleFilter === 'ALL'}
            onPress={() => setRoleFilter('ALL')}
            testID="filter-ALL"
          />
          {roles.map((r) => (
            <FilterChip
              key={r}
              label={formatRole(r)}
              active={roleFilter === r}
              onPress={() => setRoleFilter(r)}
              testID={`filter-${r}`}
            />
          ))}
        </ScrollView>

        {/* User Audit (real dormant-user count) */}
        {users ? (
          <View style={styles.auditCard} testID="users-audit">
            <View style={styles.auditHead}>
              <MaterialIcons name="fact-check" size={18} color={darkColors.cyan} />
              <Text style={styles.auditTitle}>{t('adminUsers.auditTitle')}</Text>
            </View>
            <Text style={styles.auditBody}>
              {dormant.length > 0
                ? t('adminUsers.auditFlagged', { count: dormant.length })
                : t('adminUsers.auditClear')}
            </Text>
            {dormant.length > 0 ? (
              <Pressable style={styles.auditBtn} onPress={onAuditReview} testID="audit-review">
                <Text style={styles.auditBtnText}>{t('adminUsers.auditReview')}</Text>
              </Pressable>
            ) : null}
            <Text style={styles.auditSource}>{t('adminUsers.auditSource')}</Text>
          </View>
        ) : null}

        {/* User list */}
        {users == null && !error ? (
          <ActivityIndicator color={darkColors.primary} style={styles.loading} />
        ) : error ? (
          <Text style={styles.empty} testID="users-error">
            {t('adminUsers.error')}
          </Text>
        ) : filtered.length === 0 ? (
          <Text style={styles.empty} testID="users-empty">
            {t('adminUsers.empty')}
          </Text>
        ) : (
          filtered.map((u) => <UserCard key={u.user_id} user={u} t={t} onActions={onUserActions} />)
        )}
      </ScrollView>

      {/* FAB — invite user */}
      <Pressable
        style={styles.fab}
        onPress={onInvite}
        testID="invite-user-fab"
        accessibilityRole="button"
        accessibilityLabel={t('adminUsers.invite')}
      >
        <MaterialIcons name="person-add" size={28} color={darkColors.onPrimary} />
      </Pressable>
    </View>
  );
}

function FilterChip({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  testID: string;
}): React.JSX.Element {
  return (
    <Pressable
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function UserCard({
  user: u,
  t,
  onActions,
}: {
  user: TenantUser;
  t: (k: string, v?: Record<string, unknown>) => string;
  onActions: () => void;
}): React.JSX.Element {
  const otp = u.phone_number != null; // Path A (phone) → OTP; otherwise email (Path B)
  return (
    <View
      style={[styles.card, !u.is_active && styles.cardInactive]}
      testID={`user-row-${u.user_id}`}
    >
      <View
        style={[
          styles.strip,
          { backgroundColor: u.is_active ? darkColors.success : darkColors.muted },
        ]}
      />
      <View style={styles.cardInner}>
        {/* Top row: avatar + name/uid + more */}
        <View style={styles.cardTop}>
          <View style={styles.identity}>
            {u.photo_url ? (
              <Image source={{ uri: u.photo_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                {u.is_active ? (
                  <Text style={styles.avatarText}>{initials(u.display_name)}</Text>
                ) : (
                  <MaterialIcons name="person" size={22} color={darkColors.muted} />
                )}
              </View>
            )}
            <View style={styles.nameCol}>
              <Text style={styles.name} numberOfLines={1}>
                {u.display_name}
              </Text>
              <Text style={styles.uid}>
                {t('adminUsers.uid')}: {u.user_id.slice(0, 8).toUpperCase()}
              </Text>
            </View>
          </View>
          <Pressable
            style={styles.moreBtn}
            onPress={onActions}
            testID={`user-actions-${u.user_id}`}
            accessibilityRole="button"
            accessibilityLabel={t('adminUsers.actionsTitle')}
          >
            <MaterialIcons name="more-vert" size={20} color={darkColors.muted} />
          </Pressable>
        </View>

        {/* Role + status */}
        <View style={styles.metaRow}>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>{t('adminUsers.roleLabel')}</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>{formatRole(u.role)}</Text>
            </View>
          </View>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>{t('adminUsers.statusLabel')}</Text>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: u.is_active ? darkColors.success : darkColors.muted },
                ]}
              />
              <Text
                style={[
                  styles.statusText,
                  { color: u.is_active ? darkColors.success : darkColors.muted },
                ]}
              >
                {u.is_active ? t('adminUsers.active') : t('adminUsers.inactive')}
              </Text>
            </View>
          </View>
        </View>

        {/* Footer: login method + mfa */}
        <View style={styles.cardFooter}>
          <View style={styles.loginMethod}>
            <MaterialIcons
              name={otp ? 'smartphone' : 'alternate-email'}
              size={18}
              color={darkColors.muted}
            />
            <Text style={styles.loginText}>
              {otp ? t('adminUsers.otpLogin') : t('adminUsers.emailLogin')}
            </Text>
          </View>
          {u.mfa_enabled ? (
            <MaterialIcons
              name="verified-user"
              size={16}
              color={darkColors.success}
              accessibilityLabel={t('adminUsers.mfaOn')}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: darkColors.bg },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 96 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: touchTarget.formInput,
    backgroundColor: darkColors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: darkColors.border,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    flex: 1,
    color: darkColors.text,
    fontFamily: fontFamily.regular,
    fontSize: typography.body.fontSize,
  },
  chips: { gap: spacing.xs, paddingVertical: spacing.xs, paddingRight: spacing.lg },
  chip: {
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    backgroundColor: darkColors.surface,
    borderWidth: 1,
    borderColor: darkColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: darkColors.primary, borderColor: darkColors.primary },
  chipText: {
    fontFamily: fontFamily.semibold,
    fontSize: typography.label.fontSize,
    color: darkColors.muted,
  },
  chipTextActive: { color: darkColors.onPrimary },
  auditCard: {
    backgroundColor: darkColors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: darkColors.border,
    borderLeftWidth: 4,
    borderLeftColor: darkColors.cyan,
    padding: spacing.md,
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  auditHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  auditTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: darkColors.cyan,
  },
  auditBody: {
    fontFamily: fontFamily.regular,
    fontSize: typography.caption.fontSize,
    lineHeight: typography.caption.lineHeight,
    color: darkColors.text,
  },
  auditBtn: {
    alignSelf: 'flex-start',
    minHeight: touchTarget.secondaryButton,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: `${darkColors.cyan}55`,
    backgroundColor: `${darkColors.cyan}1A`,
  },
  auditBtnText: {
    color: darkColors.cyan,
    fontFamily: fontFamily.semibold,
    fontSize: typography.label.fontSize,
  },
  auditSource: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
    color: darkColors.muted,
    fontStyle: 'italic',
  },
  loading: { marginTop: spacing.xl },
  empty: {
    marginTop: spacing.xl,
    textAlign: 'center',
    color: darkColors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.caption.fontSize,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: darkColors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: darkColors.border,
    overflow: 'hidden',
  },
  cardInactive: { opacity: 0.6 },
  strip: { width: 4 },
  cardInner: { flex: 1, padding: spacing.md, gap: spacing.sm },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1, minWidth: 0 },
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
  nameCol: { flex: 1, minWidth: 0 },
  name: {
    fontFamily: fontFamily.semibold,
    fontSize: typography.title.fontSize,
    color: darkColors.text,
  },
  uid: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: darkColors.muted,
    marginTop: 2,
  },
  moreBtn: {
    width: touchTarget.iconButton,
    height: touchTarget.iconButton,
    marginRight: -spacing.xs,
    marginTop: -spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaRow: { flexDirection: 'row', gap: spacing.md },
  metaCol: { flex: 1, gap: 4 },
  metaLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: darkColors.muted,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: `${darkColors.primary}22`,
    borderRadius: 6,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  roleText: {
    color: darkColors.primary,
    fontFamily: fontFamily.semibold,
    fontSize: typography.label.fontSize,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontFamily: fontFamily.semibold, fontSize: typography.label.fontSize },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: darkColors.border,
    paddingTop: spacing.sm,
  },
  loginMethod: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  loginText: {
    fontFamily: fontFamily.regular,
    fontSize: typography.label.fontSize,
    color: darkColors.muted,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: darkColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
});
