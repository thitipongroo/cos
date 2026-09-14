'use client';

/**
 * SYSTEM_ADMIN — Create Tenant (§20.4.2) as the Stitch "Create Tenant - Modal Overlay - SYSTEM_ADMIN" dialog
 * (screen 00b09850702f46329e30a3aef44c9f9a, HTML fetched 2026-09-15; revision R13). Drawn class for class in the
 * drawing's own values (`cos-op-*` tokens) over the real Tenant List: scrim, panel, header with close, scrolling
 * form, footer. React Aria owns the dialog semantics — focus trap, Escape, the title as its label.
 *
 * Fields and rules are §20.4.2's, enforced by `tenantCreateSchema` (@cos/schemas) and again by CreateTenantDto
 * on the server. Submit → POST /admin/tenants → `onCreated(code)`.
 *
 * ── THE DRAWING'S COPY, EVERY WORD (product-owner decision 2026-09-15, R13 decision 3) ──────────────
 * Some of it claims what this system does NOT do today. Named here so it can be cleared later:
 *   "identifier is available" — no availability check exists; a taken code is a 409 on submit. The note shows
 *     when the code's FORMAT is valid.
 *   "Port <n> Open" and "Host is reachable on cluster internal network" — nothing probes the host. Both show when
 *     the URL's FORMAT is valid; the port is the one the URL names (PostgreSQL's 5432 when it names none).
 *   "Automatic Provisioning Lifecycle: … HashiCorp Vault … schema catalog … mutual TLS certs for EMQX" — the
 *     provisioning run (§34) uses AWS Secrets Manager and does none of the three.
 *   "Zone: ap-southeast-1a (Headroom: 72%)" — a fixed string; neither figure has a source.
 *   "Shared Compute" / "Tiered IOPS" / "● Dedicated Fleet" — tier lines with no source.
 *
 * ── DIFFERENCES FROM THE DRAWING, AND WHY ────────────────────────────────────────────────────────
 *   JUSTIFICATION under the URI field (R13 decision 4): §6.7 makes it mandatory and the API refuses a create
 *     without one.
 *   The URI is DISABLED until ENTERPRISE is chosen, and holds a placeholder rather than a masked credential.
 *   Tenant Name's valid glyph is the check-circle: the drawing's own path for it is malformed and renders a dot.
 *   Type is the brand's Inter Tight, not the drawing's Inter / JetBrains Mono (§32.7).
 */

import { tenantCreateSchema } from '@cos/schemas';
import { Controller, useWatch } from 'react-hook-form';
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
import { dbUrlPort, errorKeyForStatus, type PlanType } from '../../lib/adminTenants';
import { ApiError } from '../../lib/api/client';
import { useCreateTenant } from '../../lib/api/queries';
import { useValidatedForm } from '../../lib/forms';
import { TextInputField } from '../form/TextInputField';
import { LoadingState } from '../ui/LoadingState';

const PLANS: Array<{ plan: PlanType; noteKey: string; tierKey: string }> = [
  { plan: 'STARTER', noteKey: 'admin.create.planStarter', tierKey: 'admin.create.tierStarter' },
  {
    plan: 'PROFESSIONAL',
    noteKey: 'admin.create.planProfessional',
    tierKey: 'admin.create.tierProfessional',
  },
  {
    plan: 'ENTERPRISE',
    noteKey: 'admin.create.planEnterprise',
    tierKey: 'admin.create.tierEnterprise',
  },
];

const FORM_ID = 'create-tenant-form';

