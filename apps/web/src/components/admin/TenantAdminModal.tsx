'use client';

/**
 * SYSTEM_ADMIN — a tenant's first TENANT_ADMIN (ADR-110). Opened from the Tenant List row or Tenant Detail, only where
 * `tenantAdminAction` offers it:
 *
 * - `create` — the tenant has no administrator: name + email + justification →
 *   `POST /admin/tenants/{id}/tenant-admin`.
 * - `resend` — its only administrator has never signed in (the server also requires the invitation unused): justification →
 *   `POST /admin/tenants/{id}/tenant-admin/invite`.
 * - `cancel` — offered with `resend`, for an invitation sent to a wrong address: justification →
 *   `POST /admin/tenants/{id}/tenant-admin/cancel`. The account is deactivated and the tenant can be bootstrapped again.
 *
 * Either way Keycloak emails a single-use link, valid 72 hours, where the customer sets their own password; MFA is
 * enrolled at first sign-in. COS never sees the password, and the dialog says so rather than offering one.
 *
 * NOT DRAWN. There is no Stitch screen; it reuses the Convert dialog's frame. Field rules are
 * `tenantAdminBootstrapSchema` / `adminJustificationSchema` (@cos/schemas), the same as the server DTOs.
 */

import { adminJustificationSchema, tenantAdminBootstrapSchema } from '@cos/schemas';
import { useState } from 'react';
import { Button, Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { useI18n } from '../../i18n';
import {
  ADMIN_INVITE_HOURS,
  tenantAdminErrorKey,
  type TenantAdminMode,
} from '../../lib/adminTenantAdmin';
import type { TenantListRow } from '../../lib/adminTenants';
import { ApiError } from '../../lib/api/client';
import {
  useBootstrapTenantAdmin,
  useCancelTenantAdminInvite,
  useResendTenantAdminInvite,
} from '../../lib/api/queries';
import type { TenantAdminCancelResult, TenantAdminInviteResult } from '../../lib/api/types';
import { formatDate } from '../../lib/format';
import { TextInputField } from '../form/TextInputField';
import { LoadingState } from '../ui/LoadingState';
import { AdminIcon } from './AdminIcon';

type Field = 'email' | 'display_name' | 'justification';

/** i18n keys per mode — never copy (QM-3). */
const COPY: Record<TenantAdminMode, { title: string; lead: string; submit: string }> = {
  create: {
    title: 'admin.tenantAdmin.createTitle',
    lead: 'admin.tenantAdmin.createLead',
    submit: 'admin.tenantAdmin.createSubmit',
  },
  resend: {
    title: 'admin.tenantAdmin.resendTitle',
    lead: 'admin.tenantAdmin.resendLead',
    submit: 'admin.tenantAdmin.resendSubmit',
  },
  cancel: {
    title: 'admin.tenantAdmin.cancelTitle',
    lead: 'admin.tenantAdmin.cancelLead',
    submit: 'admin.tenantAdmin.cancelSubmit',
  },
};

export function TenantAdminModal({
  tenant,
  mode,
  onClose,
}: {
  tenant: TenantListRow;
  mode: TenantAdminMode;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const bootstrap = useBootstrapTenantAdmin();
  const resend = useResendTenantAdminInvite();
  const cancel = useCancelTenantAdminInvite();
  const mutation = mode === 'create' ? bootstrap : mode === 'resend' ? resend : cancel;
  const copy = COPY[mode];
  const [values, setValues] = useState<Record<Field, string>>({
    email: '',
    display_name: '',
    justification: '',
  });
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<TenantAdminInviteResult | null>(null);
  const [cancelled, setCancelled] = useState<TenantAdminCancelResult | null>(null);

  const parsed =
    mode === 'create'
      ? tenantAdminBootstrapSchema.safeParse(values)
      : adminJustificationSchema.safeParse({ justification: values.justification });
  const issues = new Map<string, string>(
    parsed.success ? [] : parsed.error.issues.map((i) => [String(i.path[0]), i.message]),
  );
  const errorFor = (field: Field) => {
    const key = issues.get(field);
    return key && (submitted || touched[field]) ? t(key) : undefined;
  };
  const busy = mutation.isPending;

  const set = (field: Field) => (v: string) => setValues((prev) => ({ ...prev, [field]: v }));
  const blur = (field: Field) => () => setTouched((prev) => ({ ...prev, [field]: true }));

  const submit = () => {
    setSubmitted(true);
    if (!parsed.success || busy) return;
    const done = { onSuccess: (r: TenantAdminInviteResult) => setResult(r) };
    const justification = values.justification.trim();
    if (mode === 'create') {
      const d = tenantAdminBootstrapSchema.parse(values);
      bootstrap.mutate({ id: tenant.tenant_id, ...d }, done);
    } else if (mode === 'resend') {
      resend.mutate({ id: tenant.tenant_id, justification }, done);
    } else {
      cancel.mutate({ id: tenant.tenant_id, justification }, { onSuccess: setCancelled });
    }
  };

  const apiError = mutation.isError
    ? t(tenantAdminErrorKey(mutation.error instanceof ApiError ? mutation.error : null))
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
      <Modal className="my-auto flex w-full max-w-xl flex-col overflow-hidden rounded-lg border border-cos-op-container-highest bg-cos-op-container-low shadow-2xl">
        <Dialog className="flex flex-col outline-none">
          <header className="flex items-start justify-between border-b border-cos-op-container-highest bg-cos-op-dialog-edge px-6 py-5">
            <div className="flex items-start gap-3.5">
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-cos-v3-cyan-500/30 bg-cos-v3-cyan-500/10 text-cos-v3-cyan-400">
                <AdminIcon name="admin_panel_settings" size={20} />
              </span>
              <div>
                <Heading slot="title" className="text-[18px] font-bold tracking-tight text-white">
                  {t(copy.title)}
                </Heading>
                <p className="mt-1 text-[12px] text-cos-v3-slate-400">
                  <span className="font-mono font-semibold text-cos-v3-cyan-300">
                    {tenant.tenant_code}
                  </span>{' '}
                  <span aria-hidden="true" className="text-cos-v3-slate-500">
                    •
                  </span>{' '}
                  {tenant.tenant_name}
                </p>
              </div>
            </div>
            <Button
              aria-label={t('admin.create.close')}
              onPress={onClose}
              isDisabled={busy}
              className="rounded p-1 text-cos-v3-slate-400 outline-none transition-colors hover:text-white data-[focus-visible]:ring-2 data-[focus-visible]:ring-cos-v3-slate-500"
            >
              <AdminIcon name="close" size={20} />
            </Button>
          </header>

          {cancelled ? (
            <div className="space-y-3 p-6 text-[12px] leading-relaxed text-cos-v3-slate-300">
              <p role="status" className="flex items-start gap-2 text-cos-v3-emerald-400">
                <AdminIcon name="check_circle" size={16} className="mt-0.5 shrink-0" />
                <span>
                  {t('admin.tenantAdmin.cancelledFor')}{' '}
                  <span className="font-mono text-white">{cancelled.email}</span>
                </span>
              </p>
              {cancelled.keycloak === 'deleted' ? null : (
                <p role="alert" className="flex items-start gap-2 text-cos-op-warning">
                  <AdminIcon name="warning" size={16} className="mt-0.5 shrink-0" />
                  <span>
                    {t(
                      cancelled.keycloak === 'disabled'
                        ? 'admin.tenantAdmin.keycloakDisabled'
                        : 'admin.tenantAdmin.keycloakNotRemoved',
                    )}
                  </span>
                </p>
              )}
              <p>{t('admin.tenantAdmin.cancelNext')}</p>
            </div>
          ) : result ? (
            <div className="space-y-3 p-6 text-[12px] leading-relaxed text-cos-v3-slate-300">
              {result.invite_sent ? (
                <p role="status" className="flex items-start gap-2 text-cos-v3-emerald-400">
                  <AdminIcon name="check_circle" size={16} className="mt-0.5 shrink-0" />
                  <span>
                    {t('admin.tenantAdmin.sentTo')}{' '}
                    <span className="font-mono text-white">{result.email}</span>
                    {result.invite_expires_at
                      ? ` · ${t('admin.tenantAdmin.expires')} ${formatDate(locale, result.invite_expires_at)}`
                      : null}
                  </span>
                </p>
              ) : (
                <p role="alert" className="flex items-start gap-2 text-cos-op-warning">
                  <AdminIcon name="warning" size={16} className="mt-0.5 shrink-0" />
                  <span>{t('admin.tenantAdmin.notSent')}</span>
                </p>
              )}
              <p>{t('admin.tenantAdmin.nextSteps')}</p>
            </div>
          ) : (
            <div className="space-y-5 p-6">
              <p className="text-[12px] leading-relaxed text-cos-v3-slate-300">{t(copy.lead)}</p>

              {mode === 'create' ? (
                <>
                  <TextInputField
                    tone="dark"
                    label={t('admin.tenantAdmin.nameLabel')}
                    value={values.display_name}
                    onChange={set('display_name')}
                    onBlur={blur('display_name')}
                    isRequired
                    isDisabled={busy}
                    errorMessage={errorFor('display_name')}
                  />
                  <TextInputField
                    tone="dark"
                    mono
                    type="email"
                    label={t('admin.tenantAdmin.emailLabel')}
                    description={t('admin.tenantAdmin.emailHelp')}
                    value={values.email}
                    onChange={set('email')}
                    onBlur={blur('email')}
                    isRequired
                    isDisabled={busy}
                    errorMessage={errorFor('email')}
                  />
                </>
              ) : null}

              <TextInputField
                tone="dark"
                multiline
                rows={2}
                label={t('admin.justification.label')}
                description={t('admin.create.justificationRule')}
                value={values.justification}
                onChange={set('justification')}
                onBlur={blur('justification')}
                isRequired
                isDisabled={busy}
                errorMessage={errorFor('justification')}
              />

              {mode === 'cancel' ? null : (
                <p className="flex items-start gap-2 rounded-md border border-cos-op-container-highest bg-cos-op-modal-notice p-3 text-[11px] leading-relaxed text-cos-op-pending">
                  <AdminIcon name="info" size={16} className="mt-0.5 shrink-0 text-cos-op-cyan" />
                  <span>
                    {t('admin.tenantAdmin.terms').replace('{hours}', String(ADMIN_INVITE_HOURS))}
                  </span>
                </p>
              )}

              {apiError ? (
                <p role="alert" className="text-[11px] text-cos-op-error">
                  {apiError}
                </p>
              ) : null}
            </div>
          )}

          <footer className="flex items-center justify-end gap-3 border-t border-cos-op-container-highest bg-cos-op-dialog-edge px-6 py-4">
            {result || cancelled ? (
              <Button
                onPress={onClose}
                className="rounded-md bg-cos-op-primary-container px-5 py-2 text-[12px] font-bold text-white outline-none transition-all hover:brightness-110 data-[focus-visible]:ring-2 data-[focus-visible]:ring-cos-op-primary-container"
              >
                {t('admin.tenantAdmin.done')}
              </Button>
            ) : (
              <>
                <Button
                  onPress={onClose}
                  isDisabled={busy}
                  className="rounded-md border border-cos-op-container-highest px-4 py-2 text-[12px] font-semibold text-cos-v3-slate-300 outline-none transition-colors hover:text-white data-[focus-visible]:ring-2 data-[focus-visible]:ring-cos-v3-slate-500 disabled:opacity-50"
                >
                  {t('admin.create.cancel')}
                </Button>
                <Button
                  onPress={submit}
                  isDisabled={busy}
                  className="flex items-center gap-2 rounded-md bg-cos-op-primary-container px-5 py-2 text-[12px] font-bold text-white outline-none transition-all hover:brightness-110 data-[focus-visible]:ring-2 data-[focus-visible]:ring-cos-op-primary-container disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? (
                    <LoadingState variant="micro" />
                  ) : (
                    <AdminIcon name="admin_panel_settings" size={16} />
                  )}
                  {t(copy.submit)}
                </Button>
              </>
            )}
          </footer>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
