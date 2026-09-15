'use client';

/**
 * SYSTEM_ADMIN — Dedicated DB Fleet Management (`/admin/db-fleet`), the Stitch "Dedicated DB Fleet Management -
 * SYSTEM_ADMIN" screen (3e635a2fb7e5…, HTML fetched 2026-09-15; revision R17, re-synced R18). The workspace only; the shell is
 * <AdminShell /> (product-owner decision R10).
 *
 * ── PRODUCT-OWNER DECISIONS D16–D19 (R19, 2026-09-15; reversing R17's D6) ───────────────────────
 *   REAL — one row per tenant with a dedicated DB (`dedicated_db_host`, GET /admin/tenants): the host, the tenant's
 *     name and code, its data region, and its provisioning run's state (GET /admin/tenants/provisioning) as the row's
 *     dot — amber at the gate, green otherwise. The ALL FLEET and MAINTENANCE counts and filters, the
 *     "showing N of M" line, paging, and sorting by tenant code or creation date.
 *   COMING SOON — drawn as Stitch draws it, from lib/adminDrawnFigures.ts `FLEET`: the four capacity tiles, the HEALTHY
 *     and FAILOVER READY counts, the zone, TLS enclave and KMS key id, the envelope badges, and each real row's port /
 *     PgBouncer, node archetype, HA / standby, CPU / memory, storage / IOPS and CDC lag (the drawing's row values
 *     repeat over the real rows). After the real rows, on the last page and under ALL FLEET only, the drawing's six
 *     instance rows (D17) — never counted in a figure.
 *   COMING SOON (D18) — Refresh Fleet, PgBouncer Pool, New Dedicated DB, the HEALTHY / FAILOVER READY filters, the zone
 *     picker, the two saturation sorts, Export CSV, and each row's CONFIG / METRICS / terminal / GATE / LOGS open the
 *     "coming soon" dialog.
 *   The envelope cards' titles and body copy are the drawing's labels. The drawing's page title is empty; the page's
 *     heading is screen-reader only.
 *   R18 (the drawing as listed 2026-09-15): the ISOLATION and PG 16.4 tags are gone; NEW DEDICATED DB, MAINTENANCE,
 *     legend REPLICATED / STANDBY / MIGRATING, and card titles without a section citation.
 */

import { useMemo, useState } from 'react';
import { useI18n } from '../../i18n';
import {
  GATE_STATE,
  PAGE_SIZE,
  pageNumbers,
  paginate,
  provisioningByTenant,
  type TenantListRow,
} from '../../lib/adminTenants';
import { useTenantProvisioning, useTenants } from '../../lib/api/queries';
import { FLEET, drawnFor } from '../../lib/adminDrawnFigures';
import { formatDate } from '../../lib/format';
import { LoadingState } from '../ui/LoadingState';
import { AdminIcon, type AdminIconName } from './AdminIcon';
import { NO_DATA } from './AdminShell';
import { useComingSoon } from './ComingSoon';

type FleetFilter = 'all' | 'gate';
type FleetSort = 'code' | 'created';

const CARD = 'rounded border border-cos-dark-outline/30 bg-cos-op-container-low';
const TOOL_BTN =
  'flex h-8 shrink-0 items-center gap-1.5 rounded border border-cos-dark-outline/40 bg-cos-op-container-low px-3 font-mono text-[11px] font-medium text-cos-dark-text transition-colors hover:bg-cos-op-container-highest';

