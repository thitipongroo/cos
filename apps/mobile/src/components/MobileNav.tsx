// MobileNav — role-based bottom navigation (spec §32.7 Mobile Core Component Library:
// "MobileNav: Bottom navigation, exactly 4 items, icons + labels").
//
// Implemented on top of Expo Router's <Tabs> navigator: every role's tab set from the
// authoritative spec §Phase 10 is declared once, and tabs outside the current role are
// hidden via `href: null` while keeping the route mountable (reachable by router.push).
//
// Role tab sets — FOUR tabs, no Profile (PO decision 2026-08-04). Profile is reached from the
// top-bar avatar on every screen, which already routed there for all roles. This generalises what
// SITE_ENGINEER (PO 2026-07-16) and TENANT_ADMIN (PO 2026-07-28) already did to the whole product.
//   SITE_WORKER:            Home | Tasks | Safety | Directory  (PO decision 2026-08-09)
//     This bar has moved twice. The role's original four mockups drew Tasks | Issues | Reports |
//     Safety with no Home; on 2026-08-08 Home replaced Tasks (Home is first for all twelve roles,
//     and §32.7 allows exactly four). On 2026-08-09 the product owner settled it as Home | Tasks |
//     Safety | Directory, close to the 01_home/01_sw_dashboard mockup's own bar but with Home in the
//     Projects slot, since a field worker has no project-portfolio screen.
//     ISSUES and REPORT gave up their slots and are now pushed from the Home FAB's quick-action
//     menu (mockup 01_home/02_sw_quick_actions), which carries exactly those two plus Safety — so
//     nothing lost its entry point. Both are `href: null` below with a breadcrumb, like any other
//     child screen.
//   SITE_ENGINEER:          Home | Issues | Tasks | Reports  (PO decision 2026-08-12)
//     Tasks replaced Inspections when the role's mockup set was restructured — all four of its
//     screens draw this bar. Inspections is not gone: it returns to the role's drawer as the
//     derived "Inspections / QC" row, which had been suppressed only because it was a tab.
//   PROJECT_MANAGER:        Home | Projects | Procurement | Dashboard
//   EXECUTIVE:              Home | Portfolio | Alerts | Reports
//   FINANCE:                Home | Payments | Budget | Invoices
//   PROCUREMENT_OFFICER/PROC_MANAGER: Home | RFQs | Orders | Deliveries
//   SAFETY_OFFICER:         Home | Incidents | Checklists | Permits  (PO decision 2026-08-13)
//     THIS LINE USED TO READ `Home | Incidents | Inspections | Reports` AND WAS NEVER TRUE. It was
//     written in the same commit as the tab table (bf9c4603, 2026-08-04) and disagreed with it from
//     that day: the table's order rendered Home | Inspections | Reports | Incidents. Nothing else
//     defined the bar — master §Phase 10 enumerates no Safety Officer nav (`20 §20.7.7` says so),
//     §32.7's per-role table covers only CRM_SALES_MANAGER / VIEWER / SYSTEM_ADMIN, no test asserted
//     the order, and the role had never been captured, so the drift survived nine days unseen.
//     The bar now follows `mockup/mobile/07_safety_officer/`, whose three drawings agree on
//     Home | Incidents | Checklists | Profile; Profile is no role's tab (below), so Permits takes
//     the slot — §20.7.7's fourth page and the approval step master §9 gives this role alone.
//     "Checklists" is the `inspections` ROUTE relabelled, not a new screen.
//   TENANT_ADMIN:           Home | Users | Alerts | Settings
//   CRM_SALES_MANAGER:      Home | Leads | Opportunities | Customers  (§20.7.10)
//   VIEWER:                 Home | Projects | Procurement | Budget  (PO decision 2026-08-04)
//                           §6.8 grants VIEWER read on seven modules, but the tab set is NOT a free
//                           pick from those: §20.7.9 says "no create/edit/approve actions are
//                           rendered", and an audit on 2026-08-04 found several candidate screens
//                           render ungated write controls (issues → create-issue-button, tasks →
//                           onSave, payments → approve). These three were verified to contain no
//                           onPress/Pressable at all, so they satisfy the read-only rule as they
//                           stand. Adding reports/issues/tasks needs a read-only mode built first.
//   SYSTEM_ADMIN:           Home only — and that is CORRECT, not a gap. §20.7.11 puts its work in the
//                           separate /admin panel (§20.4), a web route explicitly "not visible to
//                           tenant users", so no mobile tabs are invented for it.
//
// There is no `profile` route: the navigation drawer IS the profile (PO 2026-08-09).

