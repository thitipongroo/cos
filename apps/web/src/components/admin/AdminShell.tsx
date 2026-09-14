'use client';

/**
 * The SYSTEM_ADMIN panel's shell (§20.4), built to the CURRENT Stitch drawing "Tenant List & DB Provisioning -
 * SYSTEM_ADMIN" (screen 013fc8f094504f7e9d644d8b2dbb8c6d, HTML fetched 2026-09-15) — for BOTH admin pages
 * (product-owner decision, revision R10).
 *
 * The drawing's structure, class for class: a fixed 64 px top bar; under it a full-height 256 px `<aside>`
 * (header row, seven navigation rows, the Cluster Pulse card pinned to the bottom) and a `<main>` workspace
 * whose first child is the migration-gate banner. Colours and type are the drawing's own values, carried by
 * the `cos-op-*` tokens (globals.css); its radius scale (DEFAULT 4 / lg 8 / xl 12 px) maps to ours as
 * rounded / rounded-md / rounded-lg.
 *
 * This replaces the 2026-09-14 build, which followed an older version of the same screen (the navigation as a
 * card in a 12-column grid, the banner above it) and substituted the nearest global tokens for the drawing's
 * colours. It did not look like the drawing.
 *
 * ── LAID OUT WITHOUT DATA (D1) ──────────────────────────────────────────────────────────────────
 * Drawn in place, showing `—`: the version (v4.18.2), Central Prices' period (Q2/2025), Cluster
 * Infrastructure's status dot, and every Cluster Pulse row. The pulse card's `LIVE` badge is not drawn —
 * nothing in it is live. Real: the Tenants count, the Dedicated DB Fleet count, the migration-approvals badge.
 *
 * ── THE TOP BAR ─────────────────────────────────────────────────────────────────────────────────
 * Brand on the left, the global search at the bar's centre (R14, product owner 2026-09-15 — the drawing places it
 * after the wordmark), and on the right only what the drawing draws: status pill, bell, avatar. The pill reports whether the tenant list reached the
 * API (Q1) and reads SYNCED when it did, as drawn. The avatar opens a menu holding Sign out and the language
 * switch (revision R10, decision 2) — neither is in the drawing, and an operator must still be able to leave
 * and to read the panel in Thai (QM-3).
 *
 * ── GATE BANNERS ────────────────────────────────────────────────────────────────────────────────
 * One per provisioning run at AWAITING_APPROVAL (§34.5), first in the workspace — on the Tenant List only; Create
 * Tenant draws none (R12.4), including while its modal is open over the list (R13.6). "Review Plan" is disabled: no
 * plan view exists. The drawing's `[L-04]` tier tag has no source and is not drawn.
 */

import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Button, Menu, MenuItem, MenuTrigger, Popover } from 'react-aria-components';
import { CosRole } from '@cos/types';
import { useI18n } from '../../i18n';
import {
  connectionState,
  errorKeyForStatus,
  initials,
  tenantMetrics,
  tenantsAtGate,
  type TenantListRow,
} from '../../lib/adminTenants';
import { ApiError } from '../../lib/api/client';
import { useDecideProvisioning, useTenantProvisioning, useTenants } from '../../lib/api/queries';
import { NotificationBell } from '../shell/NotificationBell';
import { AdminIcon, type AdminIconName } from './AdminIcon';
import { GateDecisionDialog } from './GateDecisionDialog';

interface NavItem {
  labelKey: string;
  icon: AdminIconName;
  href?: string;
  trailing?: React.ReactNode;
}

export const NO_DATA = '—';

const CONNECTION_TONE = {
  online: { dot: 'bg-cos-op-success', text: 'text-cos-op-success' },
  offline: { dot: 'bg-cos-op-error', text: 'text-cos-op-error' },
  checking: { dot: 'bg-cos-op-outline', text: 'text-cos-op-outline' },
} as const;

