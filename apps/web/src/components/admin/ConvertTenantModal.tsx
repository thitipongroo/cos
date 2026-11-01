'use client';

/**
 * SYSTEM_ADMIN — Convert a free trial to a paid plan (§7.10, ADR-109). Opened by the row's Convert action or the
 * Tenant Detail ops list, for a tenant that is TRIAL, EXPIRED or PENDING_DELETION. `PATCH /admin/tenants/{id}/convert`
 * with `{ planType, justification }`.
 *
 * NOT DRAWN. There is no Stitch screen for this dialog; it reuses the Deactivate dialog's frame and tokens so it reads
 * as one of the same family, and carries no copy that claims anything the API does not do: it sets the plan, makes
 * the tenant ACTIVE again (writes come back at once) and is audited. ENTERPRISE is not offered — that plan is
 * contracted and provisioned (§34), not converted.
 *
 * A plan below the tenant's active projects is refused by the server (409 COS-PLAN-002); the message names the
 * limit and the count from the response, so the operator can tell the customer exactly how many to close.
 */

import { tenantConvertSchema } from '@cos/schemas';
import { useState } from 'react';
import {
  Button,
  Dialog,
  Heading,
  Label,
  Modal,
  ModalOverlay,
  Radio,
  RadioGroup,
} from 'react-aria-components';
import { useI18n } from '../../i18n';
import {
  convertErrorKey,
  defaultConvertPlan,
  PLAN_PROJECT_LIMIT,
  TRIAL_PLANS,
  type TrialPlan,
} from '../../lib/adminTrial';
import type { TenantListRow } from '../../lib/adminTenants';
import { ApiError } from '../../lib/api/client';
import { useConvertTenant } from '../../lib/api/queries';
import { formatDate } from '../../lib/format';
import { TextInputField } from '../form/TextInputField';
import { LoadingState } from '../ui/LoadingState';
import { AdminIcon } from './AdminIcon';

export function ConvertTenantModal({
  tenant,
  onClose,
  onDone,
}: {
  tenant: TenantListRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t, locale } = useI18n();
  const convert = useConvertTenant();
  const [plan, setPlan] = useState<TrialPlan>(defaultConvertPlan(tenant.plan_type));
  const [justification, setJustification] = useState('');
  const [touched, setTouched] = useState(false);

  const parsed = tenantConvertSchema.safeParse({ planType: plan, justification });
  const busy = convert.isPending;

  const submit = () => {
    setTouched(true);
    if (!parsed.success || busy) return;
    convert.mutate(
      {
        id: tenant.tenant_id,
        planType: parsed.data.planType,
        justification: parsed.data.justification,
      },
      { onSuccess: onDone },
    );
  };

  const error = convert.error instanceof ApiError ? convert.error : null;
  const apiError = convert.isError ? t(convertErrorKey(error)) : undefined;
  const usage =
    error?.code === 'COS-PLAN-002' && error.details
      ? `${t('admin.convert.limit')} ${String(error.details['limit'])} · ${t('admin.convert.active')} ${String(error.details['active_projects'])}`
      : null;

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
      <Modal className="flex w-full max-w-xl flex-col overflow-hidden rounded-lg border border-cos-op-container-highest bg-cos-op-container-low shadow-2xl">
        <Dialog className="flex flex-col outline-none">
          <header className="flex items-start justify-between border-b border-cos-op-container-highest bg-cos-op-dialog-edge px-6 py-5">
            <div className="flex items-start gap-3.5">
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-cos-v3-emerald-500/30 bg-cos-v3-emerald-500/10 text-cos-v3-emerald-400">
                <AdminIcon name="payments" size={20} />
              </span>
              <div>
                <Heading slot="title" className="text-[18px] font-bold tracking-tight text-white">
                  {t('admin.convert.title')}
                </Heading>
                <p className="mt-1 text-[12px] text-cos-v3-slate-400">
                  <span className="font-mono font-semibold text-cos-v3-cyan-300">
                    {tenant.tenant_code}
                  </span>{' '}
                  <span aria-hidden="true" className="text-cos-v3-slate-500">
                    •
                  </span>{' '}
                  {tenant.tenant_name} · {t(`admin.subscription.${tenant.subscription_status}`)}
                  {tenant.trial_ends_at
                    ? ` · ${t('admin.convert.trialEnded')} ${formatDate(locale, tenant.trial_ends_at)}`
                    : null}
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

          <div className="space-y-5 p-6">
            <p className="text-[12px] leading-relaxed text-cos-v3-slate-300">
              {t('admin.convert.lead')}
            </p>

            <RadioGroup
              value={plan}
              onChange={(v) => setPlan(v as TrialPlan)}
              isDisabled={busy}
              isRequired
              className="space-y-2"
            >
              <Label className="text-[12px] font-semibold text-cos-op-on-surface">
                {t('admin.convert.plan')}
              </Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {TRIAL_PLANS.map((p) => (
                  <Radio
                    key={p}
                    value={p}
                    className={({ isSelected, isFocusVisible }) =>
                      `cursor-pointer rounded-md p-3 text-[12px] transition-colors ${
                        isSelected
                          ? 'border-2 border-cos-op-primary-container bg-cos-op-primary-container/10 text-white'
                          : 'border border-cos-op-container-highest bg-cos-op-modal-field text-cos-op-pending hover:bg-cos-op-modal-hover'
                      } ${isFocusVisible ? 'ring-2 ring-cos-op-primary-container' : ''}`
                    }
                  >
                    <span className="block font-bold uppercase tracking-wider">
                      {t(`admin.plan.${p}`)}
                    </span>
                    <span className="mt-1 block font-mono text-[10px]">
                      {t('admin.convert.upTo')} {PLAN_PROJECT_LIMIT[p]}{' '}
                      {t('admin.convert.projects')}
                    </span>
                  </Radio>
                ))}
              </div>
            </RadioGroup>

            <TextInputField
              tone="dark"
              multiline
              rows={2}
              label={t('admin.justification.label')}
              description={t('admin.convert.justificationHelp')}
              value={justification}
              onChange={setJustification}
              onBlur={() => setTouched(true)}
              isRequired
              isDisabled={busy}
              errorMessage={
                touched && !parsed.success ? t('admin.justification.tooShort') : undefined
              }
            />

            {apiError ? (
              <div role="alert" className="space-y-1 text-[11px] text-cos-op-error">
                <p>{apiError}</p>
                {usage ? <p className="font-mono">{usage}</p> : null}
              </div>
            ) : null}
          </div>

          <footer className="flex items-center justify-end gap-3 border-t border-cos-op-container-highest bg-cos-op-dialog-edge px-6 py-4">
            <Button
              onPress={onClose}
              isDisabled={busy}
              className="rounded-md border border-cos-op-container-highest px-4 py-2 text-[12px] font-semibold text-cos-v3-slate-300 outline-none transition-colors hover:text-white data-[focus-visible]:ring-2 data-[focus-visible]:ring-cos-v3-slate-500 disabled:opacity-50"
            >
              {t('admin.create.cancel')}
            </Button>
            <Button
              onPress={submit}
              isDisabled={busy || (touched && !parsed.success)}
              className="flex items-center gap-2 rounded-md bg-cos-op-primary-container px-5 py-2 text-[12px] font-bold text-white outline-none transition-all hover:brightness-110 data-[focus-visible]:ring-2 data-[focus-visible]:ring-cos-op-primary-container disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <LoadingState variant="micro" /> : <AdminIcon name="check" size={16} />}
              {t('admin.convert.confirm')}
            </Button>
          </footer>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
