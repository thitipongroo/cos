'use client';

/**
 * SYSTEM_ADMIN — Deactivate Tenant (§20.4.5) as the Stitch "Deactivate Tenant - Modal Overlay - SYSTEM_ADMIN" dialog
 * (screen 9b65963845ca…, HTML fetched 2026-09-15; revision R17). Opened by the row's Deactivate action;
 * `PATCH /admin/tenants/{id}/deactivate` with `{ justification }`. Closes §20.4.5's OPEN note: the operator now types
 * the tenant code to confirm.
 *
 * ── PRODUCT-OWNER DECISION D1 (2026-09-15): the drawing's copy, every word ─────────────────────────
 * Some of it claims what the system does not do. Named here so it can be cleared later:
 *   "revokes all 120+ active user sessions", "14 online (will be terminated immediately)" — no session count is read;
 *     deactivation stops new logins and API access (§20.4.5), it does not count or end sessions.
 *   "freezes background delta-sync workers, suspends API access tokens" — not separate operations in this system.
 *   "puts associated dedicated compute node … into quarantined standby" — nothing is done to a dedicated DB. The host
 *     shown is the tenant's own; a tenant with none shows the drawing's node, `MODALS.deactivateNode` (product owner
 *     2026-09-16).
 *   "0 pending (clean shutdown guaranteed)", "Immutable snapshot saved under PDPA/GDPR protocol" — no job count, no
 *     snapshot is taken; §20.4.5 says "Tenant data is preserved".
 *   "cannot be automatically rolled back without Platform Operator dual-key authorization" — no dual-key exists;
 *     §20.4.5: "can be reversed by re-activating via the API".
 *   "Cluster Zone: ap-southeast-1a | Safety Interlock: Engaged" — fixed strings.
 *
 * ── DIFFERENCES FROM THE DRAWING, AND WHY ────────────────────────────────────────────────────────
 *   JUSTIFICATION (§6.7, required) under the type-the-code field. The identifier after the name is the Keycloak realm.
 *   R19 re-sync: the title reads "DEACTIVATE TENANT", the CRITICAL STATE TRANSITION tag is gone, and the buttons
 *     read "CANCEL" and "CONFIRM", as drawn. Every claim above is COMING SOON — its i18n keys are indexed in
 *     lib/adminDrawnFigures.ts `DRAWN_COPY_KEYS`.
 */

import { adminJustificationSchema } from '@cos/schemas';
import { useState } from 'react';
import {
  Button,
  Dialog,
  Heading,
  Input,
  Label,
  Modal,
  ModalOverlay,
  TextField,
} from 'react-aria-components';
import { useT } from '../../i18n';
import { MODALS } from '../../lib/adminDrawnFigures';
import { errorKeyForStatus, type TenantListRow } from '../../lib/adminTenants';
import { ApiError } from '../../lib/api/client';
import { useDeactivateTenant } from '../../lib/api/queries';
import { TextInputField } from '../form/TextInputField';
import { LoadingState } from '../ui/LoadingState';
import { AdminIcon } from './AdminIcon';

