'use client';

/**
 * SYSTEM_ADMIN — one tenant's audit trail, the Stitch "Tenant Audit Log — Modal Overlay — SYSTEM_ADMIN" dialog
 * (screen 4578413eabff…, HTML fetched 2026-09-15; revision R17). Opened by the row's Audit Log action or from Tenant
 * Detail. Reads `GET /admin/tenants/{id}/audit-logs` (newest first, 50 per page) and exports through
 * `…/audit-logs/export.csv`; the backend audits both (§20.4.6 as answered, decision D3).
 *
 * ── PRODUCT-OWNER DECISION D3 (2026-09-15) ──────────────────────────────────────────────────────
 *   REAL — TOTAL (30D); each row's time, action, actor e-mail, IP, the resource it targeted and the justification IN
 *     FULL (the drawing's Metadata column truncates; D3 says full); the search (`q`: action, actor e-mail,
 *     justification); paging by cursor; Export CSV.
 *   NOT DRAWN — the Hash column, the INTEGRITY chain line, Trigger and Verify: audit_logs carries no hash chain.
 *   `—` — the SECURITY flagged count and the ACTIVE compliance regime: nothing classifies audit rows that way.
 *   The event-type select keeps the drawing's categories; only "All Event Types" is enabled — the per-tenant endpoint
 *   filters by text, not by category. The footer carries the paging instead of Trigger / Verify.
 *   The drawing's title slot is empty; the dialog's heading is screen-reader only. The Severity chip is the action's
 *   family (lib/adminAudit.ts `auditTone`), not a severity the platform assigns; the actor's second line shows the
 *   actor's name where the drawing shows a role, because the audit row stores no role.
 */

