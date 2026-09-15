'use client';

/**
 * SYSTEM_ADMIN — Global Audit Log (`/admin/audit`), the Stitch "Global Audit Log - SYSTEM_ADMIN" screen
 * (efb47c60bdad…, HTML fetched 2026-09-15; revision R17, re-synced R18). The workspace only; the shell is <AdminShell /> (product-owner
 * decision R10). Reads GET /admin/audit-logs, /summary and /export (tenant.openapi.yaml); the backend audits each read.
 *
 * ── PRODUCT-OWNER DECISION D4 (2026-09-15): the API, its filters and Export — no integrity / Merkle ─────────────────
 *   REAL — every row across tenants, newest first, 50 per page by cursor: time, operator e-mail and name, tenant code
 *     and name, action, the justification in full, and (View details) the resource, IP, user agent and metadata.
 *     Filters: search (`q`), action category (lib/adminAudit.ts AUDIT_ACTION_FILTERS), date range (UTC days; `to` is
 *     sent exclusive), Reset. Export CSV / JSON with the same filters. Cards: TOTAL LOGGED EVENTS (in range) and
 *     today; OPERATOR JUSTIFICATIONS as the share of tenant actions in range that carry one; HIGH-PRIVILEGE MUTATIONS
 *     over the last 7 × 24 h. "Page N of M" and "of N" only while no filter but the date range is set — the summary
 *     counts by range alone, so any other filter has no total.
 *   COMING SOON — drawn as Stitch draws it, from lib/adminDrawnFigures.ts `GLOBAL_AUDIT` (R19, D16; reversing D4's
 *     "not drawn"): the AUDIT_DAEMON version and ENCLAVE, the "Cryptographically Sealed" line, the DATA INTEGRITY SEAL
 *     card, ROOT_CHAIN, the KMS cipher, a VALID chip beside each justification, the INTEGRITY SEAL / HASH column (six
 *     drawn digests repeating over the real rows) and the hash-root / MERKLE PROOF callout. audit_logs carries no hash
 *     chain or credential.
 *   COMING SOON (D18) — Verify Ledger Integrity, every event tier past "All" and "Gateway & e-GP Config" open the
 *     "coming soon" dialog. The page-number buttons stay the cursor's Prev / Next: a cursor cannot jump to page 238157.
 *   R18 (the drawing as listed 2026-09-15): its page title and both tags are gone; the heading is screen-reader only.
 *   CORRECTED — the drawing cites §16.4 for the mandatory justification; §16.4 is "Cross-functional Enterprise Flow".
 *     The mandate is §6.7 (06-rbac-permission-matrix.md, "enforced for every tenant action in §20.4"), so §6.7 is cited.
 *   KEPT AS DRAWN — "IMMUTABLE": platform.audit_logs denies UPDATE / DELETE to app_user (rls_policies migration, QM-4).
 */

import { useState } from 'react';
import { Button, Menu, MenuItem, MenuTrigger, Popover } from 'react-aria-components';
import { useI18n } from '../../i18n';
import {
  AUDIT_ACTION_FILTERS,
  auditActionFor,
  auditQuery,
  auditTone,
  exclusiveTo,
  justificationShare,
  type AuditActionFilterKey,
} from '../../lib/adminAudit';
import { errorKeyForStatus } from '../../lib/adminTenants';
import {
  AUDIT_PAGE_SIZE,
  type AuditLogFilters,
  type AuditLogRow,
  useAuditExport,
  useAuditSummary,
  useGlobalAuditLogs,
} from '../../lib/api/adminAudit';
import { ApiError } from '../../lib/api/client';
import { GLOBAL_AUDIT, drawnFor } from '../../lib/adminDrawnFigures';
import { formatDate, formatTime, localeTag } from '../../lib/format';
import { LoadingState } from '../ui/LoadingState';
import { AdminIcon, type AdminIconName } from './AdminIcon';
import { NO_DATA } from './AdminShell';
import { useComingSoon } from './ComingSoon';

const CARD =
  'relative flex flex-col justify-between overflow-hidden rounded-md bg-cos-op-container-low p-3 shadow-sm';
const CONTROL =
  'h-9 rounded bg-cos-op-container-low text-op-tiny text-cos-op-on-surface focus:outline-none';

