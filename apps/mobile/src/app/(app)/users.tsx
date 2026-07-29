// Tenant Admin — User Management (mockup 04_tenant_admin/02_users/01_user_management; §32.7 dark).
// Reached from the "Users" bottom-nav tab. Everything is REAL data from GET /users (TENANT_ADMIN-only,
// spec §14.3), never mockup placeholders:
//   - Search + role filter chips run client-side over the loaded users (roles derived from the data).
//   - Each card shows status (is_active), role, a short UID (from user_id), and the login method — OTP
//     when the account has a phone (Path A), Email otherwise (Path B).
//   - The User Audit card is a real, deterministic count: active users whose last_seen_at is older than
//     30 days (last_seen_at is written by JwtAuthGuard on every authenticated request). No fabricated
//     "95% confidence" — it is a count, not a prediction; it reads "all clear" when none are dormant.
//   - Invite (FAB) is a first-pass placeholder (PO decision 2026-07-28): create exists on the web
//     console; the mobile invite flow is a follow-up.
//   - The per-user ⋮ opens the action sheet (mockup 01_user_management/00_main): Edit permissions /
//     Reset password / View activity / Deactivate. Each targets a sub-flow (mockups 02/04/06/07) that
//     is not built on mobile yet, so every action opens an honest "not available on mobile yet" note.

