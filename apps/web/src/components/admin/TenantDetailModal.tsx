'use client';

/**
 * SYSTEM_ADMIN — Tenant Detail & Provisioning Console, the Stitch "Tenant Detail & Provisioning Console — SYSTEM_ADMIN"
 * dialog (screen 01955db7b7cd…, HTML as listed 2026-09-15; revisions R17, R19). Opened by the row's View action.
 *
 * ── PRODUCT-OWNER DECISIONS D16–D19 (R19, 2026-09-15; reversing R17's D5) ───────────────────────
 *   REAL — from GET /admin/tenants and GET /admin/tenants/provisioning: tenant code, name, active state, data region
 *     (the zone pill), dedicated DB host (cluster-state card and routing URI — the URL itself is never sent to the
 *     browser, so the URI well shows the host alone), shared or dedicated isolation, created date, and the run state.
 *   COMING SOON — drawn as Stitch draws it, from lib/adminDrawnFigures.ts `DETAIL`: the latency, every KPI figure and
 *     bar, the VPC port badge and reachability line, the engine telemetry and NVMe allocation with its legend, the
 *     schema version / name / last DDL / drift, the Vault path and lease, the certificate fingerprint and its CA, the
 *     compliance and retention lines, and the footer. The schema name and Vault path take the open tenant's code (D19).
 *   COMING SOON (D18) — the three empty tabs, Copy, Rotate Vault Secrets / Flush Delta Queue / Trigger Deep Integrity
 *     Check and Open Telemetry Terminal open the "coming soon" dialog. None has a backend.
 *   R19 re-sync — the drawing dropped its title, the ENTERPRISE TIER tag and the "883-TH-EN" chip (so the Keycloak realm
 *     is no longer shown), and reads "PostgreSQL & TimescaleDB Telemetry" and a last-DDL time without "UTC".
 *
 * ── DIFFERENCES FROM THE DRAWING, AND WHY (ADR-085) ─────────────────────────────────────────────
 *   The Operational card also carries the row actions that DO exist — Audit Log, Assign DB, Mark as Contracted,
 *   Deactivate — offered on the same rules as the Tenant List row, in the card's button style.
 */

