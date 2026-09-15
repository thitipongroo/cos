'use client';

/**
 * SYSTEM_ADMIN — Cluster Infrastructure & Fleet Telemetry (`/admin/cluster`), the Stitch "Cluster Infrastructure &
 * Fleet Telemetry - SYSTEM_ADMIN" screen (bc1de8c630e1…, HTML fetched 2026-09-15; revision R17, re-synced R18). The workspace only:
 * the drawing's own top bar and sidebar are the panel's one shell (<AdminShell />, product-owner decision R10).
 *
 * ── PRODUCT-OWNER DECISIONS D16–D19 (R19, 2026-09-15; reversing R17's D6) ───────────────────────
 *   REAL — the DB Fleet tile: dedicated tenants (a `dedicated_db_host`), pooled tenants (active, without one) and
 *     active tenants, from GET /admin/tenants, with its split bar.
 *   COMING SOON — drawn as Stitch draws it, from lib/adminDrawnFigures.ts `CLUSTER`: every other KPI figure and bar,
 *     the node table's health chip, filter counts, LIVE interval, the drawing's eight node rows (D17), its footer and
 *     pager, every integration's status and line, and every envelope's verification line. Nothing in the repository
 *     reads node inventory, Prometheus or the broker.
 *   COMING SOON (D18) — Refresh, SSH, Provisioning, the node filters, the filter field, the pager, each node's action
 *     and Configure Cluster Sizing Params open the "coming soon" dialog.
 *   The drawing pulses its health and LIVE dots; here they are static (Rule 40 keeps animation to <LoadingState />).
 *   R18 / R19: the drawing's page title and tags are gone (the title is screen-reader only), its primary button reads
 *   PROVISIONING, and its own top-bar cluster line (not part of <AdminShell />) was removed.
 */

import { useMemo } from 'react';
import { useI18n } from '../../i18n';
import { CLUSTER, type ClusterTone } from '../../lib/adminDrawnFigures';
import { tenantMetrics } from '../../lib/adminTenants';
import { useTenants } from '../../lib/api/queries';
import { LoadingState } from '../ui/LoadingState';
import { AdminIcon, type AdminIconName } from './AdminIcon';
import { NO_DATA } from './AdminShell';
import { useComingSoon } from './ComingSoon';

const CARD = 'rounded border border-cos-op-outline-variant/30 bg-cos-op-container-low';
const GHOST_BTN =
  'flex h-8 items-center gap-1.5 rounded border border-cos-op-outline-variant/40 bg-cos-op-container px-3 font-mono text-[12px] font-semibold text-cos-op-on-surface transition-colors hover:bg-cos-op-container-high hover:text-cos-white';

const INK: Record<ClusterTone, string> = {
  cyan: 'text-cos-v3-cyan-500',
  blue: 'text-cos-blue',
  primary: 'text-white',
  neutral: 'text-cos-op-on-surface',
  success: 'text-cos-v3-emerald-500',
  warning: 'text-cos-v3-amber-500',
  white: 'text-cos-white',
  gray: 'text-cos-v3-slate-500',
};
const BAR: Record<ClusterTone, string> = {
  cyan: 'bg-cos-v3-cyan-500',
  blue: 'bg-cos-blue',
  primary: 'bg-cos-blue',
  neutral: 'bg-cos-op-container-highest',
  success: 'bg-cos-v3-emerald-500',
  warning: 'bg-cos-v3-amber-500',
  white: 'bg-cos-white',
  gray: 'bg-cos-v3-slate-500',
};
const CHIP: Record<ClusterTone, string> = {
  cyan: 'border-cos-v3-cyan-500/30 bg-cos-v3-cyan-500/15 text-cos-v3-cyan-500',
  blue: 'border-cos-blue/30 bg-cos-blue/15 text-cos-blue',
  primary: 'border-cos-blue/50 bg-cos-blue/20 text-white',
  neutral: 'border-cos-op-outline-variant/30 bg-cos-op-container-highest text-cos-op-on-surface',
  success: 'bg-cos-v3-emerald-500/15 text-cos-v3-emerald-500',
  warning: 'bg-cos-v3-amber-500/15 text-cos-v3-amber-500',
  white: 'text-cos-white',
  gray: 'text-cos-v3-slate-500',
};

