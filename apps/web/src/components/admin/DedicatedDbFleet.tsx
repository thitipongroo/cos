'use client';

/**
 * SYSTEM_ADMIN — Dedicated DB Fleet Management (`/admin/db-fleet`), the Stitch "Dedicated DB Fleet Management -
 * SYSTEM_ADMIN" screen (3e635a2fb7e5…, HTML fetched 2026-09-15; revision R17, re-synced R18). The workspace only; the shell is
 * <AdminShell /> (product-owner decision R10).
 *
 * ── PRODUCT-OWNER DECISION D6 (2026-09-15): the drawn structure, real values only ──────────────────
 *   REAL — one row per tenant with a dedicated DB (`dedicated_db_host`, GET /admin/tenants): the host, the tenant's
 *     name and code, its data region, and its provisioning run's state (GET /admin/tenants/provisioning) as the row's
 *     dot — amber at the gate, green otherwise. The ALL FLEET and MAINTENANCE/GATE counts and filters, the
 *     "showing N of M" line, paging, and sorting by tenant code or creation date.
 *   `—` — the four capacity tiles, port and PgBouncer connections, node archetype, HA / standby zone, CPU / memory,
 *     storage / IOPS, CDC lag, the HEALTHY and FAILOVER READY counts, TLS enclave and KMS key id, the envelope badges.
 *     No instance inventory, telemetry or KMS reading exists in the repository.
 *   DISABLED — Refresh Fleet, PgBouncer Pool, Provision New Dedicated DB, the zone picker, the two saturation sorts,
 *     Export CSV, and each row's CONFIG / METRICS / terminal.
 *   The envelope cards' titles and body copy are the drawing's labels, not measured states. The drawing's page title
 *     is empty; the page's heading is screen-reader only.
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
import { formatDate } from '../../lib/format';
import { LoadingState } from '../ui/LoadingState';
import { AdminIcon, type AdminIconName } from './AdminIcon';
import { NO_DATA } from './AdminShell';

type FleetFilter = 'all' | 'gate';
type FleetSort = 'code' | 'created';

const CARD = 'rounded border border-cos-dark-outline/30 bg-cos-op-container-low';
const TOOL_BTN =
  'flex h-8 shrink-0 cursor-not-allowed items-center gap-1.5 rounded border border-cos-dark-outline/40 bg-cos-op-container-low px-3 font-mono text-[11px] font-medium text-cos-dark-text';

export function DedicatedDbFleet() {
  const { t, locale } = useI18n();
  const tenants = useTenants();
  const provisioning = useTenantProvisioning();
  const [filter, setFilter] = useState<FleetFilter>('all');
  const [sort, setSort] = useState<FleetSort>('code');
  const [page, setPage] = useState(1);
  const unavailable = t('admin.nav.unavailable');

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
          <button type="button" disabled title={unavailable} className={TOOL_BTN}>
            <AdminIcon name="sync" size={15} className="text-cos-v3-slate-400" />
            <span>{t('admin.fleet.refresh')}</span>
          </button>
          <button type="button" disabled title={unavailable} className={TOOL_BTN}>
            <AdminIcon name="tune" size={15} className="text-cos-v3-slate-400" />
            <span>{t('admin.fleet.pool')}</span>
          </button>
          <button
            type="button"
            disabled
            title={unavailable}
            className="flex h-8 shrink-0 cursor-not-allowed items-center gap-1.5 rounded bg-cos-blue px-3.5 font-mono text-[11px] font-semibold text-white shadow-sm"
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
            <div className="my-2 flex items-baseline gap-2">
              <span className="font-mono text-[26px] font-bold leading-none text-cos-white">
                {NO_DATA}
              </span>
              <span className="font-mono text-[12px] text-cos-v3-slate-400">
                {t(`admin.fleet.kpi.${key}Unit`)}
              </span>
            </div>
            <div
              aria-hidden="true"
              className="h-1.5 w-full overflow-hidden rounded-full bg-cos-op-container-highest"
            />
            <div className="mt-2 flex justify-between font-mono text-[11px] text-cos-v3-slate-400">
              <span>{NO_DATA}</span>
              <span>{NO_DATA}</span>
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
            <FilterButton disabled>
              {t('admin.fleet.filter.healthy')} ({NO_DATA})
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
            <FilterButton disabled>
              {t('admin.fleet.filter.failover')} ({NO_DATA})
            </FilterButton>
          </div>
          <span
            className="flex h-7 cursor-not-allowed items-center gap-1.5 rounded border border-cos-dark-outline/40 bg-cos-dark-bg px-2.5 font-mono text-[11px] text-cos-dark-text"
            title={unavailable}
          >
            <span className="text-[10px] text-cos-v3-slate-400">{t('admin.fleet.zone')}</span>
            <span className="font-semibold text-cos-white">{NO_DATA}</span>
            <AdminIcon name="expand_more" size={15} className="text-cos-v3-slate-400" />
          </span>
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
              setSort(e.target.value as FleetSort);
              setPage(1);
            }}
            className="h-8 w-[268px] cursor-pointer rounded border border-cos-op-outline-variant/30 bg-cos-op-container-low px-2.5 pr-8 font-mono text-[12px] font-medium leading-tight text-cos-op-on-surface outline-none focus:ring-1 focus:ring-cos-blue"
          >
            <option disabled value="saturation">
              {t('admin.fleet.sort.saturation')}
            </option>
            <option disabled value="storage">
              {t('admin.fleet.sort.storage')}
            </option>
            <option value="code">{t('admin.fleet.sort.code')}</option>
            <option value="created">{t('admin.fleet.sort.created')}</option>
          </select>
          <button
            type="button"
            disabled
            aria-label={`${t('admin.fleet.export')} — ${unavailable}`}
            className="flex h-7 w-7 cursor-not-allowed items-center justify-center rounded border border-cos-dark-outline/40 bg-cos-dark-bg text-cos-v3-slate-400"
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
                {shown.rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-cos-v3-slate-400">
                      {t('admin.fleet.empty')}
                    </td>
                  </tr>
                ) : (
                  shown.rows.map((row) => (
                    <FleetRow
                      key={row.tenant_id}
                      row={row}
                      gate={states.get(row.tenant_id) === GATE_STATE}
                      created={formatDate(locale, row.created_at)}
                      t={t}
                    />
                  ))
                )}
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
            <span className="text-cos-v3-cyan-500">
              {t('admin.fleet.tls')} {NO_DATA}
            </span>
            <span aria-hidden="true">•</span>
            <span className="text-cos-v3-slate-400/80">
              {t('admin.fleet.kms')} {NO_DATA}
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
              <span className="rounded border border-cos-op-outline-variant/40 bg-cos-op-container-high px-1.5 font-mono text-[10px] text-cos-v3-slate-400">
                {NO_DATA}
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
  t,
}: {
  row: TenantListRow;
  gate: boolean;
  created: string;
  t: (key: string) => string;
}) {
  const unavailable = t('admin.nav.unavailable');
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
              {gate ? t('admin.fleet.row.gate') : `${t('admin.fleet.row.port')} ${NO_DATA}`}
            </div>
          </div>
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-3">
        <div className="font-semibold text-cos-white">{row.tenant_name}</div>
        <div className="font-mono text-[11px] text-cos-v3-cyan-500">{row.tenant_code}</div>
      </td>
      <td className="whitespace-nowrap px-3 py-3">
        <span className="rounded border border-cos-dark-outline/40 bg-cos-op-container-highest px-2 py-0.5 text-[11px] font-semibold text-cos-white">
          {NO_DATA}
        </span>
        <div className="mt-0.5 text-[10px] text-cos-v3-slate-400">{created}</div>
      </td>
      <td className="whitespace-nowrap px-3 py-3">
        <div className="text-cos-white">{row.data_region}</div>
        <div className="text-[10px] text-cos-v3-slate-400">
          {t('admin.fleet.row.standby')} {NO_DATA}
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-3">
        <div className="w-[110px]">
          <div className="mb-1 flex justify-between text-[11px]">
            <span className="text-cos-white">{NO_DATA}</span>
            <span className="text-cos-v3-slate-400">{NO_DATA}</span>
          </div>
          <div
            aria-hidden="true"
            className="h-1.5 w-full overflow-hidden rounded-full bg-cos-op-container-highest"
          />
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-3">
        <div className="font-semibold text-cos-white">{NO_DATA}</div>
        <div className="text-[10px] text-cos-v3-slate-400">{NO_DATA}</div>
      </td>
      <td className="whitespace-nowrap px-3 py-3">
        <span className="rounded bg-cos-op-container-high px-1.5 py-0.5 text-[11px] font-bold text-cos-v3-slate-400">
          {NO_DATA}
        </span>
      </td>
      <td className="whitespace-nowrap px-3.5 py-3 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            disabled
            title={unavailable}
            className="flex h-7 shrink-0 cursor-not-allowed items-center justify-center rounded bg-cos-op-container-highest px-2 font-mono text-[11px] text-cos-white"
          >
            {t('admin.fleet.row.config')}
          </button>
          <button
            type="button"
            disabled
            title={unavailable}
            className="flex h-7 shrink-0 cursor-not-allowed items-center justify-center rounded bg-cos-blue/20 px-2 font-mono text-[11px] text-cos-v3-cyan-500"
          >
            {t('admin.fleet.row.metrics')}
          </button>
          <button
            type="button"
            disabled
            aria-label={`${t('admin.fleet.row.terminal')} — ${unavailable}`}
            className="flex h-7 w-7 shrink-0 cursor-not-allowed items-center justify-center rounded bg-cos-op-container-highest/40 text-cos-v3-slate-400"
          >
            <AdminIcon name="terminal" size={15} />
          </button>
        </div>
      </td>
    </tr>
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
