// NavigationDrawer — the side drawer. It was drawn from
// mockup/mobile/04_tenant_admin/05_navigation_drawer until 2026-09-11; the drawing it follows now
// is named under ONE BODY SHAPE below, and everything above that heading is why the panel exists
// at all rather than what it looks like.
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
// ── ONE BODY SHAPE FOR EVERY ROLE, SINCE 2026-09-11 ────────────────────────────────────────────
//
// DRAWING: mockup/mobile/03_site_engineer/05_profile/01_se_navigation_drawer, redrawn by Stitch
// ("Navigation Drawer - Construction OS Mobile") and named by the product owner as the shell every
// role shares. Brand row · profile header · one "Field tools" heading · rows of icon + label +
// chevron · Logout. The ROWS are per role; the SHELL is everyone's.
//
// IT IS THE SITE ENGINEER'S DRAWING, and that is not a contradiction. Measured: 16,179 B against
// the 16,098 B file it replaced, rendered strings identical but for an added `ID:` line, its rows
// the SITE ENGINEER's §6.4 modules and its id `#SE-8842`. So its content is one role's and only its
// structure generalises — which is what "โครงสร้างหลักเหมือนกัน" asks for.
//
// BETWEEN 2026-09-10 AND 2026-09-11 THERE WERE TWO SHAPES. CRM_SALES_MANAGER had a grouped menu of
// four titled groups with badges on two rows, because its own drawing is that shape. What ended it
// was not an argument about CRM: eight drawer drawings exist on disk and they disagree with each
// other — chevrons 10 · 0 · 0 · 0 · 8 · 1 · 2 · 8, two with no Logout at all — so "follow each
// role's drawing" cannot produce one structure. One drawing was chosen for all twelve instead.
// What the grouped menu cost when it went is recorded in `lib/drawerLinks.ts`, beside the rows that
// survived it.
//
// NO STATUS LINE SINCE 2026-09-11 (product-owner decision). The block read "MFA verified • Online &
// synced" under the id — real, from `platform.users.mfa_enabled` and the connection. The standard
// drawing has no such line, and the drawer is where a person goes to NAVIGATE; sync state already
// has one indicator in the top bar (<SyncPill />, which carries every state including offline) and
// MFA has its own row in Account Settings. Two indicators of one subject in one shell is what the
// OfflineBanner was deleted for on 2026-08-06. `GET /users/me` is still read — the POSITION line
// under the name needs it (ADR-101) — so nothing was saved by dropping the request, and it was not
// dropped.
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
import { drawerSectionFor, SHARED_LINKS, type DrawerLink } from '../lib/drawerLinks';
import { getMe } from '../api/users';
import { useComingSoon } from './useComingSoon';
import { useUiStore } from '../store/uiStore';
import { useAuthStore } from '../store/authStore';
import { useI18n } from '../i18n';
import { ProfileBlock } from './ProfileBlock';
import { BrandLogo } from './BrandLogo';
import { darkColors, fontFamily, radius, spacing, touchTarget, typography } from '../theme/tokens';
import { darkScreen } from '../theme/screenStyles';

const DRAWER_WIDTH = 310;

