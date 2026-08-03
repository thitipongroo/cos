// Breadcrumb bar — rendered globally under the TopBar in (app)/_layout for pushed child screens (PO
// decision 2026-07-31, which reverts the 2026-07-29 "child screens show their title in the bar" rule:
// the bar shows the CONSTRUCTION OS wordmark on every screen, and this breadcrumb carries the screen
// context + navigation). PO 2026-08-04 additionally restored a Back control in the TopBar — the two
// coexist: Back is the one-tap gesture, the breadcrumb still shows depth and can jump several levels.
// Each crumb except the last is tappable and routes to its section.
//
// Terminal success screens (permission-success, reset-password-success/-email-success) are reached via
// router.replace and are deliberately absent from the map — they show the wordmark with no breadcrumb.

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { usePathname, useRouter, type Href } from 'expo-router';
import { useT } from '../i18n';
import { colors, darkColors, fontFamily, spacing } from '../theme/tokens';

interface Crumb {
  /** i18n key for the crumb label. */
  key: string;
  /** Route to navigate to when tapped; omitted for the current (last) crumb. */
  href?: Href;
}

// route → parent chain (section → … → current). The last entry is the current screen (not tappable);
// the section labels use `breadcrumb.*` (added to i18n) or reuse an existing tab/title key.
const BREADCRUMB_MAP: Record<string, Crumb[]> = {
  // User management (TENANT_ADMIN → the Users tab)
  '/invite-user': [
    { key: 'breadcrumb.userManagement', href: '/users' },
    { key: 'inviteUser.title' },
  ],
  '/role-permissions': [
    { key: 'breadcrumb.userManagement', href: '/users' },
    { key: 'rolePermissions.title' },
  ],
  '/roles-selection': [
    { key: 'breadcrumb.userManagement', href: '/users' },
    { key: 'rolesSelection.title' },
  ],
  '/user-profile': [
    { key: 'breadcrumb.userManagement', href: '/users' },
    { key: 'userProfile.title' },
  ],
  '/edit-permission': [
    { key: 'breadcrumb.userManagement', href: '/users' },
    { key: 'editPermission.title' },
  ],
  '/reset-password': [
    { key: 'breadcrumb.userManagement', href: '/users' },
    { key: 'resetPassword.title' },
  ],
  // Home FAB / Quick-Add flows
  '/system-integration': [
    { key: 'nav.tabs.home', href: '/home' },
    { key: 'systemIntegration.title' },
  ],
  '/apps-services': [{ key: 'nav.tabs.home', href: '/home' }, { key: 'appsServices.title' }],
  '/material-request': [{ key: 'nav.tabs.home', href: '/home' }, { key: 'materialRequest.title' }],
  '/mfa-enrollment': [{ key: 'nav.tabs.home', href: '/home' }, { key: 'mfa.enroll.title' }],
  // Notifications
  '/notifications': [{ key: 'nav.tabs.home', href: '/home' }, { key: 'notifications.title' }],
  '/notification-preferences': [
    { key: 'notifications.title', href: '/notifications' },
    { key: 'notifications.preferences.title' },
  ],
  // Alerts
  '/conflict-review': [
    { key: 'nav.tabs.alerts', href: '/sync-queue' },
    { key: 'sync.conflictReview.title' },
  ],
  // Account
  '/profile': [{ key: 'nav.tabs.home', href: '/home' }, { key: 'profile.main.title' }],
  // Privacy Policy, post-auth. Entered from the drawer, which is reachable from any tab, so Home is
  // the parent crumb — the drawer itself has no route to name.
  '/privacy-policy': [{ key: 'nav.tabs.home', href: '/home' }, { key: 'privacy.policy.title' }],
  // Transparency Portal (PO 2026-08-04) — entered from the Data Collection card on the policy, so
  // the policy is the parent crumb. The seven category screens hang off the portal hub, giving
  // Policy → Portal → category.
  '/transparency': [
    { key: 'privacy.policy.title', href: '/privacy-policy' },
    { key: 'transparency.portal.title' },
  ],
  '/transparency-identity': [
    { key: 'transparency.portal.title', href: '/transparency' },
    { key: 'transparency.identity.title' },
  ],
  '/transparency-location': [
    { key: 'transparency.portal.title', href: '/transparency' },
    { key: 'transparency.location.title' },
  ],
  '/transparency-logs': [
    { key: 'transparency.portal.title', href: '/transparency' },
    { key: 'transparency.logs.title' },
  ],
  '/transparency-manual': [
    { key: 'transparency.portal.title', href: '/transparency' },
    { key: 'transparency.manual.title' },
  ],
  '/transparency-iot': [
    { key: 'transparency.portal.title', href: '/transparency' },
    { key: 'transparency.iot.title' },
  ],
  '/transparency-ai': [
    { key: 'transparency.portal.title', href: '/transparency' },
    { key: 'transparency.ai.title' },
  ],
  '/transparency-delete': [
    { key: 'transparency.portal.title', href: '/transparency' },
    { key: 'transparency.delete.title' },
  ],
};

/**
 * True when `pathname` is a pushed child screen — i.e. it has a breadcrumb chain.
 *
 * The TopBar uses this to decide whether to render its Back control, so "has a parent" is defined in
 * exactly one place: adding a route to BREADCRUMB_MAP gives it both a breadcrumb and a Back button,
 * and the two can never disagree.
 */
export function isChildRoute(pathname: string): boolean {
  const crumbs = BREADCRUMB_MAP[pathname];
  return !!crumbs && crumbs.length > 0;
}

export function Breadcrumb({ variant = 'light' }: { variant?: 'light' | 'dark' }) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useT();
  const crumbs = BREADCRUMB_MAP[pathname];
  if (!crumbs || crumbs.length === 0) return null;

  const dark = variant === 'dark';
  const muted = dark ? darkColors.muted : colors.textSecondary;
  const linkColor = dark ? darkColors.cyan : colors.primary;
  const currentColor = dark ? darkColors.text : colors.textPrimary;

  return (
    <View
      testID="breadcrumb"
      style={[styles.bar, dark ? styles.barDark : styles.barLight]}
      accessibilityRole="header"
    >
      {crumbs.map((c, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <View key={`${c.key}-${i}`} style={styles.row}>
            {i > 0 ? (
              <MaterialIcons name="chevron-right" size={14} color={muted} style={styles.sep} />
            ) : null}
            {c.href != null && !isLast ? (
              <TouchableOpacity
                onPress={() => router.push(c.href!)}
                testID={`crumb-${i}`}
                accessibilityRole="link"
              >
                <Text style={[styles.crumb, { color: linkColor }]} numberOfLines={1}>
                  {t(c.key).toUpperCase()}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text
                style={[styles.crumb, styles.current, { color: currentColor }]}
                numberOfLines={1}
              >
                {t(c.key).toUpperCase()}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
  },
  barDark: { backgroundColor: darkColors.bg, borderBottomColor: darkColors.border },
  barLight: { backgroundColor: colors.surface, borderBottomColor: colors.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center' },
  sep: { marginHorizontal: 2 },
  crumb: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    letterSpacing: 0.8,
  },
  current: { fontFamily: fontFamily.bold },
});
