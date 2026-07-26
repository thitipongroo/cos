// Standard top app bar — one component, every authenticated role (§32.7 "Standard Top Bar").
//
// Lives in (app)/_layout above the tab content, so no role screen renders its own header. Brand on
// the left; notification bell + profile avatar on the right. It sits on a surface background — dark
// for the Site Engineer's dark shell, light for the field app — distinct from the content area, the
// same way the bottom nav does, and the safe-area strip above it takes the same surface colour.

import { useEffect, useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import appIcon from '../../assets/icon.png';
import { Avatar } from './Avatar';
import { listNotifications, unreadCount } from '../api/notifications';
import { useUiStore } from '../store/uiStore';
import { useT } from '../i18n';
import { colors, darkColors, fontFamily, spacing, touchTarget, typography } from '../theme/tokens';

// Pushed sub-screens reached from the drawer (settings-style detail routes) show a Back arrow instead
// of the drawer hamburger — a hamburger to re-open the drawer you just came from is the wrong
// affordance, and their mockups show a back arrow (e.g. 04_tenant_admin/01 header).
const BACK_ROUTES = new Set(['/notification-preferences', '/mfa-enrollment']);

export function TopBar({ variant = 'light' }: { variant?: 'light' | 'dark' }) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const t = useT();
  const openDrawer = useUiStore((s) => s.openDrawer);
  const [unread, setUnread] = useState(0);
  const dark = variant === 'dark';
  const showBack = BACK_ROUTES.has(pathname);

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
          <TouchableOpacity
            testID="drawer-menu-button"
            accessibilityRole="button"
            accessibilityLabel={t('drawer.open')}
            style={styles.menuButton}
            onPress={openDrawer}
          >
            <MaterialIcons name="menu" size={24} color={fg} />
          </TouchableOpacity>
        )}
        <Image
          testID="brand-logo"
          source={appIcon}
          style={styles.brandIcon}
          resizeMode="contain"
          accessibilityLabel={t('common.appName')}
        />
        <Text style={[styles.appName, { color: colors.primary }]}>{t('common.appName')}</Text>
      </View>
      <View style={styles.actions}>
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
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
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
