// NavigationDrawer — the side drawer from mockup/mobile/04_tenant_admin/05_navigation_drawer.
//
// Added ALONGSIDE the bottom tabs (PO decision 2026-07-26), not replacing them: it slides in over the
// tab content from the TopBar hamburger and its links router.push into the SAME routes the tabs mount,
// so navigation never exceeds one level (§32.7 "no navigation deeper than 3 levels").
//
// Custom slide-in (RN Animated) rather than @react-navigation/drawer: the shell is already an
// Expo-Router <Tabs> navigator, and nesting a Drawer over it would restructure the whole navigator for
// a presentational menu. It renders nothing (null) while closed, so it costs nothing until opened.
//
// Only real, mounted routes are linked. The mockup's "Equipment Logs" and "Drawing Viewer" have no
// route in this app, so they are omitted rather than linking to a dead path (no guessing).

import { useEffect, useRef } from 'react';
import { View, Text, Pressable, Animated, StyleSheet, ScrollView, BackHandler } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';
import { CosRole } from '@cos/types';
import { useUiStore } from '../store/uiStore';
import { useAuthStore } from '../store/authStore';
import { useI18n } from '../i18n';
import { Avatar } from './Avatar';
import { shortId } from '../lib/shortId';
import { BrandLogo } from './BrandLogo';
import { darkColors, fontFamily, radius, spacing, touchTarget, typography } from '../theme/tokens';

const DRAWER_WIDTH = 310;

interface NavLink {
  route: string;
  labelKey: string;
  icon: keyof typeof MaterialIcons.glyphMap;
}

// Field tools — every entry maps to a real (app)/ route.
const FIELD_TOOLS: readonly NavLink[] = [
  { route: '/projects', labelKey: 'drawer.projects', icon: 'dashboard' },
  { route: '/reports', labelKey: 'drawer.reports', icon: 'description' },
  { route: '/incidents', labelKey: 'drawer.incidents', icon: 'health-and-safety' },
  { route: '/inspections', labelKey: 'drawer.inspections', icon: 'fact-check' },
  { route: '/material-request', labelKey: 'drawer.materials', icon: 'inventory-2' },
  { route: '/deliveries', labelKey: 'drawer.deliveries', icon: 'local-shipping' },
];

/**
 * Team directory — the project crew as a contact list (mockup 04_directory).
 *
 * In the drawer rather than the bottom bar: §32.7 allows exactly four tabs and all four are
 * spoken for, and the 2026-08-08 mockups that put Directory in the bar disagree with each other
 * about what the other three are. Shown to the roles whose people are IN a project crew — the
 * field roles and the manager who staffs them.
 */
const DIRECTORY_LINK: NavLink = {
  route: '/directory',
  labelKey: 'directory.title',
  icon: 'groups',
};

// SITE_WORKER is deliberately ABSENT: the directory is that role's fourth TAB as of 2026-08-09, and
// a drawer entry beside it would be a second door onto the same screen.
/** Account settings — the signed-in user's own, on every role (mockup 05_profile). */
const SETTINGS_LINK: NavLink = {
  route: '/account-settings',
  labelKey: 'drawer.settings',
  icon: 'settings',
};

const DIRECTORY_ROLES: CosRole[] = [
  CosRole.SITE_ENGINEER,
  CosRole.SAFETY_OFFICER,
  CosRole.PROJECT_MANAGER,
];

