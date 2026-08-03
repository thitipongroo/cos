// Standard top app bar — one component, every authenticated role (§32.7 "Standard Top Bar").
//
// Lives in (app)/_layout above the tab content, so no role screen renders its own header. Brand on
// the left; notification bell + profile avatar on the right. It sits on a surface background — dark
// for the Site Engineer's dark shell, light for the field app — distinct from the content area, the
// same way the bottom nav does, and the safe-area strip above it takes the same surface colour.

import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandLogo } from './BrandLogo';
import { isChildRoute } from './Breadcrumb';
import { Avatar } from './Avatar';
import { SyncPill } from './SyncPill';
import { listNotifications, unreadCount } from '../api/notifications';
import { useUiStore } from '../store/uiStore';
import { useT } from '../i18n';
import { colors, darkColors, fontFamily, spacing, touchTarget } from '../theme/tokens';

// The bar shows one uniform CONSTRUCTION OS logo on EVERY screen (PO decision 2026-07-31): the wordmark
// logo doubles as the drawer trigger. Pushed child screens get BOTH a leading "<" back control (PO
// decision 2026-08-04, reversing the 2026-07-31 removal) and the clickable breadcrumb below the bar
// (components/Breadcrumb) — the chevron is the one-tap gesture, the breadcrumb shows depth.
export function TopBar({ variant = 'light' }: { variant?: 'light' | 'dark' }) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const t = useT();
  const openDrawer = useUiStore((s) => s.openDrawer);
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
        {/* Back control — pushed child screens only (PO 2026-08-04, restoring what 2026-07-31 removed).
            Rendered as a bare chevron "<" rather than the Material arrow, per the PO's sketch. The
            breadcrumb below the bar stays: this is the one-tap gesture, the breadcrumb shows depth and
            can jump more than one level. `isChildRoute` is the single source of "has a parent", so a
            route cannot get one without the other. */}
        {isChildRoute(pathname) ? (
          <TouchableOpacity
            testID="topbar-back"
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.back}
          >
            <MaterialIcons name="chevron-left" size={28} color={fg} />
          </TouchableOpacity>
        ) : null}
        {/* One uniform CONSTRUCTION OS logo on EVERY screen (crisp vector mark + native wordmark + tagline),
            doubling as the drawer trigger. */}
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
        {/* Sync-status pill (mockup 01_home_dashboard) — the standard sync indicator for EVERY role
            (PO decision 2026-08-04). It replaced the full-width green SyncStatusBar strip, which used
            to sit under the bar for every role except the two dark-shell dashboards.

            Wrapped in the SAME box as the two icon buttons beside it. Without the wrapper the pill was
            a bare 16dp glyph while `?` and the bell sat in 32dp boxes, so it inherited none of their
            side padding: measured on the 1080-wide frame the pill→? gap was 31px against 47px for
            ?→bell (PO 2026-08-04, "make it balanced"). It is NOT a button, so the box carries no
            press target — only the width that makes the row evenly spaced. */}
        <View style={styles.pillBox}>
          <SyncPill />
        </View>
        {/* Standard Help "?" — on every authenticated screen, beside the bell (PO decision 2026-07-29).
            There is no in-app help centre yet, so it opens an honest "coming soon" note rather than a
            fabricated help surface. */}
        <TouchableOpacity
          testID="topbar-help"
          accessibilityRole="button"
          accessibilityLabel={t('help.title')}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          style={styles.bell}
          onPress={() => Alert.alert(t('help.title'), t('help.comingSoon'))}
        >
          <MaterialIcons name="help-outline" size={22} color={fg} />
        </TouchableOpacity>
        <TouchableOpacity
          testID="notifications-bell"
          accessibilityRole="button"
          accessibilityLabel={t('home.engineer.notifications')}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
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
  // The chevron's BOX is 28 wide, not the full 44 — hitSlop (10 each side) carries it to 48, which
  // clears §32.7's 44px minimum without spending 44px of bar width on a glyph that is visually ~10.
  //
  // That width is load-bearing, not cosmetic: the bar now also carries the sync pill for every role
  // (PO 2026-08-04) and a taller brand mark. At the old 44 the brand row overflowed on child screens
  // and the pill was drawn ON TOP of the cyan "OS" — measured at 31px of overlap on the 1080-wide
  // Medium_Phone frame. Height stays 44; only the horizontal axis is contended.
  back: {
    width: 28,
    height: touchTarget.iconButton,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -spacing.sm,
  },
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
  // The action cluster is deliberately TIGHT (PO decision 2026-08-04). Same trade as the back
  // chevron: each icon's BOX is 32 wide and hitSlop carries the touch target back over §32.7's 44px
  // minimum, so the row spends ~36dp less width than 44px boxes would. That width goes to the brand,
  // which is what stops the sync pill crowding the cyan "OS" on child screens (where the back control
  // also competes for the same row). Height is untouched — only the horizontal axis is contended.
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs / 2 },
  bell: {
    minWidth: 32,
    minHeight: touchTarget.iconButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Boxes the pill like its neighbours so the three right-hand glyphs share one rhythm. No minHeight:
  // the pill is an indicator, not a tap target, and the row's height is already set by its buttons.
  //
  // 28, not the 32 the buttons use, because equal BOXES do not give equal-looking GAPS here: the
  // pill's glyph is 16dp against the bell's 24dp, so a 32dp box wraps the smaller glyph in more
  // slack. Measured on the 1080-wide frame, 32 gave 52px against 47/48px for the other two; 28
  // lands on ~46px. Tuned against a real capture, so re-measure if any of these three icon sizes
  // change.
  pillBox: { minWidth: 28, alignItems: 'center', justifyContent: 'center' },
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