/** The drawing's per-row ink (chip text and operator dot) and chip glyph, by the action that was recorded. */
function actionLook(action: string): { ink: string; dot: string; icon: AdminIconName } {
  if (action === 'tenant.deactivate')
    return { ink: 'text-cos-op-error', dot: 'bg-cos-op-high-privilege', icon: 'block' };
  if (action === 'tenant.assign_dedicated_db')
    return { ink: 'text-cos-op-secondary', dot: 'bg-cos-op-secondary', icon: 'database' };
  if (action === 'tenant.mark_contracted')
    return { ink: 'text-cos-op-primary', dot: 'bg-cos-op-primary', icon: 'workspace_premium' };
  const tone = auditTone(action);
  if (tone === 'gate')
    return { ink: 'text-cos-op-warning', dot: 'bg-cos-op-warning', icon: 'published_with_changes' };
  if (tone === 'privileged')
    return { ink: 'text-cos-op-primary', dot: 'bg-cos-op-primary', icon: 'add_business' };
  if (action.startsWith('central_prices.'))
    return { ink: 'text-cos-op-success', dot: 'bg-cos-op-success', icon: 'payments' };
  if (tone === 'config')
    return { ink: 'text-cos-op-primary', dot: 'bg-cos-op-primary', icon: 'tune' };
  return { ink: 'text-cos-op-on-surface-variant', dot: 'bg-cos-op-outline', icon: 'receipt_long' };
}