// The profile header's chevron, in one place because TWO things must agree on it: the glyph
// itself and the padding that keeps the text clear of it (see `profileCard`).
const PROFILE_CHEVRON_SIZE = 20;

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
  const soon = useComingSoon();
  // Collapsed on open, every time: the drawer is a fresh glance, not a place with remembered state.
  const [expanded, setExpanded] = useState(false);

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

  /**
   * ONE ROW SHAPE FOR EVERY ROLE — the drawing's, and the only one since 2026-09-11.
   *
   * There were two renderers until that day: a flat one for eleven roles and a grouped one for
   * CRM_SALES_MANAGER. They differed in three ways and the differences had drifted — the grouped
   * row drew a TRAILING CHEVRON and the flat one did not, so eleven of the twelve roles were
   * missing the chevron the drawing puts on every row. Two renderers for one row is how that
   * happens: nothing fails when they diverge.
   *
   * A row whose screen is not built SAYS SO on tap and pushes nothing. The alternative — a row that
   * navigates nowhere — reads as a broken app rather than an unbuilt screen.
   */
  const renderLink = (link: DrawerLink): React.JSX.Element => {
    // Matched on `route`, navigated by `href ?? route`: usePathname() never reports the group, so a
    // row that must name its group to be unambiguous still compares against the bare path.
    const active = pathname === link.route;
    return (
      <Pressable
        key={link.route}
        testID={`drawer-link-${link.route}`}
        onPress={() =>
          link.comingSoon === true ? soon(link.labelKey) : go(link.href ?? link.route)
        }
        style={[styles.navItem, active && styles.navItemActive]}
        accessibilityRole={link.comingSoon === true ? 'button' : 'link'}
        accessibilityLabel={t(link.labelKey)}
      >
        {active ? <View style={styles.activePill} /> : null}
        <MaterialIcons
          name={link.icon}
          size={24}
          color={active ? darkColors.primary : darkColors.muted}
        />
        {/* ONE LINE. A wrapped label makes a two-line row among one-line rows, which puts its
            chevron out of alignment with every other row — and a menu's rows are read as a column,
            so one tall row is the thing the eye lands on. */}
        <Text
          style={[styles.navLabel, styles.rowLabel, active && styles.navLabelActive]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {t(link.labelKey)}
        </Text>
        {/* The drawing puts one on every row. It was the grouped renderer's alone until
            2026-09-11. */}
        <MaterialIcons name="chevron-right" size={18} color={darkColors.border} />
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
        {/* THE DRAWING PUTS A TRAILING CHEVRON HERE and it opens nothing, which is the whole
            difficulty. The header has had no destination since 2026-08-09: `/profile` was deleted
            that day and the ruling was that THIS PANEL IS THE PROFILE. A chevron promising a screen
            that does not exist is the drawn dead control this project refused eleven times over on
            2026-09-11 — so the product owner's answer on 2026-09-11 was the third option: draw it,
            and say so on the press. `/account-settings` was the other candidate and was refused: it
            is already a row in this same drawer, and a second door onto one room is what the row
            rule exists to prevent. */}
        <Pressable
          testID="drawer-profile-card"
          accessibilityRole="button"
          accessibilityLabel={displayName ?? t('drawer.member')}
          onPress={() => soon('drawer.profileDetail')}
          style={styles.profileCard}
        >
          {/* THE PROJECT'S PROFILE BLOCK — <ProfileBlock />, which is also what heads Account
              Settings. It was 18 lines of JSX here and 18 more there until 2026-09-10, when the
              jscpd gate caught the pair on the run that added the second one. §32.7 says there is
              "no second SHAPE anywhere in the app", and two hand-maintained copies of one shape is
              precisely how a second shape appears — one prop at a time, with nothing failing when
              it does. The component's own header carries the order and the reasons behind it. */}
          <ProfileBlock
            variant="drawer"
            testIDPrefix="drawer"
            /* THE CHEVRON'S OWN COLUMN, reserved on the PROSE lines rather than on the card
               (product-owner decision 2026-09-11: "ถ้าชื่อตำแหน่งชนกับ chevron ให้ย่อส่วนท้าย…
               ด้วย ..."). The chevron is absolutely positioned, so it takes no part in the layout
               and the text ran the full width of the card and under it — every line is
               `numberOfLines={1}` and did ellipsize, but at the card's inner edge, which is past
               the glyph. The first attempt put this on the card and truncated the id to
               `User ID: 061A6A…`; see `trailingReserve`, which is why it lives here. */
            trailingReserve={spacing.sm + PROFILE_CHEVRON_SIZE + spacing.xs - spacing.md}
            displayName={displayName}
            fallbackName={t('drawer.member')}
            position={me?.position}
            idLabel={t('profile.main.userId')}
            employeeCode={me?.employeeCode}
            userId={userId}
          />

          <View testID="drawer-profile-chevron" style={styles.profileChevron}>
            <MaterialIcons
              name="chevron-right"
              size={PROFILE_CHEVRON_SIZE}
              color={darkColors.muted}
            />
          </View>
        </Pressable>

        <ScrollView
          testID="drawer-scroll"
          style={darkScreen.fill}
          contentContainerStyle={styles.navList}
        >
          {visible.length > 0 ? (
            <>
              <Text style={styles.navSection}>{t('drawer.fieldTools')}</Text>
              {visible.map(renderLink)}
              {/* The last row, when there is more than one more row's worth left (PO decision
                  2026-08-10; the row it lands on is DRAWER_MAX_ROWS, nine since 2026-09-11). It
                  expands IN PLACE rather than pushing a screen: the rest of this role's menu is
                  still the drawer's own content, and sending someone to another page to read a menu
                  is one navigation more than the menu is worth. */}
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
        </ScrollView>

        {/* The shared rows — ONE ROW EACH, not the sections themselves (PO decision 2026-08-09).
            They rendered inline here for one build and made the panel carry both navigation and
            settings, with ~900px of a 2400px screen below the fold. Never folded behind "More":
            see DRAWER_MAX_ROWS, which counts the role's own rows only, so a notice PDPA §23
            requires to stay available cannot end up behind a tap.

            This used to be conditional — a grouped drawer drew these under a heading of its own.
            There is no grouped drawer since 2026-09-11, so they are unconditional again.

            OUTSIDE THE SCROLLVIEW SINCE 2026-09-11 (product-owner decision): "ให้โซน Settings กับ
            Privacy policy อยู่ติดกับแถว LOG OUT ตลอด". Inside it they followed the role's rows,
            so their position moved with the length of the menu — SITE_WORKER has three rows and
            the pair sat a third of the way down the panel with ~700px of empty surface between
            them and Logout, while TENANT_ADMIN's expanded nineteen pushed them off the bottom.
            Pinned here they sit directly above Logout for every role, which is also the stronger
            form of the PDPA §23 guarantee above: the policy row cannot be scrolled away at all,
            not merely never folded. The scroll region shrinks by exactly this block's height, so
            nothing else moves. */}
        <View testID="drawer-footer-links" style={styles.footerLinks}>
          <View style={styles.divider} />
          {SHARED_LINKS.map(renderLink)}
        </View>

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
  // The chevron sits at the card's trailing edge, vertically centred against the block beside it.
  // `top: 0, bottom: 0` + centring rather than `top: '50%'`: a percentage puts the icon's TOP edge
  // at the midpoint, so it hangs below centre and crowds the id line — visible in the first capture.
  profileChevron: {
    position: 'absolute',
    right: spacing.sm,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
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
  navList: { paddingBottom: spacing.md, gap: 2 },
  // The pinned pair above Logout. Same 2px row gap as `navList`, so the two blocks read as one
  // column of rows with a divider in it rather than as two lists.
  footerLinks: { gap: 2, marginBottom: spacing.sm },
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
  // Every row ends in a chevron, so its label is the half that gives way. The `badge` and
  // `badgeText` styles that sat here went with the badges on 2026-09-11 — no row draws one.
  rowLabel: { flex: 1 },
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