const NAV_ROW =
  'flex items-center justify-between rounded-md px-3 py-2 text-[13px] font-medium transition-colors';

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { t, locale, setLocale } = useI18n();
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const { data: session, status } = useSession();
  const tenants = useTenants();
  const provisioning = useTenantProvisioning();
  const decide = useDecideProvisioning();
  const [globalQuery, setGlobalQuery] = useState('');
  const [gate, setGate] = useState<{ tenant: TenantListRow; decision: 'approve' | 'abort' } | null>(
    null,
  );

  const all = useMemo(() => tenants.data ?? [], [tenants.data]);
  const metrics = useMemo(
    () => tenantMetrics(all, provisioning.data, new Date()),
    [all, provisioning.data],
  );
  const atGate = useMemo(() => tenantsAtGate(all, provisioning.data), [all, provisioning.data]);
  const connection = connectionState(tenants);

  // The panel is SYSTEM_ADMIN's alone (§20.4 Access). The API refuses every call regardless; this
  // only stops another role from seeing an empty panel shaped like a permission.
  if (status === 'authenticated' && session?.user?.role !== CosRole.SYSTEM_ADMIN) {
    return (
      <main className="min-h-screen bg-cos-op-surface p-8 text-op-body text-cos-op-on-surface-variant">
        {t('admin.unauthorized')}
      </main>
    );
  }

  const nav: NavItem[] = [
    {
      labelKey: 'admin.nav.tenants',
      icon: 'domain',
      href: '/admin',
      trailing: (
        <span className="rounded bg-white/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
          {tenants.isSuccess ? metrics.total : NO_DATA}
        </span>
      ),
    },
    {
      labelKey: 'admin.nav.clusterInfra',
      icon: 'dns',
      trailing: <span aria-hidden="true" className="h-2 w-2 rounded-full bg-cos-op-success" />,
    },
    {
      labelKey: 'admin.nav.dbFleet',
      icon: 'database',
      trailing: (
        <span className="font-mono text-op-tiny text-cos-op-outline">
          {tenants.isSuccess ? `${metrics.dedicated} ${t('admin.nav.instances')}` : NO_DATA}
        </span>
      ),
    },
    {
      labelKey: 'admin.nav.migrationApprovals',
      icon: 'swap_horiz',
      trailing:
        metrics.awaitingGate > 0 ? (
          <span className="rounded bg-cos-op-gate px-1.5 py-0.5 text-[10px] font-bold text-cos-op-on-gate">
            {metrics.awaitingGate}
          </span>
        ) : null,
    },
    {
      labelKey: 'admin.nav.auditTrail',
      icon: 'history',
      trailing: <AdminIcon name="chevron_right" size={14} className="text-cos-op-outline" />,
    },
    {
      labelKey: 'admin.nav.centralPrices',
      icon: 'sell',
      trailing: <span className="text-op-tiny text-cos-op-outline">{NO_DATA}</span>,
    },
    {
      labelKey: 'admin.nav.settings',
      icon: 'tune',
      trailing: <AdminIcon name="tune" size={14} className="text-cos-op-outline" />,
    },
  ];

  const tenantsActive = pathname === '/admin' || pathname.startsWith('/admin/tenants');
  // R12.4 / R13.6 (product owner 2026-09-15): no gate banner while Create Tenant is open — on its route here, and
  // when the modal is opened over the list by the `[data-gate-banner]` rule in globals.css.
  const showGateBanners = !pathname.startsWith('/admin/tenants/new');
  const tone = CONNECTION_TONE[connection];

  return (
    // `dark` scopes Tailwind's class-based dark variants to the panel, so shared components that
    // carry them (<LoadingState />) draw their dark form here and nowhere else in the app.
    // R13.1: exactly the viewport tall — only <main> scrolls; the side menu stays put with CLUSTER PULSE on its
    // bottom edge, and scrolls on its own only when its entries outgrow the height.
    <div
      data-admin-shell=""
      className="dark flex h-screen flex-col overflow-hidden bg-cos-op-surface text-cos-op-on-surface"
    >
      {/* R14: three columns, the outer two equal (1fr), so the search sits at the bar's centre whatever the widths of
          the brand on the left and the controls on the right. */}
      <header className="z-30 grid h-12 w-full shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-cos-op-outline-variant/50 bg-cos-op-container-low px-5 shadow-md">
        <div className="flex items-center justify-self-start">
          <div className="flex items-center gap-2.5">
            <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 1024 1024">
              <path
                d="M512 64L896 280V744L512 960L128 744V280L512 64Z"
                fill="#0B1020"
                stroke="#2563EB"
                strokeWidth="48"
              />
              <rect fill="#94A3B8" height="76" rx="38" width="532" x="246" y="328" />
              <rect fill="#94A3B8" height="76" rx="38" width="532" x="246" y="474" />
              <rect fill="#4CD7F6" height="76" rx="38" width="174" x="246" y="620" />
              <rect fill="#94A3B8" height="76" rx="38" width="328" x="450" y="620" />
            </svg>
            <span className="text-[14px] font-bold uppercase tracking-wider text-cos-op-on-surface">
              {t('common.appName')}
            </span>
          </div>
        </div>
        <form
          role="search"
          className="relative w-80"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(`/admin?q=${encodeURIComponent(globalQuery.trim())}`);
          }}
        >
          <AdminIcon
            name="search"
            size={16}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-cos-op-outline"
          />
          <input
            type="search"
            aria-label={t('admin.globalSearch')}
            value={globalQuery}
            onChange={(e) => setGlobalQuery(e.target.value)}
            placeholder={t('admin.globalSearch')}
            className="h-7 w-full rounded border border-cos-op-outline-variant/60 bg-cos-op-container pl-8 pr-3 text-[12px] text-cos-op-on-surface placeholder:text-cos-op-outline focus:border-cos-op-primary-container focus:outline-none"
          />
        </form>
        <div className="flex items-center gap-3 justify-self-end">
          <span
            role="status"
            className="flex items-center gap-1.5 rounded border border-cos-op-outline-variant/40 bg-cos-op-container px-2.5 py-0.5"
          >
            {connection === 'online' ? (
              <AdminIcon name="cloud_done" size={15} className={tone.text} />
            ) : (
              <span aria-hidden="true" className={`h-2 w-2 rounded-full ${tone.dot}`} />
            )}
            <span
              className={`font-mono text-[11px] font-semibold uppercase tracking-wider ${tone.text}`}
            >
              {t(`admin.connection.${connection}`)}
            </span>
          </span>
          <NotificationBell
            buttonClassName="flex h-8 w-8 items-center justify-center !p-0 text-cos-op-on-surface-variant transition-colors hover:bg-cos-op-container hover:text-cos-op-on-surface"
            icon={<AdminIcon name="notifications" size={18} />}
            unreadDotClassName="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-cos-op-gate motion-safe:animate-pulse"
          />
          <div className="flex items-center gap-2 border-l border-cos-op-outline-variant/40 pl-2">
            <MenuTrigger>
              <Button
                aria-label={`${t('admin.account.menu')}${session?.user?.name ? `: ${session.user.name}` : ''}`}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-cos-op-primary-container text-[12px] font-bold text-cos-op-on-primary-container shadow-sm outline-none data-[focus-visible]:ring-2 data-[focus-visible]:ring-cos-op-primary"
              >
                {session?.user?.name?.trim() ? (
                  initials(session.user.name)
                ) : (
                  <AdminIcon name="person" size={16} />
                )}
              </Button>
              <Popover
                placement="bottom end"
                className="min-w-[12rem] rounded-md bg-cos-op-container-high p-1 shadow-xl"
              >
                <Menu
                  className="outline-none"
                  onAction={(key) => {
                    if (key === 'language') setLocale(locale === 'th' ? 'en' : 'th');
                    if (key === 'signout') router.push('/logout');
                  }}
                >
                  <MenuItem
                    id="language"
                    className="flex cursor-pointer items-center justify-between rounded px-3 py-2 text-op-label text-cos-op-on-surface outline-none data-[focused]:bg-cos-op-container-highest"
                  >
                    <span>{t('shell.language')}</span>
                    <span className="font-mono text-op-tiny uppercase text-cos-op-outline">
                      {locale === 'th' ? 'th → en' : 'en → th'}
                    </span>
                  </MenuItem>
                  <MenuItem
                    id="signout"
                    className="flex cursor-pointer items-center rounded px-3 py-2 text-op-label text-cos-op-on-surface outline-none data-[focused]:bg-cos-op-container-highest"
                  >
                    {t('common.signOut')}
                  </MenuItem>
                </Menu>
              </Popover>
            </MenuTrigger>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="z-20 flex w-64 shrink-0 border-r border-cos-op-outline-variant/50 bg-cos-op-container-low shadow-lg">
          <aside className="flex min-h-0 w-full flex-col justify-between gap-3 p-3">
            <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
              <div className="flex items-center justify-between px-2.5 py-1">
                <span className="text-op-tiny font-semibold uppercase tracking-widest text-cos-op-outline">
                  {t('admin.nav.section')}
                </span>
                <span className="text-op-tiny text-cos-op-secondary">{NO_DATA}</span>
              </div>
              <nav aria-label={t('admin.nav.menu')} className="flex flex-col gap-1">
                {nav.map((item) => {
                  const content = (
                    <>
                      <span className="flex items-center gap-2.5">
                        <AdminIcon name={item.icon} size={18} />
                        <span>{t(item.labelKey)}</span>
                      </span>
                      {item.trailing}
                    </>
                  );
                  if (!item.href) {
                    return (
                      <span
                        key={item.labelKey}
                        aria-disabled="true"
                        title={t('admin.nav.unavailable')}
                        className={`${NAV_ROW} cursor-not-allowed text-cos-op-on-surface-variant`}
                      >
                        {content}
                        <span className="sr-only">— {t('admin.nav.unavailable')}</span>
                      </span>
                    );
                  }
                  return (
                    <Link
                      key={item.labelKey}
                      href={item.href}
                      aria-current={tenantsActive ? 'page' : undefined}
                      className={`${NAV_ROW} ${
                        tenantsActive
                          ? 'bg-cos-op-primary-container text-cos-op-on-primary-container shadow-sm'
                          : 'text-cos-op-on-surface-variant hover:bg-cos-op-container hover:text-cos-op-on-surface'
                      }`}
                    >
                      {content}
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div className="shrink-0 rounded-md border border-cos-op-outline-variant/30 bg-cos-op-container-lowest p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-op-tiny font-semibold uppercase tracking-wider text-cos-op-outline">
                  {t('admin.pulse.title')}
                </span>
                <span className="flex items-center gap-1 text-op-tiny text-cos-op-success">
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 rounded-full bg-cos-op-success motion-safe:animate-pulse"
                  />
                  LIVE
                </span>
              </div>
              <dl className="space-y-1.5 font-mono text-[11px]">
                {(['emqx', 'timescale', 'mesh', 'queue'] as const).map((row) => (
                  <div key={row} className="flex justify-between text-cos-op-on-surface-variant">
                    <dt>{t(`admin.pulse.${row}`)}</dt>
                    <dd className="text-cos-op-on-surface">{NO_DATA}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </aside>
        </div>

        <main className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto bg-cos-op-surface p-6">
          {(showGateBanners ? atGate : []).map((tenant) => (
            <section
              key={tenant.tenant_id}
              aria-label={t('admin.gate.eyebrow')}
              data-gate-banner=""
              className="relative w-full shrink-0 overflow-hidden rounded-lg border border-cos-op-outline-variant/30 bg-cos-op-container-high p-4 shadow-xl"
            >
              <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-cos-op-gate" />
              <div className="flex flex-col justify-between gap-3 pl-2 lg:flex-row lg:items-center">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-cos-op-container-highest text-cos-op-gate">
                    <AdminIcon name="gavel" size={20} />
                  </span>
                  <div className="flex flex-col">
                    <p className="flex items-center gap-2">
                      <span className="text-op-label font-bold uppercase tracking-widest text-cos-op-gate">
                        {t('admin.gate.eyebrow')}
                      </span>
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 rounded-full bg-cos-op-gate motion-safe:animate-ping"
                      />
                      <span className="text-op-tiny text-cos-op-on-surface-variant">
                        {t('admin.gate.kind')}
                      </span>
                    </p>
                    <p className="mt-0.5 text-op-body text-cos-op-on-surface">
                      {t('admin.gate.tenant')}{' '}
                      <span className="font-mono font-semibold text-cos-op-secondary">
                        {tenant.tenant_code}
                      </span>{' '}
                      {t('admin.gate.body')}
                      {tenant.dedicated_db_host ? (
                        <span className="font-mono text-cos-op-primary">
                          {' '}
                          ({tenant.dedicated_db_host})
                        </span>
                      ) : null}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 self-end lg:self-center">
                  <button
                    type="button"
                    disabled
                    title={t('admin.nav.unavailable')}
                    className="flex h-9 items-center gap-1.5 rounded-md bg-cos-op-container px-3 text-op-label text-cos-op-on-surface disabled:cursor-not-allowed"
                  >
                    <AdminIcon name="visibility" size={16} />
                    {t('admin.gate.reviewPlan')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setGate({ tenant, decision: 'abort' })}
                    className="flex h-9 items-center gap-1.5 rounded-md bg-cos-op-error-container px-3 text-op-label text-cos-op-on-error-container transition-all hover:brightness-110"
                  >
                    <AdminIcon name="cancel" size={16} />
                    {t('admin.gate.abort')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setGate({ tenant, decision: 'approve' })}
                    className="flex h-9 items-center gap-1.5 rounded-md bg-cos-op-primary-container px-4 text-op-label font-semibold text-cos-op-on-primary-container shadow-md transition-all hover:brightness-110"
                  >
                    <AdminIcon name="verified" size={16} />
                    {t('admin.gate.approve')}
                  </button>
                </div>
              </div>
            </section>
          ))}

          {children}
        </main>
      </div>

      {gate ? (
        <GateDecisionDialog
          isOpen
          decision={gate.decision}
          tenantCode={gate.tenant.tenant_code}
          isPending={decide.isPending}
          errorMessage={
            decide.isError
              ? t(
                  errorKeyForStatus(
                    decide.error instanceof ApiError ? decide.error.status : undefined,
                    'decision',
                  ),
                )
              : undefined
          }
          onClose={() => {
            decide.reset();
            setGate(null);
          }}
          onConfirm={(justification) =>
            decide.mutate(
              { id: gate.tenant.tenant_id, decision: gate.decision, justification },
              { onSuccess: () => setGate(null) },
            )
          }
        />
      ) : null}
    </div>
  );
}
