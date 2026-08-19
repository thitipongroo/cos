// User profile (mockup 04_tenant_admin/02_users/02_user_management/02_user_profile; §32.7 dark).
// Reached from the Users list — tapping a user card (or its chevron) pushes here with that user's row
// passed as params; the ⋮ opens the quick-action sheet instead. NO top bar of its own — the global
// TopBar shows the title + a Back arrow.
//
// Every value is REAL, never the mockup's placeholders: name / UID / role / status / email / phone come
// from the passed row (GET /users), and the projects list from GET /projects/user/:id. The mockup's "AI
// ANALYTICS ENGINE: 98% confidence / 5 min ago" is fabricated — the card is kept as a shell but shows the
// account's real **last-seen** time (last_seen_at) with no invented confidence score. The mockup's
// "department" has no backing field, so that row is dropped. Edit permissions → the multi-role editor;
// Reset password → the temporary-password reset flow (both are real, backed sub-flows).

import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Image, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getUserProjects, type UserProject } from '../../api/projects';
import { LoadingBoundary } from '../../components/LoadingBoundary';
import { getUsers, type TenantUser } from '../../api/users';
import { useT } from '../../i18n';
import {
  darkColors,
  fontFamily,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../theme/tokens';
import { formatNationalPhone } from '@cos/ui-logic';
import { shortId } from '../../lib/shortId';
import { darkScreen } from '../../theme/screenStyles';
import { initialsFirstTwo as initials } from '../../lib/initials';

function formatRole(role: string): string {
  return role
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}
/** Honest relative last-seen from the real last_seen_at timestamp (no fabricated "5 min ago"). */
function relativeLastSeen(iso: string): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return '—';
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}
/** Colour a project-status badge (ACTIVE green, COMPLETED/other muted). */
function statusTint(status: string): string {
  return status.toUpperCase() === 'ACTIVE' ? darkColors.success : darkColors.muted;
}

