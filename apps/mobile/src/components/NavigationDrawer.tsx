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
//
// WHAT IS IN THE LIST IS NOW PER ROLE (PO decision 2026-08-10): a short section every role gets, and
// the section above it is that role's own. The table lives in `lib/drawerLinks.ts` — this component
// renders it and decides nothing about its contents. The shared rows were Settings + Support Centre
// on 2026-08-10 and are Settings + Privacy Policy as of 2026-08-17; see that file for both moves.
//
// ── THE BODY HAS TWO SHAPES SINCE 2026-09-10 ───────────────────────────────────────────────────
//
// Eleven roles get the FLAT list described above: one "Field tools" heading, seven rows, the rest
// behind "More". CRM_SALES_MANAGER gets a GROUPED menu — four titled groups, badges on two rows and
// six rows whose screens are not built — because its drawing
// (mockup/mobile/12_crm_manager/05_profile/02_crm_navigation_drawer) is that shape and a flat
// seven-row list cannot express it. `drawerGroupsFor(role)` decides which, returning `null` for the
// eleven; the four rules applied to that drawing, and what each cost it, are recorded beside the
// table in `lib/drawerLinks.ts` rather than here.
//
// THE PROFILE BLOCK IS UNTOUCHED BY THAT SPLIT. It is the project's standard (§32.7 "Drawer Profile
// Block") and has no per-role variant, so the drawing's "Pipeline: ฿450M Target" line under the
// position is NOT added: it is a per-role figure inside the one block that has no per-role form.
//
// THERE IS NO OPERATING-REGION BAR, which the drawing heads the menu with. No schema in this
// product holds a region for a user, so the bar could only print a constant and its switch button
// could only do nothing. See `lib/drawerLinks.ts` rule 4.

import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Animated, StyleSheet, ScrollView, BackHandler } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';
import {
  drawerGroupsFor,
  drawerSectionFor,
  SHARED_LINKS,
  type DrawerLink,
  type DrawerRow,
} from '../lib/drawerLinks';
import { getMe } from '../api/users';
import { listLeads, listOpportunities } from '../api/crm';
import { useComingSoon } from './useComingSoon';
import { useUiStore } from '../store/uiStore';
import { useAuthStore } from '../store/authStore';
import { useI18n } from '../i18n';
import { ProfileBlock } from './ProfileBlock';
import { BrandLogo } from './BrandLogo';
import { darkColors, fontFamily, radius, spacing, touchTarget, typography } from '../theme/tokens';
import { darkScreen } from '../theme/screenStyles';

const DRAWER_WIDTH = 310;