import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Pressable,
  Image,
  Modal,
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
  // The user whose ⋮ action sheet is open (null = closed).
  const [selected, setSelected] = useState<TenantUser | null>(null);

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
  const closeSheet = (): void => setSelected(null);
  // Every sheet action targets a sub-flow that is not built on mobile yet (mockups 02/04/06/07), so it
  // closes the sheet and shows an honest "not available on mobile yet" note rather than dead-ending.
  const sheetAction = (titleKey: string): void => {
    closeSheet();
    Alert.alert(t(titleKey), t('adminUsers.sheetSoon'));
  };
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

        {/* AI User Audit — mockup 00_main layout, but every figure is REAL (a deterministic count over
            last_seen_at), never the mockup's fabricated "95% confidence". */}
        {users ? (
          <View style={styles.auditCard} testID="users-audit">
            <MaterialIcons
              name="psychology"
              size={72}
              color={darkColors.cyan}
              style={styles.auditBgIcon}
            />
            <View style={styles.auditHead}>
              <View style={styles.auditHeadLeft}>
                <MaterialIcons name="auto-awesome" size={18} color={darkColors.cyan} />
                <Text style={styles.auditTitle}>{t('adminUsers.auditTitle')}</Text>
              </View>
              <View style={styles.auditBadge}>
                <Text style={styles.auditBadgeText}>
                  {dormant.length > 0
                    ? t('adminUsers.auditBadgeFlagged', { count: dormant.length })
                    : t('adminUsers.auditBadgeClear')}
                </Text>
              </View>
            </View>
            <Text style={styles.auditBody}>
              {dormant.length > 0
                ? t('adminUsers.auditFlagged', { count: dormant.length })
                : t('adminUsers.auditClear')}
            </Text>
            {/* Always shown (mockup 00_main): opens the audit review — the flagged list when there are
                dormant accounts, or an honest "all clear" when there are none. */}
            <Pressable style={styles.auditBtn} onPress={onAuditReview} testID="audit-review">
              <Text style={styles.auditBtnText}>{t('adminUsers.auditReview')}</Text>
            </Pressable>
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
          filtered.map((u) => (
            <UserCard key={u.user_id} user={u} t={t} onActions={() => setSelected(u)} />
          ))
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
        <MaterialIcons name="add" size={30} color={darkColors.onPrimary} />
      </Pressable>

      {/* Per-user action sheet (mockup 01_user_management/00_main). Opens on a card's ⋮. */}
      <Modal
        visible={selected !== null}
        transparent
        animationType="slide"
        onRequestClose={closeSheet}
      >
        <Pressable style={styles.backdrop} onPress={closeSheet} testID="user-actions-backdrop">
          {/* Inner Pressable swallows taps so pressing the sheet itself never closes it. */}
          <Pressable style={styles.sheet} onPress={() => {}} testID="user-actions-sheet">
            <View style={styles.sheetHandle} />
            {selected ? (
              <>
                <View style={styles.sheetHeader}>
                  {selected.photo_url ? (
                    <Image source={{ uri: selected.photo_url }} style={styles.sheetAvatar} />
                  ) : (
                    <View style={styles.sheetAvatarFallback}>
                      <Text style={styles.sheetAvatarText}>{initials(selected.display_name)}</Text>
                    </View>
                  )}
                  <View style={styles.sheetIdentity}>
                    <Text style={styles.sheetName} numberOfLines={1}>
                      {selected.display_name}
                    </Text>
                    <Text style={styles.sheetUid}>
                      {t('adminUsers.uid')}: {selected.user_id.slice(0, 8).toUpperCase()}
                    </Text>
                  </View>
                </View>
                <View style={styles.sheetActions}>
                  <SheetRow
                    icon="edit"
                    label={t('adminUsers.sheetEdit')}
                    onPress={() => sheetAction('adminUsers.sheetEdit')}
                    testID="sheet-edit"
                  />
                  <SheetRow
                    icon="lock-reset"
                    label={t('adminUsers.sheetReset')}
                    onPress={() => sheetAction('adminUsers.sheetReset')}
                    testID="sheet-reset"
                  />
                  <SheetRow
                    icon="history"
                    label={t('adminUsers.sheetActivity')}
                    onPress={() => sheetAction('adminUsers.sheetActivity')}
                    testID="sheet-activity"
                  />
                  <View style={styles.sheetDivider} />
                  <SheetRow
                    icon="person-off"
                    label={t('adminUsers.sheetDeactivate')}
                    onPress={() => sheetAction('adminUsers.sheetDeactivate')}
                    testID="sheet-deactivate"
                    danger
                  />
                </View>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function SheetRow({
  icon,
  label,
  onPress,
  testID,
  danger = false,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  onPress: () => void;
  testID: string;
  danger?: boolean;
}): React.JSX.Element {
  const tint = danger ? darkColors.danger : darkColors.muted;
  return (
    <Pressable style={styles.sheetRow} onPress={onPress} testID={testID} accessibilityRole="button">
      <MaterialIcons name={icon} size={22} color={tint} />
      <Text style={[styles.sheetRowText, danger && { color: darkColors.danger }]}>{label}</Text>
      <MaterialIcons
        name={danger ? 'warning' : 'chevron-right'}
        size={danger ? 18 : 20}
        color={tint}
      />
    </Pressable>
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
    <Pressable
      style={[styles.card, !u.is_active && styles.cardInactive]}
      onPress={onActions}
      testID={`user-row-${u.user_id}`}
      accessibilityRole="button"
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

        {/* Footer: login method + a chevron (active, card opens the action sheet) or lock (inactive). */}
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
          <MaterialIcons
            name={u.is_active ? 'chevron-right' : 'lock'}
            size={u.is_active ? 22 : 16}
            color={darkColors.muted}
          />
        </View>
      </View>
    </Pressable>
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
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: darkColors.elevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: darkColors.border,
    borderLeftWidth: 4,
    borderLeftColor: darkColors.cyan,
    padding: spacing.md,
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  auditBgIcon: { position: 'absolute', top: -6, right: 2, opacity: 0.08 },
  auditHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  auditHeadLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  auditBadge: {
    backgroundColor: `${darkColors.cyan}1A`,
    borderWidth: 1,
    borderColor: `${darkColors.cyan}4D`,
    borderRadius: 6,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  auditBadgeText: {
    color: darkColors.cyan,
    fontFamily: fontFamily.bold,
    fontSize: 10,
    letterSpacing: 0.5,
  },
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
    minHeight: touchTarget.secondaryButton,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
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
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: `${darkColors.primary}4D`,
  },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: `${darkColors.primary}4D`,
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

  // Action sheet (mockup 00_main): dim backdrop + a bottom sheet pinned to the bottom.
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: darkColors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: darkColors.border,
    paddingBottom: spacing.xl,
    overflow: 'hidden',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: darkColors.muted,
    opacity: 0.5,
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: darkColors.border,
  },
  sheetAvatar: { width: 52, height: 52, borderRadius: 14 },
  sheetAvatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: darkColors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetAvatarText: {
    color: darkColors.primary,
    fontFamily: fontFamily.bold,
    fontSize: typography.title.fontSize,
  },
  sheetIdentity: { flex: 1, minWidth: 0 },
  sheetName: {
    fontFamily: fontFamily.semibold,
    fontSize: typography.title.fontSize,
    color: darkColors.text,
  },
  sheetUid: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: darkColors.muted,
    marginTop: 2,
  },
  sheetActions: { paddingVertical: spacing.xs },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    height: touchTarget.listItem,
    paddingHorizontal: spacing.lg,
  },
  sheetRowText: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: typography.body.fontSize,
    color: darkColors.text,
  },
  sheetDivider: {
    height: 1,
    backgroundColor: darkColors.border,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.xs,
  },
});
