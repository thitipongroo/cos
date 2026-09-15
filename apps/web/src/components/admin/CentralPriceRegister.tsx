'use client';

/**
 * SYSTEM_ADMIN — ราคากลาง Central Price Register (`/admin/central-prices`), the Stitch "ราคากลาง Central Price Register -
 * SYSTEM_ADMIN" screen (5cd46d052ac0…, HTML fetched 2026-09-15; revision R17, re-synced R18). The workspace only; the shell is
 * <AdminShell /> (R10). The drawing's palette is Tailwind v3 slate / blue / green / amber / red, carried as `cos-v3-*`.
 *
 * ── PRODUCT-OWNER DECISIONS D8 / D9 / D12 (2026-09-15): ADR-061 in full, e-GP a stub seam, BOQ stops at the API ──────
 *   REAL — the register is GET /admin/central-prices: code, description, category, unit, the price as stored (text,
 *     never a JS number), currency, source, status; "showing N of total"; the period chip is the catalog's periods
 *     (a filter); paging by cursor. Download CSV template and Import Central Prices (file + period + source reference
 *     + §6.7 justification) are the real endpoints; the import's inserted / updated / rejected rows are shown.
 *     The sync panel is GET /sync-status: the newest run's time, kind, outcome, error code and record counts, and the
 *     adapter's name and whether it is configured. The failed-sync panel is the newest FAILED run; Force Retry Sync is
 *     POST /sync with a justification — today it records NOT_CONFIGURED (D9), and the panel says so.
 *   COMING SOON — drawn as Stitch draws it (R19, D16; reversing D8's `—`), copy keys listed in
 *     lib/adminDrawnFigures.ts DRAWN_COPY_KEYS: "HTTP 200 OK · Payload Signature Verified" under a SUCCEEDED outcome
 *     that carries no error code; the retry sentence, the impact line's cached baseline and "Fallback: In-Memory Cache
 *     Active" in the failed-sync panel while a failed run exists. Nothing in the platform signs payloads, retries, or
 *     falls back to a cache. A real value wins (rule 1): an error code replaces the outcome line, and with no failed
 *     run the panel's own "none" state stands, so the drawn failure details read `—`.
 *   R18 (the drawing as listed 2026-09-15): its page title is gone (the heading is screen-reader only) and the outcome
 *     reads "Succeeded" — product-owner decision D14: the outcome labels are English in both locales, as drawn.
 *   COMING SOON (D18) — ดู Log เชิงเทคนิค opens the "coming soon" dialog: there is no log view.
 *   ADDED — Previous / Next under the table (the drawing shows five rows of 24,810 and no way to the rest), and the
 *     empty state of the failed-sync panel when no run has failed.
 */