// THE TWO COMMENTS THAT STOOD HERE UNTIL 2026-08-17 DESCRIBED CONSTANTS THAT NO LONGER EXISTED, and
// one of them was load-bearing. Commit 44d46a40 (2026-08-09) deleted `PRIVACY_LINK` and
// `MFA_ENROLLMENT_ENABLED` from this file but left both justifications behind, so the file went on
// explaining a Privacy Policy row it did not render and a feature flag it did not read.
//   - The MFA note moved with its code: the flag now lives in AccountSettings.tsx, which owns that
//     row since the account split. Nothing was lost.
//   - The Privacy Policy row did NOT move. It survived on the AccountSettings card until commit
//     7f65cc59 (2026-08-14) removed that copy too, on the stated grounds that "it is a drawer row
//     now" — false since 08-09. For three days the app had no way at all to open the notice PDPA §23
//     requires to remain available, and no way to reach the Transparency Portal behind it.
// The row is back, in `SHARED_LINKS` where spec §32.7 (Bottom Navigation) puts it, and its reasoning
// now lives beside the data in lib/drawerLinks.ts rather than beside the component that renders it —
// which is what let the two drift apart in the first place.
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
  const { visible, overflow } = drawerSectionFor(role);
  const groups = drawerGroupsFor(role);
  const soon = useComingSoon();
  // Collapsed on open, every time: the drawer is a fresh glance, not a place with remembered state.
  const [expanded, setExpanded] = useState(false);

  /**
   * The two badge counts a grouped drawer carries, or null until they arrive.
   *
   * REAL, both of them: new leads and open opportunities are counted from the same two endpoints
   * their screens read. Fetched once when a grouped drawer first opens — the same shape as `me`
   * below, and for the same reason: a closed drawer renders nothing, so a request on mount would be
   * for a panel nobody has asked for. A FAILURE LEAVES THE BADGES OFF ENTIRELY rather than showing a
   * zero, because "no new leads" and "could not ask" are different answers and only one of them is
   * a number.
   */
  const [counts, setCounts] = useState<{ newLeads: number; openDeals: number } | null>(null);

  useEffect(() => {
    if (!open || groups === null || counts !== null) return;
    let cancelled = false;
    Promise.all([listLeads(), listOpportunities()])
      .then(([leads, opportunities]) => {
        if (!cancelled) {
          setCounts({
            newLeads: leads.filter((l) => l.status === 'NEW').length,
            openDeals: opportunities.filter((o) => o.status === 'OPEN').length,
          });
        }
      })
      .catch(() => {
        /* offline — the rows draw without badges, which is what they did before this existed */
      });
    return () => {
      cancelled = true;
    };
  }, [open, groups, counts]);

  /**
   * The two fields of the profile zone that the session token does not carry.
   *
   * `GET /users/me` returns both: `employee_code` (the employer's own id, null for office roles)
   * and `mfa_enabled`. Fetched once when the drawer first opens rather than on mount — the drawer
   * renders nothing while closed, so a request on mount would be for a panel nobody has asked for.
   * A failure leaves both null and the zone falls back to the short UUID and no MFA line, which is
   * what it drew before this existed.
   */
  const [me, setMe] = useState<{
    employeeCode: string | null;
    mfaEnabled: boolean;
    position: string | null;
  } | null>(null);

  useEffect(() => {
    if (!open || me !== null) return;
    let cancelled = false;
    getMe()
      .then((row) => {
        if (!cancelled) {
          setMe({
            employeeCode: row.employee_code ?? null,
            mfaEnabled: row.mfa_enabled === true,
            // `?? null` collapses BOTH absences into one: an older deployment omits the key, a
            // current one returns null until someone sets a title. The block draws nothing for
            // either, and the difference is not one a reader could act on.
            position: row.position ?? null,
          });
        }
      })
      .catch(() => {
        /* offline — the zone keeps the short UUID and says nothing about a factor it cannot see */
      });
    return () => {
      cancelled = true;
    };
  }, [open, me]);

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

  const renderLink = (link: DrawerLink): React.JSX.Element => {
    // Matched on `route`, navigated by `href ?? route`: usePathname() never reports the group, so a
    // row that must name its group to be unambiguous still compares against the bare path.
    const active = pathname === link.route;
    return (
      <Pressable
        key={link.route}
        testID={`drawer-link-${link.route}`}
        onPress={() => go(link.href ?? link.route)}
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

  /**
   * One row of a grouped menu.
   *
   * Differs from `renderLink` in exactly three ways, and shares everything else: it can carry a
   * trailing badge, it can be a row whose screen does not exist, and it never folds. A row that does
   * not exist SAYS SO on tap and pushes nothing — the alternative, a row that navigates nowhere,
   * reads as a broken app rather than an unbuilt screen.
   */
  const renderRow = (row: DrawerRow): React.JSX.Element => {
    const active = pathname === row.route;
    const badgeText =
      row.badge === undefined
        ? null
        : 'drawn' in row.badge
          ? t(row.badge.labelKey, { count: String(row.badge.drawn) })
          : counts === null
            ? null
            : t(row.badge.labelKey, { count: String(counts[row.badge.count]) });
    return (
      <Pressable
        key={row.route}
        testID={`drawer-link-${row.route}`}
        onPress={() => (row.comingSoon === true ? soon(row.labelKey) : go(row.href ?? row.route))}
        style={[styles.navItem, active && styles.navItemActive]}
        accessibilityRole={row.comingSoon === true ? 'button' : 'link'}
        accessibilityLabel={t(row.labelKey)}
      >
        {active ? <View style={styles.activePill} /> : null}
        <MaterialIcons
          name={row.icon}
          size={24}
          color={active ? darkColors.primary : darkColors.muted}
        />
        {/* ONE LINE. A wrapped label makes a two-line row among one-line rows, which puts its
            badge and chevron out of alignment with every other row in the group — and a menu's
            rows are read as a column, so one tall row is the thing the eye lands on. The copy is
            kept short enough not to need the ellipsis; this is what stops a longer one being
            ugly rather than merely long. */}
        <Text
          style={[styles.navLabel, styles.rowLabel, active && styles.navLabelActive]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {t(row.labelKey)}
        </Text>
        {badgeText === null ? (
          <MaterialIcons name="chevron-right" size={18} color={darkColors.border} />
        ) : (
          <View testID={`drawer-badge-${row.route}`} style={styles.badge}>
            <Text style={styles.badgeText} numberOfLines={1}>
              {badgeText}
            </Text>
          </View>
        )}
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
          {/* THE PROJECT'S PROFILE BLOCK — <ProfileBlock />, which is also what heads Account
              Settings. It was 18 lines of JSX here and 18 more there until 2026-09-10, when the
              jscpd gate caught the pair on the run that added the second one. §32.7 says there is
              "no second SHAPE anywhere in the app", and two hand-maintained copies of one shape is
              precisely how a second shape appears — one prop at a time, with nothing failing when
              it does. The component's own header carries the order and the reasons behind it. */}
          <ProfileBlock
            variant="drawer"
            testIDPrefix="drawer"
            displayName={displayName}
            fallbackName={t('drawer.member')}
            position={me?.position}
            idLabel={t('profile.main.userId')}
            employeeCode={me?.employeeCode}
            userId={userId}
          >
            <View style={styles.statusRow}>
              <MaterialIcons name="cloud-done" size={16} color={darkColors.success} />
              {/* REAL: `platform.users.mfa_enabled`. Said only when the answer is known and true —
                  an account with no second factor gets the plain online line rather than a claim.
                  THE STATUS LINE IS THE CALLER'S, not the block's: this one says whether a second
                  factor is enrolled, and Account Settings' says what the sync queue is doing. */}
              <Text style={styles.statusText}>
                {me?.mfaEnabled === true
                  ? `${t('drawer.mfaVerified')} • ${t('drawer.online')}`
                  : t('drawer.online')}
              </Text>
            </View>
          </ProfileBlock>
        </View>

        <ScrollView style={darkScreen.fill} contentContainerStyle={styles.navList}>
          {/* GROUPED — one role today. The flat branch below is unchanged and is what the other
              eleven render; neither can reach the other's rows, which is what keeps this split from
              becoming a way for one role to acquire another's menu. */}
          {groups !== null ? (
            <>
              {groups.map((group) => (
                <View key={group.titleKey} testID={`drawer-group-${group.titleKey}`}>
                  {/* One line, for the reason the rows are — see renderRow. */}
                  <Text style={styles.navSection} numberOfLines={1}>
                    {t(group.titleKey)}
                  </Text>
                  {group.rows.map(renderRow)}
                </View>
              ))}
              {/* The drawing's fourth group. Its rows are SHARED_LINKS rather than a second copy of
                  them, so Settings and the Privacy Policy cannot drift from the eleven flat
                  drawers by being written down twice. */}
              <View testID="drawer-group-crm.drawer.groupSystem">
                <Text style={styles.navSection}>{t('crm.drawer.groupSystem')}</Text>
                {SHARED_LINKS.map(renderLink)}
              </View>
            </>
          ) : null}
          {/* The role's own section. Empty for a session with no role, in which case the heading
              would label nothing and is not drawn either. */}
          {groups === null && visible.length > 0 ? (
            <>
              <Text style={styles.navSection}>{t('drawer.fieldTools')}</Text>
              {visible.map(renderLink)}
              {/* Row seven, when there is more than a seventh row's worth left (PO decision
                  2026-08-10). It expands IN PLACE rather than pushing a screen: the rest of this
                  role's menu is still the drawer's own content, and sending someone to another page
                  to read a menu is one navigation more than the menu is worth. */}
              {overflow.length > 0 ? (
                <>
                  <Pressable
                    testID="drawer-more"
                    onPress={() => setExpanded((was) => !was)}
                    style={styles.navItem}
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                    accessibilityLabel={t('drawer.more', { count: String(overflow.length) })}
                  >
                    <MaterialIcons
                      name={expanded ? 'expand-less' : 'expand-more'}
                      size={24}
                      color={darkColors.muted}
                    />
                    <Text style={styles.navLabel}>
                      {t('drawer.more', { count: String(overflow.length) })}
                    </Text>
                  </Pressable>
                  {expanded ? overflow.map(renderLink) : null}
                </>
              ) : null}
            </>
          ) : null}
          {/* The shared rows — ONE ROW EACH, not the sections themselves (PO decision 2026-08-09).
              They rendered inline here for one build and made the panel carry both navigation and
              settings, with ~900px of a 2400px screen below the fold. Never folded behind "More":
              see DRAWER_MAX_ROWS. A grouped drawer has already drawn them, under a heading. */}
          {groups === null ? (
            <>
              <View style={styles.divider} />
              {SHARED_LINKS.map(renderLink)}
            </>
          ) : null}
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
    flexShrink: 1,
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
  profileTitle: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: darkColors.muted,
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
  // A grouped row ends in a badge or a chevron, so its label is the half that gives way.
  rowLabel: { flex: 1 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.xl,
    backgroundColor: `${darkColors.accent}1F`,
  },
  badgeText: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
    letterSpacing: 0.4,
    color: darkColors.accent,
  },
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
