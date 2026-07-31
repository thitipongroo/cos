// Standard top app bar — one component, every authenticated role (§32.7 "Standard Top Bar").
//
// Lives in (app)/_layout above the tab content, so no role screen renders its own header. Brand on
// the left; notification bell + profile avatar on the right. It sits on a surface background — dark
// for the Site Engineer's dark shell, light for the field app — distinct from the content area, the
// same way the bottom nav does, and the safe-area strip above it takes the same surface colour.

import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandLogo } from './BrandLogo';
import { Avatar } from './Avatar';
import { SyncPill } from './SyncPill';
import { listNotifications, unreadCount } from '../api/notifications';
import { useUiStore } from '../store/uiStore';
import { useAuthStore } from '../store/authStore';
import { CosRole } from '@cos/types';
import { useT } from '../i18n';
import { colors, darkColors, fontFamily, spacing, touchTarget } from '../theme/tokens';

// The bar shows one uniform CONSTRUCTION OS logo on EVERY screen (PO decisions 2026-07-31): the wordmark
// logo doubles as the drawer trigger, and pushed child screens navigate via the clickable breadcrumb below
// the bar (components/Breadcrumb) — there is no Back arrow.
export function TopBar({ variant = 'light' }: { variant?: 'light' | 'dark' }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const openDrawer = useUiStore((s) => s.openDrawer);
  const role = useAuthStore((s) => s.role);
  const [unread, setUnread] = useState(0);
  const dark = variant === 'dark';

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
        {/* One uniform CONSTRUCTION OS logo on EVERY screen (crisp vector mark + native wordmark + tagline),
            doubling as the drawer trigger. There is no Back arrow — pushed child screens navigate via the
            clickable breadcrumb below the bar (PO 2026-07-31). */}
        <TouchableOpacity
          testID="drawer-menu-button"
          accessibilityRole="button"
          accessibilityLabel={t('drawer.open')}
          onPress={openDrawer}
        >
          <View testID="brand-logo">
            <BrandLogo variant={variant} height={26} />
          </View>
        </TouchableOpacity>
      </View>
      <View style={styles.actions}>
        {/* Sync-status pill (mockup 01_home_dashboard) — Tenant Admin only (its dark shell drops the
            full-width SyncStatusBar, so the pill is this role's sync indicator). */}
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
  // flex:1 + minWidth:0 keeps the logo left-aligned and lets it shrink rather than pushing the right-hand
  // actions (sync pill / help / bell / avatar) off-screen.
  brand: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 },
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
