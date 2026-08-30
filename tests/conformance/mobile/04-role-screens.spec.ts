/**
 * Phase 10 — role-based navigation and the screen inventory (master:3389-3612).
 *
 * WHY THE TAB TABLE IS READ AS TEXT. `roleTabs.ts` lives under apps/mobile, outside this suite's
 * tsconfig rootDir, so it cannot be imported here — the same constraint its own header describes for
 * the mobile suite's routeRegistry spec. The table is parsed instead, which is enough: what the spec
 * fixes is WHICH routes each role gets and in WHAT ORDER, and both are visible in the source.
 */
import * as fs from 'fs';
import * as path from 'path';
import { exists, read, repoRoot } from '../helpers';

const mobile = 'apps/mobile/src';
const roleTabsSrc = read(`${mobile}/lib/roleTabs.ts`);

/** name → the roles that match it, in table order. */
const TAB_TABLE: Array<{ name: string; roles: string[]; all: boolean }> = (() => {
  const body = roleTabsSrc
    .slice(roleTabsSrc.indexOf('export const ALL_TABS'))
    .replace(/\/\/[^\n]*/g, '');
  const out: Array<{ name: string; roles: string[]; all: boolean }> = [];
  const re = /\{\s*name:\s*'([a-z-]+)'[\s\S]*?roles:\s*(\[[^\]]*\]|Object\.values\(CosRole\))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const rolesRaw = m[2]!;
    out.push({
      name: m[1]!,
      roles: [...rolesRaw.matchAll(/CosRole\.(\w+)/g)].map((r) => r[1]!),
      all: rolesRaw.includes('Object.values'),
    });
  }
  return out;
})();

const barFor = (role: string): string[] =>
  TAB_TABLE.filter((t) => t.all || t.roles.includes(role))
    .map((t) => t.name)
    .slice(0, 4);

describe('Phase 10 · the tab table parsed cleanly', () => {
  it('found the table', () => {
    // A regex that silently matched nothing would make every assertion below vacuously true.
    expect(TAB_TABLE.length).toBeGreaterThan(20);
  });
});

/**
 * The bars the specs settle outright. PROJECT_MANAGER and EXECUTIVE are deliberately absent — see
 * the describe below them.
 */
const SETTLED_BARS: Array<[string, string[], string]> = [
  ['SITE_WORKER', ['home', 'tasks', 'safety-checklist', 'directory'], 'master:3404-3405'],
  ['SITE_ENGINEER', ['home', 'issues', 'tasks', 'reports'], 'master:3426'],
  ['SAFETY_OFFICER', ['home', 'incidents', 'inspections', 'permits'], 'master:3597 / §32.7:1670'],
  ['TENANT_ADMIN', ['home', 'users', 'sync-queue', 'system-settings'], 'master:3504'],
  ['FINANCE', ['home', 'payments', 'budget', 'invoices'], 'master:3476'],
  ['PROCUREMENT_OFFICER', ['home', 'rfqs', 'orders', 'deliveries'], 'master:3489'],
  ['PROC_MANAGER', ['home', 'rfqs', 'orders', 'deliveries'], 'master:3489'],
  ['CRM_SALES_MANAGER', ['home', 'leads', 'opportunities', 'customers'], '§32.7:1669'],
  ['VIEWER', ['home', 'projects', 'procurement', 'budget'], '§32.7:1670'],
  // Both settled 2026-08-23. PROJECT_MANAGER: master was corrected to the 2026-08-10 mockup set the
  // code already followed. EXECUTIVE: the code was corrected to master's order, the only place that
  // states one for the role.
  [
    'PROJECT_MANAGER',
    ['home', 'procurement', 'finance', 'more'],
    'master:3457 + mockups 2026-08-10',
  ],
  ['EXECUTIVE', ['home', 'portfolio', 'alerts', 'reports'], 'master:3462'],
];

