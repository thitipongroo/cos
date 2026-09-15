'use client';

/**
 * SYSTEM_ADMIN — Data Migrations & Approval Gate (`/admin/migrations`), the Stitch "Data Migrations & Approval Gate -
 * SYSTEM_ADMIN" screen (b6f080f520bb…, HTML fetched 2026-09-15; revision R17, re-synced R18). The workspace only; the shell is
 * <AdminShell /> (product-owner decision R10).
 *
 * ── PRODUCT-OWNER DECISION D7 (2026-09-15): real runs, `—` for figures without a source ───────────
 *   REAL — every provisioning run from GET /admin/tenants/provisioning joined to its tenant: the Job ID (the run's
 *     Temporal workflow id), tenant code and name, its §34.3 state, the ACTIVE / HUMAN APPROVAL GATE counts, the status
 *     filter, paging, Refresh. The gate panel shows the run selected with Review (the first run at the gate by
 *     default): target tenant, source "shared pool", the two pre-flight steps its state proves done (RDS provisioned,
 *     migrations run — §34.3 order), and Approve / Abort with a justification through POST …/provisioning/{decision}
 *     (§34.5), exactly as the Tenant List banner does.
 *   `—` — transfer volume, verification seal, target node (no host exists before approval), payload size, schema
 *     objects, row count, snapshot and replication pre-flight lines, root checksum, enclave, progress, CDC lag,
 *     operator, the ledger footer's replication / TLS labels.
 *   R18 (the drawing as listed 2026-09-15): its page title and the PIPELINE GATE tag are gone; the heading is
 *     screen-reader only.
 *   DISABLED — Archive, New Job, and View / Audit / Receipt on runs that are not at the gate.
 */

import { adminJustificationSchema } from '@cos/schemas';
import { useMemo, useState } from 'react';
import { useI18n } from '../../i18n';
import {
  PAGE_SIZE,
  errorKeyForStatus,
  paginate,
  pageNumbers,
  provisioningRuns,
  provisioningWorkflowId,
  runPreflight,
  type ProvisioningRun,
  type RunPhase,
} from '../../lib/adminTenants';
import { ApiError } from '../../lib/api/client';
import { useDecideProvisioning, useTenantProvisioning, useTenants } from '../../lib/api/queries';
import { LoadingState } from '../ui/LoadingState';
import { AdminIcon } from './AdminIcon';
import { NO_DATA } from './AdminShell';

type StatusFilter = 'all' | RunPhase;

const PANEL = 'rounded-md border border-cos-op-container-highest bg-cos-op-container-low';
const WELL = 'rounded border border-cos-op-container-highest bg-cos-op-container';

const PHASE_CHIP: Record<RunPhase, { chip: string; dot: string; id: string }> = {
  gate: {
    chip: 'border-cos-v3-amber-500/40 bg-cos-v3-amber-500/20 text-cos-v3-amber-300',
    dot: 'bg-cos-v3-amber-400',
    id: 'text-cos-v3-amber-400',
  },
  working: {
    chip: 'border-cos-v3-cyan-500/40 bg-cos-v3-cyan-500/20 text-cos-v3-cyan-300',
    dot: 'bg-cos-v3-cyan-400',
    id: 'text-cos-v3-cyan-400',
  },
  completed: {
    chip: 'border-cos-v3-emerald-500/40 bg-cos-v3-emerald-500/20 text-cos-v3-emerald-300',
    dot: 'bg-cos-v3-emerald-400',
    id: 'text-cos-v3-emerald-400',
  },
  stopped: {
    chip: 'border-cos-v3-rose-800/60 bg-cos-v3-rose-950/40 text-cos-v3-rose-300',
    dot: 'bg-cos-v3-rose-400',
    id: 'text-cos-v3-rose-400',
  },
  unknown: {
    chip: 'border-cos-op-container-highest bg-cos-op-container text-cos-v3-slate-400',
    dot: 'bg-cos-v3-slate-500',
    id: 'text-cos-v3-slate-400',
  },
};

