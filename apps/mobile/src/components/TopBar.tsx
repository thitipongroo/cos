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

// The bar shows the CONSTRUCTION OS wordmark on EVERY screen (PO decision 2026-07-31, reverting the
// 2026-07-29 "child screens show their title in the bar" rule). Pushed child screens additionally get a
// Back arrow here and a clickable breadcrumb below the bar (components/Breadcrumb) that carries the screen
// context + navigation. A route is a "child" when it is registered below — the same set that gets a Back
// affordance and a breadcrumb; main bottom-nav tabs (see ALL_TABS) get neither.
const CHILD_ROUTES: Record<string, true> = {
  '/invite-user': true,
  '/role-permissions': true,
  '/roles-selection': true,
  '/system-integration': true,
  '/apps-services': true,
  '/user-profile': true,
  '/edit-permission': true,
  '/reset-password': true,
  '/notifications': true,
  '/notification-preferences': true,
  '/mfa-enrollment': true,
  '/material-request': true,
  '/conflict-review': true,
  '/profile': true,
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
  // Child routes get a Back arrow (+ a breadcrumb below the bar); the wordmark is shown either way.
  const showBack = !isMainTab && CHILD_ROUTES[pathname] === true;

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
          // Pushed detail routes: a Back arrow is the left anchor (the brand icon is dropped here so the
          // wordmark + the right-hand actions never crowd on the narrower child bar).
          <TouchableOpacity
            testID="topbar-back"
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            style={styles.menuButton}
            onPress={() => router.back()}
          >
            <MaterialIcons name="arrow-back" size={24} color={fg} />
          </TouchableOpacity>
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
        {/* The CONSTRUCTION OS wordmark on every screen (PO 2026-07-31); child context lives in the
            breadcrumb below the bar. */}
        <Text style={[styles.appName, { color: colors.primary }]} numberOfLines={1}>
          {t('common.appName')}
        </Text>
      </View>
      <View style={styles.actions}>
        {/* Sync-status pill (mockup 01_home_dashboard) — Tenant Admin only: its dark shell drops the
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
  menuButton: {
    minWidth: touchTarget.iconButton,
    minHeight: touchTarget.iconButton,
    marginLeft: -spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Rounded-square tile (≈26% radius) for a crisp, professional enterprise-tool look (Linear/Palantir
  // aesthetic — PO decision 2026-07-29). overflow:hidden so the dark icon art clips to the rounded corners.
  brandIcon: { width: 28, height: 28, borderRadius: 7, overflow: 'hidden' },
  appName: {
    flexShrink: 1,
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