import { Button, Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { useI18n } from '../../i18n';
import {
  GATE_STATE,
  provisioningView,
  statusView,
  type TenantListRow,
} from '../../lib/adminTenants';
import { DETAIL, forTenant } from '../../lib/adminDrawnFigures';
import { formatDate } from '../../lib/format';
import { AdminIcon, type AdminIconName } from './AdminIcon';
import { useComingSoon } from './ComingSoon';

export type TenantDetailAction = 'audit' | 'assign' | 'mark' | 'deactivate';

/** The drawing's ink for each engine figure (replication lag emerald, chunks cyan, IOPS slate). */
const ENGINE_INK = {
  lag: 'text-cos-v3-emerald-400',
  chunks: 'text-cos-v3-cyan-300',
  iops: 'text-cos-v3-slate-200',
} as const;

export function TenantDetailModal({
  tenant,
  state,
  onClose,
  onAction,
}: {
  tenant: TenantListRow;
  /** The run's §34.3 state: `undefined` no run, `null` unreadable. */
  state: string | null | undefined;
  onClose: () => void;
  onAction: (action: TenantDetailAction) => void;
}) {
  const { t, locale } = useI18n();
  const comingSoon = useComingSoon();
  const dedicated = tenant.dedicated_db_host !== null;
  const enterprise = tenant.plan_type === 'ENTERPRISE';
  const hasRun = state !== undefined;
  const status = statusView(state, tenant.is_active);
  const provisioning = provisioningView(state, tenant.is_active);
  const inProgress = status.tone === 'pending';
  const atGate = state === GATE_STATE;

  const actions: Array<{
    key: TenantDetailAction;
    icon: AdminIconName;
    tone: string;
    show: boolean;
  }> = [
    { key: 'audit', icon: 'history', tone: 'text-cos-v3-cyan-400', show: true },
    {
      key: 'assign',
      icon: 'database',
      tone: 'text-cos-v3-cyan-400',
      show: tenant.is_active && enterprise && !inProgress,
    },
    {
      key: 'mark',
      icon: 'verified',
      tone: 'text-cos-v3-amber-400',
      show: tenant.is_active && enterprise && !dedicated && !hasRun,
    },
    {
      key: 'deactivate',
      icon: 'block',
      tone: 'text-cos-v3-red-400',
      show: tenant.is_active && !atGate && !inProgress,
    },
  ];

  return (
    <ModalOverlay
      isOpen
      isDismissable
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      data-admin-modal=""
      className="fixed inset-0 z-50 flex items-center justify-center bg-cos-op-container-lowest/80 p-4 backdrop-blur-md sm:p-6 lg:p-8"
    >
      <Modal className="flex max-h-[92vh] w-full max-w-[1040px] flex-col overflow-hidden rounded-lg border border-cos-v3-cyan-500/30 bg-cos-op-detail-panel text-cos-v3-slate-200 shadow-[0_0_40px_-10px_rgba(6,182,212,0.35)]">
        <Dialog className="flex min-h-0 flex-1 flex-col outline-none">
          <header className="flex shrink-0 items-center justify-between border-b border-cos-op-detail-head-line bg-cos-op-detail-head px-6 py-4">
            <div className="flex items-center gap-3.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-md border border-cos-v3-cyan-500/40 bg-cos-v3-cyan-950/60 text-cos-v3-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.25)]">
                <AdminIcon name="database" size={20} />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <Heading slot="title" className="sr-only">
                    {t('admin.detail.title')}
                  </Heading>
                </div>
                <p className="mt-0.5 flex items-center gap-2 font-mono text-[12px] text-cos-v3-slate-400">
                  <span className="font-medium text-cos-v3-cyan-300">{tenant.tenant_code}</span>
                  <span aria-hidden="true" className="text-cos-v3-slate-600">
                    •
                  </span>
                  <span className="text-cos-v3-slate-300">{tenant.tenant_name}</span>
                  <span aria-hidden="true" className="text-cos-v3-slate-600">
                    •
                  </span>
                  <span
                    className={`flex items-center gap-1 text-[11px] ${
                      tenant.is_active ? 'text-cos-v3-emerald-400' : 'text-cos-v3-slate-400'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`h-1.5 w-1.5 rounded-full ${tenant.is_active ? 'bg-cos-v3-emerald-400' : 'bg-cos-v3-slate-500'}`}
                    />
                    {t(status.labelKey)} · {t(provisioning.labelKey)}
                  </span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden items-center gap-2 rounded-md border border-cos-op-detail-well-line bg-cos-op-detail-well px-3 py-1.5 font-mono text-[12px] text-cos-v3-slate-300 sm:flex">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-cos-v3-emerald-400" />
                <span className="text-cos-v3-slate-400">{t('admin.rowModal.zone')}</span>
                <span className="text-cos-v3-slate-200">{tenant.data_region}</span>
                <span aria-hidden="true" className="text-cos-v3-slate-600">
                  |
                </span>
                {/* COMING SOON — DETAIL.latency */}
                <span className="text-cos-v3-cyan-400">{DETAIL.latency}</span>
              </div>
              <Button
                aria-label={t('admin.create.close')}
                onPress={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-cos-op-detail-close-line bg-cos-op-detail-well text-cos-v3-slate-400 outline-none transition-colors hover:bg-cos-op-detail-close-hover hover:text-cos-v3-slate-100 data-[focus-visible]:ring-2 data-[focus-visible]:ring-cos-v3-cyan-400"
              >
                <AdminIcon name="close" size={16} />
              </Button>
            </div>
          </header>

          {/* KPI band */}
          <section className="grid shrink-0 grid-cols-1 gap-4 border-b border-cos-op-detail-kpi-band-line bg-cos-op-detail-kpi-band/90 p-6 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label={t('admin.detail.kpi.cluster')}
              badge={DETAIL.cluster.badge /* COMING SOON */}
              badgeTone="text-cos-v3-emerald-400"
            >
              <div className="flex items-center gap-1.5 text-[14px] font-bold tracking-tight text-white">
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 rounded-full ${dedicated ? 'bg-cos-v3-emerald-400' : 'bg-cos-v3-slate-500'}`}
                />
                {t(dedicated ? 'admin.markModal.dedicated' : 'admin.markModal.pooled')}
              </div>
              <div
                className="mt-1 truncate font-mono text-[11px] text-cos-v3-cyan-300/80"
                title={tenant.dedicated_db_host ?? undefined}
              >
                {/* COMING SOON — DETAIL.cluster.host when the tenant has no host of its own */}
                {tenant.dedicated_db_host ?? DETAIL.cluster.host}
              </div>
            </Kpi>
            <Kpi
              label={t('admin.detail.kpi.compute')}
              badge={DETAIL.compute.badge /* COMING SOON */}
              badgeTone="text-cos-v3-cyan-400"
            >
              {/* COMING SOON — DETAIL.compute */}
              <div className="flex items-baseline gap-2 text-[14px] font-bold tracking-tight text-white">
                <span>{DETAIL.compute.active}</span>
                <span className="font-mono text-[12px] font-normal text-cos-v3-slate-400">
                  {DETAIL.compute.max}
                </span>
              </div>
              <div
                aria-hidden="true"
                className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-cos-op-detail-kpi-band-line"
              >
                <div
                  className="h-full rounded-full bg-cos-v3-cyan-500"
                  style={{ width: `${DETAIL.compute.barPercent}%` }}
                />
              </div>
            </Kpi>
            <Kpi
              label={t('admin.detail.kpi.sync')}
              badge={DETAIL.sync.badge /* COMING SOON */}
              badgeTone="text-cos-v3-emerald-400"
            >
              {/* COMING SOON — DETAIL.sync */}
              <div className="text-[14px] font-bold tracking-tight text-white">
                {DETAIL.sync.pending}
              </div>
              <div className="mt-1 flex items-center justify-between font-mono text-[11px] text-cos-v3-slate-400">
                <span>{t('admin.detail.kpi.emqx')}</span>
                <span className="font-semibold text-cos-v3-cyan-300">{DETAIL.sync.emqx}</span>
              </div>
            </Kpi>
            <Kpi
              label={t('admin.detail.kpi.tokens')}
              badge={DETAIL.tokens.badge /* COMING SOON */}
              badgeTone="text-cos-v3-amber-400"
            >
              {/* COMING SOON — DETAIL.tokens */}
              <div className="text-[14px] font-bold tracking-tight text-white">
                {DETAIL.tokens.used}{' '}
                <span className="font-mono text-[12px] font-normal text-cos-v3-slate-400">
                  {DETAIL.tokens.quota}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between font-mono text-[11px] text-cos-v3-slate-400">
                <span>{t('admin.detail.kpi.reset')}</span>
                <span className="text-cos-v3-slate-300">{DETAIL.tokens.reset}</span>
              </div>
            </Kpi>
          </section>

          {/* Tabs — only Overview has content */}
          <nav
            aria-label={t('admin.detail.tabs')}
            className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-cos-op-detail-tabs-line bg-cos-op-detail-tabs px-6 text-[12px] font-medium"
          >
            {(
              [
                ['overview', 'bar_chart', true],
                ['topology', 'dns', false],
                ['secrets', 'lock', false],
                ['audit', 'schedule', false],
              ] as const
            ).map(([key, icon, active]) =>
              active ? (
                <span
                  key={key}
                  aria-current="page"
                  className="flex items-center gap-2 border-b-2 border-cos-v3-cyan-400 px-3.5 py-3 font-semibold text-cos-v3-cyan-300"
                >
                  <AdminIcon name={icon} size={16} />
                  {t(`admin.detail.tab.${key}`)}
                </span>
              ) : (
                // COMING SOON — the tab has no content yet (D18)
                <button
                  key={key}
                  type="button"
                  onClick={() => comingSoon(t(`admin.detail.tab.${key}`))}
                  className="flex items-center gap-2 border-b-2 border-transparent px-3.5 py-3 text-cos-v3-slate-400 transition-colors hover:text-cos-v3-slate-200"
                >
                  <AdminIcon name={icon} size={16} />
                  {t(`admin.detail.tab.${key}`)}
                </button>
              ),
            )}
          </nav>

          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto bg-cos-op-detail-body p-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="space-y-5 lg:col-span-7">
                <Card>
                  <div className="mb-2.5 flex items-center justify-between">
                    <CardTitle icon="link">{t('admin.detail.uri.title')}</CardTitle>
                    <span className="rounded border border-cos-v3-emerald-500/30 bg-cos-v3-emerald-950/60 px-2 py-0.5 font-mono text-[10px] text-cos-v3-emerald-400">
                      {/* COMING SOON — DETAIL.vpc */}
                      {t('admin.create.vpcBadge')}: {DETAIL.vpc}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 rounded border border-cos-op-detail-uri-line bg-cos-op-detail-head p-1.5 px-2.5">
                    <code className="flex-1 truncate font-mono text-[12px] text-cos-v3-cyan-300">
                      {tenant.dedicated_db_host
                        ? `postgresql://••••••••@${tenant.dedicated_db_host}`
                        : t('admin.detail.uri.pooled')}
                    </code>
                    {/* COMING SOON — no connection string reaches the browser (D18) */}
                    <button
                      type="button"
                      aria-label={t('admin.detail.uri.copy')}
                      onClick={() => comingSoon(t('admin.detail.uri.copy'))}
                      className="rounded p-1.5 text-cos-v3-slate-400 transition-colors hover:bg-cos-op-detail-copy-hover hover:text-cos-v3-slate-200"
                    >
                      <AdminIcon name="content_copy" size={16} />
                    </button>
                  </div>
                  {/* COMING SOON — DETAIL.reachability */}
                  <p className="mt-2 flex items-start gap-1.5 font-mono text-[11px] text-cos-v3-slate-400">
                    <span aria-hidden="true" className="text-cos-v3-emerald-400">
                      ✓
                    </span>
                    <span>{DETAIL.reachability}</span>
                  </p>
                </Card>

                <Card>
                  <h2 className="mb-3 flex items-center justify-between font-mono text-[12px] font-semibold uppercase tracking-wider text-cos-v3-slate-200">
                    <span>{t('admin.detail.engine.title')}</span>
                    <span className="text-[11px] font-normal lowercase text-cos-v3-slate-400">
                      {/* COMING SOON — DETAIL.engine */}
                      {t('admin.detail.engine.replica')} {DETAIL.engine.replica}
                    </span>
                  </h2>
                  <div className="grid grid-cols-3 gap-3">
                    {(['lag', 'chunks', 'iops'] as const).map((k) => (
                      <div
                        key={k}
                        className="rounded border border-cos-op-detail-well-edge bg-cos-op-detail-kpi-band p-2.5"
                      >
                        <div className="font-mono text-[10px] uppercase text-cos-v3-slate-400">
                          {t(`admin.detail.engine.${k}`)}
                        </div>
                        <div className={`mt-1 font-mono text-[14px] font-bold ${ENGINE_INK[k]}`}>
                          {DETAIL.engine[k].value}
                        </div>
                        <div className="mt-0.5 text-[10px] text-cos-v3-slate-400">
                          {DETAIL.engine[k].note}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 border-t border-cos-op-detail-well-edge pt-3">
                    <div className="mb-1.5 flex items-center justify-between font-mono text-[12px]">
                      <span className="text-cos-v3-slate-300">
                        {t('admin.detail.engine.storage')}
                      </span>
                      {/* COMING SOON — DETAIL.engine.storage / segments */}
                      <span className="font-semibold text-cos-v3-cyan-400">
                        {DETAIL.engine.storage}
                      </span>
                    </div>
                    <div
                      aria-hidden="true"
                      className="flex h-2 w-full overflow-hidden rounded-full bg-cos-op-detail-kpi-band"
                    >
                      {DETAIL.engine.segments.map((seg) => (
                        <div
                          key={seg.label}
                          className={`h-full ${seg.tone}`}
                          style={{ width: `${seg.percent}%` }}
                        />
                      ))}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-4 font-mono text-[10px] text-cos-v3-slate-400">
                      {DETAIL.engine.segments.map((seg) => (
                        <span key={seg.label} className="flex items-center gap-1.5">
                          <span aria-hidden="true" className={`h-2 w-2 rounded ${seg.tone}`} />
                          {seg.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </Card>

                <Card>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-mono text-[12px] font-semibold uppercase tracking-wider text-cos-v3-slate-200">
                      {t('admin.detail.schema.title')}
                    </span>
                    {/* COMING SOON — DETAIL.schema */}
                    <span className="rounded border border-cos-v3-cyan-800/40 bg-cos-v3-cyan-950/40 px-2 py-0.5 font-mono text-[12px] text-cos-v3-cyan-400">
                      {DETAIL.schema.version}
                    </span>
                  </div>
                  <dl className="space-y-1.5 rounded border border-cos-op-detail-well-edge bg-cos-op-detail-head p-3 font-mono text-[12px] text-cos-v3-slate-300">
                    {(['name', 'ddl', 'drift'] as const).map((k) => (
                      <div key={k} className="flex justify-between">
                        <dt className="text-cos-v3-slate-400">{t(`admin.detail.schema.${k}`)}</dt>
                        <dd className="text-right font-semibold text-cos-v3-slate-200">
                          {forTenant(DETAIL.schema[k], tenant.tenant_code)}
                        </dd>
                      </div>
                    ))}
                    <div className="flex justify-between">
                      <dt className="text-cos-v3-slate-400">{t('admin.detail.schema.created')}</dt>
                      <dd className="text-cos-v3-slate-200">
                        {formatDate(locale, tenant.created_at)}
                      </dd>
                    </div>
                  </dl>
                </Card>
              </div>

              <div className="space-y-5 lg:col-span-5">
                <Card>
                  <h2 className="mb-3 flex items-center justify-between font-mono text-[12px] font-semibold uppercase tracking-wider text-cos-v3-slate-200">
                    <span>{t('admin.detail.vault.title')}</span>
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 rounded-full bg-cos-v3-emerald-400"
                    />
                  </h2>
                  {/* COMING SOON — DETAIL.vault (the path takes the open tenant's code, D19) */}
                  <div className="space-y-2.5 font-mono text-[12px]">
                    {(['path', 'fingerprint'] as const).map((k) => (
                      <div
                        key={k}
                        className="rounded border border-cos-op-detail-close-hover bg-cos-op-detail-kpi-band p-2.5"
                      >
                        <div className="text-[10px] uppercase text-cos-v3-slate-400">
                          {t(`admin.detail.vault.${k}`)}
                        </div>
                        <div
                          className={`mt-0.5 truncate text-[11px] ${k === 'path' ? 'text-cos-v3-cyan-300' : 'text-cos-v3-slate-300'}`}
                        >
                          {k === 'path'
                            ? forTenant(DETAIL.vault.path, tenant.tenant_code)
                            : DETAIL.vault.fingerprint}
                        </div>
                        {k === 'path' ? (
                          <div className="mt-1 text-[10px] text-cos-v3-slate-400">
                            {t('admin.detail.vault.pathNote')}{' '}
                            <span className="text-cos-v3-slate-200">{DETAIL.vault.lease}</span>
                          </div>
                        ) : (
                          <div className="mt-1 flex items-center gap-1 text-[10px] text-cos-v3-emerald-400">
                            <AdminIcon name="check" size={12} />
                            {t('admin.detail.vault.fingerprintNote')} {DETAIL.vault.validatedBy}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>

                <Card>
                  <h2 className="mb-2.5 font-mono text-[12px] font-semibold uppercase tracking-wider text-cos-v3-slate-200">
                    {t('admin.detail.policy.title')}
                  </h2>
                  <ul className="space-y-2 text-[12px] text-cos-v3-slate-300">
                    <li className="flex items-start gap-2">
                      <span aria-hidden="true" className="mt-0.5 text-cos-v3-cyan-400">
                        ▸
                      </span>
                      <span>
                        <strong>{t('admin.detail.policy.isolation')}</strong>{' '}
                        {t(
                          dedicated
                            ? 'admin.detail.policy.isolationDedicated'
                            : 'admin.detail.policy.isolationShared',
                        )}
                      </span>
                    </li>
                    {(['compliance', 'retention'] as const).map((k) => (
                      <li key={k} className="flex items-start gap-2">
                        <span aria-hidden="true" className="mt-0.5 text-cos-v3-cyan-400">
                          ▸
                        </span>
                        <span>
                          {/* COMING SOON — DETAIL.policy */}
                          <strong>{t(`admin.detail.policy.${k}`)}</strong> {DETAIL.policy[k]}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>

                <article className="relative rounded-md border border-cos-v3-amber-500/30 bg-cos-op-detail-ops p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 font-mono text-[12px] font-semibold uppercase tracking-wider text-cos-v3-amber-400">
                      <AdminIcon name="warning" size={16} />
                      {t('admin.detail.ops.title')}
                    </span>
                    <span className="rounded border border-cos-v3-amber-700/40 bg-cos-v3-amber-950/50 px-2 py-0.5 font-mono text-[10px] text-cos-v3-amber-300/80">
                      {t('admin.detail.ops.elevated')}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {actions
                      .filter((a) => a.show)
                      .map((a) => (
                        <Button
                          key={a.key}
                          onPress={() => onAction(a.key)}
                          className="flex w-full items-center justify-between rounded border border-cos-op-detail-op-line bg-cos-op-detail-op px-3 py-2 text-[12px] font-medium text-cos-v3-slate-200 outline-none transition-colors hover:bg-cos-op-detail-op-hover data-[focus-visible]:ring-2 data-[focus-visible]:ring-cos-v3-cyan-400"
                        >
                          <span className="flex items-center gap-2">
                            <AdminIcon name={a.icon} size={16} className={a.tone} />
                            <span>{t(`admin.detail.action.${a.key}`)}</span>
                          </span>
                          <AdminIcon
                            name="chevron_right"
                            size={14}
                            className="text-cos-v3-slate-400"
                          />
                        </Button>
                      ))}
                    {(
                      [
                        ['rotate', 'key', 'text-cos-v3-cyan-400'],
                        ['flush', 'sync', 'text-cos-v3-amber-400'],
                        ['integrity', 'task_alt', 'text-cos-v3-emerald-400'],
                      ] as const
                    ).map(([key, icon, tone]) => (
                      // COMING SOON — no process behind the operation (D18)
                      <button
                        key={key}
                        type="button"
                        onClick={() => comingSoon(t(`admin.detail.ops.${key}`))}
                        className="flex w-full items-center justify-between rounded border border-cos-op-detail-op-line bg-cos-op-detail-op px-3 py-2 text-[12px] font-medium text-cos-v3-slate-200 transition-colors hover:bg-cos-op-detail-op-hover"
                      >
                        <span className="flex items-center gap-2">
                          <AdminIcon name={icon} size={16} className={tone} />
                          <span>{t(`admin.detail.ops.${key}`)}</span>
                        </span>
                        <span className="font-mono text-[10px] text-cos-v3-slate-400">
                          {t(`admin.detail.ops.${key}Note`)}
                        </span>
                      </button>
                    ))}
                  </div>
                </article>
              </div>
            </div>
          </div>

          <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-cos-op-detail-foot-line bg-cos-op-detail-head px-6 py-3.5">
            <div className="flex items-center gap-2 font-mono text-[12px] text-cos-v3-slate-300">
              {/* COMING SOON — DETAIL.footer */}
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-cos-v3-emerald-400" />
              <span className="font-semibold text-cos-v3-emerald-400">
                {t('admin.detail.footer.mesh')} {DETAIL.footer.mesh}
              </span>
              <span aria-hidden="true" className="text-cos-v3-slate-600">
                •
              </span>
              <span className="text-cos-v3-slate-400">{DETAIL.footer.snapshot}</span>
            </div>
            <div className="flex items-center gap-3">
              <Button
                onPress={onClose}
                className="rounded-md border border-cos-op-detail-close2-line bg-cos-op-detail-op px-4 py-2 text-[12px] font-medium text-cos-v3-slate-300 outline-none transition-colors hover:bg-cos-op-detail-close2-hover hover:text-white data-[focus-visible]:ring-2 data-[focus-visible]:ring-cos-v3-slate-400"
              >
                {t('admin.detail.close')}
              </Button>
              {/* COMING SOON — no telemetry terminal exists (D18) */}
              <button
                type="button"
                onClick={() => comingSoon(t('admin.detail.terminal'))}
                className="flex items-center gap-2 rounded-md bg-cos-v3-blue-600 px-4 py-2 text-[12px] font-semibold text-white shadow-lg shadow-cos-v3-blue-600/30 transition-colors hover:bg-cos-v3-blue-600/90"
              >
                <AdminIcon name="terminal" size={16} />
                <span>{t('admin.detail.terminal')}</span>
              </button>
            </div>
          </footer>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

function Kpi({
  label,
  badge,
  badgeTone,
  children,
}: {
  label: string;
  badge: string;
  badgeTone: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-md border border-cos-op-detail-kpi-line bg-cos-op-detail-kpi p-3.5">
      <div className="mb-1 flex items-center justify-between font-mono text-[11px] uppercase tracking-wider text-cos-v3-slate-400">
        <span>{label}</span>
        <span className={`font-semibold ${badgeTone}`}>{badge}</span>
      </div>
      {children}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <article className="rounded-md border border-cos-op-detail-card-line bg-cos-op-container-low p-4">
      {children}
    </article>
  );
}

function CardTitle({ icon, children }: { icon: AdminIconName; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2 font-mono text-[12px] font-semibold uppercase tracking-wider text-cos-v3-slate-200">
      <AdminIcon name={icon} size={14} className="text-cos-v3-cyan-400" />
      {children}
    </span>
  );
}