export function GlobalAuditLog() {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<AuditActionFilterKey>('all');
  const [fromDay, setFromDay] = useState('');
  const [toDay, setToDay] = useState('');
  const [applied, setApplied] = useState('');
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const [open, setOpen] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | undefined>();
  const [exporting, setExporting] = useState(false);
  const comingSoon = useComingSoon();
  const [tier, setTier] = useState('all');
  const number = new Intl.NumberFormat(localeTag(locale));

  const range = { from: fromDay || undefined, to: toDay ? exclusiveTo(toDay) : undefined };
  const filters: AuditLogFilters = {
    ...range,
    q: applied || undefined,
    action: auditActionFor(category),
  };
  const cursor = cursors[cursors.length - 1] ?? null;
  const logs = useGlobalAuditLogs(filters, cursor);
  const summary = useAuditSummary(range);
  const exportFile = useAuditExport();

  const restart = () => {
    setCursors([null]);
    setOpen(null);
  };
  const applySearch = () => {
    const next = query.trim();
    if (next === applied) return;
    setApplied(next);
    restart();
  };
  const reset = () => {
    setQuery('');
    setApplied('');
    setCategory('all');
    setFromDay('');
    setToDay('');
    restart();
  };
  const onExport = async (format: 'csv' | 'json') => {
    setExporting(true);
    setExportError(undefined);
    try {
      await exportFile(
        `/admin/audit-logs/export${auditQuery({ ...filters, format })}`,
        `audit-logs.${format}`,
      );
    } catch (err) {
      setExportError(
        t(errorKeyForStatus(err instanceof ApiError ? err.status : undefined, 'rowAction')),
      );
    } finally {
      setExporting(false);
    }
  };

  const onlyRange = !applied && category === 'all';
  const total = summary.isSuccess && onlyRange ? summary.data.total : null;
  const rows = logs.data?.rows ?? [];
  const first = (cursors.length - 1) * AUDIT_PAGE_SIZE + 1;
  const share = summary.isSuccess
    ? justificationShare(summary.data.with_justification, summary.data.privileged)
    : null;
  const loadError = logs.isError
    ? t(
        errorKeyForStatus(
          logs.error instanceof ApiError ? logs.error.status : undefined,
          'rowAction',
        ),
      )
    : undefined;

  return (
    <div className="flex w-full flex-col">
      <div className="mb-3 flex items-center justify-between rounded-md bg-cos-op-container-lowest px-3 py-2 text-op-tiny">
        <nav
          aria-label={t('admin.cluster.breadcrumb')}
          className="flex items-center gap-2 text-cos-op-outline"
        >
          <span>{t('admin.audit.crumb1')}</span>
          <span aria-hidden="true">/</span>
          <span>{t('admin.audit.crumb2')}</span>
          <span aria-hidden="true">/</span>
          <span aria-current="page" className="font-semibold text-cos-op-primary">
            {t('admin.audit.crumb3')}
          </span>
        </nav>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-cos-op-on-surface-variant">
            {/* COMING SOON — GLOBAL_AUDIT.daemon / enclave */}
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-cos-op-success" />
            {t('admin.audit.daemon')} {GLOBAL_AUDIT.daemon}
          </span>
          <span aria-hidden="true" className="text-cos-op-outline">
            |
          </span>
          <span className="text-cos-op-outline">
            {t('admin.audit.enclave')} {GLOBAL_AUDIT.enclave}
          </span>
        </div>
      </div>

      <div className="mb-3 flex flex-col justify-between gap-3 pb-3 lg:flex-row lg:items-center">
        <div className="flex flex-col gap-1">
          <h1 className="sr-only">{t('admin.audit.title')}</h1>
        </div>
        <div className="flex items-center gap-2 self-start lg:self-center">
          <MenuTrigger>
            <Button
              isDisabled={exporting}
              className="flex h-9 items-center gap-2 rounded bg-cos-op-container-high px-3 text-op-tiny font-semibold uppercase tracking-wider text-cos-op-on-surface shadow-sm outline-none transition-colors hover:bg-cos-dark-bright disabled:opacity-50 data-[focus-visible]:ring-2 data-[focus-visible]:ring-cos-op-primary"
            >
              {exporting ? (
                <LoadingState variant="micro" />
              ) : (
                <AdminIcon name="download" size={16} />
              )}
              <span>{t('admin.audit.export')}</span>
            </Button>
            <Popover
              placement="bottom end"
              className="min-w-[10rem] rounded-md bg-cos-op-container-high p-1 shadow-xl"
            >
              <Menu
                className="outline-none"
                onAction={(key) => void onExport(key === 'json' ? 'json' : 'csv')}
              >
                {(['csv', 'json'] as const).map((format) => (
                  <MenuItem
                    key={format}
                    id={format}
                    className="flex cursor-pointer items-center rounded px-3 py-2 text-op-label text-cos-op-on-surface outline-none data-[focused]:bg-cos-op-container-highest"
                  >
                    {t(`admin.audit.exportAs.${format}`)}
                  </MenuItem>
                ))}
              </Menu>
            </Popover>
          </MenuTrigger>
          {/* COMING SOON — no ledger to verify (D18) */}
          <button
            type="button"
            onClick={() => comingSoon(t('admin.audit.verify'))}
            className="flex h-9 items-center gap-2 rounded bg-cos-op-primary-container px-3 text-op-tiny font-semibold uppercase tracking-wider text-cos-op-on-primary-container shadow-md transition-all hover:bg-cos-v3-blue-600 active:scale-95"
          >
            <AdminIcon name="verified_user" size={16} className="text-white" />
            <span className="text-white">{t('admin.audit.verify')}</span>
          </button>
        </div>
      </div>
      {exportError ? (
        <p role="alert" className="-mt-2 mb-3 text-op-tiny text-cos-op-error">
          {exportError}
        </p>
      ) : null}

      <section
        aria-label={t('admin.audit.cards')}
        className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4"
      >
        <div className={CARD}>
          <CardHead
            label={t('admin.audit.card.total')}
            icon="receipt_long"
            iconClass="text-cos-op-outline"
          />
          <div className="mb-1 flex items-baseline gap-2">
            <span className="text-op-h1 font-bold tracking-tight text-cos-op-on-surface">
              {summary.isSuccess ? number.format(summary.data.total) : NO_DATA}
            </span>
            {summary.isSuccess ? (
              <span className="text-op-tiny font-semibold text-cos-op-success">
                +{number.format(summary.data.today)} {t('admin.audit.card.today')}
              </span>
            ) : null}
          </div>
          {/* COMING SOON — GLOBAL_AUDIT.sealedLine */}
          <CardFoot icon="check_circle" iconClass="text-cos-op-success">
            {GLOBAL_AUDIT.sealedLine}
          </CardFoot>
        </div>
        <div className={CARD}>
          <CardHead
            label={t('admin.audit.card.justifications')}
            icon="fact_check"
            iconClass="text-cos-op-secondary"
          />
          <div className="mb-1 flex items-baseline gap-2">
            <span className="text-op-h1 font-bold text-cos-op-secondary">
              {share?.percent != null ? `${share.percent}%` : NO_DATA}
            </span>
            {share ? (
              <span className="text-op-tiny font-medium text-cos-op-on-surface-variant">
                {number.format(share.missing)} {t('admin.audit.card.missing')}
              </span>
            ) : null}
          </div>
          <CardFoot icon="verified" iconClass="text-cos-op-primary">
            {t('admin.audit.card.enforced')}
          </CardFoot>
        </div>
        <div className={CARD}>
          <CardHead
            label={t('admin.audit.card.privileged')}
            icon="admin_panel_settings"
            iconClass="text-cos-op-warning"
          />
          <div className="mb-1 flex items-baseline gap-2">
            <span className="text-op-h1 font-bold text-cos-op-on-surface">
              {summary.isSuccess
                ? `${number.format(summary.data.privileged_7d)} ${t('admin.audit.card.events')}`
                : NO_DATA}
            </span>
            <span className="text-op-tiny font-semibold text-cos-op-warning">
              {t('admin.audit.card.window')}
            </span>
          </div>
          <div className="flex items-center gap-1 text-op-tiny text-cos-op-on-surface-variant">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-cos-op-warning" />
            <span className="truncate">{t('admin.audit.card.privilegedScope')}</span>
          </div>
        </div>
        <div className={CARD}>
          <CardHead
            label={t('admin.audit.card.seal')}
            icon="gavel"
            iconClass="text-cos-op-secondary"
          />
          {/* COMING SOON — GLOBAL_AUDIT.seal */}
          <div className="mb-1 flex items-baseline gap-2">
            <span className="text-op-h1 font-bold text-cos-op-on-surface">
              {GLOBAL_AUDIT.seal.value}
            </span>
            <span className="rounded bg-cos-op-container-highest px-1 text-op-tiny font-semibold uppercase text-cos-op-secondary">
              {GLOBAL_AUDIT.seal.chip}
            </span>
          </div>
          <div className="flex items-center gap-1 truncate text-op-tiny text-cos-op-outline">
            <AdminIcon name="link" size={14} className="shrink-0 text-cos-op-secondary" />
            <span className="truncate">{GLOBAL_AUDIT.seal.did}</span>
          </div>
        </div>
      </section>

      <form
        role="search"
        className="mb-3 flex w-full flex-row flex-nowrap items-center gap-2.5 overflow-x-auto rounded-md bg-cos-op-container-lowest p-3 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          applySearch();
        }}
      >
        <label className="relative min-w-[200px] flex-1">
          <span className="sr-only">{t('admin.audit.search')}</span>
          <AdminIcon
            name="search"
            size={18}
            className="pointer-events-none absolute left-2 top-2.5 text-cos-op-outline"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onBlur={applySearch}
            placeholder={t('admin.audit.searchPlaceholder')}
            className={`${CONTROL} w-full pl-8 pr-2 transition-colors placeholder:text-cos-op-outline focus:bg-cos-op-container`}
          />
        </label>
        <label className="relative shrink-0">
          <span className="sr-only">{t('admin.audit.tier')}</span>
          {/* COMING SOON — nothing assigns a tier to an audit row; a tier opens the dialog (D18) */}
          <select
            value={tier}
            onChange={(e) => {
              if (e.target.value === 'all') return;
              comingSoon(e.target.selectedOptions[0]?.text ?? e.target.value);
              setTier('all');
            }}
            className={`${CONTROL} w-[210px] cursor-pointer appearance-none truncate pl-2 pr-7`}
          >
            <option value="all">{t('admin.audit.tiers.all')}</option>
            {(['critical', 'high', 'standard', 'system'] as const).map((key) => (
              <option key={key} value={key}>
                {t(`admin.audit.tiers.${key}`)}
              </option>
            ))}
          </select>
          <AdminIcon
            name="expand_more"
            size={16}
            className="pointer-events-none absolute right-2 top-2.5 text-cos-op-outline"
          />
        </label>
        <label className="relative shrink-0">
          <span className="sr-only">{t('admin.audit.category')}</span>
          <select
            value={category}
            onChange={(e) => {
              const key = e.target.value as AuditActionFilterKey;
              // COMING SOON — a category with no recorded action opens the dialog (D18)
              if (auditActionFor(key) === undefined && key !== 'all') {
                comingSoon(e.target.selectedOptions[0]?.text ?? key);
                return;
              }
              setCategory(key);
              restart();
            }}
            className={`${CONTROL} w-[210px] cursor-pointer appearance-none truncate pl-2 pr-7`}
          >
            {AUDIT_ACTION_FILTERS.map((f) => (
              <option key={f.key} value={f.key}>
                {t(`admin.audit.categories.${f.key}`)}
              </option>
            ))}
          </select>
          <AdminIcon
            name="expand_more"
            size={16}
            className="pointer-events-none absolute right-2 top-2.5 text-cos-op-outline"
          />
        </label>
        <fieldset
          className={`${CONTROL} flex shrink-0 items-center gap-1.5 whitespace-nowrap px-2`}
        >
          <legend className="sr-only">{t('admin.audit.range')}</legend>
          <AdminIcon name="date_range" size={16} className="text-cos-op-outline" />
          <input
            type="date"
            aria-label={t('admin.audit.rangeFrom')}
            value={fromDay}
            max={toDay || undefined}
            onChange={(e) => {
              setFromDay(e.target.value);
              restart();
            }}
            className="bg-transparent text-op-tiny text-cos-op-on-surface [color-scheme:dark] focus:outline-none"
          />
          <span aria-hidden="true">-</span>
          <input
            type="date"
            aria-label={t('admin.audit.rangeTo')}
            value={toDay}
            min={fromDay || undefined}
            onChange={(e) => {
              setToDay(e.target.value);
              restart();
            }}
            className="bg-transparent text-op-tiny text-cos-op-on-surface [color-scheme:dark] focus:outline-none"
          />
          <span className="text-cos-op-outline">UTC</span>
        </fieldset>
        <button
          type="button"
          onClick={reset}
          className="flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded bg-cos-op-container-high px-3 text-op-tiny text-cos-op-on-surface-variant transition-colors hover:bg-cos-dark-bright hover:text-cos-op-on-surface"
        >
          <AdminIcon name="filter_alt_off" size={16} />
          <span>{t('admin.audit.reset')}</span>
        </button>
      </form>

      <div className="flex flex-col overflow-hidden rounded-md bg-cos-op-container-low shadow-sm">
        <div className="flex items-center justify-between bg-cos-op-container px-3 py-2 text-op-tiny text-cos-op-outline">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-cos-op-on-surface">{t('admin.audit.ledger')}</span>
            <span aria-hidden="true">•</span>
            <span>{t('admin.audit.sort')}</span>
            <span aria-hidden="true">•</span>
            {/* COMING SOON — GLOBAL_AUDIT.rootChain */}
            <span className="font-mono text-cos-op-secondary">
              {t('admin.audit.rootChain')} {GLOBAL_AUDIT.rootChain}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <AdminIcon name="lock" size={16} className="text-cos-op-success" />
            <span className="font-medium text-cos-op-on-surface-variant">
              {/* COMING SOON — GLOBAL_AUDIT.encrypted */}
              {t('admin.audit.encrypted')} {GLOBAL_AUDIT.encrypted}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          {logs.isLoading ? (
            <div className="p-3">
              <LoadingState variant="table" columns={5} label={t('admin.auditModal.loading')} />
            </div>
          ) : loadError ? (
            <p role="alert" className="p-6 text-op-tiny text-cos-op-error">
              {loadError}
            </p>
          ) : (
            <table className="w-full border-collapse whitespace-nowrap text-left text-op-body">
              <thead>
                <tr className="bg-cos-op-container-highest text-op-tiny uppercase tracking-wider text-cos-op-outline">
                  <th scope="col" className="w-40 px-3 py-2.5 font-semibold">
                    {t('admin.audit.col.time')}
                  </th>
                  <th scope="col" className="w-44 px-3 py-2.5 font-semibold">
                    {t('admin.audit.col.operator')}
                  </th>
                  <th scope="col" className="w-48 px-3 py-2.5 font-semibold">
                    {t('admin.audit.col.tenant')}
                  </th>
                  <th scope="col" className="w-52 px-3 py-2.5 font-semibold">
                    {t('admin.audit.col.action')}
                  </th>
                  <th scope="col" className="min-w-[340px] px-3 py-2.5 font-semibold">
                    {t('admin.audit.col.justification')}
                  </th>
                  <th scope="col" className="w-40 px-3 py-2.5 font-semibold">
                    {t('admin.audit.col.hash')}
                  </th>
                  <th scope="col" className="w-28 px-3 py-2.5 text-right font-semibold">
                    {t('admin.audit.col.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="text-op-tiny">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-cos-op-outline">
                      {t('admin.auditModal.empty')}
                    </td>
                  </tr>
                ) : (
                  rows.map((row, index) => (
                    <LedgerRow
                      key={row.log_id}
                      row={row}
                      hash={drawnFor(GLOBAL_AUDIT.hashes, index)!}
                      open={open === row.log_id}
                      onToggle={() => setOpen(open === row.log_id ? null : row.log_id)}
                    />
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex flex-col items-center justify-between gap-2 bg-cos-op-container-lowest p-3 md:flex-row">
          <div className="flex items-center gap-2 text-op-tiny text-cos-op-outline">
            <span>
              {t('admin.audit.showing')}{' '}
              <strong className="font-semibold text-cos-op-on-surface">
                {rows.length === 0
                  ? 0
                  : `${number.format(first)} - ${number.format(first + rows.length - 1)}`}
              </strong>{' '}
              {t('admin.audit.of')}{' '}
              <strong>{total === null ? NO_DATA : number.format(total)}</strong>{' '}
              {t('admin.audit.entries')}
            </span>
            <span aria-hidden="true">•</span>
            <span>
              {t('admin.audit.page')} {number.format(cursors.length)} {t('admin.audit.of')}{' '}
              {total === null
                ? NO_DATA
                : number.format(Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)))}
            </span>
          </div>
          <nav
            aria-label={t('admin.list.pagination')}
            className="flex items-center gap-1 text-op-tiny"
          >
            <button
              type="button"
              disabled={cursors.length <= 1 || logs.isFetching}
              onClick={() => {
                setCursors((c) => c.slice(0, -1));
                setOpen(null);
              }}
              className="rounded bg-cos-op-container px-2 py-1 text-cos-op-on-surface hover:bg-cos-op-container-high disabled:cursor-not-allowed disabled:text-cos-op-outline disabled:opacity-50"
            >
              {t('admin.audit.prev')}
            </button>
            <span
              aria-current="page"
              className="rounded bg-cos-op-primary-container px-2 py-1 font-semibold text-cos-op-on-primary-container"
            >
              {number.format(cursors.length)}
            </span>
            <button
              type="button"
              disabled={!logs.data?.next_cursor || logs.isFetching}
              onClick={() => {
                const next = logs.data?.next_cursor;
                if (next) setCursors((c) => [...c, next]);
                setOpen(null);
              }}
              className="rounded bg-cos-op-container px-2 py-1 text-cos-op-on-surface hover:bg-cos-op-container-high disabled:cursor-not-allowed disabled:text-cos-op-outline disabled:opacity-50"
            >
              {t('admin.list.next')}
            </button>
          </nav>
        </div>
      </div>

      {/* COMING SOON — GLOBAL_AUDIT.hashRoot / merkle: no ledger hash root exists */}
      <div className="mt-3 flex flex-col justify-between gap-2 rounded-md bg-cos-op-container-lowest p-3 shadow-sm sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-center gap-2">
          <AdminIcon name="shield" size={20} className="shrink-0 text-cos-op-secondary" />
          <div className="flex min-w-0 flex-col text-op-tiny">
            <div className="flex flex-wrap items-center gap-1">
              <span className="font-semibold uppercase text-cos-op-outline">
                {t('admin.audit.hashRoot')}
              </span>
              <span className="truncate font-mono text-cos-op-on-surface">
                {GLOBAL_AUDIT.hashRoot}
              </span>
            </div>
            <span className="text-cos-op-on-surface-variant">{GLOBAL_AUDIT.hashRootNote}</span>
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1 rounded bg-cos-op-container-highest px-2 py-1 text-op-tiny font-semibold text-cos-op-success">
          <AdminIcon name="task_alt" size={14} />
          {GLOBAL_AUDIT.merkle}
        </span>
      </div>
    </div>
  );
}

function CardHead({
  label,
  icon,
  iconClass,
}: {
  label: string;
  icon: AdminIconName;
  iconClass: string;
}) {
  return (
    <div className="mb-1 flex items-center justify-between">
      <span className="text-op-tiny font-semibold uppercase tracking-wider text-cos-op-outline">
        {label}
      </span>
      <AdminIcon name={icon} size={18} className={iconClass} />
    </div>
  );
}

function CardFoot({
  icon,
  iconClass,
  children,
}: {
  icon: AdminIconName;
  iconClass: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1 text-op-tiny text-cos-op-on-surface-variant">
      <AdminIcon name={icon} size={14} className={iconClass} />
      <span className="truncate">{children}</span>
    </div>
  );
}

function LedgerRow({
  row,
  hash,
  open,
  onToggle,
}: {
  row: AuditLogRow;
  /** COMING SOON — the drawn digest for this row (GLOBAL_AUDIT.hashes). */
  hash: string;
  open: boolean;
  onToggle: () => void;
}) {
  const { t, locale } = useI18n();
  const look = actionLook(row.action);
  return (
    <>
      <tr className="h-10 transition-colors hover:bg-cos-op-container">
        <td className="px-3 font-mono text-cos-op-on-surface">
          {formatDate(locale, row.occurred_at)}{' '}
          <span className="text-cos-op-outline">{formatTime(locale, row.occurred_at)}</span>
        </td>
        <td className="px-3">
          <div
            className="flex max-w-[18rem] items-center gap-1.5"
            title={`${row.actor_email ?? row.actor_id}${row.actor_name ? ` (${row.actor_name})` : ''}`}
          >
            <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${look.dot}`} />
            <span className="truncate font-semibold text-cos-op-on-surface">
              {row.actor_email ?? row.actor_id}
            </span>
            {row.actor_name ? (
              <span className="truncate text-cos-op-outline">({row.actor_name})</span>
            ) : null}
          </div>
        </td>
        <td className="px-3">
          <div className="flex flex-col">
            <span className="font-semibold text-cos-op-primary">{row.tenant_code}</span>
            <span className="max-w-[170px] truncate text-cos-op-outline">{row.tenant_name}</span>
          </div>
        </td>
        <td className="px-3">
          <div
            title={row.action}
            className={`inline-flex max-w-[16rem] items-center gap-1 rounded bg-cos-op-container-highest px-2 py-0.5 font-semibold uppercase ${look.ink}`}
          >
            <AdminIcon name={look.icon} size={14} className="shrink-0" />
            <span className="truncate">{row.action}</span>
          </div>
        </td>
        <td className="whitespace-normal px-3 py-2">
          {row.justification ? (
            <span className="flex items-start gap-2">
              {/* COMING SOON — GLOBAL_AUDIT.validChip: nothing validates a justification */}
              <span className="mt-0.5 shrink-0 rounded bg-cos-op-container-high px-1.5 font-mono text-[10px] font-semibold uppercase text-cos-op-success">
                {GLOBAL_AUDIT.validChip}
              </span>
              <span className="break-words text-cos-op-on-surface">
                &ldquo;{row.justification}&rdquo;
              </span>
            </span>
          ) : (
            <span className="text-cos-op-outline">{NO_DATA}</span>
          )}
        </td>
        <td className="px-3 font-mono">
          <div className="flex items-center gap-1 text-cos-op-secondary">
            <AdminIcon name="verified" size={14} className="text-cos-op-success" />
            <span>{hash}</span>
          </div>
        </td>
        <td className="px-3 text-right">
          <button
            type="button"
            aria-expanded={open}
            onClick={onToggle}
            className="rounded px-2 py-1 text-op-tiny font-semibold uppercase tracking-wider text-cos-op-secondary transition-colors hover:bg-cos-op-container-highest hover:text-cos-op-on-surface"
          >
            {t('admin.audit.details')}
          </button>
        </td>
      </tr>
      {open ? (
        <tr className="bg-cos-op-container-lowest">
          <td colSpan={7} className="px-3 py-3">
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 whitespace-normal font-mono text-op-tiny">
              <dt className="text-cos-op-outline">{t('admin.audit.detail.resource')}</dt>
              <dd className="break-all text-cos-op-on-surface">
                {row.resource_type} {row.resource_id ?? NO_DATA}
              </dd>
              <dt className="text-cos-op-outline">{t('admin.audit.detail.ip')}</dt>
              <dd className="text-cos-op-on-surface">{row.ip_address ?? NO_DATA}</dd>
              <dt className="text-cos-op-outline">{t('admin.audit.detail.agent')}</dt>
              <dd className="break-all text-cos-op-on-surface">{row.user_agent ?? NO_DATA}</dd>
              <dt className="text-cos-op-outline">{t('admin.audit.detail.metadata')}</dt>
              <dd>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-cos-op-container p-2 text-cos-op-on-surface-variant">
                  {JSON.stringify(row.metadata, null, 2)}
                </pre>
              </dd>
            </dl>
          </td>
        </tr>
      ) : null}
    </>
  );
}
