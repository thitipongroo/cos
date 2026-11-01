'use client';

/**
 * SYSTEM_ADMIN — Start a free trial (§7.10, ADR-109): opened from the Tenant List for a construction-os.io trial
 * request. `POST /admin/tenants/trial` → a tenant on LITE / STARTER / PROFESSIONAL whose trial ends 30 days from now
 * by the database clock. Trials are sales-assisted until self-service signup exists (ADR-109 decision 5).
 *
 * NOT DRAWN. There is no Stitch screen; this reuses the admin dialog frame. The terms printed under the plans are
 * the published ones (§26.1.2): 30 days, no card, read-only for 30 days after, then deleted — nothing else is
 * claimed. Rules are `tenantTrialCreateSchema` (@cos/schemas), the same as CreateTrialTenantDto on the server.
 */

import { tenantTrialCreateSchema } from '@cos/schemas';
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
import { useT } from '../../i18n';
import {
  createTrialErrorKey,
  PLAN_PROJECT_LIMIT,
  TRIAL_PLANS,
  type TrialPlan,
} from '../../lib/adminTrial';
import { ApiError } from '../../lib/api/client';
import { useCreateTrialTenant } from '../../lib/api/queries';
import { TextInputField } from '../form/TextInputField';
import { LoadingState } from '../ui/LoadingState';
import { AdminIcon } from './AdminIcon';

type Field = 'tenantCode' | 'tenantName' | 'trialSource' | 'trialRequestRef' | 'justification';

export function CreateTrialModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (tenantCode: string) => void;
}) {
  const t = useT();
  const create = useCreateTrialTenant();
  const [values, setValues] = useState<Record<Field, string>>({
    tenantCode: '',
    tenantName: '',
    trialSource: '',
    trialRequestRef: '',
    justification: '',
  });
  const [plan, setPlan] = useState<TrialPlan>('STARTER');
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);

  const parsed = tenantTrialCreateSchema.safeParse({ ...values, planType: plan });
  const issues = new Map<string, string>(
    parsed.success ? [] : parsed.error.issues.map((i) => [String(i.path[0]), i.message]),
  );
  const errorFor = (field: Field) => {
    const key = issues.get(field);
    return key && (submitted || touched[field]) ? t(key) : undefined;
  };
  const busy = create.isPending;

  const set = (field: Field) => (v: string) => setValues((prev) => ({ ...prev, [field]: v }));
  const blur = (field: Field) => () => setTouched((prev) => ({ ...prev, [field]: true }));

  const submit = () => {
    setSubmitted(true);
    if (!parsed.success || busy) return;
    const d = parsed.data;
    create.mutate(
      {
        tenantCode: d.tenantCode,
        tenantName: d.tenantName,
        planType: d.planType,
        trialSource: d.trialSource || undefined,
        trialRequestRef: d.trialRequestRef || undefined,
        justification: d.justification,
      },
      { onSuccess: () => onCreated(d.tenantCode) },
    );
  };

  const apiError = create.isError
    ? t(createTrialErrorKey(create.error instanceof ApiError ? create.error.status : undefined))
    : undefined;

  const text = (
    field: Field,
    labelKey: string,
    help: string,
    opts: { mono?: boolean; required?: boolean } = {},
  ) => (
    <TextInputField
      tone="dark"
      mono={opts.mono}
      label={t(labelKey)}
      description={t(help)}
      value={values[field]}
      onChange={set(field)}
      onBlur={blur(field)}
      isRequired={opts.required}
      isDisabled={busy}
      errorMessage={errorFor(field)}
    />
  );

  return (
    <ModalOverlay
      isOpen
      isDismissable={!busy}
      isKeyboardDismissDisabled={busy}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      data-admin-modal=""
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-cos-op-container-lowest/80 p-4 backdrop-blur-sm sm:p-6"
    >
      <Modal className="relative my-auto flex w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-cos-op-container-highest bg-cos-op-container-low text-cos-op-on-surface shadow-2xl">
        <Dialog className="flex flex-col outline-none">
          <header className="flex items-center justify-between border-b border-cos-op-container-highest bg-cos-op-modal-header px-6 py-4">
            <Heading
              slot="title"
              className="flex items-center gap-2 text-[18px] font-bold tracking-tight text-white"
            >
              <AdminIcon name="timer" size={20} className="text-cos-op-cyan" />
              {t('admin.trial.title')}
            </Heading>
            <Button
              aria-label={t('admin.create.close')}
              onPress={onClose}
              isDisabled={busy}
              className="rounded-md p-1.5 text-cos-op-pending outline-none transition-colors hover:text-white data-[focus-visible]:ring-2 data-[focus-visible]:ring-cos-op-primary-container"
            >
              <AdminIcon name="close" size={20} />
            </Button>
          </header>

          <div className="max-h-[calc(100vh-14rem)] space-y-5 overflow-y-auto p-6">
            {apiError ? (
              <p role="alert" className="text-[11px] text-cos-op-error">
                {apiError}
              </p>
            ) : null}

            {text('tenantCode', 'admin.create.codeLabel', 'admin.create.codeRule', {
              mono: true,
              required: true,
            })}
            {text('tenantName', 'admin.create.nameLabel', 'admin.create.nameRule', {
              required: true,
            })}

            <RadioGroup
              value={plan}
              onChange={(v) => setPlan(v as TrialPlan)}
              isDisabled={busy}
              isRequired
              className="space-y-2"
            >
              <Label className="text-[12px] font-semibold text-cos-op-on-surface">
                {t('admin.trial.plan')}
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {text('trialSource', 'admin.trial.sourceLabel', 'admin.trial.sourceHelp', {
                mono: true,
              })}
              {text(
                'trialRequestRef',
                'admin.trial.requestRefLabel',
                'admin.trial.requestRefHelp',
                { mono: true },
              )}
            </div>

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

            <p className="flex items-start gap-2 rounded-md border border-cos-op-container-highest bg-cos-op-modal-notice p-3 text-[11px] leading-relaxed text-cos-op-pending">
              <AdminIcon name="info" size={16} className="mt-0.5 shrink-0 text-cos-op-cyan" />
              <span>{t('admin.trial.terms')}</span>
            </p>
          </div>

          <footer className="flex items-center justify-end gap-3 border-t border-cos-op-container-highest bg-cos-op-modal-footer px-6 py-4">
            <Button
              onPress={onClose}
              isDisabled={busy}
              className="rounded-md border border-cos-op-container-highest px-4 py-2 text-[12px] font-semibold text-cos-op-on-surface outline-none transition-all hover:text-white data-[focus-visible]:ring-2 data-[focus-visible]:ring-cos-op-container-highest disabled:opacity-50"
            >
              {t('admin.create.cancel')}
            </Button>
            <Button
              onPress={submit}
              isDisabled={busy}
              className="flex items-center gap-1.5 rounded-md bg-cos-op-primary-container px-5 py-2 text-[12px] font-bold text-white outline-none transition-all hover:brightness-110 data-[focus-visible]:ring-2 data-[focus-visible]:ring-cos-op-primary-container disabled:opacity-50"
            >
              {busy ? <LoadingState variant="micro" /> : <AdminIcon name="timer" size={16} />}
              {t('admin.trial.submit')}
            </Button>
          </footer>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
