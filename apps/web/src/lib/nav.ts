/**
 * Role-filtered navigation (spec §20.6.2 / §20.7). Each role sees only the
 * navigation for pages it can access; items map to the §20.7 page inventory.
 *
 * DECISION-2: deferred routes (SITE_WORKER `/tasks`, `/site/checklists`;
 * SAFETY_OFFICER `/safety/*`) are omitted until their backend ships. They are
 * added back here when the safety/tasks workstream lands.
 */
import { CosRole } from '@cos/types';

export interface NavItem {
  href: string;
  /** i18n key under `nav.*`. */
  labelKey: string;
}

const PROCUREMENT_NAV: NavItem[] = [
  { href: '/procurement/requests', labelKey: 'nav.procurement.requests' },
  { href: '/procurement/rfqs', labelKey: 'nav.procurement.rfqs' },
  { href: '/procurement/quotations', labelKey: 'nav.procurement.quotations' },
  { href: '/procurement/orders', labelKey: 'nav.procurement.orders' },
  { href: '/procurement/deliveries', labelKey: 'nav.procurement.deliveries' },
  { href: '/procurement/vendors', labelKey: 'nav.procurement.vendors' },
];

const FINANCE_NAV: NavItem[] = [
  { href: '/finance/payments', labelKey: 'nav.finance.payments' },
  { href: '/finance/budget', labelKey: 'nav.finance.budget' },
  { href: '/finance/invoices', labelKey: 'nav.finance.invoices' },
  { href: '/finance/reports/variance', labelKey: 'nav.finance.variance' },
];

const SITE_ENGINEER_NAV: NavItem[] = [
  { href: '/site/reports', labelKey: 'nav.site.reports' },
  { href: '/site/issues', labelKey: 'nav.site.issues' },
  { href: '/site/inspections', labelKey: 'nav.site.inspections' },
  { href: '/site/conflicts', labelKey: 'nav.site.conflicts' },
];

const EXECUTIVE_NAV: NavItem[] = [
  { href: '/', labelKey: 'nav.exec.home' },
  { href: '/portfolio', labelKey: 'nav.exec.portfolio' },
  { href: '/alerts', labelKey: 'nav.exec.alerts' },
  { href: '/reports', labelKey: 'nav.exec.reports' },
];

const PM_NAV: NavItem[] = [{ href: '/projects', labelKey: 'nav.pm.projects' }];

const TENANT_ADMIN_NAV: NavItem[] = [
  ...PM_NAV,
  ...PROCUREMENT_NAV,
  ...FINANCE_NAV,
  ...SITE_ENGINEER_NAV,
  { href: '/settings/users', labelKey: 'nav.admin.users' },
  { href: '/settings/tenant', labelKey: 'nav.admin.tenant' },
];

export const NAV_BY_ROLE: Record<string, NavItem[]> = {
  [CosRole.EXECUTIVE]: EXECUTIVE_NAV,
  [CosRole.PROJECT_MANAGER]: PM_NAV,
  [CosRole.PROCUREMENT_OFFICER]: PROCUREMENT_NAV,
  [CosRole.PROC_MANAGER]: PROCUREMENT_NAV,
  [CosRole.FINANCE]: FINANCE_NAV,
  [CosRole.SITE_ENGINEER]: SITE_ENGINEER_NAV,
  [CosRole.TENANT_ADMIN]: TENANT_ADMIN_NAV,
  // Read-only across assigned modules; per-project ABAC enforced at page level.
  [CosRole.VIEWER]: [...PM_NAV, ...SITE_ENGINEER_NAV],
  // DECISION-2 — only READY pages until backend lands.
  [CosRole.SITE_WORKER]: [
    { href: '/site/reports/new', labelKey: 'nav.siteWorker.newReport' },
    { href: '/site/issues/new', labelKey: 'nav.siteWorker.newIssue' },
  ],
  [CosRole.SAFETY_OFFICER]: [],
};

export function navForRole(role: string | undefined | null): NavItem[] {
  if (role && role in NAV_BY_ROLE) {
    return NAV_BY_ROLE[role];
  }
  return [];
}
