'use client';

/**
 * SYSTEM_ADMIN — Tenant List (§20.4.1), the screen behind `/admin` and `/admin/tenants/new` (R13: Create Tenant is a
 * modal over this list — <CreateTenantModal />). Built to the CURRENT Stitch drawing "Tenant List & DB Provisioning -
 * SYSTEM_ADMIN" (screen 013fc8f094504f7e9d644d8b2dbb8c6d, HTML fetched 2026-09-15; revision R10) — class for
 * class, in the drawing's own colours and type (`cos-op-*` tokens). The shell — top bar, sidebar, Cluster
 * Pulse, gate banners — is <AdminShell />; this is the workspace inside its `<main>`.
 *
 * R12 (product owner, 2026-09-15): the page title and the "Tenant created:" line are screen-reader only; the header
 * row keeps its two buttons, right-aligned.
 * R13 (product owner, 2026-09-15): Create Tenant opens the modal; on success it closes and the URL becomes
 * `?created=<code>` (row highlight, announcement). With `createOpen` (the `/admin/tenants/new` route) the modal is
 * open on arrival and closing it goes to `/admin`.
 *
 * ── REAL ────────────────────────────────────────────────────────────────────────────────────────
 * Every figure comes from GET /admin/tenants and GET /admin/tenants/provisioning, computed in
 * lib/adminTenants.ts: tenant counts, the dedicated-DB count (rows with a `dedicated_db_host`), the gate
 * count, each row's region, created date and provisioning state, and the SYSTEM_ADMIN chip (the session's
 * role). The name's second line is the tenant's Keycloak realm (Q2, reaffirmed 2026-09-15) — the drawing's
 * "883-TH-EN" is an identifier no tenant has. A tenant with no provisioning run reads "✓ Active" when active (Q3).
 *
 * ── LAID OUT WITHOUT DATA (D1) — `—` / "No data source yet", never a made-up figure ──────────────
 * EMQX chip · PG Fleet's pool count · Import Central Prices (disabled; ADR-061 not built) · Enterprise DB
 * Fleet's caption figure · Migration Gates' "Avg Gate Time" and tier · Platform Compute card (value and bar)
 * · the footer's Cluster Zone. Specified in §20.4.6 for round 2.
 *
 * ── ROW ACTIONS — icon buttons as drawn (R3) ────────────────────────────────────────────────────
 * visibility opens <TenantDetailModal />, history <TenantAuditLogModal />, database = Assign DB (ENTERPRISE only;
 * disabled elsewhere) <AssignDedicatedDbModal />, block = Deactivate <DeactivateTenantModal /> (§20.4.5 type-the-code),
 * and on a row whose run is at the gate the drawing's filled gavel opens Approve. Mark as Contracted
 * (<MarkContractedModal />) is one more icon on an active ENTERPRISE row with no dedicated DB — §20.4.4 requires the
 * action; the drawing has no icon for it. R17: the window.prompt flows are gone; every modal carries the §6.7
 * justification.
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { AdminIcon, type AdminIconName } from './AdminIcon';
import { NO_DATA } from './AdminShell';
import { AssignDedicatedDbModal } from './AssignDedicatedDbModal';
import { CreateTenantModal } from './CreateTenantModal';
import { DeactivateTenantModal } from './DeactivateTenantModal';
import { TenantAuditLogModal } from './TenantAuditLogModal';
import { GateDecisionDialog } from './GateDecisionDialog';
import { MarkContractedModal } from './MarkContractedModal';
import { TenantDetailModal } from './TenantDetailModal';
import { LoadingState } from '../../components/ui/LoadingState';
import { useI18n } from '../../i18n';
import {
  GATE_STATE,
  errorKeyForStatus,
  filterTenants,
  pageNumbers,
  pageOf,
  paginate,
  provisioningByTenant,
  provisioningView,
  statusView,
  tenantMetrics,
  type PlanFilter,
  type PlanType,
  type ProvisioningTone,
  type StatusTone,
  type TenantListRow,
} from '../../lib/adminTenants';
import { ApiError } from '../../lib/api/client';
import { useDecideProvisioning, useTenantProvisioning, useTenants } from '../../lib/api/queries';
import { formatDate } from '../../lib/format';

const PLAN_FILTERS: PlanFilter[] = ['ALL', 'ENTERPRISE', 'PROFESSIONAL', 'STARTER'];

// As drawn: ENTERPRISE `bg-secondary-container/20 text-secondary border border-secondary/40 font-bold`, PROFESSIONAL
// `bg-surface-variant text-on-surface font-semibold`, STARTER `bg-surface-container-high text-outline font-medium`.
const PLAN_BADGE: Record<PlanType, string> = {
  ENTERPRISE:
    'border border-cos-op-secondary/40 bg-cos-op-secondary-container/20 text-cos-op-secondary font-bold',
  PROFESSIONAL: 'bg-cos-op-container-highest text-cos-op-on-surface font-semibold',
  STARTER: 'bg-cos-op-container-high text-cos-op-outline font-medium',
};

const TONE: Record<ProvisioningTone, { text: string; icon: AdminIconName | null }> = {
  ready: { text: 'text-cos-op-success', icon: 'check_circle' },
  gate: { text: 'text-cos-op-gate font-semibold', icon: 'hourglass_top' },
  working: { text: 'text-cos-op-secondary', icon: 'sync' },
  stopped: { text: 'text-cos-op-error', icon: 'cancel' },
  unknown: { text: 'text-cos-op-outline italic', icon: null },
  none: { text: 'text-cos-op-outline', icon: null },
};

// As drawn: Active `text-mobile-success`, Transit `text-sync-active`, Pending `text-sync-pending`.
const STATUS_TONE: Record<StatusTone, { text: string; dot: string }> = {
  active: { text: 'text-cos-op-success', dot: 'bg-cos-op-success' },
  transit: { text: 'text-cos-op-gate', dot: 'bg-cos-op-gate' },
  pending: { text: 'text-cos-op-pending', dot: 'bg-cos-op-pending' },
  inactive: { text: 'text-cos-op-outline', dot: 'bg-cos-op-outline' },
};

const statusOf = (err: unknown): number | undefined =>
  err instanceof ApiError ? err.status : undefined;

export function TenantListScreen({ createOpen = false }: { createOpen?: boolean }) {
  // useSearchParams needs a Suspense boundary under the App Router.
  return (
    <Suspense fallback={<LoadingState variant="table" />}>
      <TenantList createOpen={createOpen} />
    </Suspense>
  );
}

function TenantList({ createOpen }: { createOpen: boolean }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const created = params?.get('created') ?? null;
  const globalQuery = params?.get('q') ?? null;
  const tenants = useTenants();
  const provisioning = useTenantProvisioning();
  const decide = useDecideProvisioning();

  const [query, setQuery] = useState('');
  const [plan, setPlan] = useState<PlanFilter>('ALL');
  const [page, setPage] = useState(1);
  // R17: the row actions open their Stitch modals; each modal owns its request, justification and errors.
  const [rowAction, setRowAction] = useState<{
    kind: 'detail' | 'assign' | 'mark' | 'deactivate' | 'audit';
    row: TenantListRow;
  } | null>(null);
  const [approving, setApproving] = useState<TenantListRow | null>(null);
  const [creating, setCreating] = useState(createOpen);

  const closeCreate = () => {
    setCreating(false);
    if (createOpen) router.push('/admin');
  };

  const all = useMemo(() => tenants.data ?? [], [tenants.data]);
  const rows = useMemo(() => filterTenants(all, query, plan), [all, query, plan]);
  const states = useMemo(() => provisioningByTenant(provisioning.data), [provisioning.data]);
  const metrics = useMemo(
    () => tenantMetrics(all, provisioning.data, new Date()),
    [all, provisioning.data],
  );
  const shown = paginate(rows, page);

  // The top bar's search lands here as ?q=.
  useEffect(() => {
    if (globalQuery !== null) {
      setQuery(globalQuery);
      setPage(1);
    }
  }, [globalQuery]);

  // §20.4.2 success state: arrive on the page that holds the new tenant.
  useEffect(() => {
    if (created && all.length > 0) setPage(pageOf(rows, created));
    // Keyed on the list's arrival, not on `rows`: a later search must not jump back to the new row.
  }, [created, all.length]);

  return (
    <>
      {/* Breadcrumbs & telemetry card */}
      <div className="flex flex-col justify-between gap-3 rounded-lg border border-cos-op-outline-variant/20 bg-cos-op-container-low p-3 shadow-sm md:flex-row md:items-center">
        <nav className="flex items-center gap-2 text-op-tiny uppercase tracking-widest text-cos-op-on-surface-variant">
          <span className="text-cos-op-outline">{t('admin.list.breadcrumbSection')}</span>
          <span aria-hidden="true">/</span>
          <span className="font-bold text-cos-op-primary">{t('admin.list.breadcrumbPage')}</span>
        </nav>
        <div className="flex flex-wrap items-center gap-3 font-mono text-op-tiny text-cos-op-on-surface-variant">
          <Chip icon="hub" iconClass="text-cos-op-success">
            {t('admin.telemetry.emqx')}: {NO_DATA}
          </Chip>
          <Chip icon="storage" iconClass="text-cos-op-secondary">
            {t('admin.telemetry.pgFleet')}: {tenants.isSuccess ? metrics.dedicated : NO_DATA}{' '}
            {t('admin.telemetry.ded')} / {NO_DATA} {t('admin.telemetry.pool')}
          </Chip>
        </div>
      </div>

      {/* Action & header row */}
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div>
          {/* R12.1 (product owner 2026-09-15): not drawn; kept as the page's heading for assistive technology. */}
          <h1 className="sr-only">{t('admin.list.title')}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled
            title={t('admin.nav.unavailable')}
            className="flex h-9 cursor-not-allowed items-center gap-2 rounded-md bg-cos-op-container-high px-3 text-op-label text-cos-op-on-surface shadow-sm"
          >
            <AdminIcon name="upload_file" size={18} />
            {t('admin.list.importCentralPrices')}
          </button>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex h-9 items-center gap-2 rounded-md bg-cos-op-primary-container px-4 text-op-label font-semibold text-cos-op-on-primary-container shadow-md transition-all hover:brightness-110"
          >
            <AdminIcon name="add" size={18} />
            {t('admin.create.submit')}
          </button>
        </div>
      </div>

      {created ? (
        // R12.2: announced, not drawn — the §20.4.2 row highlight is what the eye gets.
        <p role="status" className="sr-only">
          {t('admin.list.created')} <span className="font-mono">{created}</span>
        </p>
      ) : null}

      {/* Metric cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label={t('admin.metrics.total')} icon="apartment" iconClass="">
          <MetricValue value={tenants.isSuccess ? metrics.total : NO_DATA}>
            <span className="text-op-tiny font-medium text-cos-op-success">
              {metrics.active} {t('admin.metrics.active')}
            </span>
          </MetricValue>
          <MetricFoot>
            <span>
              {metrics.inactive} {t('admin.metrics.inactive')}
            </span>
            <span className="font-mono text-cos-op-outline">
              +{metrics.createdThisWeek} {t('admin.metrics.thisWeek')}
            </span>
          </MetricFoot>
        </MetricCard>

        <MetricCard
          label={t('admin.metrics.enterpriseFleet')}
          icon="switch_account"
          iconClass="text-cos-op-secondary"
        >
          <MetricValue
            value={tenants.isSuccess ? metrics.dedicated : NO_DATA}
            valueClass="text-cos-op-secondary"
          >
            <span className="text-op-tiny text-cos-op-outline">{t('admin.metrics.instances')}</span>
          </MetricValue>
          <MetricFoot>
            <span>{t('admin.metrics.isolation')}</span>
            <span className="font-mono text-cos-op-secondary">{NO_DATA}</span>
          </MetricFoot>
        </MetricCard>

        <MetricCard
          label={t('admin.metrics.gates')}
          icon="shield_lock"
          iconClass="text-cos-op-gate"
        >
          <MetricValue
            value={provisioning.isSuccess ? metrics.awaitingGate : NO_DATA}
            valueClass="text-cos-op-gate"
          >
            <span className="text-op-tiny uppercase text-cos-op-gate">
              {t('admin.metrics.waiting')}
            </span>
          </MetricValue>
          <MetricFoot>
            <span>
              {t('admin.metrics.avgGateTime')}: {NO_DATA}
            </span>
            <span className="font-mono text-cos-op-outline">{NO_DATA}</span>
          </MetricFoot>
        </MetricCard>

        <MetricCard label={t('admin.metrics.compute')} icon="speed" iconClass="text-cos-op-primary">
          <MetricValue value={NO_DATA}>
            <span className="text-op-tiny text-cos-op-outline">{t('admin.noDataSource')}</span>
          </MetricValue>
          <div
            aria-hidden="true"
            className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-cos-op-container"
          />
        </MetricCard>
      </div>

      {/* Filters & search */}
      <div className="flex flex-col items-stretch justify-between gap-3 rounded-lg border border-cos-op-outline-variant/20 bg-cos-op-container-low p-3 shadow-sm md:flex-row md:items-center">
        <label className="relative flex-1">
          <span className="sr-only">{t('admin.list.searchLabel')}</span>
          <AdminIcon
            name="search"
            size={20}
            className="pointer-events-none absolute left-3 top-2.5 text-cos-op-outline"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder={t('admin.list.searchPlaceholder')}
            className="h-10 w-full rounded-md border border-cos-op-field-border bg-cos-op-container pl-10 pr-3 text-op-body text-cos-op-on-surface transition-colors placeholder:text-cos-op-outline focus:bg-cos-op-container-highest focus:outline-none"
          />
        </label>
        <div
          role="group"
          aria-label={t('admin.list.planFilter')}
          className="flex items-center gap-2"
        >
          {PLAN_FILTERS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={plan === p}
              onClick={() => {
                setPlan(p);
                setPage(1);
              }}
              className={`h-9 rounded-md px-3 text-op-label ${
                plan === p
                  ? 'bg-cos-op-primary-container font-semibold text-cos-op-on-primary-container'
                  : 'bg-cos-op-container text-cos-op-on-surface-variant transition-colors hover:text-cos-op-on-surface'
              }`}
            >
              {p === 'ALL' ? t('admin.list.allPlans') : t(`admin.plan.${p}`)}
            </button>
          ))}
        </div>
      </div>

      {provisioning.isError ? (
        <p role="status" className="text-op-tiny text-cos-op-gate">
          {t('admin.list.provisioningError')}
        </p>
      ) : null}

      {/* Tenants table */}
      <div className="flex shrink-0 grow flex-col justify-between overflow-hidden rounded-lg border border-cos-op-outline-variant/20 bg-cos-op-container-low shadow-md">
        {tenants.isLoading ? (
          <div className="p-4">
            <LoadingState variant="table" columns={8} label={t('admin.list.loading')} />
          </div>
        ) : tenants.isError ? (
          <p role="alert" className="p-6 text-op-body text-cos-op-error">
            {t('admin.list.loadError')}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-cos-op-outline-variant/30 bg-cos-op-container text-op-tiny uppercase tracking-wider text-cos-op-outline">
                  {(
                    ['code', 'name', 'plan', 'status', 'db', 'region', 'provisioning'] as const
                  ).map((c) => (
                    <th key={c} scope="col" className="px-3 py-3 font-medium first:px-4">
                      {t(`admin.col.${c}`)}
                    </th>
                  ))}
                  <th scope="col" className="px-4 py-3 text-center font-medium">
                    {t('admin.col.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cos-op-outline-variant/20 text-op-body">
                {shown.rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-cos-op-outline">
                      {t('admin.list.empty')}
                    </td>
                  </tr>
                ) : (
                  shown.rows.map((row) => (
                    <TenantRow
                      key={row.tenant_id}
                      row={row}
                      state={states.has(row.tenant_id) ? states.get(row.tenant_id) : undefined}
                      provisioningLoading={provisioning.isLoading}
                      highlighted={row.tenant_code === created}
                      locale={locale}
                      t={t}
                      onView={() => setRowAction({ kind: 'detail', row })}
                      onApprove={() => setApproving(row)}
                      onAssign={() => setRowAction({ kind: 'assign', row })}
                      onMarkContracted={() => setRowAction({ kind: 'mark', row })}
                      onDeactivate={() => setRowAction({ kind: 'deactivate', row })}
                      onAudit={() => setRowAction({ kind: 'audit', row })}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {!tenants.isLoading && !tenants.isError ? (
          <nav
            aria-label={t('admin.list.pagination')}
            className="flex flex-col items-center justify-between gap-2 border-t border-cos-op-outline-variant/30 bg-cos-op-container p-3 text-op-tiny text-cos-op-outline sm:flex-row"
          >
            <span className="flex items-center gap-3">
              <span>
                {t('admin.list.showing')} {shown.rows.length} {t('admin.list.of')} {shown.total}{' '}
                {t('admin.list.tenants')}
              </span>
              <span className="font-mono text-cos-op-on-surface-variant">
                {t('admin.list.clusterZone')}: {NO_DATA}
              </span>
            </span>
            <span className="flex items-center gap-1">
              <PageButton
                variant="edge"
                disabled={shown.page <= 1}
                onClick={() => setPage(shown.page - 1)}
              >
                {t('admin.list.previous')}
              </PageButton>
              {pageNumbers(shown.page, shown.pageCount).map((p, i) =>
                p === 'ellipsis' ? (
                  <span key={`e${i}`} aria-hidden="true">
                    ...
                  </span>
                ) : p === shown.page ? (
                  <span
                    key={p}
                    aria-current="page"
                    className="rounded bg-cos-op-primary-container/20 px-2 py-1 font-mono font-semibold text-cos-op-primary"
                  >
                    {p}
                  </span>
                ) : (
                  <PageButton
                    key={p}
                    label={`${t('admin.list.page')} ${p}`}
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </PageButton>
                ),
              )}
              <PageButton
                variant="edge"
                disabled={shown.page >= shown.pageCount}
                onClick={() => setPage(shown.page + 1)}
              >
                {t('admin.list.next')}
              </PageButton>
            </span>
          </nav>
        ) : null}
      </div>

      {creating ? (
        <CreateTenantModal
          onClose={closeCreate}
          onCreated={(code) => {
            setCreating(false);
            router.replace(`/admin?created=${encodeURIComponent(code)}`);
          }}
        />
      ) : null}

      {rowAction?.kind === 'detail' ? (
        <TenantDetailModal
          tenant={rowAction.row}
          state={
            states.has(rowAction.row.tenant_id) ? states.get(rowAction.row.tenant_id) : undefined
          }
          onClose={() => setRowAction(null)}
          onAction={(action) => setRowAction({ kind: action, row: rowAction.row })}
        />
      ) : null}
      {rowAction?.kind === 'mark' ? (
        <MarkContractedModal
          tenant={rowAction.row}
          onClose={() => setRowAction(null)}
          onDone={() => setRowAction(null)}
        />
      ) : null}
      {rowAction?.kind === 'assign' ? (
        <AssignDedicatedDbModal
          tenant={rowAction.row}
          onClose={() => setRowAction(null)}
          onDone={() => setRowAction(null)}
        />
      ) : null}
      {rowAction?.kind === 'audit' ? (
        <TenantAuditLogModal tenant={rowAction.row} onClose={() => setRowAction(null)} />
      ) : null}
      {rowAction?.kind === 'deactivate' ? (
        <DeactivateTenantModal
          tenant={rowAction.row}
          onClose={() => setRowAction(null)}
          onDone={() => setRowAction(null)}
        />
      ) : null}

      {approving ? (
        <GateDecisionDialog
          isOpen
          decision="approve"
          tenantCode={approving.tenant_code}
          isPending={decide.isPending}
          errorMessage={
            decide.isError ? t(errorKeyForStatus(statusOf(decide.error), 'decision')) : undefined
          }
          onClose={() => {
            decide.reset();
            setApproving(null);
          }}
          onConfirm={(justification) =>
            decide.mutate(
              { id: approving.tenant_id, decision: 'approve', justification },
              { onSuccess: () => setApproving(null) },
            )
          }
        />
      ) : null}
    </>
  );
}

function TenantRow({
  row,
  state,
  provisioningLoading,
  highlighted,
  locale,
  t,
  onView,
  onApprove,
  onAssign,
  onMarkContracted,
  onDeactivate,
  onAudit,
}: {
  row: TenantListRow;
  state: string | null | undefined;
  provisioningLoading: boolean;
  highlighted: boolean;
  locale: Parameters<typeof formatDate>[0];
  t: (key: string) => string;
  onView: () => void;
  onApprove: () => void;
  onAssign: () => void;
  onMarkContracted: () => void;
  onDeactivate: () => void;
  onAudit: () => void;
}) {
  const view = provisioningLoading ? null : provisioningView(state, row.is_active);
  const atGate = state === GATE_STATE;
  const enterprise = row.plan_type === 'ENTERPRISE';
  const toneIcon = view ? TONE[view.tone].icon : null;
  const status = statusView(provisioningLoading ? undefined : state, row.is_active);
  // A run in progress takes no row action but View and Audit Log, as drawn; a tenant with ANY run is never
  // offered Mark as Contracted again — the API would start a second run on the same workflow id.
  const inProgress = status.tone === 'pending';
  const hasRun = state !== undefined;

  return (
    <tr
      data-testid={`tenant-row-${row.tenant_code}`}
      className={`${
        highlighted
          ? 'bg-cos-op-primary-container/15'
          : atGate
            ? 'bg-cos-op-gate/5 hover:bg-cos-op-gate/10'
            : 'hover:bg-cos-op-container/60'
      } transition-colors ${row.is_active ? '' : 'opacity-60'}`}
    >
      <td
        className={`px-4 py-3 font-mono text-op-tiny ${
          atGate
            ? 'font-semibold text-cos-op-secondary'
            : enterprise
              ? 'font-semibold text-cos-op-primary'
              : 'text-cos-op-on-surface-variant'
        }`}
      >
        {row.tenant_code}
      </td>
      <td className="max-w-[7.5rem] px-3 py-3">
        <div
          className="truncate text-op-label font-medium text-cos-op-on-surface"
          title={row.tenant_name}
        >
          {row.tenant_name}
        </div>
        <div className="truncate text-op-tiny text-cos-op-outline" title={row.keycloak_realm}>
          {row.keycloak_realm}
        </div>
      </td>
      <td className="px-3 py-3">
        <span
          className={`inline-flex items-center rounded px-2 py-0.5 text-op-tiny ${PLAN_BADGE[row.plan_type]}`}
        >
          {row.plan_type}
        </span>
      </td>
      <td className="px-3 py-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded bg-cos-op-container px-2 py-0.5 text-op-tiny font-medium ${STATUS_TONE[status.tone].text}`}
        >
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 rounded-full ${STATUS_TONE[status.tone].dot}`}
          />
          {t(status.labelKey)}
        </span>
      </td>
      <td className="whitespace-nowrap px-3 py-3 font-mono text-op-tiny">
        {row.dedicated_db_host ? (
          <span
            className="flex items-center gap-1.5 text-cos-op-on-surface"
            title={row.dedicated_db_host}
          >
            <AdminIcon name="dns" size={14} className="shrink-0 text-cos-op-secondary" />
            <span className="max-w-[7rem] truncate">{row.dedicated_db_host}</span>
          </span>
        ) : (
          <span
            className="block max-w-[8.5rem] truncate text-cos-op-outline"
            title={t('admin.pooled')}
          >
            {t('admin.pooled')}
          </span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-3">
        <div className="text-op-label text-cos-op-on-surface">{row.data_region}</div>
        <div className="text-op-tiny text-cos-op-outline">{formatDate(locale, row.created_at)}</div>
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-op-tiny">
        {view === null ? (
          <LoadingState variant="micro" />
        ) : (
          <span className={`inline-flex items-center gap-1 ${TONE[view.tone].text}`}>
            {toneIcon ? <AdminIcon name={toneIcon} size={14} /> : null}
            {t(view.labelKey)}
          </span>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right">
        <span className="inline-flex items-center gap-1">
          <IconButton icon="visibility" label={t('admin.row.view')} onClick={onView} />
          {atGate ? (
            <IconButton
              icon="gavel"
              label={t('admin.row.approveGate')}
              onClick={onApprove}
              tone="gate"
            />
          ) : row.is_active && !inProgress ? (
            <IconButton
              icon="database"
              label={
                enterprise
                  ? t('admin.assignDb')
                  : `${t('admin.assignDb')} — ${t('admin.row.enterpriseOnly')}`
              }
              onClick={onAssign}
              disabled={!enterprise}
              tone={enterprise ? 'cyan' : 'muted'}
            />
          ) : null}
          {row.is_active &&
          enterprise &&
          !row.dedicated_db_host &&
          !hasRun &&
          !provisioningLoading ? (
            <IconButton
              icon="verified"
              label={t('admin.markContracted')}
              onClick={onMarkContracted}
              tone="warning"
            />
          ) : null}
          <IconButton icon="history" label={t('admin.row.auditLog')} onClick={onAudit} />
          {row.is_active && !atGate && !inProgress ? (
            <IconButton
              icon="block"
              label={t('settings.deactivate')}
              onClick={onDeactivate}
              tone="danger"
            />
          ) : null}
        </span>
      </td>
    </tr>
  );
}

function Chip({
  icon,
  iconClass,
  children,
}: {
  icon: AdminIconName;
  iconClass: string;
  children: React.ReactNode;
}) {
  return (
    <span className="flex items-center gap-1.5 rounded bg-cos-op-container px-2 py-1">
      <AdminIcon name={icon} size={14} className={iconClass} />
      <span>{children}</span>
    </span>
  );
}

function MetricCard({
  label,
  icon,
  iconClass,
  children,
}: {
  label: string;
  icon: AdminIconName;
  iconClass: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-cos-op-outline-variant/20 bg-cos-op-container-low p-4 shadow-sm">
      <div className="mb-1 flex items-center justify-between text-cos-op-outline">
        <span className="text-op-tiny uppercase tracking-wider">{label}</span>
        <AdminIcon name={icon} size={18} className={iconClass} />
      </div>
      {children}
    </div>
  );
}

function MetricValue({
  value,
  valueClass = 'text-cos-op-on-surface',
  children,
}: {
  value: number | string;
  valueClass?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className={`text-op-display font-bold ${valueClass}`}>{value}</span>
      {children}
    </div>
  );
}

function MetricFoot({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 flex items-center justify-between text-op-tiny text-cos-op-on-surface-variant">
      {children}
    </div>
  );
}

// As drawn: plain `text-on-surface-variant hover:text-on-surface`, database `text-secondary`, block `text-error`,
// the gate's gavel `bg-sync-active text-on-tertiary-fixed`.
const ICON_TONE = {
  plain: 'text-cos-op-on-surface-variant hover:bg-cos-op-container hover:text-cos-op-on-surface',
  cyan: 'text-cos-op-secondary hover:bg-cos-op-container',
  muted: 'text-cos-op-outline hover:bg-cos-op-container hover:text-cos-op-secondary',
  warning: 'text-cos-op-gate hover:bg-cos-op-container',
  danger: 'text-cos-op-error hover:bg-cos-op-container',
  gate: 'bg-cos-op-gate font-bold text-cos-op-on-gate',
} as const;

function IconButton({
  icon,
  label,
  onClick,
  disabled = false,
  tone = 'plain',
}: {
  icon: AdminIconName;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  tone?: keyof typeof ICON_TONE;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`rounded p-1.5 disabled:cursor-not-allowed ${ICON_TONE[tone]}`}
    >
      <AdminIcon name={icon} size={18} />
    </button>
  );
}

function PageButton({
  variant = 'number',
  disabled = false,
  label,
  onClick,
  children,
}: {
  variant?: 'edge' | 'number';
  disabled?: boolean;
  label?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      onClick={onClick}
      className={`rounded px-2 py-1 disabled:opacity-50 ${
        variant === 'edge'
          ? 'bg-cos-op-container-high text-cos-op-on-surface hover:brightness-110'
          : 'text-cos-op-on-surface-variant hover:bg-cos-op-container-high'
      }`}
    >
      {children}
    </button>
  );
}