export function CreateTenantModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (tenantCode: string) => void;
}) {
  const t = useT();
  const create = useCreateTenant();

  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting, dirtyFields },
  } = useValidatedForm({
    schema: tenantCreateSchema,
    defaultValues: {
      tenantCode: '',
      tenantName: '',
      planType: 'STARTER' as PlanType,
      dedicatedDbUrl: '',
      justification: '',
    },
  });

  const values = useWatch({ control });
  const enterprise = values.planType === 'ENTERPRISE';

  // "Valid …" is said only for a field that was typed into AND passes its own rule — computed from the
  // schema, not from the resolver, so it stays true while client validation is flagged off (QM-15).
  const parsed = tenantCreateSchema.safeParse(values);
  const failing = new Set(parsed.success ? [] : parsed.error.issues.map((i) => String(i.path[0])));
  const isFieldValid = (field: 'tenantCode' | 'tenantName' | 'dedicatedDbUrl') =>
    Boolean(dirtyFields[field] && !failing.has(field) && values[field]);
  const validNote = (field: 'tenantCode' | 'tenantName' | 'dedicatedDbUrl', key: string) =>
    isFieldValid(field) ? <ValidNote>{t(key)}</ValidNote> : null;
  const port = values.dedicatedDbUrl ? dbUrlPort(values.dedicatedDbUrl) : null;

  const messageFor = (key?: string) => (key ? t(key) : undefined);
  const busy = isSubmitting || create.isPending;

  const submit = handleSubmit((v) => {
    create.mutate(
      {
        tenantCode: v.tenantCode,
        tenantName: v.tenantName,
        planType: v.planType,
        dedicatedDbUrl:
          v.planType === 'ENTERPRISE' && v.dedicatedDbUrl ? v.dedicatedDbUrl : undefined,
        justification: v.justification,
      },
      { onSuccess: () => onCreated(v.tenantCode) },
    );
  });

  const apiError =
    create.error != null
      ? t(
          errorKeyForStatus(
            create.error instanceof ApiError ? create.error.status : undefined,
            'create',
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
      data-create-tenant-modal=""
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-cos-op-container-lowest/80 p-4 backdrop-blur-sm sm:p-6"
    >
      <Modal className="relative my-auto flex w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-cos-op-container-highest bg-cos-op-container-low text-cos-op-on-surface shadow-2xl">
        <Dialog className="flex flex-col outline-none">
          <header className="flex items-center justify-between border-b border-cos-op-container-highest bg-cos-op-modal-header px-6 py-4">
            <Heading
              slot="title"
              className="mt-0.5 flex items-center gap-2 text-[18px] font-bold tracking-tight text-white"
            >
              {t('admin.create.title')}
            </Heading>
            <Button
              aria-label={t('admin.create.close')}
              onPress={onClose}
              isDisabled={busy}
              className="rounded-md p-1.5 text-cos-op-pending outline-none transition-colors hover:bg-cos-op-container-high hover:text-white data-[focus-visible]:ring-2 data-[focus-visible]:ring-cos-op-primary-container"
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

          <form
            id={FORM_ID}
            onSubmit={submit}
            noValidate
            className="max-h-[calc(100vh-14rem)] space-y-5 overflow-y-auto p-6"
          >
            {apiError ? (
              <p role="alert" className="text-[11px] text-cos-op-error">
                {apiError}
              </p>
            ) : null}

            <FieldRow marker={t('admin.create.required')} required>
              <Controller
                name="tenantCode"
                control={control}
                render={({ field }) => (
                  <TextInputField
                    {...field}
                    tone="dark"
                    mono
                    label={t('admin.create.codeLabel')}
                    description={t('admin.create.codeRule')}
                    errorMessage={messageFor(errors.tenantCode?.message)}
                    isRequired
                    isValid={isFieldValid('tenantCode')}
                    validIndicator={<CheckCircle />}
                  />
                )}
              />
              {validNote('tenantCode', 'admin.create.codeValid')}
            </FieldRow>

            <FieldRow marker={t('admin.create.required')} required>
              <Controller
                name="tenantName"
                control={control}
                render={({ field }) => (
                  <TextInputField
                    {...field}
                    tone="dark"
                    label={t('admin.create.nameLabel')}
                    description={t('admin.create.nameRule')}
                    errorMessage={messageFor(errors.tenantName?.message)}
                    isRequired
                    isValid={isFieldValid('tenantName')}
                    validIndicator={<CheckCircle />}
                  />
                )}
              />
              {validNote('tenantName', 'admin.create.nameValid')}
            </FieldRow>

            <Controller
              name="planType"
              control={control}
              render={({ field }) => (
                <RadioGroup
                  value={field.value}
                  onChange={(v) => {
                    field.onChange(v);
                    if (v !== 'ENTERPRISE')
                      setValue('dedicatedDbUrl', '', { shouldValidate: true });
                  }}
                  isRequired
                  className="space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <Label className="text-[12px] font-semibold text-cos-op-on-surface">
                      {t('admin.create.planLabel')}
                    </Label>
                    <RequiredMarker>{t('admin.create.required')}</RequiredMarker>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {PLANS.map(({ plan, noteKey, tierKey }) => (
                      <Radio
                        key={plan}
                        value={plan}
                        className={({ isSelected, isFocusVisible }) =>
                          `relative flex cursor-pointer flex-col rounded-md p-3.5 transition-all duration-150 ${
                            isSelected
                              ? 'border-2 border-cos-op-primary-container bg-cos-op-primary-container/10 shadow-md shadow-cos-op-primary-container/10'
                              : 'border border-cos-op-container-highest bg-cos-op-modal-field hover:bg-cos-op-modal-hover'
                          } ${isFocusVisible ? 'ring-2 ring-cos-op-primary-container' : ''}`
                        }
                      >
                        {({ isSelected }) => (
                          <>
                            <span className="mb-1.5 flex items-center justify-between">
                              <span
                                className={`flex items-center gap-1 text-[12px] font-bold uppercase tracking-wider ${
                                  isSelected ? 'text-cos-op-enterprise' : 'text-white'
                                }`}
                              >
                                {plan}
                                {isSelected ? (
                                  <span
                                    aria-hidden="true"
                                    className="h-1.5 w-1.5 rounded-full bg-cos-op-primary-container motion-safe:animate-ping"
                                  />
                                ) : null}
                              </span>
                              {isSelected ? (
                                <span
                                  aria-hidden="true"
                                  className="flex h-4 w-4 items-center justify-center rounded-full border-2 border-cos-op-primary-container bg-cos-op-primary-container"
                                >
                                  <span className="h-1.5 w-1.5 rounded-full bg-white" />
                                </span>
                              ) : (
                                <span
                                  aria-hidden="true"
                                  className="h-3.5 w-3.5 rounded-full border border-cos-op-container-highest"
                                />
                              )}
                            </span>
                            <span
                              className={`text-[11px] leading-snug ${
                                isSelected
                                  ? 'font-medium text-cos-op-on-surface'
                                  : 'text-cos-op-pending'
                              }`}
                            >
                              {t(noteKey)}
                            </span>
                            <span
                              className={`mt-2 font-mono text-[10px] ${
                                isSelected ? 'text-cos-op-ok' : 'text-cos-op-tier'
                              }`}
                            >
                              {t(tierKey)}
                            </span>
                          </>
                        )}
                      </Radio>
                    ))}
                  </div>
                  {enterprise ? (
                    <p className="flex items-center gap-2 rounded border border-cos-op-primary-container/30 bg-cos-op-primary-container/10 p-2 text-[11px] text-cos-op-on-surface">
                      <svg
                        aria-hidden="true"
                        className="h-4 w-4 shrink-0 text-cos-op-primary-container"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                        />
                      </svg>
                      <span>{t('admin.create.planEnterpriseNote')}</span>
                    </p>
                  ) : null}
                </RadioGroup>
              )}
            />

            <div className="pt-1">
              <FieldRow marker={t('admin.create.optionalEnterprise')}>
                <Controller
                  name="dedicatedDbUrl"
                  control={control}
                  render={({ field }) => (
                    <TextInputField
                      {...field}
                      value={field.value ?? ''}
                      tone="dark"
                      mono
                      type="url"
                      inputClassName="text-[12px] font-medium"
                      indicatorPaddingClassName="pr-36"
                      label={t('admin.create.dbUrlLabel')}
                      labelAddon={
                        <span className="rounded border border-cos-op-vpc-line bg-cos-op-vpc/80 px-1.5 font-mono text-[9px] text-cos-op-vpc-ink">
                          {t('admin.create.vpcBadge')}
                        </span>
                      }
                      placeholder="postgresql://"
                      description={t(
                        enterprise ? 'admin.create.dbUrlRule' : 'admin.create.dbUrlEnterpriseOnly',
                      )}
                      descriptionClassName="font-mono text-[10px] text-cos-op-pending"
                      errorMessage={messageFor(errors.dedicatedDbUrl?.message)}
                      isDisabled={!enterprise}
                      isValid={enterprise && isFieldValid('dedicatedDbUrl') && port !== null}
                      validBorder={false}
                      validIndicator={
                        <span className="inline-flex items-center rounded border border-cos-op-port-line/80 bg-cos-op-port/70 px-2 py-0.5 font-mono text-[10px] font-medium text-cos-op-ok">
                          <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-cos-op-ok motion-safe:animate-pulse" />
                          {t('admin.create.portPrefix')} {port} {t('admin.create.portSuffix')}
                        </span>
                      }
                    />
                  )}
                />
                {enterprise ? validNote('dedicatedDbUrl', 'admin.create.dbUrlValid') : null}
              </FieldRow>
            </div>

            <FieldRow marker={t('admin.create.required')} required>
              <Controller
                name="justification"
                control={control}
                render={({ field }) => (
                  <TextInputField
                    {...field}
                    tone="dark"
                    multiline
                    rows={3}
                    label={t('admin.justification.label')}
                    description={t('admin.create.justificationRule')}
                    errorMessage={messageFor(errors.justification?.message)}
                    isRequired
                  />
                )}
              />
            </FieldRow>

            <div className="flex items-start gap-2.5 rounded-md border border-cos-op-container-highest bg-cos-op-modal-notice p-3 text-xs text-cos-op-pending">
              <svg
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0 text-cos-op-cyan"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </svg>
              <p className="space-y-0.5 text-[11px] leading-relaxed">
                <span className="font-medium text-white">{t('admin.create.lifecycleTitle')}</span>{' '}
                {t('admin.create.lifecycleBody')}
              </p>
            </div>
          </form>

          <footer className="flex items-center justify-between border-t border-cos-op-container-highest bg-cos-op-modal-footer px-6 py-4">
            <div className="flex items-center gap-2 text-[11px] text-cos-op-pending">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-cos-op-ok" />
              <span className="font-mono">{t('admin.create.zone')}</span>
            </div>
            <div className="flex items-center gap-3">
              <Button
                onPress={onClose}
                isDisabled={busy}
                className="rounded-md border border-cos-op-container-highest bg-transparent px-4 py-2 text-[12px] font-semibold text-cos-op-on-surface outline-none transition-all hover:bg-cos-op-container-high hover:text-white data-[focus-visible]:ring-2 data-[focus-visible]:ring-cos-op-container-highest disabled:opacity-50"
              >
                {t('admin.create.cancel')}
              </Button>
              <button
                type="submit"
                form={FORM_ID}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-md border border-cos-op-enterprise/40 bg-cos-op-primary-container px-5 py-2 text-[12px] font-bold text-white shadow-lg shadow-cos-op-cta-shadow/40 transition-all hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-cos-op-primary-container disabled:opacity-50"
              >
                {busy ? (
                  <LoadingState variant="micro" />
                ) : (
                  <svg
                    aria-hidden="true"
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M12 4v16m8-8H4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2.5"
                    />
                  </svg>
                )}
                <span>{t(busy ? 'admin.create.submitting' : 'admin.create.submit')}</span>
              </button>
            </div>
          </footer>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

/** The drawing's REQUIRED: 10 px mono uppercase, wide tracking, primary blue. */
function RequiredMarker({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-cos-op-primary-container">
      {children}
    </span>
  );
}

/** A field with the drawing's right-aligned marker beside its label: REQUIRED in blue, Optional in grey. */
function FieldRow({
  marker,
  required = false,
  children,
}: {
  marker: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex flex-col gap-0.5">
      <span className="absolute right-0 top-0">
        {required ? (
          <RequiredMarker>{marker}</RequiredMarker>
        ) : (
          <span className="font-mono text-[10px] text-cos-op-pending">{marker}</span>
        )}
      </span>
      {children}
    </div>
  );
}

/** The drawing's valid note: 11 px mono emerald-400, a literal "✓". */
function ValidNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1 pt-0.5 font-mono text-[11px] font-medium text-cos-op-ok">
      <span aria-hidden="true">✓</span>
      <span>{children}</span>
    </p>
  );
}

/** The drawing's solid check-circle (20 × 20). */
function CheckCircle() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5 text-cos-op-ok"
      fill="currentColor"
      viewBox="0 0 20 20"
    >
      <path
        clipRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
        fillRule="evenodd"
      />
    </svg>
  );
}