export default function UserProfileScreen(): React.JSX.Element {
  const t = useT();
  const router = useRouter();
  const params = useLocalSearchParams<{
    user_id: string;
    display_name: string;
    email: string;
    phone_number: string;
    role: string;
    is_active: string;
    photo_url: string;
    last_seen_at: string;
    department: string;
  }>();
  const str = (v: string | string[] | undefined): string =>
    typeof v === 'string' ? v : Array.isArray(v) ? (v[0] ?? '') : '';
  const userId = str(params.user_id);

  // Detail fields normally arrive as params (from the Users list). When we're pushed here with only an
  // id (e.g. from the permission-success screen), fetch the row so the profile still shows real data.
  const [fetched, setFetched] = useState<TenantUser | null>(null);
  useEffect(() => {
    if (userId !== '' && str(params.email) === '' && str(params.phone_number) === '') {
      getUsers()
        .then((rows) => setFetched(rows.find((u) => u.user_id === userId) ?? null))
        .catch(() => {});
    }
  }, [userId, params.email, params.phone_number]);

  const name = str(params.display_name) || fetched?.display_name || '';
  const email = str(params.email) || fetched?.email || '';
  const phone = str(params.phone_number) || fetched?.phone_number || '';
  const role = str(params.role) || fetched?.role || '';
  const photo = str(params.photo_url) || fetched?.photo_url || '';
  const lastSeen = str(params.last_seen_at) || fetched?.last_seen_at || '';
  const dept = str(params.department) || fetched?.department || '';
  const active =
    str(params.is_active) !== '' ? str(params.is_active) === 'true' : (fetched?.is_active ?? true);

  const [projects, setProjects] = useState<UserProject[] | null>(null);
  const [projErr, setProjErr] = useState(false);
  useEffect(() => {
    let on = true;
    if (userId === '') return;
    getUserProjects(userId)
      .then((p) => on && setProjects(p))
      .catch(() => on && setProjErr(true));
    return () => {
      on = false;
    };
  }, [userId]);

  return (
    <View style={darkScreen.root} testID="user-profile">
      <ScrollView style={darkScreen.fill} contentContainerStyle={styles.content}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.avatarWrap}>
            {photo !== '' ? (
              <Image source={{ uri: photo }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarText}>{initials(name)}</Text>
              </View>
            )}
            <View
              style={[
                styles.statusDot,
                { backgroundColor: active ? darkColors.success : darkColors.muted },
              ]}
            />
          </View>
          <Text style={styles.name}>{name}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.uid}>
              {t('adminUsers.uid')}: {shortId(userId)}
            </Text>
            <View style={styles.dotSep} />
            <Text style={styles.roleText}>{formatRole(role).toUpperCase()}</Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              { borderColor: `${active ? darkColors.success : darkColors.muted}4D` },
            ]}
          >
            <View
              style={[
                styles.statusBadgeDot,
                { backgroundColor: active ? darkColors.success : darkColors.muted },
              ]}
            />
            <Text
              style={[
                styles.statusBadgeText,
                { color: active ? darkColors.success : darkColors.muted },
              ]}
            >
              {active ? t('adminUsers.active') : t('adminUsers.inactive')}
            </Text>
          </View>
        </View>

        {/* AI Analytics Engine — shell only; the value is the real last-seen, no fabricated confidence. */}
        <View style={styles.aiCard}>
          <View style={darkScreen.iconRow}>
            <MaterialIcons name="psychology" size={16} color={darkColors.cyan} />
            <Text style={darkScreen.aiTitle}>{t('userProfile.aiTitle')}</Text>
          </View>
          <Text style={styles.aiValue}>
            {t('userProfile.lastActive')}: {relativeLastSeen(lastSeen)}
          </Text>
          <Text style={styles.aiSource}>{t('userProfile.aiSource')}</Text>
        </View>

        {/* Personal information */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <MaterialIcons name="person" size={18} color={darkColors.cyan} />
            <Text style={styles.sectionTitle}>{t('userProfile.personalInfo')}</Text>
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{t('userProfile.email')}</Text>
            <Text style={styles.fieldValue}>{email !== '' ? email : '—'}</Text>
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{t('userProfile.phone')}</Text>
            <Text style={styles.fieldValue}>{phone !== '' ? formatNationalPhone(phone) : '—'}</Text>
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{t('userProfile.department')}</Text>
            <Text style={styles.fieldValue}>{dept !== '' ? dept : '—'}</Text>
          </View>
        </View>

        {/* Projects the user is a member of */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <MaterialIcons name="architecture" size={18} color={darkColors.cyan} />
            <Text style={styles.sectionTitle}>{t('userProfile.projects')}</Text>
          </View>
          <LoadingBoundary
            loading={projects === null && !projErr}
            variant="micro"
            theme="dark"
            style={styles.projectsBoundary}
          >
            {projErr || (projects?.length ?? 0) === 0 ? (
              <Text style={styles.empty}>{t('userProfile.noProjects')}</Text>
            ) : (
              projects?.map((p) => (
                <View key={p.project_id} style={styles.projectRow}>
                  <View style={styles.projectInfo}>
                    <Text style={styles.projectName} numberOfLines={1}>
                      {p.project_name}
                    </Text>
                    <Text style={styles.projectCode}>
                      {t('userProfile.projectCode')}: {p.project_code}
                    </Text>
                  </View>
                  <View style={[styles.projectBadge, { borderColor: `${statusTint(p.status)}66` }]}>
                    <Text style={[styles.projectBadgeText, { color: statusTint(p.status) }]}>
                      {p.status.toUpperCase()}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </LoadingBoundary>
        </View>
      </ScrollView>

      {/* Footer actions (mockup): Edit permissions → multi-role editor, Reset password → reset flow. */}
      <View style={darkScreen.footer}>
        <Pressable
          style={darkScreen.primaryBtn}
          onPress={() =>
            router.push({
              pathname: '/edit-permission',
              params: { user_id: userId, display_name: name },
            })
          }
          testID="profile-edit-permissions"
          accessibilityRole="button"
        >
          <MaterialIcons name="admin-panel-settings" size={20} color={darkColors.onPrimary} />
          <Text style={styles.primaryText}>{t('adminUsers.sheetEdit')}</Text>
        </Pressable>
        <Pressable
          style={styles.secondaryBtn}
          onPress={() =>
            router.push({
              pathname: '/reset-password',
              params: {
                user_id: userId,
                display_name: name,
                email,
                role,
                photo_url: photo,
                is_active: String(active),
              },
            })
          }
          testID="profile-reset-password"
          accessibilityRole="button"
        >
          <MaterialIcons name="lock-reset" size={20} color={darkColors.text} />
          <Text style={styles.secondaryText}>{t('adminUsers.sheetReset')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.md, gap: spacing.md },

  hero: {
    alignItems: 'center',
    backgroundColor: darkColors.surface,
    borderWidth: 1,
    borderColor: darkColors.border,
    borderRadius: radius.xl,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  avatarWrap: { width: 96, height: 96, marginBottom: spacing.sm },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: radius.xl,
    borderWidth: 2,
    borderColor: darkColors.cyan,
  },
  avatarFallback: {
    backgroundColor: darkColors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: darkColors.text, fontFamily: fontFamily.bold, fontSize: 32 },
  statusDot: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
    borderColor: darkColors.surface,
  },
  name: {
    fontFamily: fontFamily.bold,
    fontSize: typography.hero.fontSize,
    color: darkColors.text,
    textAlign: 'center',
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  uid: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: darkColors.muted,
  },
  dotSep: { width: 3, height: 3, borderRadius: radius.sm, backgroundColor: darkColors.muted },
  roleText: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    letterSpacing: 1,
    color: darkColors.cyan,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.xl,
    borderWidth: 1,
  },
  statusBadgeDot: { width: 6, height: 6, borderRadius: 3 },
  statusBadgeText: { fontFamily: fontFamily.semibold, fontSize: typography.label.fontSize },

  aiCard: {
    backgroundColor: `${darkColors.cyan}0D`,
    borderLeftWidth: 4,
    borderLeftColor: darkColors.cyan,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 2,
  },
  aiValue: {
    fontFamily: fontFamily.bold,
    fontSize: typography.title.fontSize,
    color: darkColors.text,
    marginTop: 2,
  },
  aiSource: { fontFamily: fontFamily.regular, fontSize: 11, color: darkColors.muted },

  section: {
    backgroundColor: darkColors.surface,
    borderWidth: 1,
    borderColor: darkColors.border,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.sm,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: darkColors.border,
    paddingBottom: spacing.xs,
  },
  sectionTitle: {
    fontFamily: fontFamily.bold,
    fontSize: typography.label.fontSize,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: darkColors.text,
  },
  field: { gap: 2 },
  fieldLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: darkColors.muted,
  },
  fieldValue: {
    fontFamily: fontFamily.semibold,
    fontSize: typography.body.fontSize,
    color: darkColors.text,
  },
  empty: {
    fontFamily: fontFamily.regular,
    fontSize: typography.caption.fontSize,
    color: darkColors.muted,
  },
  projectsBoundary: { gap: spacing.sm },
  projectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    backgroundColor: darkColors.elevated,
    borderLeftWidth: 2,
    borderLeftColor: darkColors.primary,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  projectInfo: { flex: 1, minWidth: 0 },
  projectName: {
    fontFamily: fontFamily.semibold,
    fontSize: typography.label.fontSize,
    color: darkColors.text,
  },
  projectCode: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: darkColors.muted,
    marginTop: 2,
  },
  projectBadge: {
    borderWidth: 1,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  projectBadgeText: { fontFamily: fontFamily.bold, fontSize: 10, letterSpacing: 0.5 },

  primaryText: {
    fontFamily: fontFamily.bold,
    fontSize: typography.label.fontSize,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: darkColors.onPrimary,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: touchTarget.primaryButton + 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: darkColors.border,
  },
  secondaryText: {
    fontFamily: fontFamily.bold,
    fontSize: typography.label.fontSize,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: darkColors.text,
  },
});
