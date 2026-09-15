'use client';

/**
 * SYSTEM_ADMIN — Assign Dedicated DB (§20.4.3) as the Stitch "Assign Dedicated Database — Modal Overlay — SYSTEM_ADMIN"
 * dialog (screen 1cdce051da40…, HTML fetched 2026-09-15; revision R17). Opened by the row's Assign DB action;
 * `PATCH /admin/tenants/{id}/dedicated-db` with `{ dedicatedDbUrl, justification }`.
 *
 * ── PRODUCT-OWNER DECISIONS (2026-09-15) ────────────────────────────────────────────────────────
 *   D2 — the drawing's "Infrastructure Migration Gates" cards carry §20.4.3's prerequisites instead ("Dedicated
 *     PostgreSQL instance provisioned and reachable", "`prisma migrate deploy` run against the dedicated DB",
 *     "Existing data migrated"). Nothing here can check them, so each card is a box the operator ticks, and the URL
 *     field stays disabled until all three are ticked — §20.4.3 "checklist before form is enabled". The gate status
 *     reads "All Clear" only then.
 *   D1 — every other word is the drawing's, and some of it claims what the system does not do:
 *       "Port 5432 Open" and "✓ Host validated & credentials authenticated" — nothing connects to the host; both show
 *         when the URL's FORMAT is valid, with the port the URL names.
 *       "Cluster Sharding Pool & Node Target" and "Ingress Mesh Proxy Strategy" with their options and notes
 *         ("c6i.4xlarge", "Envoy proxy") — no such pools, nodes or proxy exist; the selects are shown as drawn and
 *         send nothing (the API takes only the URL and the justification).
 *       "Privileged Mutation Notice" — no ingress rules, Vault secrets or EMQX certs are touched; routing changes on
 *         the tenant's next request. §20.4.3's own warning follows it in the same callout.
 *       "Zone: ap-southeast-1a | Routing Mesh: Ready" — fixed strings.
 *
 * ── DIFFERENCES FROM THE DRAWING, AND WHY ────────────────────────────────────────────────────────
 *   JUSTIFICATION (§6.7, required) under the selects. §20.4.3's warning text inside the notice.
 *   The URL is validated as §20.4.3 says (`postgresql://`, ≤ 500) and holds a placeholder, not a masked credential.
 */

import { adminJustificationSchema } from '@cos/schemas';
import { useState } from 'react';
import {
  Button,
  Checkbox,
  Dialog,
  Heading,
  Input,
  Label,
  Modal,
  ModalOverlay,
  TextField,
} from 'react-aria-components';
import { useT } from '../../i18n';
import { dbUrlPort, errorKeyForStatus, type TenantListRow } from '../../lib/adminTenants';
import { ApiError } from '../../lib/api/client';
import { useAssignDedicatedDb } from '../../lib/api/queries';
import { TextInputField } from '../form/TextInputField';
import { LoadingState } from '../ui/LoadingState';
import { AdminIcon } from './AdminIcon';

const GATES = ['reachable', 'migrated', 'dataMoved'] as const;
const MAX_URL = 500;

/** §20.4.3: must start with `postgresql://` and be at most 500 characters, and parse as a URL with a host. */
export function isAssignableDbUrl(url: string): boolean {
  if (!url.startsWith('postgresql://') || url.length > MAX_URL) return false;
  try {
    return new URL(url).hostname.length > 0;
  } catch {
    return false;
  }
}

