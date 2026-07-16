// Standard top app bar — one component, every authenticated role (§32.7 "Standard Top Bar").
//
// Lives in (app)/_layout above the tab content, so no role screen renders its own header. Brand on
// the left; notification bell + profile avatar on the right. It sits on a surface background — dark
// for the Site Engineer's dark shell, light for the field app — distinct from the content area, the
// same way the bottom nav does, and the safe-area strip above it takes the same surface colour.

import { useEffect, useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import appIcon from '../../assets/icon.png';
import { Avatar } from './Avatar';
import { listNotifications, unreadCount } from '../api/notifications';
import { useT } from '../i18n';
import { colors, darkColors, fontFamily, spacing, touchTarget, typography } from '../theme/tokens';

export function TopBar({ variant = 'light' }: { variant?: 'light' | 'dark' }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
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
