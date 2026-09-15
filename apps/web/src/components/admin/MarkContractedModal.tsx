'use client';

/**
 * SYSTEM_ADMIN — Mark as Enterprise Contracted (§20.4.4) as the Stitch "Mark Tenant as Enterprise Contracted - Modal
 * Overlay - SYSTEM_ADMIN" dialog (screen 54bbd25e7f6a…, HTML fetched 2026-09-15; revision R17). Opened by the row's
 * Mark as Contracted action; `PATCH /admin/tenants/{id}/mark-contracted` with `{ contractReference?, justification }`.
 *
 * ── PRODUCT-OWNER DECISIONS (2026-09-15) ────────────────────────────────────────────────────────
 *   D2 — the PREREQUISITE CHECKLIST is §20.4.4's, checked from the tenant row: plan ENTERPRISE, tenant active, no
 *     dedicated DB. The drawing's three cards ("Enterprise Contract Executed", "Dedicated DB Fleet Allocated",
 *     "Billing SLA & Rate Card Confirmed") are replaced by those three, in the drawing's card style. An unmet one
 *     shows §20.4.4's message and keeps Confirm disabled.
 *   D1 — every other word is the drawing's, and some of it claims what the system does not do. Named here so it can
 *     be cleared later:
 *       "STAGE: VALIDATION", "HIGH PRIVILEGE", "SUPER_OPERATOR" — labels, no role or stage by those names exists.
 *       "Target Dedicated Instance db-ent-043.cos.internal" and the target tier's host — no instance exists before the
 *         run creates one; the string is the drawing's.
 *       "All 3 prerequisite gates satisfied. Approving this transition initiates automatic tenant schema separation
 *         and strict isolation pipeline under GDPR/PDPA compliance." — the run creates an RDS instance (§34.4).
 *       "Submitting triggers Vault token creation, automatic background data schema migration, and emission of
 *         event tenant.contract.enterprise.v1." — the run uses AWS Secrets Manager, pauses before data migration
 *         (§34.5), and the event is `platform.enterprise.contract_signed.v1` (§34.9), not that name.
 *       "Cluster Zone: ap-southeast-1a" and "Provisioning Mesh: Ready (Latency: 4.2ms)" — fixed strings.
 *
 * ── DIFFERENCES FROM THE DRAWING, AND WHY ────────────────────────────────────────────────────────
 *   CONTRACT REFERENCE (optional) and JUSTIFICATION (§6.7, required) under the type-the-code field — §20.4.4's body.
 *   The identifier line under the tenant name is the Keycloak realm, as on the Tenant List (the drawing's
 *     "(104-TH-CIV)" is an identifier no tenant has).
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
import { errorKeyForStatus, type TenantListRow } from '../../lib/adminTenants';
import { ApiError } from '../../lib/api/client';
import { useMarkContracted } from '../../lib/api/queries';
import { TextInputField } from '../form/TextInputField';
import { LoadingState } from '../ui/LoadingState';
import { AdminIcon } from './AdminIcon';

const DRAWN_INSTANCE = 'db-ent-043.cos.internal';

interface Prerequisite {
  key: 'plan' | 'active' | 'noDb';
  met: boolean;
}

export function MarkContractedModal({
  tenant,
  onClose,
  onDone,
}: {
  tenant: TenantListRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const mark = useMarkContracted();
  const [typed, setTyped] = useState('');
  const [reference, setReference] = useState('');
  const [justification, setJustification] = useState('');
  const [touched, setTouched] = useState(false);

  const prerequisites: Prerequisite[] = [
    { key: 'plan', met: tenant.plan_type === 'ENTERPRISE' },
    { key: 'active', met: tenant.is_active },
    { key: 'noDb', met: tenant.dedicated_db_host === null },
  ];
  const satisfied = prerequisites.filter((p) => p.met).length;
  const allMet = satisfied === prerequisites.length;
  const codeMatches = typed === tenant.tenant_code;
  const reason = adminJustificationSchema.safeParse({ justification });
  const busy = mark.isPending;
  const canConfirm = allMet && codeMatches && reason.success && !busy;

  const submit = () => {
    setTouched(true);
    if (!canConfirm || !reason.success) return;
    mark.mutate(
      {
        id: tenant.tenant_id,
        contractReference: reference.trim() || undefined,
        justification: reason.data.justification,
      },
      { onSuccess: onDone },
    );
  };

  const apiError = mark.isError
    ? t(
        errorKeyForStatus(
          mark.error instanceof ApiError ? mark.error.status : undefined,
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
      <Modal className="flex w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-cos-op-container-highest bg-cos-op-container-low shadow-2xl shadow-black/80">
        <Dialog className="flex flex-col outline-none">
          {/* Header */}
          <header className="flex shrink-0 items-center justify-between border-b border-cos-op-container-highest bg-cos-op-surface px-6 py-4">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-md border border-cos-op-primary-container/40 bg-cos-op-primary-container/15 text-cos-op-secondary">
                <AdminIcon name="verified_user" size={22} />
              </span>
              <div>
                <div className="flex items-center gap-2.5">
                  <Heading slot="title" className="text-[16px] font-bold tracking-tight text-white">
                    {t('admin.markModal.title')}
                  </Heading>
                  <Tag tone="gate">{t('admin.markModal.stage')}</Tag>
                  <Tag tone="danger">{t('admin.markModal.privilege')}</Tag>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[12px] text-cos-v3-slate-400">
                  <span>
                    {t('admin.markModal.target')}{' '}
                    <strong className="font-mono text-cos-op-secondary">
                      {tenant.tenant_code}
                    </strong>
                  </span>
                  <span aria-hidden="true">•</span>
                  <span>{tenant.tenant_name}</span>
                  <span className="font-mono text-cos-v3-slate-500">({tenant.keycloak_realm})</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <div className="font-mono text-[10px] uppercase text-cos-v3-slate-500">
                  {t('admin.markModal.targetInstance')}
                </div>
                <div className="font-mono text-[12px] text-cos-op-secondary">{DRAWN_INSTANCE}</div>
              </div>
              <Button
                aria-label={t('admin.create.close')}
                onPress={onClose}
                isDisabled={busy}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-cos-op-container-highest bg-cos-op-container text-cos-v3-slate-400 outline-none transition-colors hover:bg-cos-op-container-highest hover:text-white data-[focus-visible]:ring-2 data-[focus-visible]:ring-cos-op-primary-container"
              >
                <AdminIcon name="close" size={18} />
              </Button>
            </div>
          </header>

          {/* Body */}
          <div className="grid max-h-[calc(85vh-140px)] grid-cols-1 gap-5 overflow-y-auto p-6 lg:grid-cols-12">
            {/* Left — prerequisites (D2) */}
            <section
              className="flex flex-col gap-4 lg:col-span-6"
              aria-label={t('admin.markModal.checklist')}
            >
              <div className="flex items-center justify-between border-b border-cos-op-container-highest pb-1">
                <span className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider text-white">
                  <AdminIcon name="fact_check" size={18} className="text-cos-op-success" />
                  {t('admin.markModal.checklist')}
                </span>
                <span
                  className={`rounded border px-2 py-0.5 font-mono text-[11px] font-bold ${
                    allMet
                      ? 'border-cos-op-success/30 bg-cos-op-success/10 text-cos-op-success'
                      : 'border-cos-op-gate/30 bg-cos-op-gate/10 text-cos-op-gate'
                  }`}
                >
                  {satisfied} {t('admin.markModal.of')} {prerequisites.length}{' '}
                  {t('admin.markModal.satisfied')}
                </span>
              </div>

              {prerequisites.map((p) => (
                <div
                  key={p.key}
                  className="rounded-md border border-cos-op-container-highest bg-cos-op-container p-3.5 transition-all hover:border-cos-op-success/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <span
                        aria-hidden="true"
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded ${
                          p.met
                            ? 'bg-cos-op-success text-black'
                            : 'bg-cos-op-error-container text-cos-op-on-error-container'
                        }`}
                      >
                        <AdminIcon name={p.met ? 'check' : 'close'} size={15} />
                      </span>
                      <div>
                        <div className="text-[12px] font-semibold text-white">
                          {t(`admin.markModal.pre.${p.key}.title`)}
                        </div>
                        <div className="mt-0.5 text-[11px] leading-relaxed text-cos-v3-slate-400">
                          {t(
                            p.met
                              ? `admin.markModal.pre.${p.key}.met`
                              : `admin.markModal.pre.${p.key}.unmet`,
                          )}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`flex shrink-0 items-center gap-1 rounded border px-2 py-0.5 font-mono text-[10px] ${
                        p.met
                          ? 'border-cos-op-success/30 bg-cos-op-success/15 text-cos-op-success'
                          : 'border-cos-op-error/30 bg-cos-op-error/15 text-cos-op-error'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`h-1.5 w-1.5 rounded-full ${p.met ? 'bg-cos-op-success' : 'bg-cos-op-error'}`}
                      />
                      {t(p.met ? 'admin.markModal.metTag' : 'admin.markModal.unmetTag')}
                    </span>
                  </div>
                </div>
              ))}

              <p className="mt-1 flex items-start gap-2.5 rounded-md border border-cos-op-container-highest bg-cos-op-container/70 p-3 text-[11px] text-cos-v3-slate-400">
                <AdminIcon
                  name="info"
                  size={18}
                  className="mt-0.5 shrink-0 text-cos-op-secondary"
                />
                <span className="leading-relaxed">{t('admin.markModal.safetyNotice')}</span>
              </p>
            </section>

            {/* Right — state transition confirmation */}
            <section
              className="flex flex-col gap-4 lg:col-span-6"
              aria-label={t('admin.markModal.transition')}
            >
              <div className="flex items-center justify-between border-b border-cos-op-container-highest pb-1">
                <span className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider text-white">
                  <AdminIcon name="lock_reset" size={18} className="text-cos-op-gate" />
                  {t('admin.markModal.transition')}
                </span>
                <span className="rounded border border-cos-op-gate/30 bg-cos-op-gate/10 px-2 py-0.5 font-mono text-[11px] text-cos-op-gate">
                  {t('admin.markModal.operator')}
                </span>
              </div>

              <div className="flex flex-col gap-2.5 rounded-md border border-cos-op-container-highest bg-cos-op-surface p-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-cos-v3-slate-400">
                  {t('admin.markModal.shift')}
                </div>
                <div className="grid grid-cols-2 gap-3 text-[12px]">
                  <div className="rounded border border-cos-op-container-highest bg-cos-op-container p-2.5">
                    <div className="font-mono text-[10px] uppercase text-cos-v3-slate-500">
                      {t('admin.markModal.currentTier')}
                    </div>
                    <div className="mt-0.5 font-semibold text-cos-op-gate">
                      {t('admin.markModal.pooled')}
                    </div>
                    <div className="mt-1 text-[10px] text-cos-v3-slate-400">
                      {t('admin.markModal.pooledNote')}
                    </div>
                  </div>
                  <div className="rounded border border-cos-op-primary-container/50 bg-cos-op-primary-container/10 p-2.5">
                    <div className="font-mono text-[10px] uppercase text-cos-op-secondary">
                      {t('admin.markModal.targetTier')}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 font-semibold text-white">
                      <span>{t('admin.markModal.dedicated')}</span>
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 rounded-full bg-cos-op-success"
                      />
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-cos-op-secondary">
                      {DRAWN_INSTANCE}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 rounded-md border border-cos-op-container-highest bg-cos-op-container p-4">
                <TextField
                  value={typed}
                  onChange={setTyped}
                  isDisabled={busy}
                  className="flex flex-col gap-3"
                >
                  <Label className="block text-[12px] font-semibold text-white">
                    {t('admin.markModal.typePrefix')}{' '}
                    <span className="rounded border border-cos-op-gate/40 bg-black/40 px-1.5 py-0.5 font-mono text-cos-op-gate">
                      {tenant.tenant_code}
                    </span>{' '}
                    {t('admin.markModal.typeSuffix')}
                  </Label>
                  <div className="relative">
                    <Input
                      spellCheck={false}
                      autoComplete="off"
                      className={`w-full rounded-md bg-cos-op-surface px-3.5 py-2.5 font-mono text-[14px] focus:outline-none focus:ring-1 ${
                        codeMatches
                          ? 'border-2 border-cos-op-success text-cos-op-success focus:ring-cos-op-success'
                          : 'border-2 border-cos-op-container-highest text-cos-op-on-surface focus:ring-cos-op-primary-container'
                      }`}
                    />
                    {codeMatches ? (
                      <span
                        aria-hidden="true"
                        className="absolute right-3 top-2.5 text-cos-op-success"
                      >
                        <AdminIcon name="check_circle" size={18} />
                      </span>
                    ) : null}
                  </div>
                </TextField>
                {codeMatches ? (
                  <p className="flex items-center gap-1.5 text-[11px] text-cos-op-success">
                    <AdminIcon name="done_all" size={14} />
                    <span>{t('admin.markModal.matches')}</span>
                  </p>
                ) : null}
                <TextInputField
                  tone="dark"
                  label={t('admin.contractRef')}
                  value={reference}
                  onChange={setReference}
                  isDisabled={busy}
                />
                <TextInputField
                  tone="dark"
                  multiline
                  rows={3}
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
              </div>

              <p className="flex items-start gap-2 rounded-md border border-cos-op-container-highest bg-cos-op-surface p-3 text-[11px] text-cos-v3-slate-400">
                <AdminIcon name="terminal" size={16} className="mt-0.5 shrink-0 text-cos-op-gate" />
                <span className="leading-relaxed">
                  {t('admin.markModal.lifecycle')}{' '}
                  <code className="font-mono text-cos-op-secondary">
                    tenant.contract.enterprise.v1
                  </code>
                  .
                </span>
              </p>

              {apiError ? (
                <p role="alert" className="text-[11px] text-cos-op-error">
                  {apiError}
                </p>
              ) : null}
            </section>
          </div>

          {/* Footer */}
          <footer className="flex shrink-0 flex-col items-center justify-between gap-3 border-t border-cos-op-container-highest bg-cos-op-surface px-6 py-3.5 sm:flex-row">
            <div className="flex items-center gap-4 text-[12px] text-cos-v3-slate-400">
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-cos-op-success" />
                <span>
                  {t('admin.markModal.zone')}{' '}
                  <strong className="font-mono text-white">ap-southeast-1a</strong>
                </span>
              </span>
              <span aria-hidden="true" className="text-cos-v3-slate-500">
                |
              </span>
              <span>
                {t('admin.markModal.mesh')}{' '}
                <span className="font-mono text-cos-op-success">
                  {t('admin.markModal.meshValue')}
                </span>
              </span>
            </div>
            <div className="flex w-full items-center justify-end gap-3 sm:w-auto">
              <Button
                onPress={onClose}
                isDisabled={busy}
                className="rounded-md border border-cos-op-container-highest bg-cos-op-container px-4 py-2 text-[12px] font-semibold text-cos-op-on-surface outline-none transition-colors hover:bg-cos-op-container-highest data-[focus-visible]:ring-2 data-[focus-visible]:ring-cos-op-container-highest disabled:opacity-50"
              >
                {t('admin.create.cancel')}
              </Button>
              <Button
                onPress={submit}
                isDisabled={!canConfirm}
                className="flex items-center gap-2 rounded-md bg-cos-op-primary-container px-5 py-2 text-[12px] font-bold text-white shadow-lg shadow-cos-op-primary-container/25 outline-none transition-all hover:bg-cos-op-mark-confirm-hover data-[focus-visible]:ring-2 data-[focus-visible]:ring-cos-op-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? <LoadingState variant="micro" /> : <AdminIcon name="verified" size={16} />}
                <span>{t('admin.markModal.confirm')}</span>
              </Button>
            </div>
          </footer>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

function Tag({ tone, children }: { tone: 'gate' | 'danger'; children: React.ReactNode }) {
  const cls: Record<typeof tone, string> = {
    gate: 'border-cos-op-gate/30 bg-cos-op-gate/15 text-cos-op-gate',
    danger: 'border-cos-op-high-privilege/30 bg-cos-op-high-privilege/15 text-cos-op-error',
  };
  return (
    <span className={`rounded border px-2 py-0.5 font-mono text-[10px] font-semibold ${cls[tone]}`}>
      {children}
    </span>
  );
}