describe('Phase 10 · per-role bottom nav', () => {
  it.each(SETTLED_BARS)('%s renders the bar %s settles', (role, expected) => {
    // Order is asserted, not just membership: roleTabs.ts states that the table's order IS the bar's
    // order and that the first entry is where the role lands after sign-in.
    expect(barFor(role)).toEqual(expected);
  });

  it('every role carries at most four tabs (§32.7 "exactly 4 items")', () => {
    const roles = [...new Set(TAB_TABLE.flatMap((t) => t.roles))];
    for (const role of roles) {
      const all = TAB_TABLE.filter((t) => t.all || t.roles.includes(role));
      // Overflow is defined behaviour — it goes to the drawer — but the BAR is four.
      expect(barFor(role).length).toBeLessThanOrEqual(4);
      expect(all.length).toBeGreaterThanOrEqual(barFor(role).length);
    }
  });

  it('home is the first tab for every role', () => {
    // master:3404-3405: the bar "starts in the same place for all twelve roles", and landingRoute
    // sends a signed-in user to the first tab.
    const roles = [...new Set(TAB_TABLE.flatMap((t) => t.roles))];
    for (const role of roles) expect(barFor(role)[0]).toBe('home');
  });

  it('SYSTEM_ADMIN is not given tenant tabs (§32.7:1672)', () => {
    // "Not a gap" — its work lives in the /admin web panel, explicitly not visible to tenant users.
    expect(barFor('SYSTEM_ADMIN')).toEqual(['home']);
  });
});

describe('Phase 10 · the drawer IS the profile (master:3449-3452)', () => {
  it('there is no self-profile route', () => {
    // "There is no /profile route any more — the screen was deleted and its content is
    // <AccountSettings />, rendered inside the drawer the avatar opens."
    expect(exists(`${mobile}/app/(app)/profile.tsx`)).toBe(false);
  });

  it('account settings exists as the drawer content', () => {
    expect(exists(`${mobile}/app/(app)/account-settings.tsx`)).toBe(true);
  });

  it('profile is not a tab for any role', () => {
    expect(TAB_TABLE.some((t) => t.name === 'profile')).toBe(false);
  });
});

describe('Phase 10 · shared mobile components (master:3610-3611; §32.7)', () => {
  const required = [
    'MobileNav',
    'PhotoCapture',
    'VoiceNoteButton',
    'TaskCard',
    'QuickActionCard',
    'StatusChip',
    'OptimisticList',
    'SyncPill',
  ];

  it.each(required)('%s exists', (name) => {
    expect(exists(`${mobile}/components/${name}.tsx`)).toBe(true);
  });

  it.each(['OfflineBanner', 'SyncStatusBar'])('%s is deleted (master:3518)', (name) => {
    // Asserted as an ABSENCE because the spec records a deletion: SyncPill carries "every sync
    // state, offline included", and a second surface saying the same thing is what was removed.
    const hits: string[] = [];
    const walk = (d: string): void => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) {
          if (!['node_modules', 'dist', '.expo'].includes(e.name)) walk(full);
        } else if (e.name === `${name}.tsx`) hits.push(full);
      }
    };
    walk(path.join(repoRoot, mobile));
    expect(hits).toEqual([]);
  });
});

describe('Phase 10 · both authentication paths (master:3580-3584)', () => {
  const login = read(`${mobile}/app/(auth)/login.tsx`);

  it('offers Path A — phone + OTP', () => {
    expect(login).toMatch(/otp|OTP/);
  });

  it('offers Path B — email/password via Keycloak (ADR-050)', () => {
    // "all roles use React Native on smartphone, so mobile must render both auth paths". With only
    // Path A, every office role is locked out of the app on their own phone.
    expect(login).toMatch(/password/i);
  });

  it('routes by role after sign-in', () => {
    expect(exists(`${mobile}/lib/landingRoute.ts`)).toBe(true);
    expect(read(`${mobile}/lib/landingRoute.ts`)).toMatch(/roleTabs|tabsFor|visibleTabsFor/);
  });
});

describe('Phase 10 · the role screens master:3585-3609 names', () => {
  // Existence, not appearance: what the spec fixes is that each role's listed workflow HAS a screen
  // wired to a route. Whether it looks right is what the mockups and the Detox specs cover.
  const screens = [
    'home',
    'tasks',
    'issues',
    'reports',
    'safety-checklist',
    'inspections',
    'incidents',
    'permits',
    'conflict-review',
    'material-request',
    'payments',
    'budget',
    'invoices',
    'rfqs',
    'orders',
    'deliveries',
    'portfolio',
    'alerts',
    'projects',
    'procurement',
    'users',
    'leads',
    'opportunities',
    'customers',
  ];

  it.each(screens)('%s has a screen', (name) => {
    expect(exists(`${mobile}/app/(app)/${name}.tsx`)).toBe(true);
  });

  it('the conflict review screen the SITE_ENGINEER needs is reachable (master:3443)', () => {
    // "Extra: ConflictBadge, conflict review screen" — the client half of §17.5. Without it a
    // CONFLICT_FLAGGED row is a badge the user can never act on.
    expect(exists(`${mobile}/app/(app)/conflict-review.tsx`)).toBe(true);
    expect(exists(`${mobile}/components/ConflictBadge.tsx`)).toBe(true);
  });
});