export function AssignDedicatedDbModal({
  tenant,
  onClose,
  onDone,
}: {
  tenant: TenantListRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const assign = useAssignDedicatedDb();
  const [ticked, setTicked] = useState<Record<(typeof GATES)[number], boolean>>({
    reachable: false,
    migrated: false,
    dataMoved: false,
  });
  const [url, setUrl] = useState('');
  const [justification, setJustification] = useState('');
  const [touched, setTouched] = useState(false);

  const gatesClear = GATES.every((g) => ticked[g]);
  const urlValid = isAssignableDbUrl(url);
  const port = urlValid ? dbUrlPort(url) : null;
  const reason = adminJustificationSchema.safeParse({ justification });
  const busy = assign.isPending;
  const canConfirm = gatesClear && urlValid && reason.success && !busy;

  const submit = () => {
    setTouched(true);
    if (!canConfirm || !reason.success) return;
    assign.mutate(
      { id: tenant.tenant_id, dedicatedDbUrl: url, justification: reason.data.justification },
      { onSuccess: onDone },
    );
  };

  const apiError = assign.isError
    ? t(
        errorKeyForStatus(
          assign.error instanceof ApiError ? assign.error.status : undefined,
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
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-cos-op-container-lowest/80 p-4 backdrop-blur-md"
    >
      <Modal className="my-auto flex w-full max-w-[760px] flex-col overflow-hidden rounded-lg border border-cos-op-assign-edge bg-cos-op-container-low text-cos-v3-slate-100 shadow-2xl shadow-black/80">
        <Dialog className="flex flex-col outline-none">
          <header className="flex items-center justify-between border-b border-cos-op-assign-head-line bg-cos-op-assign-head px-6 py-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="flex h-2.5 w-2.5 rounded-full bg-cos-v3-cyan-400 shadow-sm shadow-cos-v3-cyan-500/50"
                />
                <Heading
                  slot="title"
                  className="text-[16px] font-semibold tracking-wide text-white"
                >
                  {t('admin.assignModal.title')}
                </Heading>
              </div>
              <p className="text-[12px] text-cos-v3-slate-400">
                {t('admin.assignModal.tenant')}{' '}
                <span className="font-medium text-cos-v3-slate-200">{tenant.tenant_name}</span>{' '}
                <span aria-hidden="true" className="text-cos-v3-slate-500">
                  |
                </span>{' '}
                {t('admin.assignModal.code')}{' '}
                <code className="rounded border border-cos-op-assign-code-line bg-cos-op-assign-code px-1 py-0.5 font-mono text-cos-v3-cyan-300">
                  {tenant.tenant_code}
                </code>{' '}
                <span aria-hidden="true" className="text-cos-v3-slate-500">
                  |
                </span>{' '}
                {t('admin.assignModal.tier')}{' '}
                <span className="font-medium text-cos-v3-emerald-400">{tenant.plan_type}</span>
              </p>
            </div>
            <Button
              aria-label={t('admin.create.close')}
              onPress={onClose}
              isDisabled={busy}
              className="rounded p-1 text-cos-v3-slate-400 outline-none transition-colors hover:bg-cos-op-assign-close-hover hover:text-white data-[focus-visible]:ring-1 data-[focus-visible]:ring-cos-v3-blue-500"
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

          <div className="space-y-5 bg-cos-op-container-low p-6 text-[12px]">
            {/* §20.4.3 prerequisites, in the drawing's gate cards (D2) */}
            <section className="space-y-2.5 rounded-md border border-cos-op-assign-gates-line bg-cos-op-modal-footer p-3.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-cos-v3-slate-400">
                  <AdminIcon name="shield" size={14} className="text-cos-v3-cyan-400" />
                  {t('admin.assignModal.gates')}
                </span>
                <span
                  className={`rounded border px-2 py-0.5 font-mono text-[10px] ${
                    gatesClear
                      ? 'border-cos-v3-emerald-800/40 bg-cos-v3-emerald-950/40 text-cos-v3-emerald-400'
                      : 'border-cos-v3-amber-800/40 bg-cos-v3-amber-950/40 text-cos-v3-amber-300'
                  }`}
                >
                  {t('admin.assignModal.gateStatus')}{' '}
                  {gatesClear
                    ? t('admin.assignModal.allClear')
                    : `${GATES.filter((g) => ticked[g]).length} / ${GATES.length}`}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2.5 pt-1 md:grid-cols-3">
                {GATES.map((g) => (
                  <Checkbox
                    key={g}
                    isSelected={ticked[g]}
                    onChange={(v) => setTicked((prev) => ({ ...prev, [g]: v }))}
                    isDisabled={busy}
                    className={({ isFocusVisible }) =>
                      `flex cursor-pointer items-start gap-2 rounded border border-cos-op-assign-gate-line bg-cos-op-assign-gate p-2.5 ${
                        isFocusVisible ? 'ring-2 ring-cos-v3-blue-500' : ''
                      }`
                    }
                  >
                    {({ isSelected }) => (
                      <>
                        <span
                          className={`mt-0.5 shrink-0 ${isSelected ? 'text-cos-v3-emerald-400' : 'text-cos-v3-slate-500'}`}
                        >
                          <AdminIcon name={isSelected ? 'check_circle' : 'schedule'} size={16} />
                        </span>
                        <span className="min-w-0">
                          <span className="block font-medium text-cos-v3-slate-200">
                            {t(`admin.assignModal.gate.${g}.title`)}
                          </span>
                          <span
                            className={`block font-mono text-[11px] ${
                              isSelected ? 'text-cos-v3-emerald-400' : 'text-cos-v3-slate-400'
                            }`}
                          >
                            {t(
                              isSelected
                                ? 'admin.assignModal.confirmed'
                                : 'admin.assignModal.tickToConfirm',
                            )}
                          </span>
                          <span className="mt-0.5 block text-[10px] text-cos-v3-slate-400">
                            {t(`admin.assignModal.gate.${g}.note`)}
                          </span>
                        </span>
                      </>
                    )}
                  </Checkbox>
                ))}
              </div>
            </section>

            {/* URI */}
            <TextField
              value={url}
              onChange={setUrl}
              isDisabled={!gatesClear || busy}
              isRequired
              className="space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2 font-medium text-cos-v3-slate-200">
                  <span>{t('admin.assignModal.uriLabel')}</span>
                  <span
                    aria-hidden="true"
                    className="rounded border border-cos-v3-cyan-700/50 bg-cos-v3-cyan-950/50 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-cos-v3-cyan-400"
                  >
                    {t('admin.create.vpcBadge')}
                  </span>
                </Label>
                <span className="font-mono text-[10px] tracking-wide text-cos-v3-red-400">
                  {t('admin.create.required').toUpperCase()}
                </span>
              </div>
              <div className="relative flex items-center">
                <Input
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="postgresql://"
                  className="w-full rounded border border-cos-op-assign-field-line bg-cos-op-assign-field px-3 py-2 pr-32 font-mono text-[12px] text-cos-v3-cyan-300 placeholder:text-cos-v3-slate-500 focus:border-cos-v3-cyan-400 focus:outline-none focus:ring-1 focus:ring-cos-v3-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                />
                {port ? (
                  <span
                    aria-hidden="true"
                    className="absolute right-2 flex items-center gap-1.5 rounded border border-cos-op-assign-pill-line bg-cos-op-assign-pill px-2 py-1 text-[11px]"
                  >
                    <span className="inline-block h-2 w-2 rounded-full bg-cos-v3-emerald-400 motion-safe:animate-ping" />
                    <span className="font-mono font-medium text-cos-v3-emerald-300">
                      {t('admin.create.portPrefix')} {port} {t('admin.create.portSuffix')}
                    </span>
                  </span>
                ) : null}
              </div>
              <div className="flex items-center justify-between pt-0.5 text-[11px] text-cos-v3-slate-400">
                <span className="font-mono text-cos-v3-slate-500">
                  {t('admin.create.dbUrlRule')}
                </span>
                {urlValid ? (
                  <span className="font-medium text-cos-v3-emerald-400">
                    ✓ {t('admin.assignModal.hostValidated')}
                  </span>
                ) : null}
              </div>
            </TextField>

            {/* The drawing's selects (D1 — shown as drawn, send nothing) */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <DrawnSelect
                label={t('admin.assignModal.poolLabel')}
                options={[1, 2, 3].map((n) => t(`admin.assignModal.poolOption${n}`))}
                note={t('admin.assignModal.poolNote')}
              />
              <DrawnSelect
                label={t('admin.assignModal.proxyLabel')}
                options={[1, 2, 3].map((n) => t(`admin.assignModal.proxyOption${n}`))}
                note={t('admin.assignModal.proxyNote')}
              />
            </div>

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

            <div className="flex items-start gap-3 rounded-md border border-cos-v3-amber-500/40 bg-cos-v3-amber-950/20 p-3.5 text-cos-v3-slate-300">
              <AdminIcon
                name="warning"
                size={16}
                className="mt-0.5 shrink-0 text-cos-v3-amber-400"
              />
              <div className="space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-cos-v3-amber-300">
                  {t('admin.assignModal.noticeTitle')}
                </div>
                <p className="text-[11px] leading-relaxed text-cos-v3-slate-300">
                  {t('admin.assignModal.noticeBefore')}{' '}
                  <span className="font-medium text-cos-v3-emerald-300">
                    {t('admin.assignModal.zeroDowntime')}
                  </span>{' '}
                  {t('admin.assignModal.noticeAfter')}
                </p>
                <p className="text-[11px] leading-relaxed text-cos-v3-slate-300">
                  {t('admin.assignModal.specWarning')}
                </p>
              </div>
            </div>

            {apiError ? (
              <p role="alert" className="text-[11px] text-cos-op-error">
                {apiError}
              </p>
            ) : null}
          </div>

          <footer className="flex flex-col gap-3 border-t border-cos-op-assign-foot-line bg-cos-op-assign-foot px-6 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 font-mono text-[11px] text-cos-v3-slate-400">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-cos-v3-emerald-400" />
              <span>
                {t('admin.rowModal.zone')}{' '}
                <strong className="text-cos-v3-slate-200">ap-southeast-1a</strong>
              </span>
              <span aria-hidden="true" className="text-cos-v3-slate-600">
                |
              </span>
              <span>
                {t('admin.assignModal.routingMesh')}{' '}
                <strong className="text-cos-v3-cyan-300">{t('admin.assignModal.ready')}</strong>
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Button
                onPress={onClose}
                isDisabled={busy}
                className="rounded border border-cos-op-assign-cancel-line bg-cos-op-assign-cancel px-4 py-2 text-[12px] font-medium text-cos-v3-slate-300 outline-none transition-colors hover:bg-cos-op-assign-cancel-hover hover:text-white data-[focus-visible]:ring-1 data-[focus-visible]:ring-cos-v3-slate-400 disabled:opacity-50"
              >
                {t('admin.create.cancel')}
              </Button>
              <Button
                onPress={submit}
                isDisabled={!canConfirm}
                className="flex items-center gap-1.5 rounded border border-cos-v3-blue-400/50 bg-cos-v3-blue-600 px-4 py-2 text-[12px] font-semibold text-white shadow-md shadow-cos-v3-blue-600/30 outline-none transition-all hover:bg-cos-v3-blue-500 data-[focus-visible]:ring-2 data-[focus-visible]:ring-cos-v3-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? (
                  <LoadingState variant="micro" />
                ) : (
                  <svg
                    aria-hidden="true"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M12 4v16m8-8H4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                    />
                  </svg>
                )}
                <span>{t('admin.assignModal.confirm')}</span>
              </Button>
            </div>
          </footer>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

/** A drawn select with no backing field (D1): keyboard-usable, labelled, and sends nothing. */
function DrawnSelect({ label, options, note }: { label: string; options: string[]; note: string }) {
  const id = `drawn-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="font-medium text-cos-v3-slate-200">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          defaultValue={options[0]}
          className="w-full appearance-none rounded border border-cos-op-assign-field-line bg-cos-op-assign-field px-3 py-2 pr-8 font-mono text-[12px] text-cos-v3-slate-100 focus:border-cos-v3-blue-500 focus:outline-none"
        >
          {options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-cos-v3-slate-400"
        >
          <AdminIcon name="expand_more" size={16} />
        </span>
      </div>
      <p className="text-[10px] text-cos-v3-slate-500">{note}</p>
    </div>
  );
}