export function ClusterInfrastructure() {
  const { t } = useI18n();
  const tenants = useTenants();
  const all = useMemo(() => tenants.data ?? [], [tenants.data]);
  const metrics = useMemo(() => tenantMetrics(all, undefined, new Date()), [all]);
  const pooled = all.filter((r) => r.is_active && r.dedicated_db_host === null).length;
  const comingSoon = useComingSoon();
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
          {/* COMING SOON — no process behind Refresh / SSH / Provisioning (D18) */}
          <button
            type="button"
            onClick={() => comingSoon(t('admin.cluster.refresh'))}
            className={GHOST_BTN}
          >
            <AdminIcon name="sync" size={16} />
            <span>{t('admin.cluster.refresh')}</span>
          </button>
          <button
            type="button"
            onClick={() => comingSoon(t('admin.cluster.ssh'))}
            className={GHOST_BTN}
          >
            <AdminIcon name="terminal" size={16} />
            <span>{t('admin.cluster.ssh')}</span>
          </button>
          <button
            type="button"
            onClick={() => comingSoon(t('admin.cluster.provision'))}
            className="flex h-8 items-center gap-1.5 rounded bg-cos-blue px-3 font-mono text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-cos-v3-blue-600"
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
          badge={CLUSTER.kpi.cluster.badge /* COMING SOON */}
          badgeTone="text-cos-v3-emerald-500"
        >
          {/* COMING SOON — CLUSTER.kpi.cluster */}
          <Figure
            value={CLUSTER.kpi.cluster.value}
            unit={`/ ${CLUSTER.kpi.cluster.pool} ${t('admin.cluster.kpi.vcpu')}`}
          />
          <Bar percent={CLUSTER.kpi.cluster.barPercent} tone="bg-cos-blue" />
          <Foot
            left={`${t('admin.cluster.kpi.mem')} ${CLUSTER.kpi.cluster.mem}`}
            right={CLUSTER.kpi.cluster.active}
          />
        </Tile>
        <Tile
          icon="sensors"
          iconTone="text-cos-v3-cyan-500"
          label={t('admin.cluster.kpi.iot')}
          badge={CLUSTER.kpi.iot.badge /* COMING SOON */}
          badgeTone="text-cos-v3-cyan-500"
        >
          {/* COMING SOON — CLUSTER.kpi.iot */}
          <Figure
            value={CLUSTER.kpi.iot.value}
            unit={t('admin.cluster.kpi.msgs')}
            unitTone="text-cos-v3-cyan-500"
          />
          <Bar percent={CLUSTER.kpi.iot.barPercent} tone="bg-cos-v3-cyan-500" />
          <Foot
            left={`${t('admin.cluster.kpi.cap')} ${CLUSTER.kpi.iot.cap}`}
            right={CLUSTER.kpi.iot.p99}
            rightTone="text-cos-v3-emerald-500"
          />
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
          {/* COMING SOON — CLUSTER.kpi.fleet */}
          <Foot
            left={`${t('admin.cluster.kpi.pgbouncer')} ${CLUSTER.kpi.fleet.pgbouncer}`}
            right={CLUSTER.kpi.fleet.saturation}
            rightTone="text-cos-v3-emerald-500"
          />
        </Tile>
        <Tile
          icon="timer"
          iconTone="text-cos-v3-emerald-500"
          label={t('admin.cluster.kpi.timescale')}
          badge={CLUSTER.kpi.timescale.badge /* COMING SOON */}
          badgeTone="text-cos-v3-emerald-500"
        >
          {/* COMING SOON — CLUSTER.kpi.timescale */}
          <Figure value={CLUSTER.kpi.timescale.value} unit={t('admin.cluster.kpi.chunk')} />
          <Bar percent={CLUSTER.kpi.timescale.barPercent} tone="bg-cos-v3-emerald-500" />
          <Foot
            left={`${t('admin.cluster.kpi.nvme')} ${CLUSTER.kpi.timescale.nvme}`}
            right={CLUSTER.kpi.timescale.alloc}
          />
        </Tile>
      </div>

      {/* Node table — the drawing's rows, COMING SOON (D17) */}
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
            {/* COMING SOON — CLUSTER.nodesHealth */}
            <span className="ml-1 flex items-center gap-1.5 rounded border border-cos-v3-emerald-500/40 bg-cos-v3-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-cos-v3-emerald-500">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-cos-v3-emerald-500" />
              {CLUSTER.nodesHealth}
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1 rounded border border-cos-op-outline-variant/30 bg-cos-op-container-lowest/80 p-0.5 font-mono text-[11px]">
              {(['all', 'db', 'compute', 'iot', 'gateway'] as const).map((f, i) => (
                // COMING SOON — CLUSTER.filterCounts; a filter opens the dialog (D18)
                <button
                  key={f}
                  type="button"
                  onClick={i === 0 ? undefined : () => comingSoon(t(`admin.cluster.filter.${f}`))}
                  className={`rounded px-2.5 py-1 ${
                    i === 0
                      ? 'bg-cos-blue font-semibold text-white shadow-sm'
                      : 'text-cos-op-on-surface-variant transition-colors hover:text-white'
                  }`}
                >
                  {t(`admin.cluster.filter.${f}`)} ({CLUSTER.filterCounts[f]})
                </button>
              ))}
            </div>
            <div className="relative">
              <AdminIcon
                name="filter_list"
                size={15}
                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-cos-op-outline"
              />
              {/* COMING SOON — no node inventory to filter (D18) */}
              <input
                type="search"
                readOnly
                onClick={() => comingSoon(t('admin.cluster.filterNodes'))}
                aria-label={t('admin.cluster.filterNodes')}
                placeholder={t('admin.cluster.filterNodes')}
                className="h-7 w-36 rounded border border-cos-op-outline-variant/40 bg-cos-op-container pl-6 pr-2 font-mono text-[11px] text-cos-op-on-surface placeholder:text-cos-op-outline"
              />
            </div>
            {/* COMING SOON — CLUSTER.live */}
            <span className="flex items-center gap-1.5 rounded border border-cos-op-outline-variant/30 bg-cos-op-container px-2 py-1 font-mono text-[10px] font-semibold text-cos-v3-cyan-500">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-cos-v3-cyan-500" />
              {t('admin.cluster.live')} {CLUSTER.live}
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
            <tbody className="divide-y divide-cos-op-outline-variant/20 font-mono">
              {/* COMING SOON — CLUSTER.nodes: the drawing's eight rows (D17) */}
              {CLUSTER.nodes.map((node) => (
                <tr
                  key={node.host}
                  className={`transition-colors hover:bg-cos-op-container/50 ${node.highlight ? 'bg-cos-blue/5' : ''}`}
                >
                  <td className="px-3.5 py-2.5">
                    <div className="flex items-center gap-1.5 font-bold text-cos-white">
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 rounded-full bg-cos-v3-emerald-500"
                      />
                      {node.host}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-cos-v3-slate-500">
                      {node.size}
                      <span aria-hidden="true" className="text-cos-op-outline-variant/40">
                        •
                      </span>
                      <span className="text-cos-op-on-surface-variant">{node.ip}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`rounded border px-2 py-0.5 text-[10px] font-bold ${CHIP[node.chip]}`}
                    >
                      {node.service}
                    </span>
                    <div className={`mt-0.5 text-[10px] ${INK[node.roleInk]}`}>{node.role}</div>
                  </td>
                  <td className="px-2.5 py-2.5 text-cos-op-on-surface-variant">
                    <span className="rounded bg-cos-op-container px-1.5 py-0.5 text-[10px] text-cos-v3-slate-500">
                      {node.zone}
                    </span>
                  </td>
                  <td className="px-2.5 py-2.5">
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-cos-v3-emerald-500">
                      <AdminIcon name={node.statusIcon} size={14} />
                      {node.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <UsageCell
                      value={node.cpu}
                      detail={node.vcpu}
                      percent={node.cpuPercent}
                      tone={BAR[node.bar]}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <UsageCell
                      value={node.mem}
                      detail={node.cap}
                      percent={node.memPercent}
                      tone={BAR[node.bar]}
                    />
                  </td>
                  <td className="px-3 py-2.5 text-cos-op-on-surface-variant">
                    <div className="text-[11px] text-cos-white">{node.disk}</div>
                    <div className={`text-[10px] ${INK[node.disk2Ink]}`}>{node.disk2}</div>
                  </td>
                  <td className="px-3 py-2.5 text-cos-op-on-surface-variant">
                    <div
                      className={`text-[11px] ${node.latencyInk === 'success' ? 'font-bold' : ''} ${INK[node.latencyInk]}`}
                    >
                      {node.latency}
                    </div>
                    <div className={`text-[10px] ${INK[node.latency2Ink]}`}>{node.latency2}</div>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => comingSoon(`${node.action} · ${node.host}`)}
                      className="rounded border border-cos-op-outline-variant/40 bg-cos-op-container px-2 py-1 text-[10px] text-cos-white transition-colors hover:bg-cos-op-container-high"
                    >
                      {node.action}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-cos-op-outline-variant/20 bg-cos-op-container-lowest/80 p-3 font-mono text-[12px] text-cos-v3-slate-500">
          <div className="flex items-center gap-2">
            <span>
              {/* COMING SOON — CLUSTER.foot */}
              {t('admin.cluster.foot.mesh')}{' '}
              <strong className="text-cos-white">{CLUSTER.foot.mesh}</strong>
            </span>
            <span aria-hidden="true" className="text-cos-op-outline-variant/40">
              •
            </span>
            <span>
              {t('admin.cluster.foot.provisioned')}{' '}
              <strong className="text-cos-white">{CLUSTER.foot.provisioned}</strong>
            </span>
            <span aria-hidden="true" className="text-cos-op-outline-variant/40">
              •
            </span>
            <span>
              {t('admin.cluster.foot.memory')}{' '}
              <strong className="text-cos-v3-cyan-500">{CLUSTER.foot.memory}</strong>
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-[11px] text-cos-v3-slate-500">{CLUSTER.foot.showing}</span>
            <div className="flex items-center gap-1">
              {/* COMING SOON — the drawn pager has nothing behind it (D18) */}
              <button
                type="button"
                aria-label={t('admin.list.previous')}
                onClick={() => comingSoon(t('admin.list.previous'))}
                className="rounded border border-cos-op-outline-variant/30 bg-cos-op-container px-2 py-0.5 text-cos-op-on-surface-variant transition-colors hover:text-white"
              >
                &lt;
              </button>
              <span className="px-2 text-[12px] font-bold text-cos-white">{CLUSTER.foot.page}</span>
              <button
                type="button"
                aria-label={t('admin.list.next')}
                onClick={() => comingSoon(t('admin.list.next'))}
                className="rounded border border-cos-op-outline-variant/30 bg-cos-op-container px-2 py-0.5 text-cos-op-on-surface-variant transition-colors hover:text-white"
              >
                &gt;
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Outbound integration */}
      <section className={`${CARD} p-4`} aria-label={t('admin.cluster.integration.title')}>
        <PanelHead
          icon="cell_tower"
          iconTone="text-cos-v3-cyan-500"
          title={t('admin.cluster.integration.title')}
          badge={CLUSTER.integrationBadge /* COMING SOON */}
          badgeTone="text-cos-v3-emerald-500"
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
                      className="h-1.5 w-1.5 rounded-full bg-cos-v3-emerald-500"
                    />
                  </div>
                  {/* COMING SOON — CLUSTER.integrations */}
                  <span
                    className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${CHIP[CLUSTER.integrations[k].tone]}`}
                  >
                    {CLUSTER.integrations[k].status}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-cos-op-on-surface-variant">
                  {t(`admin.cluster.integration.${k}.note`)}
                </div>
              </div>
              <div className="border-t border-cos-op-outline-variant/20 pt-1.5 font-mono text-[10px] text-cos-v3-slate-500">
                {CLUSTER.integrations[k].line}
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
              {/* COMING SOON — CLUSTER.envelopes */}
              <div className={`mt-2 text-[10px] ${INK[CLUSTER.envelopes[k].tone]}`}>
                {CLUSTER.envelopes[k].line}
              </div>
            </div>
          ))}
        </div>
        {/* COMING SOON — no sizing parameters are stored (D18) */}
        <button
          type="button"
          onClick={() => comingSoon(t('admin.cluster.envelope.configure'))}
          className="mt-3.5 flex h-8 w-full items-center justify-center gap-1.5 rounded border border-cos-op-outline-variant/40 bg-cos-op-container font-mono text-[12px] font-semibold text-cos-white"
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

function Bar({ percent, tone }: { percent: number; tone: string }) {
  return (
    <div
      aria-hidden="true"
      className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-cos-op-container-highest"
    >
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${percent}%` }} />
    </div>
  );
}

function Foot({
  left,
  right,
  rightTone = 'text-cos-white',
}: {
  left: string;
  right: string;
  rightTone?: string;
}) {
  return (
    <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-cos-v3-slate-500">
      <span>{left}</span>
      <span className={`font-medium ${rightTone}`}>{right}</span>
    </div>
  );
}

/** A drawn CPU / memory cell: value and detail over a thin bar. */
function UsageCell({
  value,
  detail,
  percent,
  tone,
}: {
  value: string;
  detail: string;
  percent: number;
  tone: string;
}) {
  return (
    <>
      <div className="flex items-center justify-between text-[11px] font-medium text-cos-white">
        <span>{value}</span>
        <span className="text-[10px] text-cos-v3-slate-500">{detail}</span>
      </div>
      <div
        aria-hidden="true"
        className="mt-1 h-1 w-full overflow-hidden rounded-full bg-cos-op-container"
      >
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${percent}%` }} />
      </div>
    </>
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
