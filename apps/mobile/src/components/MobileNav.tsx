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
//   SITE_WORKER:            Home | Tasks | Report | Issues
//   SITE_ENGINEER:          Home | Issues | Inspections | Reports
//   PROJECT_MANAGER:        Home | Projects | Procurement | Dashboard
//   EXECUTIVE:              Home | Portfolio | Alerts | Reports
//   FINANCE:                Home | Payments | Budget | Invoices
//   PROCUREMENT_OFFICER/PROC_MANAGER: Home | RFQs | Orders | Deliveries
//   SAFETY_OFFICER:         Home | Incidents | Inspections | Reports  (PO 2026-08-04 — the two extra
//                           tabs are existing mounted routes and match §20.7.7, which gives the role
//                           safety checklists and compliance review)
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
// The `profile` route stays mounted via `href: null`, so router.push('/profile') still works.

import { Tabs } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { CosRole } from '@cos/types';
import { useAuthStore } from '../store/authStore';
import { useT } from '../i18n';
import { colors, darkColors } from '../theme/tokens';
import { useIsDark } from '../theme/usePalette';

/** MaterialIcons glyph name — §32.7 names @expo/vector-icons' MaterialIcons as the icon set. */
type IconName = keyof typeof MaterialIcons.glyphMap;

type TabConfig = {
  name: string;
  titleKey: string;
  /** §32.7 requires "icons + labels" on every bottom-nav item; without one the tab renders blank. */
  icon: IconName;
  roles: CosRole[];
};

// Authoritative per-role tab set (spec §Phase 10). Exported for reuse/testing.
// Icons are MaterialIcons glyph names, type-checked against the set's glyphMap. None of them are
// building / crane / hard-hat / blueprint / gear imagery — §32.7:622 prohibits those.
// Tabs render in array order. SITE_ENGINEER's Home|Issues|Inspections|Reports (product-owner
// decision 2026-07-16) is why `reports` sits after `inspections` rather than before `issues`:
// moving it there does not disturb any other role — SITE_WORKER's issues stays after its report,
// and EXECUTIVE's reports stays ahead of its portfolio.
export const ALL_TABS: TabConfig[] = [
  { name: 'home', titleKey: 'nav.tabs.home', icon: 'home', roles: Object.values(CosRole) },
  // TENANT_ADMIN bottom nav — Home | Users | Alerts | Settings (PO decision 2026-07-28, mockups
  // 04_tenant_admin/01_home,02_users,03_alerts,04_settings). "Alerts" is the sync-review queue
  // (04_tenant_admin/03_alerts — conflict records) and "Settings" is the system-settings route
  // (both dark, §32.7). For every other role these three stay href:null — mountable but never a tab.
  { name: 'users', titleKey: 'nav.tabs.users', icon: 'group', roles: [CosRole.TENANT_ADMIN] },
  {
    name: 'sync-queue',
    titleKey: 'nav.tabs.alerts',
    icon: 'notification-important',
    roles: [CosRole.TENANT_ADMIN],
  },
  {
    name: 'system-settings',
    titleKey: 'nav.tabs.settings',
    icon: 'settings',
    roles: [CosRole.TENANT_ADMIN],
  },
  { name: 'tasks', titleKey: 'nav.tabs.tasks', icon: 'checklist', roles: [CosRole.SITE_WORKER] },
  { name: 'report', titleKey: 'nav.tabs.report', icon: 'edit-note', roles: [CosRole.SITE_WORKER] },
  {
    name: 'issues',
    titleKey: 'nav.tabs.issues',
    icon: 'report-problem',
    roles: [CosRole.SITE_WORKER, CosRole.SITE_ENGINEER],
  },
  {
    name: 'inspections',
    titleKey: 'nav.tabs.inspections',
    icon: 'fact-check',
    roles: [CosRole.SITE_ENGINEER, CosRole.SAFETY_OFFICER],
  },
  {
    name: 'reports',
    titleKey: 'nav.tabs.reports',
    icon: 'description',
    roles: [CosRole.SITE_ENGINEER, CosRole.EXECUTIVE, CosRole.SAFETY_OFFICER],
  },
  {
    name: 'projects',
    titleKey: 'nav.tabs.projects',
    icon: 'folder',
    roles: [CosRole.PROJECT_MANAGER, CosRole.VIEWER],
  },
  {
    name: 'procurement',
    titleKey: 'nav.tabs.procurement',
    icon: 'shopping-cart',
    roles: [CosRole.PROJECT_MANAGER, CosRole.VIEWER],
  },
  {
    name: 'dashboard',
    titleKey: 'nav.tabs.dashboard',
    icon: 'insights',
    roles: [CosRole.PROJECT_MANAGER],
  },
  {
    name: 'portfolio',
    titleKey: 'nav.tabs.portfolio',
    icon: 'pie-chart',
    roles: [CosRole.EXECUTIVE],
  },
  {
    name: 'alerts',
    titleKey: 'nav.tabs.alerts',
    icon: 'notification-important',
    roles: [CosRole.EXECUTIVE],
  },
  { name: 'payments', titleKey: 'nav.tabs.payments', icon: 'payments', roles: [CosRole.FINANCE] },
  {
    name: 'budget',
    titleKey: 'nav.tabs.budget',
    icon: 'account-balance-wallet',
    roles: [CosRole.FINANCE, CosRole.VIEWER],
  },
  {
    name: 'invoices',
    titleKey: 'nav.tabs.invoices',
    icon: 'receipt-long',
    roles: [CosRole.FINANCE],
  },
  {
    name: 'rfqs',
    titleKey: 'nav.tabs.rfqs',
    icon: 'request-quote',
    roles: [CosRole.PROCUREMENT_OFFICER, CosRole.PROC_MANAGER],
  },
  {
    name: 'orders',
    titleKey: 'nav.tabs.orders',
    icon: 'inventory-2',
    roles: [CosRole.PROCUREMENT_OFFICER, CosRole.PROC_MANAGER],
  },
  {
    name: 'deliveries',
    titleKey: 'nav.tabs.deliveries',
    icon: 'local-shipping',
    roles: [CosRole.PROCUREMENT_OFFICER, CosRole.PROC_MANAGER],
  },
  {
    name: 'incidents',
    titleKey: 'nav.tabs.incidents',
    icon: 'health-and-safety',
    roles: [CosRole.SAFETY_OFFICER],
  },
  // CRM — the three pages §20.7.10 defines for CRM_SALES_MANAGER, in lifecycle order
  // (lead → opportunity → customer), which is also the order the work happens in.
  {
    name: 'leads',
    titleKey: 'nav.tabs.leads',
    icon: 'person-add',
    roles: [CosRole.CRM_SALES_MANAGER],
  },
  {
    name: 'opportunities',
    titleKey: 'nav.tabs.opportunities',
    icon: 'trending-up',
    roles: [CosRole.CRM_SALES_MANAGER],
  },
  {
    name: 'customers',
    titleKey: 'nav.tabs.customers',
    icon: 'business',
    roles: [CosRole.CRM_SALES_MANAGER],
  },
];

/** Role-filtered bottom tab navigator. Reads the signed-in role from the auth store. */
export function MobileNav() {
  const role = useAuthStore((s) => s.role) as CosRole | null;
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
      {ALL_TABS.map((tab) => {
        const visible = role != null && tab.roles.includes(role);
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
              // E2E navigation hook. The inspection suite taps by.id('inspection-tab').
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
      <Tabs.Screen name="profile" options={{ href: null }} />
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