import { Tabs } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { CosRole } from '@cos/types';
import { ALL_TABS as TAB_TABLE, visibleTabsFor } from '../lib/roleTabs';
import { useAuthStore } from '../store/authStore';
import { useT } from '../i18n';
import { colors, darkColors } from '../theme/tokens';
import { useIsDark } from '../theme/usePalette';

// The tab TABLE moved to lib/roleTabs.ts (2026-08-08) so `lib/landingRoute.ts` and its unit test can
// read it: importing this file pulls in expo-router, which is ESM and cannot load under jest. Re-
// exported here because callers (and the routeRegistry guard's sibling imports) already reference
// `ALL_TABS` from this module.
export { ALL_TABS } from '../lib/roleTabs';
export type { TabConfig, IconName } from '../lib/roleTabs';

/** Role-filtered bottom tab navigator. Reads the signed-in role from the auth store. */
export function MobileNav() {
  const role = useAuthStore((s) => s.role) as CosRole | null;
  // The names that actually get a button, capped at MAX_TABS.
  const onBar = new Set(role == null ? [] : visibleTabsFor(role).map((tab) => tab.name));
  const t = useT();

  // Tab-bar colour follows the USER'S theme (PO decision 2026-08-04: dark is the product default for
  // every role, light is selectable in Profile). Previously only SITE_ENGINEER and TENANT_ADMIN got a
  // dark bar, because only their Home mockups were dark.
  const dark = useIsDark();

  return (
    <Tabs
      // Pushed child screens (invite-user, roles-selection, role-permissions, notifications…) are hidden
      // Tabs.Screen siblings, so router.back() from one is a tab "goBack". The React Navigation default
      // (`firstRoute`) would jump straight to Home; `history` makes Back return to the previously focused
      // screen instead — so, e.g., Roles-selection → CONFIRM pops back to the Invite-user form it came
      // from (PO decision 2026-07-29), keeping that form's state.
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        // Active tab: a filled rounded rectangle behind icon+label, per the mockup's
        // bg-primary-container (product-owner decision 2026-07-16, all roles). The active tint is
        // light so it reads on the blue highlight; inactive stays muted. Only borderRadius + a
        // horizontal inset — no vertical margin or overflow:hidden, which clip the label away and
        // break §32.7's "icons + labels".
        tabBarActiveTintColor: darkColors.text,
        tabBarInactiveTintColor: dark ? darkColors.muted : colors.textSecondary,
        tabBarActiveBackgroundColor: colors.primary,
        // 20 is a NAMED EXCEPTION to §32.7, not a leftover magic number (PO decision 2026-08-06).
        // This is the filled highlight behind the active tab, and it is neither a square plate (so
        // `plateRadius` does not apply) nor a capsule (the bar's height comes from
        // @react-navigation/bottom-tabs and is nearer 56 than 40, so 20 draws a rounded rectangle,
        // which is what the mockups show). Left at 20 deliberately, recorded so the next radius
        // audit does not flag it again.
        tabBarItemStyle: { borderRadius: 20, marginHorizontal: 4 },
        // `surfaceContainer` #102034 — the mockups' own value for this bar, resolved from
        // 04_tenant_admin/01_home/01_home_dashboard rather than inferred (PO decision 2026-08-06).
        //
        // The two bars do NOT share a colour, which is why this went wrong twice. The header there is
        // `bg-surface dark:bg-dark-bg` and the file sets `<html class="dark">` + `darkMode: "class"`,
        // so `.dark .dark\:bg-dark-bg` beats the single-class utilities on specificity and the top bar
        // is the page colour. The nav is `bg-surface-container dark:bg-surface-container` — same value
        // either mode — plus `rounded-t-xl` and a top border: a raised sheet, not a flat strip. It was
        // `surface` (#0F172A, the card colour), then briefly `bg` when the top bar moved and I assumed
        // the two had to agree.
        tabBarStyle: dark
          ? { backgroundColor: darkColors.surfaceContainer, borderTopColor: darkColors.border }
          : undefined,
      }}
    >
      {/* The bar is four wide and no wider (§32.7, `MAX_TABS`). A role matching a fifth entry does
          NOT get a fifth button — `visibleTabsFor` cuts the list at four and `drawerLinksFor` puts
          the remainder at the top of that role's drawer section, so the screen is still one tap from
          anywhere and the bar keeps its shape. Every role matches exactly four today; this is what
          happens the day one does not. */}
      {TAB_TABLE.map((tab) => {
        const visible = onBar.has(tab.name);
        return (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: t(tab.titleKey),
              // href: null hides the tab from the tab bar while keeping the route mountable.
              href: visible ? undefined : null,
              // §32.7 "icons + labels". `color` comes from the active/inactive tints above, so the
              // glyph follows the label rather than being painted a fixed colour.
              tabBarIcon: ({ color, size }) => (
                <MaterialIcons name={tab.icon} size={size} color={color} />
              ),
              // E2E navigation hook. `inspection-tab` survives for SAFETY_OFFICER, the one role that
              // still carries Inspections on its bar; the offline-inspection suite runs as
              // SITE_ENGINEER and reaches the screen through the drawer since 2026-08-12.
              // React Navigation 7 (expo-router 56) renamed tabBarTestID → tabBarButtonTestID.
              tabBarButtonTestID: tab.name === 'inspections' ? 'inspection-tab' : `${tab.name}-tab`,
            }}
          />
        );
      })}
      {/* Routes reached via router.push (ConflictBadge / quick actions / drawer), never bottom tabs.
          Without an explicit href:null expo-router auto-registers each remaining (app)/ route file as
          a visible tab — the leak that once put mfa-enrollment and notification-preferences on every
          bottom bar, and that put the seven D-series screens there again in 2026-08.
          `src/lib/__tests__/routeRegistry.spec.ts` now reads this list against the files on disk, so
          the next omission fails a test rather than shipping.
          (An earlier version of this comment claimed notifications + notification-preferences were
          declared in ALL_TABS instead; they are not, and both are listed below like every other
          pushed screen.) */}
      {/* The daily-entry FORM. A SITE_WORKER tab until 2026-08-09, now pushed from the Home FAB's
          quick-action menu. Mounted here so router.push('/report') still resolves. (`reports`, the
          Site Engineer's review LIST, is a different route and still a tab.) */}
      <Tabs.Screen name="report" options={{ href: null }} />
      {/* The PM analytics dashboard. A PROJECT_MANAGER tab until 2026-08-10, when Approvals and
          Vendors took the role's last two slots and its content became the manager Home itself
          (mockup 06_project_manager/01_home). Mounted so router.push('/dashboard') still resolves. */}
      <Tabs.Screen name="dashboard" options={{ href: null }} />
      {/* `more` is NOT here any more — it became the Project Manager's fourth tab on 2026-08-10, once
          finance.tsx existed and the bar could be switched to Home | Procurement | Finance | More.
          It is declared from ALL_TABS with every other tab.
          The vendor directory took its place in this list: it left ALL_TABS in the same change and is
          now the pushed child behind More's vendor tile (mockup 06_project_manager/04_more_option).
          Without this line expo-router would auto-register it as a visible tab for every role. */}
      <Tabs.Screen name="vendors" options={{ href: null }} />
      {/* Which site am I on today — the Site Worker's first screen (mockup
          05_site_worker/01_home/00_sw_project_selection). Pushed from the project context bar and
          entered automatically when no project has been chosen; never a tab. */}
      {/* The signed-in user's own account settings — pushed from the drawer's Settings row. */}
      <Tabs.Screen name="account-settings" options={{ href: null }} />
      <Tabs.Screen name="conflict-review" options={{ href: null }} />
      {/* Notification inbox — reached from the top-bar bell (router.push). No role lists it as a tab. */}
      <Tabs.Screen name="notifications" options={{ href: null }} />
      {/* Notification preferences — reached from the Settings screen / notifications inbox (router.push).
          It was briefly the TENANT_ADMIN "Settings" tab; that tab is now `system-settings`. */}
      <Tabs.Screen name="notification-preferences" options={{ href: null }} />
      {/* Invite user — reached from the Quick Commands overlay (router.push), never a bottom tab. */}
      <Tabs.Screen name="invite-user" options={{ href: null }} />
      {/* Role permissions — reached from Invite-user's "View permissions" (router.push). */}
      <Tabs.Screen name="role-permissions" options={{ href: null }} />
      {/* Roles selection — reached from Invite-user's "Show more roles" picker (router.push). */}
      <Tabs.Screen name="roles-selection" options={{ href: null }} />
      {/* Invitation success — terminal screen after SEND INVITATION (router.replace). Not in the
          TopBar CHILD_TITLE_KEY map on purpose: it shows the CONSTRUCTION OS wordmark with no Back
          arrow, matching the mockup (there is no form to return to). */}
      <Tabs.Screen name="invitation-success" options={{ href: null }} />
      {/* System integration — connector picker from the Quick Commands overlay (router.push). */}
      <Tabs.Screen name="system-integration" options={{ href: null }} />
      {/* Apps & Services — module/tools/extensions hub from the Quick Commands overlay (router.push). */}
      <Tabs.Screen name="apps-services" options={{ href: null }} />
      <Tabs.Screen name="user-profile" options={{ href: null }} />
      <Tabs.Screen name="edit-permission" options={{ href: null }} />
      {/* permission-success is intentionally absent from TopBar CHILD_TITLE_KEY — a terminal screen
          reached via router.replace, it shows the CONSTRUCTION OS wordmark with no Back arrow. */}
      <Tabs.Screen name="permission-success" options={{ href: null }} />
      <Tabs.Screen name="reset-password" options={{ href: null }} />
      {/* reset-password-success + reset-password-email-success are intentionally absent from TopBar
          CHILD_TITLE_KEY — terminal screens (reached via router.replace), they show the wordmark with no
          Back, like permission-success. */}
      <Tabs.Screen name="reset-password-success" options={{ href: null }} />
      <Tabs.Screen name="reset-password-email-success" options={{ href: null }} />
      <Tabs.Screen name="material-request" options={{ href: null }} />
      <Tabs.Screen name="mfa-enrollment" options={{ href: null }} />
      {/* Transparency Portal (PO 2026-08-04) — reached from Profile, not a tab for any role. Hidden
          here for the same reason as every other pushed child screen: `href: null` keeps it out of
          the bottom nav while leaving it routable. */}
      {/* Profile left the bottom nav (PO 2026-08-04) but must stay mounted — the top-bar avatar
          pushes here from every screen. */}
      {/* Post-auth Privacy Policy — drawer entry (PO 2026-08-04); same document as the (auth) route. */}
      <Tabs.Screen name="privacy-policy" options={{ href: null }} />
      <Tabs.Screen name="transparency" options={{ href: null }} />
      <Tabs.Screen name="transparency-identity" options={{ href: null }} />
      <Tabs.Screen name="transparency-location" options={{ href: null }} />
      <Tabs.Screen name="transparency-logs" options={{ href: null }} />
      <Tabs.Screen name="transparency-manual" options={{ href: null }} />
      <Tabs.Screen name="transparency-iot" options={{ href: null }} />
      <Tabs.Screen name="transparency-ai" options={{ href: null }} />
      <Tabs.Screen name="transparency-delete" options={{ href: null }} />
      {/* The D-series screens (ADR-078/080/081/084). Every one is reached by router.push from the
          portal hub or from another child screen, and none is a tab for any role — so each needs its
          own href:null for exactly the reason stated at the top of this block. The mockups for these
          screens each draw their OWN bottom bar (Dashboard|Tasks|Export|Profile on the export screen,
          Field|Security|Logs on the network one, Inventory|Security|Fleet|Logs on the device one).
          None of those tab sets exists in this product: the bottom nav is the role's tab set from
          §32.7 and does not change per screen, so the mockup bars are dropped rather than reproduced. */}
      <Tabs.Screen name="data-export" options={{ href: null }} />
      <Tabs.Screen name="transparency-network" options={{ href: null }} />
      {/* Terminal-ish: reached from the network screen's re-verify action, returns with router.back. */}
      <Tabs.Screen name="network-reattest" options={{ href: null }} />
      <Tabs.Screen name="device-details" options={{ href: null }} />
      <Tabs.Screen name="account-security" options={{ href: null }} />
      <Tabs.Screen name="transparency-session" options={{ href: null }} />
      <Tabs.Screen name="transparency-timestamps" options={{ href: null }} />
    </Tabs>
  );
}