type DrawnInstance = (typeof FLEET.instances)[number];
const NORMAL_INSTANCES = FLEET.instances.filter((i) => !i.gate);
const GATE_INSTANCES = FLEET.instances.filter((i) => i.gate);
const KPI_TONE = {
  compute: {
    bar: 'bg-cos-blue',
    unit: 'text-cos-v3-emerald-400',
    value: 'text-cos-white',
    right: 'text-cos-v3-slate-400',
  },
  iops: {
    bar: 'bg-cos-v3-emerald-500',
    unit: 'text-cos-v3-slate-400',
    value: 'text-cos-white',
    right: 'text-cos-v3-emerald-400',
  },
  storage: {
    bar: 'bg-cos-v3-cyan-500',
    unit: 'text-cos-v3-cyan-500',
    value: 'text-cos-white',
    right: 'text-cos-v3-emerald-400',
  },
  ha: {
    bar: 'bg-cos-v3-emerald-500',
    unit: 'text-cos-v3-emerald-400',
    value: 'text-cos-v3-emerald-400',
    right: 'text-cos-v3-slate-400',
  },
} as const;
const ENVELOPE_BADGE = {
  boundary: 'border-cos-v3-emerald-500/30 bg-cos-v3-emerald-500/10 text-cos-v3-emerald-400',
  justification: 'border-cos-blue/40 bg-cos-blue/15 text-cos-blue',
  standby: 'border-cos-v3-emerald-500/30 bg-cos-v3-emerald-500/10 text-cos-v3-emerald-400',
} as const;

