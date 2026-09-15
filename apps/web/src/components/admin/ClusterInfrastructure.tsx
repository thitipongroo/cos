'use client';

/**
 * SYSTEM_ADMIN — Cluster Infrastructure & Fleet Telemetry (`/admin/cluster`), the Stitch "Cluster Infrastructure &
 * Fleet Telemetry - SYSTEM_ADMIN" screen (bc1de8c630e1…, HTML fetched 2026-09-15; revision R17, re-synced R18). The workspace only:
 * the drawing's own top bar and sidebar are the panel's one shell (<AdminShell />, product-owner decision R10).
 *
 * ── PRODUCT-OWNER DECISION D6 (2026-09-15): the drawn structure, real values only ──────────────────
 *   REAL — the DB Fleet tile: dedicated tenants (a `dedicated_db_host`), pooled tenants (active, without one) and
 *     active tenants, from GET /admin/tenants.
 *   `—` — every other figure: cluster vCPU / memory / headroom, IoT stream rate, PgBouncer pool, TimescaleDB chunk and
 *     NVMe figures, the node table's footer (mesh, provisioned nodes, memory pool), every integration's status and
 *     latency, every envelope's verification line. Nothing in the repository reads node inventory, Prometheus or the
 *     broker (spec §20.4.6 records the same for Cluster Pulse).
 *   NO FABRICATED NODES — the node table has its header, filters and an empty state; the drawing's eight hosts are not
 *     drawn. The filter tabs show no counts.
 *   DISABLED — Refresh, SSH, Provision, the node filters and pager, Configure Cluster Sizing Params.
 *   The descriptive copy (the integration names, the envelope policies, "PO RATIFIED") is the drawing's labels, not
 *   measured states.
 *   R18 (the drawing as listed 2026-09-15): its page title and the EMQX / HA tags are gone — the title is screen-reader
 *   only, the tags are not drawn — and its primary button reads PROVISIONING.
 */

import { useMemo } from 'react';
import { useI18n } from '../../i18n';
import { tenantMetrics } from '../../lib/adminTenants';
import { useTenants } from '../../lib/api/queries';
import { LoadingState } from '../ui/LoadingState';
import { AdminIcon, type AdminIconName } from './AdminIcon';
import { NO_DATA } from './AdminShell';

const CARD = 'rounded border border-cos-op-outline-variant/30 bg-cos-op-container-low';
const GHOST_BTN =
  'flex h-8 cursor-not-allowed items-center gap-1.5 rounded border border-cos-op-outline-variant/40 bg-cos-op-container px-3 font-mono text-[12px] font-semibold text-cos-op-on-surface';

