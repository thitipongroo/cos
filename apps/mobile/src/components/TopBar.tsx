// Standard top app bar — one component, every authenticated role (§32.7 "Standard Top Bar").
//
// Lives in (app)/_layout above the tab content, so no role screen renders its own header. Brand on
// the left; notification bell + profile avatar on the right. It sits on a surface background — dark
// for the Site Engineer's dark shell, light for the field app — distinct from the content area, the
// same way the bottom nav does, and the safe-area strip above it takes the same surface colour.

import { useEffect, useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import appIcon from '../../assets/icon.png';
import { Avatar } from './Avatar';
import { SyncPill } from './SyncPill';
import { ALL_TABS } from './MobileNav';
import { listNotifications, unreadCount } from '../api/notifications';
import { useUiStore } from '../store/uiStore';
import { useAuthStore } from '../store/authStore';
import { CosRole } from '@cos/types';
import { useT } from '../i18n';
import { colors, darkColors, fontFamily, spacing, touchTarget, typography } from '../theme/tokens';

// Pushed child screens (not a bottom-nav tab of the current role) show their own title + a Back arrow
// in the bar instead of the CONSTRUCTION OS wordmark (PO decision 2026-07-29). The wordmark is reserved
// for a role's top-level destinations — its bottom-nav tabs (see ALL_TABS). Every other in-app route is
// a child: it carries the screen name here (its in-content heading was removed) and a Back affordance.
// Titles come from each screen's existing i18n key.
const CHILD_TITLE_KEY: Record<string, string> = {
  '/invite-user': 'inviteUser.title',
  '/role-permissions': 'rolePermissions.title',
  '/roles-selection': 'rolesSelection.title',
  '/notifications': 'notifications.title',
  '/notification-preferences': 'notifications.preferences.title',
  '/mfa-enrollment': 'mfa.enroll.title',
  '/material-request': 'materialRequest.title',
  '/conflict-review': 'sync.conflictReview.title',
  '/profile': 'profile.main.title',
};

export function TopBar({ variant = 'light' }: { variant?: 'light' | 'dark' }) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const t = useT();
  const openDrawer = useUiStore((s) => s.openDrawer);
  const role = useAuthStore((s) => s.role);
  const [unread, setUnread] = useState(0);
  const dark = variant === 'dark';

  // A route is "main" (→ wordmark, drawer trigger) when it is one of the current role's bottom-nav tabs;
  // anything else that has a registered title is a "child" (→ screen title + Back arrow). Unknown
  // non-tab routes fall back to the wordmark rather than an empty bar.
  const routeName = pathname.replace(/^\/+/, '');
  const isMainTab =
    routeName === '' ||
    ALL_TABS.some((tab) => tab.name === routeName && role != null && tab.roles.includes(role));
  const childTitleKey = isMainTab ? undefined : CHILD_TITLE_KEY[pathname];
  const showBack = childTitleKey != null;
  const screenTitle = childTitleKey != null ? t(childTitleKey) : null;

  useEffect(() => {
    listNotifications()
      .then((res) => setUnread(unreadCount(res.rows)))
      .catch(() => {
        /* offline — leave the badge as-is rather than claiming zero */
      });
  }, []);

  const fg = dark ? darkColors.text : colors.textPrimary;

  return (
    <View
      style={[
        styles.bar,
        { paddingTop: insets.top + spacing.xs },
        dark ? styles.barDark : styles.barLight,
      ]}
    >
      <View style={styles.brand}>
        {showBack ? (
          // Pushed detail routes keep a Back affordance; the brand icon rides alongside it.
          <>
            <TouchableOpacity
              testID="topbar-back"
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
              style={styles.menuButton}
              onPress={() => router.back()}
            >
              <MaterialIcons name="arrow-back" size={24} color={fg} />
            </TouchableOpacity>
            <Image
              testID="brand-logo"
              source={appIcon}
              style={styles.brandIcon}
              resizeMode="contain"
              accessibilityLabel={t('common.appName')}
            />
          </>
        ) : (
          // No hamburger — the brand icon itself is the drawer trigger (§32.7 Standard Top Bar:
          // Left = "App icon + CONSTRUCTION OS wordmark"; the icon carries the menu affordance).
          <TouchableOpacity
            testID="drawer-menu-button"
            accessibilityRole="button"
            accessibilityLabel={t('drawer.open')}
            style={styles.menuButton}
            onPress={openDrawer}
          >
            <Image
              testID="brand-logo"
              source={appIcon}
              style={styles.brandIcon}
              resizeMode="contain"
            />
          </TouchableOpacity>
        )}
        {showBack ? (
          // Child screen: its own name (the in-content heading was removed). Truncates with "…" so a
          // long title never crowds the sync pill / actions on the right (PO decision 2026-07-29 §3).
          <Text style={[styles.screenTitle, { color: fg }]} numberOfLines={1} ellipsizeMode="tail">
            {screenTitle}
          </Text>
        ) : (
          <Text style={[styles.appName, { color: colors.primary }]} numberOfLines={1}>
            {t('common.appName')}
          </Text>
        )}
      </View>
      <View style={styles.actions}>
        {/* Sync-status pill (mockup 01_home_admin) — Tenant Admin only: its dark shell drops the
            full-width SyncStatusBar, so the pill is this role's sync indicator. */}
        {role === CosRole.TENANT_ADMIN ? <SyncPill /> : null}
        {/* Standard Help "?" — on every authenticated screen, beside the bell (PO decision 2026-07-29).
            There is no in-app help centre yet, so it opens an honest "coming soon" note rather than a
            fabricated help surface. */}
        <TouchableOpacity
          testID="topbar-help"
          accessibilityRole="button"
          accessibilityLabel={t('help.title')}
          style={styles.bell}
          onPress={() => Alert.alert(t('help.title'), t('help.comingSoon'))}
        >
          <MaterialIcons name="help-outline" size={22} color={fg} />
        </TouchableOpacity>
        <TouchableOpacity
          testID="notifications-bell"
          accessibilityRole="button"
          accessibilityLabel={t('home.engineer.notifications')}
          style={styles.bell}
          onPress={() => router.push('/notifications')}
        >
          <MaterialIcons name="notifications-none" size={24} color={fg} />
          {unread > 0 ? (
            <View testID="bell-badge" style={styles.bellBadge}>
              <Text style={styles.bellBadgeText}>{unread > 9 ? '9+' : unread}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
        <Avatar testID="profile-avatar" variant={variant} onPress={() => router.push('/profile')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
  },
  barDark: { backgroundColor: darkColors.surface, borderBottomColor: darkColors.border },
  barLight: { backgroundColor: colors.surface, borderBottomColor: colors.textSecondary },
  // flex:1 + minWidth:0 lets a long screen title shrink and ellipsize instead of pushing the right-hand
  // actions (sync pill / help / bell / avatar) off-screen.
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flex: 1, minWidth: 0 },
  screenTitle: {
    flexShrink: 1,
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.bold,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  menuButton: {
    minWidth: touchTarget.iconButton,
    minHeight: touchTarget.iconButton,
    marginLeft: -spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandIcon: { width: 28, height: 28 },
  appName: {
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.bold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  bell: {
    minWidth: touchTarget.iconButton,
    minHeight: touchTarget.iconButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: darkColors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  bellBadgeText: { color: darkColors.text, fontSize: 9, fontFamily: fontFamily.bold },
});