export function DeactivateTenantModal({
  tenant,
  onClose,
  onDone,
}: {
  tenant: TenantListRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const deactivate = useDeactivateTenant();
  const [typed, setTyped] = useState('');
  const [justification, setJustification] = useState('');
  const [touched, setTouched] = useState(false);

  const codeMatches = typed === tenant.tenant_code;
  const reason = adminJustificationSchema.safeParse({ justification });
  const busy = deactivate.isPending;
  const canConfirm = codeMatches && reason.success && !busy;

  const submit = () => {
    setTouched(true);
    if (!canConfirm || !reason.success) return;
    deactivate.mutate(
      { id: tenant.tenant_id, justification: reason.data.justification },
      { onSuccess: onDone },
    );
  };

  const apiError = deactivate.isError
    ? t(
        errorKeyForStatus(
          deactivate.error instanceof ApiError ? deactivate.error.status : undefined,
          'rowAction',
        ),
      )
    : undefined;

  return (
    <ModalOverlay
      isOpen
      isDismissable={!busy}
      isKeyboardDismissDisabled={busy}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      data-admin-modal=""
      className="fixed inset-0 z-50 flex items-center justify-center bg-cos-op-container-lowest/80 p-4 backdrop-blur-md"
    >
      <Modal className="flex w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-cos-op-container-highest bg-cos-op-container-low shadow-2xl shadow-[0_0_25px_-5px_rgba(239,68,68,0.25)]">
        <Dialog className="flex flex-col outline-none">
          <header className="flex items-start justify-between border-b border-cos-op-container-highest bg-cos-op-dialog-edge px-6 py-5">
            <div className="flex items-start gap-3.5">
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-cos-v3-red-500/30 bg-cos-v3-red-500/10 text-cos-v3-red-400">
                <svg
                  aria-hidden="true"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
              </span>
              <div>
                <div className="flex items-center gap-2.5">
                  <Heading slot="title" className="text-[18px] font-bold tracking-tight text-white">
                    {t('admin.deactivateModal.title')}
                  </Heading>
                </div>
                <p className="mt-1 text-[12px] text-cos-v3-slate-400">
                  {t('admin.markModal.target')}{' '}
                  <span className="font-mono font-semibold text-cos-v3-cyan-300">
                    {tenant.tenant_code}
                  </span>{' '}
                  <span aria-hidden="true" className="text-cos-v3-slate-500">
                    •
                  </span>{' '}
                  {tenant.tenant_name}{' '}
                  <span className="font-mono text-cos-v3-slate-500">({tenant.keycloak_realm})</span>
                </p>
              </div>
            </div>
            <Button
              aria-label={t('admin.create.close')}
              onPress={onClose}
              isDisabled={busy}
              className="rounded p-1 text-cos-v3-slate-400 outline-none transition-colors hover:bg-cos-op-deact-close-hover hover:text-white data-[focus-visible]:ring-2 data-[focus-visible]:ring-cos-v3-slate-500"
            >
              <svg
                aria-hidden="true"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  d="M6 18L18 6M6 6l12 12"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </svg>
            </Button>
          </header>

          <div className="space-y-5 p-6">
            <div className="rounded-r-md border-y border-l-4 border-r border-cos-v3-red-900/30 border-l-cos-v3-red-500 bg-cos-v3-red-950/20 p-4">
              <div className="flex items-start gap-3">
                <AdminIcon
                  name="warning"
                  size={20}
                  className="mt-0.5 shrink-0 text-cos-v3-red-400"
                />
                <div className="text-[12px] leading-relaxed text-cos-v3-slate-300">
                  <span className="font-bold text-cos-v3-red-200">
                    {t('admin.deactivateModal.lead')}
                  </span>{' '}
                  {t('admin.deactivateModal.impactA')}{' '}
                  <strong className="text-white">
                    {t('admin.deactivateModal.impactSessions')}
                  </strong>
                  {t('admin.deactivateModal.impactB')}{' '}
                  <code className="rounded bg-cos-v3-red-950/80 px-1 py-0.5 font-mono text-[11px] text-cos-v3-amber-200">
                    {/* COMING SOON — MODALS.deactivateNode when the tenant has no host of its own */}
                    {tenant.dedicated_db_host ?? MODALS.deactivateNode}
                  </code>{' '}
                  {t('admin.deactivateModal.impactC')}
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-1 gap-2 border-t border-cos-v3-red-900/30 pt-3 text-[12px]">
                {(
                  [
                    ['sessions', 'bg-cos-v3-amber-400', 'font-semibold text-cos-v3-amber-300'],
                    ['sync', 'bg-cos-v3-emerald-400', 'font-semibold text-cos-v3-emerald-400'],
                    ['preservation', 'bg-cos-v3-blue-400', 'text-cos-v3-slate-300'],
                  ] as const
                ).map(([key, dot, value]) => (
                  <div key={key} className="flex items-center justify-between py-0.5">
                    <dt className="flex items-center gap-1.5 text-cos-v3-slate-400">
                      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                      {t(`admin.deactivateModal.check.${key}.label`)}
                    </dt>
                    <dd className={`font-mono ${value}`}>
                      {t(`admin.deactivateModal.check.${key}.value`)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <TextField value={typed} onChange={setTyped} isDisabled={busy} className="space-y-2">
              <Label className="block text-[12px] font-semibold uppercase tracking-wider text-cos-v3-slate-300">
                {t('admin.markModal.typePrefix')}{' '}
                <span className="select-all rounded border border-cos-v3-amber-800/40 bg-cos-v3-amber-950/40 px-1.5 py-0.5 font-mono lowercase text-cos-v3-amber-400">
                  {tenant.tenant_code}
                </span>{' '}
                {t('admin.deactivateModal.typeSuffix')}
              </Label>
              <div className="relative flex items-center">
                <Input
                  spellCheck={false}
                  autoComplete="off"
                  className={`w-full rounded-md bg-cos-op-surface px-4 py-2.5 font-mono text-[14px] font-medium tracking-wide shadow-inner focus:outline-none focus:ring-2 ${
                    codeMatches
                      ? 'border-2 border-cos-v3-emerald-500/80 text-cos-v3-emerald-400 focus:border-cos-v3-emerald-500 focus:ring-cos-v3-emerald-500/30'
                      : 'border-2 border-cos-op-container-highest text-cos-v3-slate-200 focus:ring-cos-v3-slate-500/30'
                  }`}
                />
                {codeMatches ? (
                  <span
                    aria-hidden="true"
                    className="absolute right-2.5 flex items-center gap-1.5 rounded border border-cos-v3-emerald-500/40 bg-cos-v3-emerald-950/90 px-2.5 py-1 font-mono text-[11px] font-medium text-cos-v3-emerald-300 shadow-sm"
                  >
                    <AdminIcon name="check" size={14} className="text-cos-v3-emerald-400" />
                    {t('admin.deactivateModal.matches')}
                  </span>
                ) : null}
              </div>
              <p className="text-[11px] italic text-cos-v3-slate-400">
                {t('admin.deactivateModal.footnote')}
              </p>
            </TextField>

            <TextInputField
              tone="dark"
              multiline
              rows={2}
              label={t('admin.justification.label')}
              description={t('admin.justification.help')}
              value={justification}
              onChange={setJustification}
              onBlur={() => setTouched(true)}
              isRequired
              isDisabled={busy}
              errorMessage={
                touched && !reason.success ? t('admin.justification.tooShort') : undefined
              }
            />

            {apiError ? (
              <p role="alert" className="text-[11px] text-cos-op-error">
                {apiError}
              </p>
            ) : null}
          </div>

          <footer className="flex items-center justify-between border-t border-cos-op-container-highest bg-cos-op-dialog-edge px-6 py-4">
            <div className="flex items-center gap-2 font-mono text-[11px] text-cos-v3-slate-400">
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full bg-cos-v3-emerald-500 motion-safe:animate-pulse"
              />
              <span>
                {t('admin.markModal.zone')}{' '}
                <strong className="text-cos-v3-slate-200">ap-southeast-1a</strong> |{' '}
                {t('admin.deactivateModal.interlock')}{' '}
                <strong className="text-cos-v3-amber-400">
                  {t('admin.deactivateModal.engaged')}
                </strong>
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Button
                onPress={onClose}
                isDisabled={busy}
                className="rounded-md border border-cos-op-container-highest bg-cos-op-deact-cancel px-4 py-2 text-[12px] font-semibold text-cos-v3-slate-300 outline-none transition-colors hover:bg-cos-op-deact-cancel-hover data-[focus-visible]:ring-2 data-[focus-visible]:ring-cos-v3-slate-500 disabled:opacity-50"
              >
                {t('admin.deactivateModal.cancel')}
              </Button>
              <Button
                onPress={submit}
                isDisabled={!canConfirm}
                className="flex items-center gap-2 rounded-md border border-cos-v3-red-500 bg-cos-v3-red-600 px-5 py-2 text-[12px] font-semibold text-white shadow-lg shadow-cos-v3-red-950/50 outline-none transition-all hover:bg-cos-v3-red-700 data-[focus-visible]:ring-2 data-[focus-visible]:ring-cos-v3-red-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? <LoadingState variant="micro" /> : <AdminIcon name="block" size={16} />}
                {t('admin.deactivateModal.confirm')}
              </Button>
            </div>
          </footer>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