// PO decision 2026-08-04 — the post-auth entry to the Privacy Policy. Not in the drawer mockup: the
// mockups only ever reach the policy from the login footer, which leaves a signed-in user with no
// route to it at all. PDPA §23 makes the notice a standing disclosure, so it needs a permanent home
// once the login footer is behind you. Grouped with Settings rather than Field tools — it is an
// account-level document, not a site tool.
// QM-15: the MFA-enrollment surface is a new auth flow and must be flag-gated. Mobile has no
// server-evaluated flags client yet (ADR-049 is backend-only), so this is a build-time flag read
// statically (Expo only inlines EXPO_PUBLIC_* on static access); a runtime client is a follow-up.
// Fail closed — a security surface stays hidden unless the flag is explicitly on.
export function NavigationDrawer(): React.JSX.Element | null {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useI18n();
  const open = useUiStore((s) => s.drawerOpen);
  const closeDrawer = useUiStore((s) => s.closeDrawer);
  const displayName = useAuthStore((s) => s.displayName);
  const role = useAuthStore((s) => s.role);
  const userId = useAuthStore((s) => s.userId);
  const logout = useAuthStore((s) => s.logout);

  // -DRAWER_WIDTH = off-screen left; 0 = open. Backdrop fades 0→1 in step.
  const slide = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(slide, {
      toValue: open ? 0 : -DRAWER_WIDTH,
      duration: 260,
      useNativeDriver: true,
    }).start();
    Animated.timing(fade, {
      toValue: open ? 1 : 0,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [open, slide, fade]);

  // Android hardware back closes the drawer before leaving the screen.
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeDrawer();
      return true;
    });
    return () => sub.remove();
  }, [open, closeDrawer]);

  const go = (route: string): void => {
    closeDrawer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- expo-router's typed href union
    router.push(route as any);
  };

  const onLogout = (): void => {
    closeDrawer();
    void logout();
  };

  const renderLink = (link: NavLink): React.JSX.Element => {
    const active = pathname === link.route;
    return (
      <Pressable
        key={link.route}
        testID={`drawer-link-${link.route}`}
        onPress={() => go(link.route)}
        style={[styles.navItem, active && styles.navItemActive]}
        accessibilityRole="link"
        accessibilityLabel={t(link.labelKey)}
      >
        {active ? <View style={styles.activePill} /> : null}
        <MaterialIcons
          name={link.icon}
          size={24}
          color={active ? darkColors.primary : darkColors.muted}
        />
        <Text style={[styles.navLabel, active && styles.navLabelActive]}>{t(link.labelKey)}</Text>
      </Pressable>
    );
  };

  // Nothing in the tree while closed — no backdrop intercepting touches, no cost.
  if (!open) return null;

  return (
    <View style={[StyleSheet.absoluteFill, styles.overlay]} testID="navigation-drawer">
      <Animated.View style={[styles.backdrop, { opacity: fade }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={closeDrawer}
          testID="drawer-backdrop"
          accessibilityLabel={t('drawer.close')}
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.panel,
          { paddingTop: insets.top + spacing.md, transform: [{ translateX: slide }] },
        ]}
      >
        {/* Brand — the same <BrandLogo /> the top bar uses, tagline included (product-owner
            decision 2026-08-06). This row previously hand-rolled the mark from `favicon.png` plus a
            <Text> wordmark, which meant the drawer showed the brand name WITHOUT the tagline while
            the bar directly above it showed both. DESIGN.md §1.2 makes the tagline part of the
            brand identity, so one component now renders it everywhere and the drawer cannot drift
            from the bar again. */}
        <View style={styles.brandRow}>
          <BrandLogo variant="dark" height={26} />
        </View>

        {/* Profile header. It opens NOTHING — THIS PANEL IS THE PROFILE (product-owner decision
            2026-08-09). The `/profile` route was deleted with that ruling; every account control it
            held now renders below the navigation links as <AccountSettings />. */}
        <View testID="drawer-profile-card" style={styles.profileCard}>
          <View style={styles.profileRow}>
            <Avatar variant="dark" />
            <View style={styles.flex1}>
              <Text style={styles.profileName} numberOfLines={1}>
                {displayName ?? t('drawer.member')}
              </Text>
              <Text style={styles.profileRole} numberOfLines={1}>
                {role ?? ''}
              </Text>
              {/* `ID: <SHORT>` in a monospaced face, as the mockup draws it. The mockup's own
                  "SW-9281" is an employee-code scheme this product does not mint — `user_id` is a
                  UUID — so shortId() renders the real one at a length a person can read out (PO
                  2026-08-09: "use a short UUID for now"). It is a display aid, never a key. */}
              <Text testID="drawer-user-id" style={styles.profileId} numberOfLines={1}>
                {t('profile.main.userId')}: {shortId(userId)}
              </Text>
            </View>
          </View>
          <View style={styles.statusRow}>
            <MaterialIcons name="cloud-done" size={16} color={darkColors.success} />
            <Text style={styles.statusText}>{t('drawer.online')}</Text>
          </View>
        </View>

        {/* Field tools */}
        <ScrollView style={styles.flex1} contentContainerStyle={styles.navList}>
          <Text style={styles.navSection}>{t('drawer.fieldTools')}</Text>
          {role && DIRECTORY_ROLES.includes(role) ? renderLink(DIRECTORY_LINK) : null}
          {FIELD_TOOLS.map(renderLink)}
          {/* Account settings — ONE ROW, not the sections themselves (PO decision 2026-08-09). They
              rendered inline here for one build and made the panel carry both navigation and
              settings, with ~900px of a 2400px screen below the fold. The mockups split them the
              same way: the tenant-admin drawer drawing is Field Tools + Settings + Logout. */}
          <View style={styles.divider} />
          {renderLink(SETTINGS_LINK)}
        </ScrollView>

        {/* Logout */}
        <Pressable
          testID="drawer-logout"
          onPress={onLogout}
          style={[styles.logout, { marginBottom: insets.bottom + spacing.sm }]}
          accessibilityRole="button"
          accessibilityLabel={t('drawer.logout')}
        >
          <MaterialIcons name="logout" size={22} color={darkColors.danger} />
          <Text style={styles.logoutText}>{t('drawer.logout')}</Text>
          <MaterialIcons name="chevron-right" size={20} color={darkColors.danger} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Lift the whole overlay above the bottom tab bar: on Android the tab bar carries its own
  // elevation, so a 0-elevation sibling drawer renders BEHIND it and the panel's bottom (the Logout
  // button) gets hidden. High elevation + zIndex puts the drawer above it on both platforms.
  overlay: { elevation: 32, zIndex: 100 },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  panel: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: darkColors.surface,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  flex1: { flex: 1 },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  // The favicon is a transparent dark-navy hexagon mark, so it needs no plate — it sits on the drawer
  // surface directly.
  profileCard: {
    backgroundColor: darkColors.elevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: darkColors.border,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  profileName: {
    fontFamily: fontFamily.semibold,
    fontSize: typography.body.fontSize,
    color: darkColors.text,
  },
  profileId: {
    fontSize: typography.caption.fontSize,
    // Monospaced, as the mockup sets it: an id is read character by character, and a proportional
    // face makes 0/O and 1/l ambiguous exactly where it matters.
    fontFamily: 'monospace',
    color: darkColors.muted,
  },
  profileRole: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    letterSpacing: 0.5,
    color: darkColors.muted,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: darkColors.bg,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  statusText: { fontFamily: fontFamily.medium, fontSize: 11, color: darkColors.muted },
  navList: { paddingBottom: spacing.md, gap: 2 },
  navSection: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    letterSpacing: 1.5,
    color: darkColors.muted,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: touchTarget.listItem,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  navItemActive: { backgroundColor: `${darkColors.primary}1A` },
  activePill: {
    position: 'absolute',
    left: -spacing.lg,
    width: 4,
    height: 24,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
    backgroundColor: darkColors.primary,
  },
  navLabel: {
    fontFamily: fontFamily.medium,
    fontSize: typography.body.fontSize,
    color: darkColors.muted,
  },
  navLabelActive: { fontFamily: fontFamily.bold, color: darkColors.primary },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: darkColors.border,
    marginVertical: spacing.sm,
  },
  logout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: touchTarget.primaryButton,
    paddingHorizontal: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: `${darkColors.danger}1A`,
  },
  logoutText: {
    flex: 1,
    fontFamily: fontFamily.bold,
    fontSize: typography.body.fontSize,
    color: darkColors.danger,
    textTransform: 'uppercase',
  },
});