import { adminJustificationSchema } from '@cos/schemas';
import { useState } from 'react';
import { Button, Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { useI18n } from '../../i18n';
import {
  EFFECTIVE_PERIOD_RE,
  IMPORT_ACCEPT,
  IMPORT_MAX_BYTES,
  importErrorKey,
  priceText,
} from '../../lib/centralPrices';
import { useAuditExport } from '../../lib/api/adminAudit';
import {
  type CentralPriceStatus,
  type ImportResult,
  type SyncRun,
  type SyncRunOutcome,
  useCentralPriceSyncStatus,
  useCentralPrices,
  useImportCentralPrices,
  useSyncCentralPrices,
} from '../../lib/api/centralPrices';
import { ApiError } from '../../lib/api/client';
import { formatDateTime, localeTag } from '../../lib/format';
import { LoadingState } from '../ui/LoadingState';
import { AdminIcon, type AdminIconName } from './AdminIcon';
import { NO_DATA } from './AdminShell';
import { useComingSoon } from './ComingSoon';

const SECTION = 'overflow-hidden rounded-md border border-cos-v3-slate-700 bg-cos-v3-slate-800';
const WELL = 'rounded-[6px] border border-cos-v3-slate-700 bg-cos-v3-slate-900 p-3';
const FIELD =
  'w-full rounded border border-cos-v3-slate-700 bg-cos-v3-slate-900 px-3 py-1.5 text-[13px] text-cos-white placeholder:text-cos-v3-slate-400/60 focus:border-cos-v3-blue-600 focus:outline-none';

const STATUS_LOOK: Record<CentralPriceStatus, { ink: string; icon: AdminIconName }> = {
  ACTIVE: { ink: 'text-cos-v3-green-600', icon: 'check_circle' },
  PENDING: { ink: 'text-cos-v3-amber-500', icon: 'schedule' },
  INACTIVE: { ink: 'text-cos-v3-slate-400', icon: 'block' },
};

const OUTCOME_LOOK: Record<SyncRunOutcome, { ink: string; icon: AdminIconName }> = {
  SUCCEEDED: { ink: 'text-cos-v3-green-600', icon: 'check_circle' },
  FAILED: { ink: 'text-cos-v3-red-600', icon: 'error' },
  NOT_CONFIGURED: { ink: 'text-cos-v3-amber-500', icon: 'warning' },
};

const statusOf = (err: unknown) => (err instanceof ApiError ? err.status : undefined);

export function CentralPriceRegister() {
  const { t, locale } = useI18n();
  const [period, setPeriod] = useState<string | undefined>();
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const [importing, setImporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [templateError, setTemplateError] = useState<string | undefined>();
  const cursor = cursors[cursors.length - 1] ?? null;
  const list = useCentralPrices(period, cursor);
  const status = useCentralPriceSyncStatus();
  const download = useAuditExport();
  const number = new Intl.NumberFormat(localeTag(locale));

  const onTemplate = async () => {
    setTemplateError(undefined);
    try {
      await download('/admin/central-prices/template.csv', 'central-prices-template.csv');
    } catch (err) {
      setTemplateError(t(importErrorKey(statusOf(err))));
    }
  };

  const rows = list.data?.rows ?? [];
  const lastRun = status.data?.last_run ?? null;
  const failure = status.data?.last_failure ?? null;

  return (
    <div className="-m-6 flex flex-1 flex-col gap-6 bg-cos-v3-slate-900 p-8 text-cos-white">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="sr-only">{t('admin.centralPrices.title')}</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void onTemplate()}
            className="flex h-[36px] items-center gap-2 rounded border border-cos-v3-slate-700 bg-cos-v3-slate-800 px-3 text-[13px] font-medium hover:bg-cos-v3-slate-700"
          >
            <AdminIcon name="download" size={18} />
            <span>{t('admin.centralPrices.template')}</span>
          </button>
          <button
            type="button"
            onClick={() => setImporting(true)}
            className="flex h-[36px] items-center gap-2 rounded bg-cos-v3-blue-600 px-4 text-[13px] font-semibold hover:bg-cos-v3-blue-600/90"
          >
            <AdminIcon name="upload_file" size={18} />
            <span>{t('admin.centralPrices.import')}</span>
          </button>
        </div>
      </div>
      {templateError ? (
        <p role="alert" className="-mt-4 text-[12px] text-cos-v3-red-400">
          {templateError}
        </p>
      ) : null}

      <section className={`${SECTION} flex flex-col`} aria-labelledby="cp-register">
        <div className="flex items-center justify-between border-b border-cos-v3-slate-700 bg-cos-v3-slate-800/50 px-4 py-3">
          <div className="flex items-center gap-3">
            <AdminIcon name="table_chart" size={20} className="text-cos-v3-blue-600" />
            <h2 id="cp-register" className="text-[16px] font-semibold">
              {t('admin.centralPrices.register')}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-cos-v3-slate-400">
              {list.isSuccess
                ? `${t('admin.centralPrices.showing')} ${number.format(rows.length)} ${t('admin.centralPrices.of')} ${number.format(list.data.total)} ${t('admin.centralPrices.items')}`
                : NO_DATA}
            </span>
            <label>
              <span className="sr-only">{t('admin.centralPrices.period')}</span>
              <select
                value={period ?? ''}
                onChange={(e) => {
                  setPeriod(e.target.value || undefined);
                  setCursors([null]);
                }}
                className="rounded bg-cos-v3-slate-700 px-2 py-0.5 text-[11px] font-semibold text-cos-v3-slate-400 focus:outline-none focus:ring-1 focus:ring-cos-v3-blue-600"
              >
                <option value="">{t('admin.centralPrices.allPeriods')}</option>
                {(list.data?.periods ?? []).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="overflow-x-auto">
          {list.isLoading ? (
            <div className="p-4">
              <LoadingState variant="table" columns={7} label={t('admin.centralPrices.loading')} />
            </div>
          ) : list.isError ? (
            <p role="alert" className="p-6 text-[13px] text-cos-v3-red-400">
              {t(importErrorKey(statusOf(list.error)))}
            </p>
          ) : (
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="h-[40px] border-b border-cos-v3-slate-700 bg-cos-v3-slate-900/60 text-[13px] font-medium uppercase text-cos-v3-slate-400">
                  <th scope="col" className="w-[120px] px-4 py-2">
                    {t('admin.centralPrices.col.code')}
                  </th>
                  <th scope="col" className="px-4 py-2">
                    {t('admin.centralPrices.col.description')}
                  </th>
                  <th scope="col" className="w-[140px] px-4 py-2">
                    {t('admin.centralPrices.col.category')}
                  </th>
                  <th scope="col" className="w-[90px] px-4 py-2">
                    {t('admin.centralPrices.col.unit')}
                  </th>
                  <th scope="col" className="w-[130px] px-4 py-2 text-right">
                    {t('admin.centralPrices.col.price')}
                  </th>
                  <th scope="col" className="w-[140px] px-4 py-2">
                    {t('admin.centralPrices.col.source')}
                  </th>
                  <th scope="col" className="w-[120px] px-4 py-2">
                    {t('admin.centralPrices.col.status')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cos-v3-slate-700 text-[13px]">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-cos-v3-slate-400">
                      {t('admin.centralPrices.empty')}
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const look = STATUS_LOOK[row.status];
                    return (
                      <tr
                        key={row.price_id}
                        className="h-[40px] transition-colors hover:bg-cos-v3-slate-900/40"
                      >
                        <td className="px-4 py-2 font-mono text-cos-v3-slate-400">{row.code}</td>
                        <td className="px-4 py-2 font-medium">{row.description}</td>
                        <td className="px-4 py-2 text-cos-v3-slate-400">
                          {row.category ?? NO_DATA}
                        </td>
                        <td className="px-4 py-2 text-cos-v3-slate-400">{row.unit}</td>
                        <td className="px-4 py-2 text-right font-mono font-semibold">
                          {priceText(row.central_price)}
                          {row.currency_code !== 'THB' ? (
                            <span className="ml-1 text-[11px] text-cos-v3-slate-400">
                              {row.currency_code}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-2 text-[12px] text-cos-v3-slate-400">
                          {row.source_ref ?? t(`admin.centralPrices.source.${row.source}`)}
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={`inline-flex items-center gap-1 text-[12px] font-semibold ${look.ink}`}
                          >
                            <AdminIcon name={look.icon} size={15} />
                            <span>{t(`admin.centralPrices.status.${row.status}`)}</span>
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
        {list.isSuccess && (cursors.length > 1 || list.data.next_cursor) ? (
          <nav
            aria-label={t('admin.list.pagination')}
            className="flex items-center justify-end gap-2 border-t border-cos-v3-slate-700 px-4 py-2 text-[12px]"
          >
            <button
              type="button"
              disabled={cursors.length <= 1 || list.isFetching}
              onClick={() => setCursors((c) => c.slice(0, -1))}
              className="rounded border border-cos-v3-slate-700 px-3 py-1 hover:bg-cos-v3-slate-700 disabled:opacity-40"
            >
              {t('admin.list.previous')}
            </button>
            <span className="text-cos-v3-slate-400">
              {t('admin.list.page')} {number.format(cursors.length)}
            </span>
            <button
              type="button"
              disabled={!list.data.next_cursor || list.isFetching}
              onClick={() => {
                const next = list.data?.next_cursor;
                if (next) setCursors((c) => [...c, next]);
              }}
              className="rounded border border-cos-v3-slate-700 px-3 py-1 hover:bg-cos-v3-slate-700 disabled:opacity-40"
            >
              {t('admin.list.next')}
            </button>
          </nav>
        ) : null}
      </section>

      <section className={`${SECTION} p-4`} aria-labelledby="cp-sync">
        <div className="mb-4 flex items-center justify-between border-b border-cos-v3-slate-700 pb-3">
          <div className="flex items-center gap-2">
            <AdminIcon name="sync_saved_locally" size={20} className="text-cos-v3-green-600" />
            <h2 id="cp-sync" className="text-[16px] font-semibold">
              {t('admin.centralPrices.sync.title')}
            </h2>
          </div>
          <span className="text-[12px] text-cos-v3-slate-400">
            {status.isSuccess
              ? `${t('admin.centralPrices.sync.adapter')} ${status.data.adapter.name} · ${
                  status.data.adapter.configured
                    ? t('admin.centralPrices.sync.configured')
                    : t('admin.centralPrices.sync.notConfigured')
                }`
              : NO_DATA}
          </span>
        </div>
        {status.isLoading ? (
          <LoadingState variant="widget" label={t('admin.centralPrices.sync.loading')} />
        ) : status.isError ? (
          <p role="alert" className="text-[13px] text-cos-v3-red-400">
            {t(importErrorKey(statusOf(status.error)))}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className={WELL}>
              <WellHead icon="history">{t('admin.centralPrices.sync.lastRun')}</WellHead>
              <div className="font-mono text-[16px] font-bold">
                {lastRun ? formatDateTime(locale, lastRun.finished_at) : NO_DATA}
              </div>
              <div className="mt-1 text-[12px] text-cos-v3-slate-400">
                {lastRun
                  ? t(`admin.centralPrices.sync.kind.${lastRun.kind}`)
                  : t('admin.centralPrices.sync.never')}
              </div>
            </div>
            <div className={WELL}>
              <WellHead icon="verified">{t('admin.centralPrices.sync.outcome')}</WellHead>
              {lastRun ? (
                <div
                  className={`flex items-center gap-1.5 text-[16px] font-bold ${OUTCOME_LOOK[lastRun.outcome].ink}`}
                >
                  <AdminIcon name={OUTCOME_LOOK[lastRun.outcome].icon} size={18} />
                  <span>{t(`admin.centralPrices.sync.outcomes.${lastRun.outcome}`)}</span>
                </div>
              ) : (
                <div className="text-[16px] font-bold">{NO_DATA}</div>
              )}
              <div className="mt-1 font-mono text-[12px] text-cos-v3-slate-400">
                {/* COMING SOON — sync.outcomeDrawn: nothing verifies a payload signature */}
                {lastRun?.error_code ??
                  (lastRun?.outcome === 'SUCCEEDED'
                    ? t('admin.centralPrices.sync.outcomeDrawn')
                    : NO_DATA)}
              </div>
            </div>
            <div className={WELL}>
              <WellHead icon="cloud_download">{t('admin.centralPrices.sync.brought')}</WellHead>
              <div className="font-mono text-[16px] font-bold">
                {lastRun
                  ? `${number.format(lastRun.records_total)} ${t('admin.centralPrices.sync.records')}`
                  : NO_DATA}
              </div>
              <div className="mt-1 text-[12px] text-cos-v3-slate-400">
                {lastRun
                  ? `${t('admin.centralPrices.sync.inserted')} ${number.format(lastRun.records_inserted)} · ${t('admin.centralPrices.sync.updated')} ${number.format(lastRun.records_updated)} · ${t('admin.centralPrices.sync.rejected')} ${number.format(lastRun.records_rejected)}`
                  : NO_DATA}
              </div>
            </div>
          </div>
        )}
      </section>

      <FailedSync failure={failure} locale={locale} onRetry={() => setSyncing(true)} />

      {importing ? <ImportDialog onClose={() => setImporting(false)} /> : null}
      {syncing ? <SyncDialog onClose={() => setSyncing(false)} /> : null}
    </div>
  );
}

function WellHead({ icon, children }: { icon: AdminIconName; children: React.ReactNode }) {
  return (
    <div className="mb-1 flex items-center gap-1 text-[12px] text-cos-v3-slate-400">
      <AdminIcon name={icon} size={16} />
      <span>{children}</span>
    </div>
  );
}

function FailedSync({
  failure,
  locale,
  onRetry,
}: {
  failure: SyncRun | null;
  locale: Parameters<typeof formatDateTime>[0];
  onRetry: () => void;
}) {
  const { t } = useI18n();
  const comingSoon = useComingSoon();
  return (
    <section
      aria-labelledby="cp-failed"
      className="overflow-hidden rounded-md border border-cos-v3-red-600/40 bg-cos-v3-slate-800"
    >
      <div className="flex items-center justify-between border-b border-cos-v3-red-600/30 bg-cos-v3-red-600/10 px-4 py-3">
        <div className="flex items-center gap-2 text-cos-v3-red-600">
          <AdminIcon name="error" size={20} />
          <h2 id="cp-failed" className="text-[16px] font-bold">
            {t('admin.centralPrices.failed.title')}
          </h2>
        </div>
        <span className="rounded border border-cos-v3-red-600/30 bg-cos-v3-red-600/20 px-2 py-0.5 text-[11px] font-semibold uppercase text-cos-v3-red-600">
          {t('admin.centralPrices.failed.code')} {failure?.error_code ?? NO_DATA}
        </span>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="text-[14px] font-semibold">
              {failure
                ? `${t(`admin.centralPrices.sync.kind.${failure.kind}`)}: ${failure.source_name}`
                : t('admin.centralPrices.failed.none')}
            </div>
            <div className="font-mono text-[13px] text-cos-v3-slate-400">
              {failure?.error_message ?? NO_DATA}
            </div>
            <div className="text-[12px] text-cos-v3-slate-400">
              {t('admin.centralPrices.failed.at')}{' '}
              {failure ? formatDateTime(locale, failure.finished_at) : NO_DATA} ·{' '}
              {/* COMING SOON — failed.retriesDrawn: nothing retries a failed sync */}
              {failure
                ? t('admin.centralPrices.failed.retriesDrawn')
                : `${t('admin.centralPrices.failed.retries')} ${NO_DATA}`}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* COMING SOON — no technical log view (D18) */}
            <button
              type="button"
              onClick={() => comingSoon(t('admin.centralPrices.failed.log'))}
              className="flex h-[36px] items-center gap-1.5 rounded border border-cos-v3-slate-700 bg-cos-v3-slate-900 px-3 text-[12px] font-medium text-cos-v3-slate-400 hover:bg-cos-v3-slate-700 hover:text-cos-white"
            >
              <AdminIcon name="terminal" size={16} />
              <span>{t('admin.centralPrices.failed.log')}</span>
            </button>
            <button
              type="button"
              onClick={onRetry}
              className="flex h-[36px] items-center gap-1.5 rounded bg-cos-v3-red-600 px-4 text-[13px] font-semibold hover:bg-cos-v3-red-600/90"
            >
              <AdminIcon name="sync_problem" size={16} />
              <span>{t('admin.centralPrices.failed.retry')}</span>
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between rounded-[6px] border border-cos-v3-slate-700/80 bg-cos-v3-slate-900 p-3 text-[12px]">
          <div className="flex items-center gap-2">
            <AdminIcon name="warning" size={18} className="text-cos-v3-amber-500" />
            {/* COMING SOON — failed.impactDrawn / fallbackDrawn: no cached baseline, no fallback */}
            <span className="text-cos-v3-slate-400">
              {failure
                ? t('admin.centralPrices.failed.impactDrawn')
                : `${t('admin.centralPrices.failed.impact')} ${NO_DATA}`}
            </span>
          </div>
          <span className="font-mono text-cos-v3-slate-400">
            {t('admin.centralPrices.failed.fallback')}{' '}
            {failure ? t('admin.centralPrices.failed.fallbackDrawn') : NO_DATA}
          </span>
        </div>
      </div>
    </section>
  );
}

function DialogShell({
  title,
  onClose,
  dismissable,
  children,
}: {
  title: string;
  onClose: () => void;
  dismissable: boolean;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <ModalOverlay
      isOpen
      isDismissable={dismissable}
      onOpenChange={(open) => (open ? undefined : onClose())}
      data-admin-modal=""
      className="fixed inset-0 z-50 flex items-center justify-center bg-cos-v3-slate-900/80 p-6 backdrop-blur-sm"
    >
      <Modal className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-md border border-cos-v3-slate-700 bg-cos-v3-slate-800 text-cos-white shadow-2xl">
        <Dialog className="flex min-h-0 flex-1 flex-col outline-none">
          <div className="flex items-center justify-between border-b border-cos-v3-slate-700 px-5 py-3.5">
            <Heading slot="title" className="text-[16px] font-semibold">
              {title}
            </Heading>
            <Button
              aria-label={t('admin.create.close')}
              onPress={onClose}
              isDisabled={!dismissable}
              className="rounded p-1 text-cos-v3-slate-400 outline-none hover:bg-cos-v3-slate-700 hover:text-cos-white data-[focus-visible]:ring-2 data-[focus-visible]:ring-cos-v3-blue-600"
            >
              <AdminIcon name="close" size={20} />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

function Justification({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  error: string | undefined;
}) {
  const { t } = useI18n();
  return (
    <label className="block space-y-1">
      <span className="block text-[13px] font-medium">{t('admin.justification.label')}</span>
      <textarea
        value={value}
        rows={3}
        maxLength={500}
        aria-invalid={error !== undefined}
        onChange={(e) => onChange(e.target.value)}
        className={`${FIELD} ${error ? '!border-cos-v3-red-600' : ''}`}
      />
      <span
        className={`block text-[12px] ${error ? 'text-cos-v3-red-400' : 'text-cos-v3-slate-400'}`}
      >
        {error ?? t('admin.justification.help')}
      </span>
    </label>
  );
}

function ImportDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const submit = useImportCentralPrices();
  const [file, setFile] = useState<File | null>(null);
  const [period, setPeriod] = useState('');
  const [sourceRef, setSourceRef] = useState('');
  const [justification, setJustification] = useState('');
  const [touched, setTouched] = useState(false);
  const result: ImportResult | undefined = submit.data;

  const reason = adminJustificationSchema.safeParse({ justification });
  const fileError = !file
    ? t('admin.centralPrices.importForm.fileRequired')
    : file.size > IMPORT_MAX_BYTES
      ? t('admin.centralPrices.error.fileTooLarge')
      : undefined;
  const periodError = EFFECTIVE_PERIOD_RE.test(period.trim())
    ? undefined
    : t('admin.centralPrices.importForm.periodRule');
  const reasonError = reason.success
    ? undefined
    : t(reason.error.issues[0]?.message ?? 'validation.required');

  const onSubmit = () => {
    setTouched(true);
    if (fileError || periodError || !reason.success || !file) return;
    submit.mutate({
      file,
      effective_period: period.trim(),
      source_ref: sourceRef.trim(),
      justification: reason.data.justification,
    });
  };

  return (
    <DialogShell
      title={t('admin.centralPrices.import')}
      onClose={onClose}
      dismissable={!submit.isPending}
    >
      {result ? (
        <div className="space-y-3 text-[13px]" role="status">
          <div
            className={`flex items-center gap-1.5 font-semibold ${OUTCOME_LOOK[result.outcome].ink}`}
          >
            <AdminIcon name={OUTCOME_LOOK[result.outcome].icon} size={18} />
            <span>{t(`admin.centralPrices.sync.outcomes.${result.outcome}`)}</span>
          </div>
          <p className="text-cos-v3-slate-400">
            {t('admin.centralPrices.sync.records')}: {result.records_total} ·{' '}
            {t('admin.centralPrices.sync.inserted')} {result.inserted} ·{' '}
            {t('admin.centralPrices.sync.updated')} {result.updated} ·{' '}
            {t('admin.centralPrices.sync.rejected')} {result.rejected.length}
          </p>
          {result.rejected.length > 0 ? (
            <ul className="max-h-60 space-y-1 overflow-y-auto rounded border border-cos-v3-slate-700 bg-cos-v3-slate-900 p-3 font-mono text-[12px] text-cos-v3-slate-400">
              {result.rejected.map((r) => (
                <li key={`${r.row}-${r.reason}`}>
                  {t('admin.centralPrices.importForm.row')} {r.row}: {r.reason}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded bg-cos-v3-blue-600 px-4 py-1.5 text-[13px] font-semibold hover:bg-cos-v3-blue-600/90"
            >
              {t('admin.centralPrices.importForm.done')}
            </button>
          </div>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <label className="block space-y-1">
            <span className="block text-[13px] font-medium">
              {t('admin.centralPrices.importForm.file')}
            </span>
            <input
              type="file"
              accept={IMPORT_ACCEPT}
              aria-invalid={touched && fileError !== undefined}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-[13px] text-cos-v3-slate-400 file:mr-3 file:rounded file:border-0 file:bg-cos-v3-slate-700 file:px-3 file:py-1.5 file:text-cos-white"
            />
            <span
              className={`block text-[12px] ${touched && fileError ? 'text-cos-v3-red-400' : 'text-cos-v3-slate-400'}`}
            >
              {touched && fileError ? fileError : t('admin.centralPrices.importForm.fileHelp')}
            </span>
          </label>
          <label className="block space-y-1">
            <span className="block text-[13px] font-medium">
              {t('admin.centralPrices.importForm.period')}
            </span>
            <input
              type="text"
              value={period}
              maxLength={32}
              aria-invalid={touched && periodError !== undefined}
              onChange={(e) => setPeriod(e.target.value)}
              className={`${FIELD} font-mono ${touched && periodError ? '!border-cos-v3-red-600' : ''}`}
            />
            <span
              className={`block text-[12px] ${touched && periodError ? 'text-cos-v3-red-400' : 'text-cos-v3-slate-400'}`}
            >
              {t('admin.centralPrices.importForm.periodRule')}
            </span>
          </label>
          <label className="block space-y-1">
            <span className="block text-[13px] font-medium">
              {t('admin.centralPrices.importForm.sourceRef')}
            </span>
            <input
              type="text"
              value={sourceRef}
              maxLength={500}
              onChange={(e) => setSourceRef(e.target.value)}
              className={FIELD}
            />
          </label>
          <Justification
            value={justification}
            onChange={setJustification}
            error={touched ? reasonError : undefined}
          />
          {submit.isError ? (
            <p role="alert" className="text-[12px] text-cos-v3-red-400">
              {t(importErrorKey(statusOf(submit.error)))}
            </p>
          ) : null}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submit.isPending}
              className="rounded border border-cos-v3-slate-700 px-3.5 py-1.5 text-[13px] hover:bg-cos-v3-slate-700 disabled:opacity-50"
            >
              {t('admin.create.cancel')}
            </button>
            <button
              type="submit"
              disabled={submit.isPending}
              className="flex items-center gap-2 rounded bg-cos-v3-blue-600 px-4 py-1.5 text-[13px] font-semibold hover:bg-cos-v3-blue-600/90 disabled:opacity-60"
            >
              {submit.isPending ? (
                <LoadingState variant="micro" />
              ) : (
                <AdminIcon name="upload_file" size={16} />
              )}
              <span>{t('admin.centralPrices.importForm.submit')}</span>
            </button>
          </div>
        </form>
      )}
    </DialogShell>
  );
}

function SyncDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const sync = useSyncCentralPrices();
  const [justification, setJustification] = useState('');
  const [touched, setTouched] = useState(false);
  const reason = adminJustificationSchema.safeParse({ justification });
  const reasonError = reason.success
    ? undefined
    : t(reason.error.issues[0]?.message ?? 'validation.required');
  const run = sync.data;

  return (
    <DialogShell
      title={t('admin.centralPrices.failed.retry')}
      onClose={onClose}
      dismissable={!sync.isPending}
    >
      {run ? (
        <div className="space-y-3 text-[13px]" role="status">
          <div
            className={`flex items-center gap-1.5 font-semibold ${OUTCOME_LOOK[run.outcome].ink}`}
          >
            <AdminIcon name={OUTCOME_LOOK[run.outcome].icon} size={18} />
            <span>{t(`admin.centralPrices.sync.outcomes.${run.outcome}`)}</span>
          </div>
          <p className="font-mono text-cos-v3-slate-400">{run.error_code ?? NO_DATA}</p>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded bg-cos-v3-blue-600 px-4 py-1.5 text-[13px] font-semibold hover:bg-cos-v3-blue-600/90"
            >
              {t('admin.centralPrices.importForm.done')}
            </button>
          </div>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (reason.success) sync.mutate(reason.data.justification);
          }}
        >
          <p className="text-[13px] text-cos-v3-slate-400">
            {t('admin.centralPrices.syncForm.body')}
          </p>
          <Justification
            value={justification}
            onChange={setJustification}
            error={touched ? reasonError : undefined}
          />
          {sync.isError ? (
            <p role="alert" className="text-[12px] text-cos-v3-red-400">
              {t(importErrorKey(statusOf(sync.error)))}
            </p>
          ) : null}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={sync.isPending}
              className="rounded border border-cos-v3-slate-700 px-3.5 py-1.5 text-[13px] hover:bg-cos-v3-slate-700 disabled:opacity-50"
            >
              {t('admin.create.cancel')}
            </button>
            <button
              type="submit"
              disabled={sync.isPending}
              className="flex items-center gap-2 rounded bg-cos-v3-red-600 px-4 py-1.5 text-[13px] font-semibold hover:bg-cos-v3-red-600/90 disabled:opacity-60"
            >
              {sync.isPending ? (
                <LoadingState variant="micro" />
              ) : (
                <AdminIcon name="sync_problem" size={16} />
              )}
              <span>{t('admin.centralPrices.syncForm.submit')}</span>
            </button>
          </div>
        </form>
      )}
    </DialogShell>
  );
}