export function ClusterInfrastructure() {
  const { t } = useI18n();
  const tenants = useTenants();
  const all = useMemo(() => tenants.data ?? [], [tenants.data]);
  const metrics = useMemo(() => tenantMetrics(all, undefined, new Date()), [all]);
  const pooled = all.filter((r) => r.is_active && r.dedicated_db_host === null).length;
  const unavailable = t('admin.nav.unavailable');
  const fleetReady = tenants.isSuccess;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between border-b border-cos-op-outline-variant/20 pb-4">
        <div>
          <nav
            aria-label={t('admin.cluster.breadcrumb')}
            className="mb-1 flex items-center gap-2 font-mono text-[11px] text-cos-v3-slate-500"
          >
            <span>{t('admin.cluster.crumb1')}</span>
            <span aria-hidden="true">/</span>
            <span>{t('admin.cluster.crumb2')}</span>
            <span aria-hidden="true">/</span>
            <span aria-current="page" className="font-semibold text-cos-v3-cyan-500">
              {t('admin.cluster.crumb3')}
            </span>
          </nav>
          <div className="flex items-center gap-3">
            <h1 className="sr-only">{t('admin.cluster.title')}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <button type="button" disabled title={unavailable} className={GHOST_BTN}>
            <AdminIcon name="sync" size={16} />
            <span>{t('admin.cluster.refresh')}</span>
          </button>
          <button type="button" disabled title={unavailable} className={GHOST_BTN}>
            <AdminIcon name="terminal" size={16} />
            <span>{t('admin.cluster.ssh')}</span>
          </button>
          <button
            type="button"
            disabled
            title={unavailable}
            className="flex h-8 cursor-not-allowed items-center gap-1.5 rounded bg-cos-blue px-3 font-mono text-[12px] font-semibold text-white shadow-sm"
          >
            <AdminIcon name="add_circle" size={16} />
            <span>{t('admin.cluster.provision')}</span>
          </button>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          icon="memory"
          iconTone="text-cos-blue"
          label={t('admin.cluster.kpi.cluster')}
          badge={NO_DATA}
          badgeTone="text-cos-v3-emerald-500"
        >
          <Figure value={NO_DATA} unit={`/ ${NO_DATA} ${t('admin.cluster.kpi.vcpu')}`} />
          <Bar />
          <Foot left={`${t('admin.cluster.kpi.mem')} ${NO_DATA}`} right={NO_DATA} />
        </Tile>
        <Tile
          icon="sensors"
          iconTone="text-cos-v3-cyan-500"
          label={t('admin.cluster.kpi.iot')}
          badge={NO_DATA}
          badgeTone="text-cos-v3-cyan-500"
        >
          <Figure
            value={NO_DATA}
            unit={t('admin.cluster.kpi.msgs')}
            unitTone="text-cos-v3-cyan-500"
          />
          <Bar />
          <Foot left={`${t('admin.cluster.kpi.cap')} ${NO_DATA}`} right={NO_DATA} />
        </Tile>
        <Tile
          icon="storage"
          iconTone="text-cos-v3-blue-600"
          label={t('admin.cluster.kpi.fleet')}
          badge={fleetReady ? `${metrics.active} ${t('admin.cluster.kpi.active')}` : NO_DATA}
          badgeTone="text-cos-white"
        >
          {tenants.isLoading ? (
            <LoadingState variant="micro" label={t('admin.list.loading')} />
          ) : (
            <div className="flex items-baseline gap-3">
              <div>
                <span className="font-mono text-[24px] font-extrabold tracking-tight text-cos-white">
                  {fleetReady ? metrics.dedicated : NO_DATA}
                </span>{' '}
                <span className="text-[12px] text-cos-v3-slate-500">
                  {t('admin.cluster.kpi.dedicated')}
                </span>
              </div>
              <span aria-hidden="true" className="text-cos-op-outline">
                /
              </span>
              <div>
                <span className="font-mono text-[24px] font-extrabold tracking-tight text-cos-white">
                  {fleetReady ? pooled : NO_DATA}
                </span>{' '}
                <span className="text-[12px] text-cos-v3-slate-500">
                  {t('admin.cluster.kpi.pooled')}
                </span>
              </div>
            </div>
          )}
          <div className="mt-3 flex h-1.5 w-full overflow-hidden rounded-full bg-cos-op-container-highest">
            {fleetReady && metrics.dedicated + pooled > 0 ? (
              <>
                <div
                  className="h-full bg-cos-blue"
                  style={{ width: `${(metrics.dedicated / (metrics.dedicated + pooled)) * 100}%` }}
                />
                <div
                  className="h-full bg-cos-v3-cyan-500"
                  style={{ width: `${(pooled / (metrics.dedicated + pooled)) * 100}%` }}
                />
              </>
            ) : null}
          </div>
          <Foot left={`${t('admin.cluster.kpi.pgbouncer')} ${NO_DATA}`} right={NO_DATA} />
        </Tile>
        <Tile
          icon="timer"
          iconTone="text-cos-v3-emerald-500"
          label={t('admin.cluster.kpi.timescale')}
          badge={NO_DATA}
          badgeTone="text-cos-v3-emerald-500"
        >
          <Figure value={NO_DATA} unit={t('admin.cluster.kpi.chunk')} />
          <Bar />
          <Foot left={`${t('admin.cluster.kpi.nvme')} ${NO_DATA}`} right={NO_DATA} />
        </Tile>
      </div>

      {/* Node table — structure only, no fabricated nodes */}
      <section
        className={`${CARD} flex w-full flex-col overflow-hidden shadow-sm`}
        aria-label={t('admin.cluster.nodes')}
      >
        <div className="flex items-center justify-between gap-4 border-b border-cos-op-outline-variant/30 bg-cos-op-container px-4 py-2.5">
          <div className="flex shrink-0 items-center gap-2.5">
            <AdminIcon name="hub" size={19} className="text-cos-blue" />
            <h2 className="font-mono text-[12px] font-bold uppercase tracking-wider text-cos-white">
              {t('admin.cluster.nodes')}
            </h2>
            <span className="ml-1 flex items-center gap-1.5 rounded border border-cos-op-outline-variant/40 bg-cos-op-container-high px-2 py-0.5 font-mono text-[10px] font-semibold text-cos-v3-slate-400">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-cos-v3-slate-500" />
              {NO_DATA}
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1 rounded border border-cos-op-outline-variant/30 bg-cos-op-container-lowest/80 p-0.5 font-mono text-[11px]">
              {(['all', 'db', 'compute', 'iot', 'gateway'] as const).map((f, i) => (
                <button
                  key={f}
                  type="button"
                  disabled
                  title={unavailable}
                  className={`cursor-not-allowed rounded px-2.5 py-1 ${
                    i === 0
                      ? 'bg-cos-blue font-semibold text-white shadow-sm'
                      : 'text-cos-op-on-surface-variant'
                  }`}
                >
                  {t(`admin.cluster.filter.${f}`)}
                </button>
              ))}
            </div>
            <div className="relative">
              <AdminIcon
                name="filter_list"
                size={15}
                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-cos-op-outline"
              />
              <input
                type="search"
                disabled
                aria-label={t('admin.cluster.filterNodes')}
                placeholder={t('admin.cluster.filterNodes')}
                className="h-7 w-36 cursor-not-allowed rounded border border-cos-op-outline-variant/40 bg-cos-op-container pl-6 pr-2 font-mono text-[11px] text-cos-op-on-surface placeholder:text-cos-op-outline"
              />
            </div>
            <span className="flex items-center gap-1.5 rounded border border-cos-op-outline-variant/30 bg-cos-op-container px-2 py-1 font-mono text-[10px] font-semibold text-cos-v3-slate-400">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-cos-v3-slate-500" />
              {t('admin.cluster.live')} {NO_DATA}
            </span>
          </div>
        </div>
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse text-left text-[12px]">
            <thead className="border-b border-cos-op-outline-variant/20 bg-cos-op-container-lowest/80 font-mono text-[10px] uppercase tracking-wider text-cos-v3-slate-500">
              <tr>
                {(
                  ['node', 'service', 'zone', 'status', 'cpu', 'memory', 'disk', 'latency'] as const
                ).map((c) => (
                  <th key={c} scope="col" className="px-3 py-2.5 first:px-3.5">
                    {t(`admin.cluster.col.${c}`)}
                  </th>
                ))}
                <th scope="col" className="px-3 py-2.5 text-right">
                  {t('admin.col.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-10 text-center font-mono text-[12px] text-cos-v3-slate-500"
                >
                  {t('admin.cluster.noSource')}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-cos-op-outline-variant/20 bg-cos-op-container-lowest/80 p-3 font-mono text-[12px] text-cos-v3-slate-500">
          <div className="flex items-center gap-2">
            <span>
              {t('admin.cluster.foot.mesh')} <strong className="text-cos-white">{NO_DATA}</strong>
            </span>
            <span aria-hidden="true" className="text-cos-op-outline-variant/40">
              •
            </span>
            <span>
              {t('admin.cluster.foot.provisioned')}{' '}
              <strong className="text-cos-white">{NO_DATA}</strong>
            </span>
            <span aria-hidden="true" className="text-cos-op-outline-variant/40">
              •
            </span>
            <span>
              {t('admin.cluster.foot.memory')}{' '}
              <strong className="text-cos-v3-cyan-500">{NO_DATA}</strong>
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled
              aria-label={t('admin.list.previous')}
              className="cursor-not-allowed rounded border border-cos-op-outline-variant/30 bg-cos-op-container px-2 py-0.5 text-cos-op-on-surface-variant"
            >
              &lt;
            </button>
            <span className="px-2 text-[12px] font-bold text-cos-white">{NO_DATA}</span>
            <button
              type="button"
              disabled
              aria-label={t('admin.list.next')}
              className="cursor-not-allowed rounded border border-cos-op-outline-variant/30 bg-cos-op-container px-2 py-0.5 text-cos-op-on-surface-variant"
            >
              &gt;
            </button>
          </div>
        </div>
      </section>

      {/* Outbound integration */}
      <section className={`${CARD} p-4`} aria-label={t('admin.cluster.integration.title')}>
        <PanelHead
          icon="cell_tower"
          iconTone="text-cos-v3-cyan-500"
          title={t('admin.cluster.integration.title')}
          badge={NO_DATA}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(['egp', 'promptpay', 'did', 'line'] as const).map((k) => (
            <div
              key={k}
              className="flex flex-col justify-between gap-2 rounded border border-cos-op-outline-variant/20 bg-cos-op-container p-2.5"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[12px] font-bold text-cos-white">
                    <span>{t(`admin.cluster.integration.${k}.name`)}</span>
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 rounded-full bg-cos-v3-slate-500"
                    />
                  </div>
                  <span className="rounded bg-cos-op-container-high px-1.5 py-0.5 font-mono text-[10px] font-semibold text-cos-v3-slate-400">
                    {NO_DATA}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-cos-op-on-surface-variant">
                  {t(`admin.cluster.integration.${k}.note`)}
                </div>
              </div>
              <div className="border-t border-cos-op-outline-variant/20 pt-1.5 font-mono text-[10px] text-cos-v3-slate-500">
                {NO_DATA}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Architecture envelopes */}
      <section className={`${CARD} w-full p-4`} aria-label={t('admin.cluster.envelope.title')}>
        <PanelHead
          icon="verified_user"
          iconTone="text-cos-v3-amber-500"
          title={t('admin.cluster.envelope.title')}
          badge={t('admin.cluster.envelope.ratified')}
          badgeTone="text-cos-v3-cyan-500"
        />
        <div className="grid grid-cols-1 gap-4 font-mono text-[12px] text-cos-op-on-surface-variant md:grid-cols-3">
          {(['chunk', 'emqx', 'ha'] as const).map((k) => (
            <div
              key={k}
              className="flex flex-col justify-between rounded border border-cos-op-outline-variant/20 bg-cos-op-container p-3"
            >
              <div className="text-[10px] font-bold uppercase text-cos-v3-slate-500">
                {t(`admin.cluster.envelope.${k}.label`)}
              </div>
              <div className="mt-1 text-[12px] font-medium text-cos-white">
                {t(`admin.cluster.envelope.${k}.policy`)}
              </div>
              <div className="mt-2 text-[10px] text-cos-v3-slate-500">{NO_DATA}</div>
            </div>
          ))}
        </div>
        <button
          type="button"
          disabled
          title={unavailable}
          className="mt-3.5 flex h-8 w-full cursor-not-allowed items-center justify-center gap-1.5 rounded border border-cos-op-outline-variant/40 bg-cos-op-container font-mono text-[12px] font-semibold text-cos-white"
        >
          <AdminIcon name="tune" size={16} />
          <span>{t('admin.cluster.envelope.configure')}</span>
        </button>
      </section>
    </div>
  );
}

function Tile({
  icon,
  iconTone,
  label,
  badge,
  badgeTone,
  children,
}: {
  icon: AdminIconName;
  iconTone: string;
  label: string;
  badge: string;
  badgeTone: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`${CARD} relative overflow-hidden p-4`}>
      <div className="mb-2 flex items-center justify-between text-[12px] font-semibold uppercase tracking-wider text-cos-v3-slate-500">
        <span className="flex items-center gap-1.5">
          <AdminIcon name={icon} size={18} className={iconTone} />
          {label}
        </span>
        <span className={`font-mono font-bold ${badgeTone}`}>{badge}</span>
      </div>
      {children}
    </div>
  );
}

function Figure({
  value,
  unit,
  unitTone = 'text-cos-v3-slate-500',
}: {
  value: string;
  unit: string;
  unitTone?: string;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-mono text-[24px] font-extrabold tracking-tight text-cos-white">
        {value}
      </span>
      <span className={`font-mono text-[12px] ${unitTone}`}>{unit}</span>
    </div>
  );
}

function Bar() {
  return (
    <div
      aria-hidden="true"
      className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-cos-op-container-highest"
    />
  );
}

function Foot({ left, right }: { left: string; right: string }) {
  return (
    <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-cos-v3-slate-500">
      <span>{left}</span>
      <span className="font-medium text-cos-white">{right}</span>
    </div>
  );
}

function PanelHead({
  icon,
  iconTone,
  title,
  badge,
  badgeTone = 'text-cos-v3-slate-400',
}: {
  icon: AdminIconName;
  iconTone: string;
  title: string;
  badge: string;
  badgeTone?: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between border-b border-cos-op-outline-variant/20 pb-3">
      <div className="flex items-center gap-2">
        <AdminIcon name={icon} size={18} className={iconTone} />
        <h3 className="text-[12px] font-bold uppercase tracking-wider text-cos-white">{title}</h3>
      </div>
      <span className={`font-mono text-[10px] font-semibold ${badgeTone}`}>{badge}</span>
    </div>
  );
}