export function DataMigrations() {
  const { t } = useI18n();
  const tenants = useTenants();
  const provisioning = useTenantProvisioning();
  const decide = useDecideProvisioning();
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [justification, setJustification] = useState('');
  const [touched, setTouched] = useState(false);
  const unavailable = t('admin.nav.unavailable');

  const runs = useMemo(
    () => provisioningRuns(tenants.data ?? [], provisioning.data),
    [tenants.data, provisioning.data],
  );
  const count = (phase: RunPhase) => runs.filter((r) => r.phase === phase).length;
  const atGate = runs.filter((r) => r.phase === 'gate');
  const gateRun: ProvisioningRun | undefined =
    atGate.find((r) => r.tenant.tenant_id === selected) ?? atGate[0];
  const filtered = filter === 'all' ? runs : runs.filter((r) => r.phase === filter);
  const shown = paginate(filtered, page);
  const loading = tenants.isLoading || provisioning.isLoading;
  const ready = tenants.isSuccess && provisioning.isSuccess;

  const reason = adminJustificationSchema.safeParse({ justification });
  const decideRun = (decision: 'approve' | 'abort') => {
    setTouched(true);
    if (!gateRun || !reason.success) return;
    decide.mutate(
      { id: gateRun.tenant.tenant_id, decision, justification: reason.data.justification },
      {
        onSuccess: () => {
          setJustification('');
          setTouched(false);
          setSelected(null);
        },
      },
    );
  };
  const decideError = decide.isError
    ? t(
        errorKeyForStatus(
          decide.error instanceof ApiError ? decide.error.status : undefined,
          'decision',
        ),
      )
    : undefined;
  const preflight = gateRun ? runPreflight(gateRun.state) : { provisioned: false, migrated: false };

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col justify-between gap-2 border-b border-cos-op-container-highest pb-3 sm:flex-row sm:items-center">
        <div>
          <nav
            aria-label={t('admin.cluster.breadcrumb')}
            className="flex items-center gap-2 font-mono text-[11px] text-cos-v3-slate-400"
          >
            <span>{t('admin.migrations.crumb1')}</span>
            <span aria-hidden="true">/</span>
            <span>{t('admin.migrations.crumb2')}</span>
            <span aria-hidden="true">/</span>
            <span aria-current="page" className="font-semibold text-cos-v3-blue-400">
              {t('admin.migrations.crumb3')}
            </span>
          </nav>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="sr-only">{t('admin.migrations.title')}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            disabled
            title={unavailable}
            className="flex cursor-not-allowed items-center gap-1.5 rounded border border-cos-op-container-highest bg-cos-op-container px-3 py-1.5 text-[12px] font-medium text-cos-v3-slate-300"
          >
            <AdminIcon name="archive" size={14} className="text-cos-v3-slate-400" />
            <span>{t('admin.migrations.archive')}</span>
          </button>
          <button
            type="button"
            disabled
            title={unavailable}
            className="flex cursor-not-allowed items-center gap-1.5 rounded bg-cos-v3-blue-600 px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-sm"
          >
            <AdminIcon name="add" size={14} />
            <span>{t('admin.migrations.newJob')}</span>
          </button>
        </div>
      </section>

      <section
        className="grid grid-cols-1 gap-3 md:grid-cols-4"
        aria-label={t('admin.migrations.kpis')}
      >
        <Kpi label={t('admin.migrations.kpi.active')} icon="bolt" tone="blue">
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-[24px] font-bold text-white">
              {ready ? count('gate') + count('working') : NO_DATA}
            </span>
            <span className="text-[12px] font-medium text-cos-v3-blue-400">
              {t('admin.migrations.kpi.activeUnit')}
            </span>
          </div>
          <div className="mt-1 text-[10px] text-cos-v3-slate-400">
            {ready
              ? `${count('gate')} ${t('admin.migrations.kpi.pending')}, ${count('working')} ${t('admin.migrations.kpi.working')}`
              : NO_DATA}
          </div>
        </Kpi>
        <Kpi label={t('admin.migrations.kpi.volume')} icon="database" tone="emerald">
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-[24px] font-bold text-white">{NO_DATA}</span>
          </div>
          <div className="mt-1 text-[10px] text-cos-v3-emerald-400/80">{NO_DATA}</div>
        </Kpi>
        <div className="relative overflow-hidden rounded-md border border-cos-v3-amber-500/40 bg-cos-op-container-low p-3 ring-1 ring-cos-v3-amber-500/20">
          <div className="flex items-start justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-cos-v3-amber-300">
              {t('admin.migrations.kpi.gates')}
            </span>
            <span className="rounded bg-cos-v3-amber-500/20 p-1 text-cos-v3-amber-400">
              <AdminIcon name="warning" size={16} />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-[24px] font-bold text-cos-v3-amber-400">
              {ready ? count('gate') : NO_DATA}
            </span>
            <span className="text-[12px] font-medium text-cos-v3-amber-300">
              {t('admin.migrations.kpi.pendingGate')}
            </span>
          </div>
          <div className="mt-1 text-[10px] text-cos-v3-amber-200/80">
            {t('admin.migrations.kpi.signoff')}
          </div>
        </div>
        <Kpi label={t('admin.migrations.kpi.verification')} icon="verified_user" tone="cyan">
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-[24px] font-bold text-white">{NO_DATA}</span>
          </div>
          <div className="mt-1 font-mono text-[10px] text-cos-v3-cyan-400/90">{NO_DATA}</div>
        </Kpi>
      </section>

      {/* Gate panel */}
      <section
        className="rounded-md border border-cos-v3-amber-500/40 bg-cos-op-container-low p-4 shadow-lg ring-1 ring-cos-v3-amber-500/20"
        aria-label={t('admin.migrations.gate.title')}
      >
        <div className="flex flex-col justify-between gap-2 border-b border-cos-op-container-highest pb-3 md:flex-row md:items-center">
          <div className="flex items-center gap-2.5">
            <span aria-hidden="true" className="relative flex h-3 w-3">
              {gateRun ? (
                <span className="absolute inline-flex h-full w-full rounded-full bg-cos-v3-amber-400 opacity-75 motion-safe:animate-ping" />
              ) : null}
              <span
                className={`relative inline-flex h-3 w-3 rounded-full ${gateRun ? 'bg-cos-v3-amber-500' : 'bg-cos-v3-slate-500'}`}
              />
            </span>
            <span className="text-[12px] font-bold uppercase tracking-wider text-cos-v3-amber-400">
              {t('admin.migrations.gate.title')}
            </span>
            <span className="rounded border border-cos-v3-amber-700/60 bg-cos-v3-amber-950/80 px-1.5 font-mono text-[9px] text-cos-v3-amber-300">
              {t('admin.migrations.gate.jobId')}{' '}
              {gateRun ? provisioningWorkflowId(gateRun.tenant.tenant_id) : NO_DATA}
            </span>
          </div>
          <span className="font-mono text-[11px] text-cos-v3-slate-400">
            {t('admin.migrations.gate.enclave')} {NO_DATA}
          </span>
        </div>

        {loading ? (
          <div className="my-3">
            <LoadingState variant="widget" label={t('admin.list.loading')} />
          </div>
        ) : !gateRun ? (
          <p className="my-4 text-center text-[12px] text-cos-v3-slate-400">
            {t('admin.migrations.gate.none')}
          </p>
        ) : (
          <>
            <div className="my-3 grid grid-cols-1 gap-4 text-[12px] lg:grid-cols-12">
              <div className={`${WELL} space-y-2.5 p-3 lg:col-span-7`}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase text-cos-v3-slate-400">
                    {t('admin.migrations.gate.target')}
                  </span>
                  <span className="rounded border border-cos-v3-blue-900/50 bg-cos-op-surface px-2 py-0.5 font-mono text-[11px] text-cos-v3-blue-400">
                    {gateRun.tenant.tenant_code}
                  </span>
                </div>
                <div className="text-[14px] font-semibold text-white">
                  {gateRun.tenant.tenant_name}
                </div>
                <div className="flex items-center justify-between rounded border border-cos-op-container-highest bg-cos-op-surface p-2.5 font-mono text-[11px]">
                  <div className="space-y-0.5">
                    <div className="text-[10px] text-cos-v3-slate-400">
                      {t('admin.migrations.gate.source')}
                    </div>
                    <div className="flex items-center gap-1 text-cos-v3-slate-200">
                      <span>{t('admin.migrations.gate.sharedDb')}</span>
                      <span className="rounded bg-cos-v3-amber-950/60 px-1 text-[9px] text-cos-v3-amber-400">
                        {t('admin.migrations.gate.sharedPool')}
                      </span>
                    </div>
                  </div>
                  <AdminIcon name="arrow_forward" size={20} className="text-cos-v3-blue-400" />
                  <div className="space-y-0.5 text-right">
                    <div className="text-[10px] text-cos-v3-slate-400">
                      {t('admin.migrations.gate.targetNode')}
                    </div>
                    <div className="flex items-center justify-end gap-1 text-cos-v3-emerald-400">
                      <span>{gateRun.tenant.dedicated_db_host ?? NO_DATA}</span>
                      <span className="rounded bg-cos-v3-emerald-950/60 px-1 text-[9px] text-cos-v3-emerald-400">
                        {t('admin.migrations.gate.dedicated')}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-[11px]">
                  {(['payload', 'objects', 'rows'] as const).map((k) => (
                    <div
                      key={k}
                      className="rounded border border-cos-op-container-highest/80 bg-cos-op-surface/70 p-2"
                    >
                      <div className="text-[10px] text-cos-v3-slate-400">
                        {t(`admin.migrations.gate.${k}`)}
                      </div>
                      <div className="font-bold text-white">{NO_DATA}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className={`${WELL} flex flex-col justify-between p-3 lg:col-span-5`}>
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase text-cos-v3-slate-400">
                      {t('admin.migrations.gate.preflight')}
                    </span>
                    <span className="rounded bg-cos-v3-emerald-950/80 px-1.5 py-0.5 font-mono text-[10px] text-cos-v3-emerald-400">
                      {Number(preflight.provisioned) + Number(preflight.migrated)}/4{' '}
                      {t('admin.migrations.gate.passed')}
                    </span>
                  </div>
                  <ul className="space-y-2 text-[11px]">
                    <Check ok={preflight.provisioned}>
                      {t('admin.migrations.gate.check.provisioned')}
                    </Check>
                    <Check ok={preflight.migrated}>
                      {t('admin.migrations.gate.check.migrated')}
                    </Check>
                    <Check ok={null}>
                      {t('admin.migrations.gate.check.snapshot')} {NO_DATA}
                    </Check>
                    <Check ok={null}>
                      {t('admin.migrations.gate.check.replication')} {NO_DATA}
                    </Check>
                  </ul>
                </div>
                <div className="mt-2 flex justify-between border-t border-cos-op-container-highest pt-2 font-mono text-[10px] text-cos-v3-slate-400">
                  <span>
                    {t('admin.migrations.gate.checksum')} {NO_DATA}
                  </span>
                  <span className="text-cos-v3-amber-400">
                    {t(`admin.provisioning.state.${gateRun.state}`)}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-center justify-between gap-3 rounded-md border border-cos-op-container-highest bg-cos-op-surface p-3 md:flex-row">
              <div className="w-full flex-1">
                <label htmlFor="gate-justification" className="sr-only">
                  {t('admin.justification.label')}
                </label>
                <input
                  id="gate-justification"
                  type="text"
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  onBlur={() => setTouched(true)}
                  placeholder={t('admin.justification.help')}
                  aria-invalid={touched && !reason.success}
                  aria-describedby="gate-justification-error"
                  disabled={decide.isPending}
                  className="w-full rounded border border-cos-op-container-highest bg-cos-op-container px-3 py-2 font-mono text-[12px] text-cos-v3-slate-200 placeholder:text-cos-v3-slate-500 focus:border-cos-v3-blue-500 focus:outline-none"
                />
                <p
                  id="gate-justification-error"
                  role="alert"
                  className="mt-1 text-[11px] text-cos-op-error"
                >
                  {touched && !reason.success
                    ? t('admin.justification.tooShort')
                    : (decideError ?? '')}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => decideRun('abort')}
                  disabled={decide.isPending}
                  className="inline-flex h-8 items-center justify-center gap-1 rounded border border-cos-v3-rose-800/60 bg-cos-v3-rose-950/40 px-3.5 text-[12px] font-medium text-cos-v3-rose-400 transition hover:bg-cos-v3-rose-950/70 hover:text-cos-v3-rose-300 disabled:opacity-50"
                >
                  <AdminIcon name="close" size={14} />
                  <span>{t('admin.migrations.gate.abort')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => decideRun('approve')}
                  disabled={decide.isPending}
                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded border border-cos-v3-emerald-500 bg-cos-v3-emerald-600 px-4 text-[12px] font-semibold text-white shadow-md transition hover:bg-cos-v3-emerald-500 disabled:opacity-50"
                >
                  {decide.isPending ? (
                    <LoadingState variant="micro" />
                  ) : (
                    <AdminIcon name="check" size={16} />
                  )}
                  <span>{t('admin.migrations.gate.approve')}</span>
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {/* Ledger */}
      <section
        className={`${PANEL} flex flex-1 flex-col overflow-hidden`}
        aria-label={t('admin.migrations.ledger.title')}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cos-op-container-highest bg-cos-op-mig-band p-3">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-bold uppercase tracking-wider text-cos-v3-slate-200">
              {t('admin.migrations.ledger.title')}
            </span>
            <span className="font-mono text-[10px] text-cos-v3-slate-400">
              {t('admin.migrations.ledger.encrypted')} {NO_DATA}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[12px]">
            <label htmlFor="mig-status" className="sr-only">
              {t('admin.migrations.ledger.filter')}
            </label>
            <select
              id="mig-status"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value as StatusFilter);
                setPage(1);
              }}
              className="rounded border border-cos-op-container-highest bg-cos-op-container px-2.5 py-1 text-[12px] text-cos-v3-slate-300 focus:outline-none"
            >
              <option value="all">
                {t('admin.migrations.ledger.all')} ({runs.length})
              </option>
              <option value="gate">
                {t('admin.migrations.ledger.gate')} ({count('gate')})
              </option>
              <option value="working">
                {t('admin.migrations.ledger.working')} ({count('working')})
              </option>
              <option value="completed">
                {t('admin.migrations.ledger.completed')} ({count('completed')})
              </option>
              <option value="stopped">
                {t('admin.migrations.ledger.stopped')} ({count('stopped')})
              </option>
            </select>
            <button
              type="button"
              onClick={() => {
                void tenants.refetch();
                void provisioning.refetch();
              }}
              className="flex items-center gap-1 rounded border border-cos-op-container-highest bg-cos-op-container px-2.5 py-1 text-cos-v3-slate-300 hover:bg-cos-dark-bright"
            >
              <AdminIcon name="sync" size={14} className="text-cos-v3-slate-400" />
              <span>{t('admin.migrations.ledger.refresh')}</span>
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-4">
              <LoadingState variant="table" columns={8} label={t('admin.list.loading')} />
            </div>
          ) : (
            <table className="w-full text-left text-[12px] text-cos-v3-slate-300">
              <thead className="border-b border-cos-op-container-highest bg-cos-op-container font-mono text-[10px] uppercase tracking-wider text-cos-v3-slate-400">
                <tr>
                  {(
                    ['job', 'tenant', 'route', 'status', 'progress', 'cdc', 'operator'] as const
                  ).map((c) => (
                    <th key={c} scope="col" className="px-3 py-2.5">
                      {t(`admin.migrations.col.${c}`)}
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-2.5 text-right">
                    {t('admin.col.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cos-op-container-highest/60">
                {shown.rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-cos-v3-slate-400">
                      {t('admin.migrations.ledger.empty')}
                    </td>
                  </tr>
                ) : (
                  shown.rows.map((run) => {
                    const tone = PHASE_CHIP[run.phase];
                    return (
                      <tr
                        key={run.tenant.tenant_id}
                        data-testid={`run-row-${run.tenant.tenant_code}`}
                        className={`transition-colors hover:bg-cos-op-container/70 ${run.phase === 'gate' ? 'bg-cos-v3-amber-500/[0.03]' : ''}`}
                      >
                        <td
                          className={`max-w-[220px] truncate px-3 py-2.5 font-mono font-medium ${tone.id}`}
                          title={provisioningWorkflowId(run.tenant.tenant_id)}
                        >
                          {provisioningWorkflowId(run.tenant.tenant_id)}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-semibold text-white">{run.tenant.tenant_code}</div>
                          <div className="text-[10px] text-cos-v3-slate-400">
                            {run.tenant.tenant_name}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[11px]">
                          <span className="text-cos-v3-slate-300">
                            {t('admin.migrations.gate.sharedDb')}
                          </span>
                          <span aria-hidden="true" className="mx-1 text-cos-v3-blue-400">
                            →
                          </span>
                          <span className="text-cos-v3-emerald-400">
                            {run.tenant.dedicated_db_host ?? NO_DATA}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${tone.chip}`}
                          >
                            <span
                              aria-hidden="true"
                              className={`h-1.5 w-1.5 rounded-full ${tone.dot}`}
                            />
                            {run.state === null
                              ? t('admin.provisioning.unreadable')
                              : run.phase === 'unknown'
                                ? t('admin.provisioning.unrecognised')
                                : t(`admin.provisioning.state.${run.state}`)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[11px]">{NO_DATA}</td>
                        <td className="px-3 py-2.5 font-mono text-[11px]">{NO_DATA}</td>
                        <td className="px-3 py-2.5 font-semibold text-cos-v3-slate-200">
                          {NO_DATA}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {run.phase === 'gate' ? (
                            <button
                              type="button"
                              onClick={() => setSelected(run.tenant.tenant_id)}
                              className="rounded border border-cos-v3-amber-500/50 bg-cos-v3-amber-500/20 px-2.5 py-1 text-[11px] font-semibold text-cos-v3-amber-300 transition hover:bg-cos-v3-amber-500/30"
                            >
                              {t('admin.migrations.ledger.review')}
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled
                              title={unavailable}
                              className="cursor-not-allowed rounded border border-cos-op-container-highest bg-cos-op-container px-2.5 py-1 text-[11px] font-medium text-cos-v3-slate-200"
                            >
                              {t(`admin.migrations.ledger.action.${run.phase}`)}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
        <nav
          aria-label={t('admin.list.pagination')}
          className="flex flex-col items-center justify-between gap-2 border-t border-cos-op-container-highest bg-cos-op-mig-band p-3 text-[12px] text-cos-v3-slate-400 sm:flex-row"
        >
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <span>
              {t('admin.migrations.ledger.cdc')} {NO_DATA}
            </span>
            <span aria-hidden="true">•</span>
            <span className="text-cos-v3-emerald-400">
              {t('admin.migrations.ledger.tls')} {NO_DATA}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px]">
              {t('admin.fleet.footShowing')}{' '}
              {shown.rows.length === 0 ? 0 : (shown.page - 1) * PAGE_SIZE + 1} -{' '}
              {(shown.page - 1) * PAGE_SIZE + shown.rows.length} {t('admin.list.of')}{' '}
              {filtered.length}
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={shown.page <= 1}
                onClick={() => setPage(shown.page - 1)}
                aria-label={t('admin.list.previous')}
                className="rounded border border-cos-op-container-highest bg-cos-op-container px-2 py-0.5 font-mono text-[12px] text-cos-v3-slate-400 hover:text-white disabled:opacity-40"
              >
                ‹
              </button>
              {pageNumbers(shown.page, shown.pageCount).map((p, i) =>
                p === 'ellipsis' ? (
                  <span key={`e${i}`} aria-hidden="true">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    aria-current={p === shown.page ? 'page' : undefined}
                    onClick={() => setPage(p)}
                    className={`rounded px-2.5 py-0.5 font-mono text-[12px] ${p === shown.page ? 'bg-cos-v3-blue-600 font-medium text-white' : 'border border-cos-op-container-highest bg-cos-op-container text-cos-v3-slate-400 hover:text-white'}`}
                  >
                    {p}
                  </button>
                ),
              )}
              <button
                type="button"
                disabled={shown.page >= shown.pageCount}
                onClick={() => setPage(shown.page + 1)}
                aria-label={t('admin.list.next')}
                className="rounded border border-cos-op-container-highest bg-cos-op-container px-2 py-0.5 font-mono text-[12px] text-cos-v3-slate-400 hover:text-white disabled:opacity-40"
              >
                ›
              </button>
            </div>
          </div>
        </nav>
      </section>
    </div>
  );
}

function Kpi({
  label,
  icon,
  tone,
  children,
}: {
  label: string;
  icon: 'bolt' | 'database' | 'verified_user';
  tone: 'blue' | 'emerald' | 'cyan';
  children: React.ReactNode;
}) {
  const plate = {
    blue: 'bg-cos-v3-blue-500/10 text-cos-v3-blue-400',
    emerald: 'bg-cos-v3-emerald-500/10 text-cos-v3-emerald-400',
    cyan: 'bg-cos-v3-cyan-500/10 text-cos-v3-cyan-400',
  }[tone];
  return (
    <div className={`${PANEL} relative overflow-hidden p-3`}>
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-cos-v3-slate-400">
          {label}
        </span>
        <span className={`rounded p-1 ${plate}`}>
          <AdminIcon name={icon} size={16} />
        </span>
      </div>
      {children}
    </div>
  );
}

function Check({ ok, children }: { ok: boolean | null; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2 text-cos-v3-slate-200">
      <AdminIcon
        name={ok ? 'check_circle' : 'schedule'}
        size={16}
        className={`shrink-0 ${ok ? 'text-cos-v3-emerald-400' : 'text-cos-v3-slate-500'}`}
      />
      <span>{children}</span>
    </li>
  );
}