export function DedicatedDbFleet() {
  const { t, locale } = useI18n();
  const tenants = useTenants();
  const provisioning = useTenantProvisioning();
  const [filter, setFilter] = useState<FleetFilter>('all');
  const [sort, setSort] = useState<FleetSort>('code');
  const [page, setPage] = useState(1);
  const comingSoon = useComingSoon();

  const states = useMemo(() => provisioningByTenant(provisioning.data), [provisioning.data]);
  const fleet = useMemo(
    () => (tenants.data ?? []).filter((r) => r.dedicated_db_host !== null),
    [tenants.data],
  );
  const atGate = fleet.filter((r) => states.get(r.tenant_id) === GATE_STATE);
  const rows = useMemo(() => {
    const base =
      filter === 'gate' ? fleet.filter((r) => states.get(r.tenant_id) === GATE_STATE) : fleet;
    const collator = new Intl.Collator(locale);
    return [...base].sort((a, b) =>
      sort === 'code'
        ? collator.compare(a.tenant_code, b.tenant_code)
        : b.created_at.localeCompare(a.created_at),
    );
  }, [fleet, filter, sort, states, locale]);
  const shown = paginate(rows, page);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">{t('admin.fleet.title')}</h1>
      <div className="flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-3" />
        <div className="flex items-center gap-2">
          {/* COMING SOON — no process behind the fleet tools (D18) */}
          <button
            type="button"
            onClick={() => comingSoon(t('admin.fleet.refresh'))}
            className={TOOL_BTN}
          >
            <AdminIcon name="sync" size={15} className="text-cos-v3-slate-400" />
            <span>{t('admin.fleet.refresh')}</span>
          </button>
          <button
            type="button"
            onClick={() => comingSoon(t('admin.fleet.pool'))}
            className={TOOL_BTN}
          >
            <AdminIcon name="tune" size={15} className="text-cos-v3-slate-400" />
            <span>{t('admin.fleet.pool')}</span>
          </button>
          <button
            type="button"
            onClick={() => comingSoon(t('admin.fleet.provision'))}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded bg-cos-blue px-3.5 font-mono text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-cos-v3-blue-600"
          >
            <AdminIcon name="add_circle" size={16} />
            <span>{t('admin.fleet.provision')}</span>
          </button>
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(
          [
            ['compute', 'memory', 'text-cos-v3-cyan-500'],
            ['iops', 'speed', 'text-cos-blue'],
            ['storage', 'lock', 'text-cos-v3-emerald-400'],
            ['ha', 'verified_user', 'text-cos-v3-amber-400'],
          ] as const
        ).map(([key, icon, tone]) => (
          <div key={key} className={`${CARD} flex flex-col justify-between p-3.5`}>
            <div className="flex items-center justify-between text-cos-v3-slate-400">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-wider">
                {t(`admin.fleet.kpi.${key}`)}
              </span>
              <AdminIcon name={icon} size={18} className={tone} />
            </div>
            {/* COMING SOON — FLEET.kpi */}
            <div className="my-2 flex items-baseline gap-2">
              <span
                className={`font-mono text-[26px] font-bold leading-none ${KPI_TONE[key].value}`}
              >
                {FLEET.kpi[key].value}
              </span>
              <span className={`font-mono text-[12px] font-medium ${KPI_TONE[key].unit}`}>
                {FLEET.kpi[key].unit}
              </span>
            </div>
            <div
              aria-hidden="true"
              className="h-1.5 w-full overflow-hidden rounded-full bg-cos-op-container-highest"
            >
              <div
                className={`h-full rounded-full ${KPI_TONE[key].bar}`}
                style={{ width: `${FLEET.kpi[key].barPercent}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between font-mono text-[11px] text-cos-v3-slate-400">
              <span>{FLEET.kpi[key].left}</span>
              <span className={KPI_TONE[key].right}>{FLEET.kpi[key].right}</span>
            </div>
          </div>
        ))}
      </div>

      <div className={`${CARD} flex shrink-0 items-center justify-between px-3.5 py-2.5`}>
        <div className="flex items-center gap-2.5">
          <div
            role="group"
            aria-label={t('admin.fleet.filters')}
            className="flex items-center rounded border border-cos-dark-outline/40 bg-cos-dark-bg p-0.5 font-mono text-[11px] font-medium"
          >
            <FilterButton
              active={filter === 'all'}
              onPress={() => {
                setFilter('all');
                setPage(1);
              }}
            >
              {t('admin.fleet.filter.all')} ({tenants.isSuccess ? fleet.length : NO_DATA})
            </FilterButton>
            {/* COMING SOON — FLEET.healthyCount; the filter opens the dialog (D18) */}
            <FilterButton onPress={() => comingSoon(t('admin.fleet.filter.healthy'))}>
              {t('admin.fleet.filter.healthy')} ({FLEET.healthyCount})
            </FilterButton>
            <FilterButton
              active={filter === 'gate'}
              onPress={() => {
                setFilter('gate');
                setPage(1);
              }}
            >
              <span>
                {t('admin.fleet.filter.gate')} ({provisioning.isSuccess ? atGate.length : NO_DATA})
              </span>
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-cos-v3-amber-400" />
            </FilterButton>
            <FilterButton onPress={() => comingSoon(t('admin.fleet.filter.failover'))}>
              {t('admin.fleet.filter.failover')} ({FLEET.failoverCount})
            </FilterButton>
          </div>
          {/* COMING SOON — FLEET.zone; the picker opens the dialog (D18) */}
          <button
            type="button"
            onClick={() => comingSoon(t('admin.fleet.zone'))}
            className="flex h-7 items-center gap-1.5 rounded border border-cos-dark-outline/40 bg-cos-dark-bg px-2.5 font-mono text-[11px] text-cos-dark-text"
          >
            <span className="text-[10px] text-cos-v3-slate-400">{t('admin.fleet.zone')}</span>
            <span className="font-semibold text-cos-white">{FLEET.zone}</span>
            <AdminIcon name="expand_more" size={15} className="text-cos-v3-slate-400" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <label
            htmlFor="fleet-sort"
            className="whitespace-nowrap font-mono text-[11px] text-cos-v3-slate-400"
          >
            {t('admin.fleet.sortBy')}
          </label>
          <select
            id="fleet-sort"
            value={sort}
            onChange={(e) => {
              const next = e.target.value;
              // COMING SOON — the saturation and storage sorts have no data to sort by (D18)
              if (next === 'saturation' || next === 'storage') {
                comingSoon(e.target.selectedOptions[0]?.text ?? next);
                return;
              }
              setSort(next as FleetSort);
              setPage(1);
            }}
            className="h-8 w-[268px] cursor-pointer rounded border border-cos-op-outline-variant/30 bg-cos-op-container-low px-2.5 pr-8 font-mono text-[12px] font-medium leading-tight text-cos-op-on-surface outline-none focus:ring-1 focus:ring-cos-blue"
          >
            <option value="saturation">{t('admin.fleet.sort.saturation')}</option>
            <option value="storage">{t('admin.fleet.sort.storage')}</option>
            <option value="code">{t('admin.fleet.sort.code')}</option>
            <option value="created">{t('admin.fleet.sort.created')}</option>
          </select>
          {/* COMING SOON — no fleet specs to export (D18) */}
          <button
            type="button"
            aria-label={t('admin.fleet.export')}
            onClick={() => comingSoon(t('admin.fleet.export'))}
            className="flex h-7 w-7 items-center justify-center rounded border border-cos-dark-outline/40 bg-cos-dark-bg text-cos-v3-slate-400 transition-colors hover:text-cos-white"
          >
            <AdminIcon name="download" size={15} />
          </button>
        </div>
      </div>

      <section
        className={`${CARD} flex min-h-[380px] flex-1 flex-col overflow-hidden`}
        aria-label={t('admin.fleet.directory')}
      >
        <div className="flex items-center justify-between border-b border-cos-dark-outline/30 bg-cos-op-container-highest/30 px-4 py-2.5">
          <div className="flex items-center gap-2 font-mono text-[12px] font-semibold text-cos-white">
            <AdminIcon name="inventory_2" size={18} className="text-cos-v3-cyan-500" />
            <span>
              {t('admin.fleet.directory')} ({t('admin.fleet.showing')} {shown.rows.length}{' '}
              {t('admin.list.of')} {rows.length})
            </span>
          </div>
          <div className="flex items-center gap-3 font-mono text-[11px] text-cos-v3-slate-400">
            <Legend dot="bg-cos-v3-emerald-400">{t('admin.fleet.legend.replicated')}</Legend>
            <Legend dot="bg-cos-v3-cyan-500">{t('admin.fleet.legend.standby')}</Legend>
            <Legend dot="bg-cos-v3-amber-400">{t('admin.fleet.legend.gate')}</Legend>
          </div>
        </div>

        <div className="w-full flex-1 overflow-auto">
          {tenants.isLoading ? (
            <div className="p-4">
              <LoadingState variant="table" columns={8} label={t('admin.list.loading')} />
            </div>
          ) : (
            <table className="w-full border-collapse text-left" style={{ minWidth: 1180 }}>
              <thead className="sticky top-0 z-10 border-b border-cos-dark-outline/30 bg-cos-dark-bg/80 font-mono text-[11px] font-medium uppercase tracking-wider text-cos-v3-slate-400">
                <tr>
                  {(
                    ['instance', 'tenant', 'archetype', 'zone', 'cpu', 'storage', 'cdc'] as const
                  ).map((c) => (
                    <th key={c} scope="col" className="px-3 py-2.5 first:px-3.5">
                      {t(`admin.fleet.col.${c}`)}
                    </th>
                  ))}
                  <th scope="col" className="px-3.5 py-2.5 text-right">
                    {t('admin.fleet.col.operations')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cos-dark-outline/20 font-mono text-[12px]">
                {shown.rows.length === 0 && filter !== 'all' ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-cos-v3-slate-400">
                      {t('admin.fleet.empty')}
                    </td>
                  </tr>
                ) : null}
                {shown.rows.map((row, index) => {
                  const gate = states.get(row.tenant_id) === GATE_STATE;
                  return (
                    <FleetRow
                      key={row.tenant_id}
                      row={row}
                      gate={gate}
                      created={formatDate(locale, row.created_at)}
                      drawn={
                        (gate
                          ? drawnFor(GATE_INSTANCES, index)
                          : drawnFor(NORMAL_INSTANCES, (shown.page - 1) * PAGE_SIZE + index))!
                      }
                      t={t}
                      onComingSoon={comingSoon}
                    />
                  );
                })}
                {/* COMING SOON — FLEET.instances: the drawing's rows after the real ones (D17) */}
                {filter === 'all' && shown.page >= shown.pageCount
                  ? FLEET.instances.map((instance) => (
                      <DrawnInstanceRow
                        key={instance.host}
                        instance={instance}
                        t={t}
                        onComingSoon={comingSoon}
                      />
                    ))
                  : null}
              </tbody>
            </table>
          )}
        </div>

        <nav
          aria-label={t('admin.list.pagination')}
          className="flex shrink-0 items-center justify-between border-t border-cos-dark-outline/30 bg-cos-dark-bg/90 px-4 py-2 font-mono text-[11px]"
        >
          <div className="flex items-center gap-2 text-cos-v3-slate-400">
            <span>
              {t('admin.fleet.footShowing')}{' '}
              {shown.rows.length === 0 ? 0 : (shown.page - 1) * PAGE_SIZE + 1} -{' '}
              {(shown.page - 1) * PAGE_SIZE + shown.rows.length} {t('admin.fleet.footOf')}{' '}
              {rows.length} {t('admin.fleet.footUnit')}
            </span>
            <span aria-hidden="true">•</span>
            {/* COMING SOON — FLEET.tls / kms */}
            <span className="text-cos-v3-cyan-500">
              {t('admin.fleet.tls')} {FLEET.tls}
            </span>
            <span aria-hidden="true">•</span>
            <span className="text-cos-v3-slate-400/80">
              {t('admin.fleet.kms')} {FLEET.kms}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <PageBtn disabled={shown.page <= 1} onClick={() => setPage(shown.page - 1)}>
              {t('admin.fleet.prev')}
            </PageBtn>
            {pageNumbers(shown.page, shown.pageCount).map((p, i) =>
              p === 'ellipsis' ? (
                <span
                  key={`e${i}`}
                  aria-hidden="true"
                  className="rounded border border-cos-dark-outline/40 px-2 py-0.5 text-cos-v3-slate-400"
                >
                  ...
                </span>
              ) : (
                <PageBtn key={p} current={p === shown.page} onClick={() => setPage(p)}>
                  {p}
                </PageBtn>
              ),
            )}
            <PageBtn
              disabled={shown.page >= shown.pageCount}
              onClick={() => setPage(shown.page + 1)}
            >
              {t('admin.fleet.next')}
            </PageBtn>
          </div>
        </nav>
      </section>

      <div className="grid shrink-0 grid-cols-1 gap-3 lg:grid-cols-3">
        {(
          [
            ['boundary', 'security'],
            ['justification', 'history_edu'],
            ['standby', 'cloud_sync'],
          ] as const
        ).map(([key, icon]) => (
          <div key={key} className={`${CARD} flex flex-col justify-between p-3 text-[11px]`}>
            <div className="mb-1.5 flex items-center justify-between font-mono text-[11px] font-semibold text-cos-v3-cyan-500">
              <span className="flex items-center gap-1.5">
                <AdminIcon name={icon as AdminIconName} size={16} />
                <span>{t(`admin.fleet.envelope.${key}.title`)}</span>
              </span>
              {/* COMING SOON — FLEET.envelopeBadges */}
              <span
                className={`rounded border px-1.5 font-mono text-[10px] ${ENVELOPE_BADGE[key]}`}
              >
                {FLEET.envelopeBadges[key]}
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-cos-v3-slate-400">
              {t(`admin.fleet.envelope.${key}.body`)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function FleetRow({
  row,
  gate,
  created,
  drawn,
  t,
  onComingSoon,
}: {
  row: TenantListRow;
  gate: boolean;
  created: string;
  /** COMING SOON — the drawing's row whose unsourced cells this real row shows. */
  drawn: DrawnInstance;
  t: (key: string) => string;
  onComingSoon: (feature: string) => void;
}) {
  return (
    <tr
      data-testid={`fleet-row-${row.tenant_code}`}
      className={`transition-colors hover:bg-cos-op-container-highest/30 ${gate ? 'bg-cos-v3-amber-500/5' : ''}`}
    >
      <td className="whitespace-nowrap px-3.5 py-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`h-2 w-2 shrink-0 rounded-full ${gate ? 'bg-cos-v3-amber-400' : 'bg-cos-v3-emerald-400'}`}
          />
          <div>
            <div className="flex items-center gap-1.5 font-bold text-cos-white">
              <span>{row.dedicated_db_host}</span>
              <AdminIcon
                name={gate ? 'sync' : 'lock'}
                size={14}
                className={gate ? 'text-cos-v3-amber-400' : 'text-cos-v3-cyan-500'}
              />
            </div>
            <div
              className={`font-mono text-[11px] ${gate ? 'text-cos-v3-amber-400' : 'text-cos-v3-slate-400'}`}
            >
              {gate ? t('admin.fleet.row.gate') : drawn.port}
            </div>
          </div>
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-3">
        <div className="font-semibold text-cos-white">{row.tenant_name}</div>
        <div className="font-mono text-[11px] text-cos-v3-cyan-500">{row.tenant_code}</div>
      </td>
      <DrawnCells instance={drawn} created={created} region={row.data_region} />
      <td className="whitespace-nowrap px-3.5 py-3 text-right">
        <RowActions instance={drawn} gate={gate} t={t} onComingSoon={onComingSoon} />
      </td>
    </tr>
  );
}

/** A drawn instance row (D17) — every cell is the drawing's. */
function DrawnInstanceRow({
  instance,
  t,
  onComingSoon,
}: {
  instance: DrawnInstance;
  t: (key: string) => string;
  onComingSoon: (feature: string) => void;
}) {
  return (
    <tr
      className={`transition-colors hover:bg-cos-op-container-highest/30 ${instance.gate ? 'bg-cos-v3-amber-500/5' : ''}`}
    >
      <td className="whitespace-nowrap px-3.5 py-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`h-2 w-2 shrink-0 rounded-full ${instance.gate ? 'bg-cos-v3-amber-400' : 'bg-cos-v3-emerald-400'}`}
          />
          <div>
            <div className="flex items-center gap-1.5 font-bold text-cos-white">
              <span>{instance.host}</span>
              <AdminIcon
                name={instance.gate ? 'sync' : 'lock'}
                size={14}
                className={instance.gate ? 'text-cos-v3-amber-400' : 'text-cos-v3-cyan-500'}
              />
            </div>
            <div
              className={`font-mono text-[11px] ${instance.gate ? 'text-cos-v3-amber-400' : 'text-cos-v3-slate-400'}`}
            >
              {instance.port}
            </div>
          </div>
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-3">
        <div className="font-semibold text-cos-white">{instance.tenant}</div>
        <div className="font-mono text-[11px] text-cos-v3-cyan-500">
          {instance.code} ({instance.ent})
        </div>
      </td>
      <DrawnCells instance={instance} created={instance.archetypeNote} region={instance.zone} />
      <td className="whitespace-nowrap px-3.5 py-3 text-right">
        <RowActions instance={instance} gate={instance.gate} t={t} onComingSoon={onComingSoon} />
      </td>
    </tr>
  );
}

/** The unsourced cells, as drawn: archetype, zone / HA, CPU / memory, storage / IOPS, CDC lag. */
function DrawnCells({
  instance,
  created,
  region,
}: {
  instance: DrawnInstance;
  created: string;
  region: string;
}) {
  const amber = instance.gate;
  const iopsTone =
    instance.iopsTone === 'amber'
      ? 'text-cos-v3-amber-400'
      : instance.iopsTone === 'cyan'
        ? 'text-cos-v3-cyan-500'
        : 'text-cos-v3-emerald-400';
  return (
    <>
      <td className="whitespace-nowrap px-3 py-3">
        <span className="rounded border border-cos-dark-outline/40 bg-cos-op-container-highest px-2 py-0.5 text-[11px] font-semibold text-cos-white">
          {instance.archetype}
        </span>
        <div className="mt-0.5 text-[10px] text-cos-v3-slate-400">{created}</div>
      </td>
      <td className="whitespace-nowrap px-3 py-3">
        <div className="flex items-center gap-1 text-cos-white">
          {region}
          <span
            className={`text-[10px] font-bold ${amber ? 'text-cos-v3-amber-400' : 'text-cos-v3-emerald-400'}`}
          >
            {instance.ha}
          </span>
        </div>
        <div className="text-[10px] text-cos-v3-slate-400">{instance.standby}</div>
      </td>
      <td className="whitespace-nowrap px-3 py-3">
        <div className="w-[110px]">
          <div className="mb-1 flex justify-between text-[11px]">
            <span className={instance.cpuHigh ? 'text-cos-v3-amber-400' : 'text-cos-white'}>
              {instance.cpu}
            </span>
            <span className="text-cos-v3-slate-400">{instance.mem}</span>
          </div>
          <div
            aria-hidden="true"
            className="h-1.5 w-full overflow-hidden rounded-full bg-cos-op-container-highest"
          >
            <div
              className={`h-full rounded-full ${instance.cpuHigh ? 'bg-cos-v3-amber-400' : 'bg-cos-v3-emerald-400'}`}
              style={{ width: `${instance.cpuPercent}%` }}
            />
          </div>
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-3">
        <div className="font-semibold text-cos-white">{instance.storage}</div>
        <div className={`text-[10px] ${iopsTone}`}>{instance.iops}</div>
      </td>
      <td className="whitespace-nowrap px-3 py-3">
        <span
          className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${
            amber
              ? 'bg-cos-v3-amber-500/15 text-cos-v3-amber-300'
              : 'bg-cos-v3-emerald-500/10 text-cos-v3-emerald-400'
          }`}
        >
          {instance.cdc}
        </span>
      </td>
    </>
  );
}

/** CONFIG / METRICS / terminal — or GATE / LOGS on a row at the gate — each opening the dialog (D18). */
function RowActions({
  instance,
  gate,
  t,
  onComingSoon,
}: {
  instance: DrawnInstance;
  gate: boolean;
  t: (key: string) => string;
  onComingSoon: (feature: string) => void;
}) {
  // A real row takes the drawing's action set for its state; a drawn row keeps its own.
  const labels =
    instance.gate === gate
      ? instance.actions
      : (gate ? GATE_INSTANCES : NORMAL_INSTANCES)[0]!.actions;
  return (
    <div className="flex items-center justify-end gap-1.5">
      {labels.map((label, i) => (
        <button
          key={label}
          type="button"
          onClick={() => onComingSoon(label)}
          className={`flex h-7 shrink-0 items-center justify-center rounded px-2 font-mono text-[11px] transition-colors ${
            gate && i === 0
              ? 'bg-cos-v3-amber-500/20 font-semibold text-cos-v3-amber-300 hover:bg-cos-v3-amber-500/30'
              : !gate && i === 1
                ? 'bg-cos-blue/20 text-cos-v3-cyan-500 hover:bg-cos-blue/30'
                : 'bg-cos-op-container-highest text-cos-white hover:bg-cos-dark-outline/60'
          }`}
        >
          {label}
        </button>
      ))}
      {gate ? null : (
        <button
          type="button"
          aria-label={t('admin.fleet.row.terminal')}
          onClick={() => onComingSoon(t('admin.fleet.row.terminal'))}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-cos-op-container-highest/40 text-cos-v3-slate-400 transition-colors hover:bg-cos-op-container-highest hover:text-cos-white"
        >
          <AdminIcon name="terminal" size={15} />
        </button>
      )}
    </div>
  );
}

function FilterButton({
  active = false,
  disabled = false,
  onPress,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={disabled ? undefined : active}
      disabled={disabled}
      onClick={onPress}
      className={`flex items-center gap-1.5 rounded px-2.5 py-1 leading-none transition-colors disabled:cursor-not-allowed ${
        active ? 'bg-cos-blue text-white shadow-xs' : 'text-cos-v3-slate-400 hover:text-cos-white'
      }`}
    >
      {children}
    </button>
  );
}

function Legend({ dot, children }: { dot: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1">
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${dot}`} />
      {children}
    </span>
  );
}

function PageBtn({
  current = false,
  disabled = false,
  onClick,
  children,
}: {
  current?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-current={current ? 'page' : undefined}
      onClick={onClick}
      className={`rounded px-2 py-0.5 disabled:opacity-40 ${
        current
          ? 'bg-cos-blue font-bold text-white'
          : 'border border-cos-dark-outline/40 text-cos-v3-slate-400 hover:text-cos-white'
      }`}
    >
      {children}
    </button>
  );
}