import { useState } from 'react';
import { Button, Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { useI18n } from '../../i18n';
import { auditQuery, auditTone, type AuditTone } from '../../lib/adminAudit';
import { errorKeyForStatus, type TenantListRow } from '../../lib/adminTenants';
import { type AuditLogRow, useAuditExport, useTenantAuditLogs } from '../../lib/api/adminAudit';
import { ApiError } from '../../lib/api/client';
import { formatDateTime, localeTag } from '../../lib/format';
import { LoadingState } from '../ui/LoadingState';
import { AdminIcon } from './AdminIcon';
import { NO_DATA } from './AdminShell';

/** Chip classes per action family — the drawing's five chip styles. */
export const AUDIT_TONE: Record<AuditTone, string> = {
  gate: 'border-cos-op-gate/40 bg-cos-op-gate/20 text-cos-op-gate',
  danger: 'border-cos-op-error/40 bg-cos-op-error/15 text-cos-op-error',
  privileged: 'border-cos-blue/30 bg-cos-blue/15 text-cos-blue',
  config: 'border-cos-cyan/30 bg-cos-cyan/15 text-cos-cyan',
  read: 'border-cos-op-success/30 bg-cos-op-success/15 text-cos-op-success',
  other: 'border-cos-op-outline-variant/30 bg-cos-op-container-high text-cos-op-on-surface-variant',
};

export function TenantAuditLogModal({
  tenant,
  onClose,
}: {
  tenant: TenantListRow;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState('');
  const [applied, setApplied] = useState('');
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const cursor = cursors[cursors.length - 1] ?? null;
  const logs = useTenantAuditLogs(tenant.tenant_id, applied, cursor);
  const exportCsv = useAuditExport();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | undefined>();
  const unavailable = t('admin.nav.unavailable');

  const applySearch = () => {
    const next = query.trim();
    if (next === applied) return;
    setApplied(next);
    setCursors([null]);
  };

  const onExport = async () => {
    setExporting(true);
    setExportError(undefined);
    try {
      await exportCsv(
        `/admin/tenants/${tenant.tenant_id}/audit-logs/export.csv${auditQuery({ q: applied })}`,
        `audit-${tenant.tenant_code}.csv`,
      );
    } catch (err) {
      setExportError(
        t(errorKeyForStatus(err instanceof ApiError ? err.status : undefined, 'rowAction')),
      );
    } finally {
      setExporting(false);
    }
  };

  const loadError = logs.isError
    ? t(
        errorKeyForStatus(
          logs.error instanceof ApiError ? logs.error.status : undefined,
          'rowAction',
        ),
      )
    : undefined;

  return (
    <ModalOverlay
      isOpen
      isDismissable
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      data-admin-modal=""
      className="fixed inset-0 z-50 flex items-center justify-center bg-cos-op-container-lowest/80 p-6 backdrop-blur-md"
    >
      <Modal className="flex max-h-[920px] w-full max-w-5xl flex-col overflow-hidden rounded-md border border-cos-op-outline-variant/60 bg-cos-op-container-low shadow-2xl">
        <Dialog className="flex max-h-[inherit] min-h-0 flex-1 flex-col outline-none">
          <header className="flex items-center justify-between border-b border-cos-op-outline-variant/40 bg-cos-op-surface px-6 py-4">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded border border-cos-cyan/30 bg-cos-cyan/10 text-cos-cyan">
                <AdminIcon name="history_edu" size={20} />
              </span>
              <div>
                <Heading slot="title" className="sr-only">
                  {t('admin.auditModal.title')}
                </Heading>
                <p className="mt-0.5 font-mono text-[12px] text-cos-op-outline">
                  {t('admin.auditModal.tenant')} {tenant.tenant_name} ({t('admin.auditModal.code')}{' '}
                  <span className="text-cos-op-on-surface">{tenant.tenant_code}</span>) •{' '}
                  {t('admin.auditModal.node')}{' '}
                  <span className="text-cos-cyan">{tenant.dedicated_db_host ?? NO_DATA}</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                onPress={() => void onExport()}
                isDisabled={exporting}
                className="flex items-center gap-1.5 rounded border border-cos-op-outline-variant/40 bg-cos-op-container-high px-3 py-1.5 font-mono text-[12px] text-cos-op-on-surface outline-none transition-colors hover:bg-cos-op-container-highest disabled:opacity-50 data-[focus-visible]:ring-2 data-[focus-visible]:ring-cos-cyan"
              >
                {exporting ? (
                  <LoadingState variant="micro" />
                ) : (
                  <AdminIcon name="file_download" size={16} />
                )}
                {t('admin.auditModal.export')}
              </Button>
              <Button
                aria-label={t('admin.create.close')}
                onPress={onClose}
                className="rounded p-1 text-cos-op-outline outline-none transition-colors hover:bg-cos-op-container-high hover:text-white data-[focus-visible]:ring-2 data-[focus-visible]:ring-cos-cyan"
              >
                <AdminIcon name="close" size={20} />
              </Button>
            </div>
          </header>

          <div className="flex items-center justify-between gap-4 border-b border-cos-op-outline-variant/30 bg-cos-op-detail-tabs px-6 py-3 font-mono text-[12px]">
            <div className="flex items-center gap-6">
              <span className="flex items-center gap-2">
                <span className="text-cos-op-outline">{t('admin.auditModal.total30d')}</span>
                <span className="font-bold text-white">
                  {logs.isSuccess
                    ? new Intl.NumberFormat(localeTag(locale)).format(logs.data.summary.total_30d)
                    : NO_DATA}
                </span>
              </span>
              <span aria-hidden="true" className="h-4 w-px bg-cos-op-outline-variant/40" />
              <span className="flex items-center gap-2">
                <span className="text-cos-op-outline">{t('admin.auditModal.security')}</span>
                <span className="flex items-center gap-1 font-bold text-cos-op-gate">
                  <AdminIcon name="warning" size={14} /> {NO_DATA}
                </span>
              </span>
              <span aria-hidden="true" className="h-4 w-px bg-cos-op-outline-variant/40" />
              <span className="flex items-center gap-2">
                <span className="text-cos-op-outline">{t('admin.auditModal.active')}</span>
                <span className="font-bold text-cos-op-success">{NO_DATA}</span>
              </span>
            </div>
            <form
              role="search"
              className="flex items-center gap-2.5"
              onSubmit={(e) => {
                e.preventDefault();
                applySearch();
              }}
            >
              <label className="relative flex items-center">
                <span className="sr-only">{t('admin.auditModal.search')}</span>
                <AdminIcon
                  name="search"
                  size={16}
                  className="pointer-events-none absolute left-2.5 text-cos-op-outline"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onBlur={applySearch}
                  placeholder={t('admin.auditModal.searchPlaceholder')}
                  className="w-48 rounded border border-cos-op-outline-variant/50 bg-cos-op-container-lowest py-1 pl-8 pr-3 font-mono text-[12px] text-white placeholder:text-cos-op-outline focus:border-cos-cyan focus:outline-none focus:ring-0"
                />
              </label>
              <label>
                <span className="sr-only">{t('admin.auditModal.category')}</span>
                <select
                  defaultValue="all"
                  className="rounded border border-cos-op-outline-variant/50 bg-cos-op-container-lowest px-2.5 py-1 font-mono text-[12px] text-cos-op-on-surface focus:border-cos-cyan focus:outline-none focus:ring-0"
                >
                  <option value="all">{t('admin.auditModal.cat.all')}</option>
                  {(['privileged', 'security', 'tier', 'quota'] as const).map((c) => (
                    <option key={c} value={c} disabled title={unavailable}>
                      {t(`admin.auditModal.cat.${c}`)}
                    </option>
                  ))}
                </select>
              </label>
            </form>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-cos-op-container-lowest">
            {logs.isLoading ? (
              <div className="p-4">
                <LoadingState variant="table" columns={5} label={t('admin.auditModal.loading')} />
              </div>
            ) : loadError ? (
              <p role="alert" className="p-6 text-[12px] text-cos-op-error">
                {loadError}
              </p>
            ) : (
              <AuditTable rows={logs.data?.rows ?? []} showTenant={false} />
            )}
          </div>

          <footer className="flex items-center justify-between border-t border-cos-op-outline-variant/30 bg-cos-op-detail-tabs p-4 font-mono text-[12px]">
            <div className="flex items-center gap-2 text-cos-op-outline">
              {exportError ? (
                <span role="alert" className="text-cos-op-error">
                  {exportError}
                </span>
              ) : (
                <span>
                  {t('admin.auditModal.page')} {cursors.length}
                  {logs.isSuccess
                    ? ` • ${logs.data.rows.length} ${t('admin.auditModal.rows')}`
                    : ''}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button
                onPress={() => setCursors((c) => c.slice(0, -1))}
                isDisabled={cursors.length <= 1 || logs.isFetching}
                className="rounded border border-cos-op-outline-variant/40 bg-cos-op-container-high px-4 py-2 font-mono text-[12px] font-semibold text-cos-op-on-surface outline-none transition-colors hover:bg-cos-op-container-highest disabled:opacity-40 data-[focus-visible]:ring-2 data-[focus-visible]:ring-cos-cyan"
              >
                {t('admin.list.previous')}
              </Button>
              <Button
                onPress={() => {
                  const next = logs.data?.next_cursor;
                  if (next) setCursors((c) => [...c, next]);
                }}
                isDisabled={!logs.data?.next_cursor || logs.isFetching}
                className="flex items-center gap-1.5 rounded bg-cos-blue px-4 py-2 font-mono text-[12px] font-semibold text-white shadow-lg shadow-cos-blue/20 outline-none transition-colors hover:bg-cos-op-mark-confirm-hover disabled:opacity-40 data-[focus-visible]:ring-2 data-[focus-visible]:ring-cos-cyan"
              >
                {t('admin.list.next')}
              </Button>
            </div>
          </footer>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

/** The ledger table both audit screens draw: newest first, justification in full. */
export function AuditTable({ rows, showTenant }: { rows: AuditLogRow[]; showTenant: boolean }) {
  const { t, locale } = useI18n();
  const columns = showTenant ? 6 : 5;
  return (
    <table className="w-full border-collapse text-left text-[12px]">
      <thead className="sticky top-0 z-10 border-b border-cos-op-outline-variant/40 bg-cos-op-container-low font-mono text-[11px] uppercase tracking-wider text-cos-op-outline">
        <tr>
          <th scope="col" className="px-4 py-2.5 font-semibold">
            {t('admin.auditModal.col.time')}
          </th>
          <th scope="col" className="px-4 py-2.5 font-semibold">
            {t('admin.auditModal.col.severity')}
          </th>
          <th scope="col" className="px-4 py-2.5 font-semibold">
            {t('admin.auditModal.col.actor')}
          </th>
          {showTenant ? (
            <th scope="col" className="px-4 py-2.5 font-semibold">
              {t('admin.auditModal.col.tenant')}
            </th>
          ) : null}
          <th scope="col" className="px-4 py-2.5 font-semibold">
            {t('admin.auditModal.col.target')}
          </th>
          <th scope="col" className="px-4 py-2.5 font-semibold">
            {t('admin.auditModal.col.metadata')}
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-cos-op-outline-variant/20 font-mono text-[11.5px]">
        {rows.length === 0 ? (
          <tr>
            <td colSpan={columns} className="px-4 py-10 text-center text-cos-op-outline">
              {t('admin.auditModal.empty')}
            </td>
          </tr>
        ) : (
          rows.map((row) => {
            const tone = auditTone(row.action);
            return (
              <tr
                key={row.log_id}
                className={`transition-colors hover:bg-cos-op-container/60 ${tone === 'gate' ? 'bg-cos-op-gate/5' : ''}`}
              >
                <td className="whitespace-nowrap px-4 py-3 text-cos-op-outline">
                  {formatDateTime(locale, row.occurred_at)}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span
                    className={`flex w-fit items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-bold uppercase ${AUDIT_TONE[tone]}`}
                  >
                    {tone === 'gate' ? (
                      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
                    ) : null}
                    {row.action}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <div className="font-semibold text-white">{row.actor_email ?? row.actor_id}</div>
                  <div className="text-[10px] text-cos-op-outline">
                    {row.actor_name ?? NO_DATA} • IP: {row.ip_address ?? NO_DATA}
                  </div>
                </td>
                {showTenant ? (
                  <td className="px-4 py-3">
                    <div className="text-cos-op-on-surface">{row.tenant_code}</div>
                    <div className="text-[10px] text-cos-op-outline">{row.tenant_name}</div>
                  </td>
                ) : null}
                <td className="px-4 py-3">
                  <div className="font-semibold text-cos-op-on-surface">{row.resource_type}</div>
                  <div className="break-all text-[10px] text-cos-cyan">
                    {row.resource_id ?? NO_DATA}
                  </div>
                </td>
                <td className="px-4 py-3 text-cos-op-outline">
                  {row.justification ? (
                    <span className="whitespace-pre-wrap break-words font-sans italic text-cos-op-on-surface">
                      &ldquo;{row.justification}&rdquo;
                    </span>
                  ) : (
                    NO_DATA
                  )}
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}
