'use client';

import { tenantCreateSchema } from '@cos/schemas';
import { useSession } from 'next-auth/react';
import { Controller } from 'react-hook-form';
import { CosRole } from '@cos/types';
import { NativeSelectField } from '../../components/form/NativeSelectField';
import { TextInputField } from '../../components/form/TextInputField';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { useI18n } from '../../i18n';
import {
  useTenants,
  useCreateTenant,
  useDeactivateTenant,
  useAssignDedicatedDb,
  useMarkContracted,
} from '../../lib/api/queries';
import type { PlanType, TenantRow } from '../../lib/api/types';
import { formatDate } from '../../lib/format';
import { useValidatedForm } from '../../lib/forms';

const PLANS: PlanType[] = ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'];

/** SYSTEM_ADMIN cross-tenant platform panel (§20.4 / §20.7.11). Separate from the tenant client. */
export default function AdminPanelPage() {
  const { t, locale } = useI18n();
  const { data: session } = useSession();
  const query = useTenants();
  const create = useCreateTenant();
  const deactivate = useDeactivateTenant();
  const assignDb = useAssignDedicatedDb();
  const markContracted = useMarkContracted();

  // Declared before the SYSTEM_ADMIN guard below: hooks cannot be called conditionally, and the
  // guard returns early for every other role.
  const {
    control,
    handleSubmit,
    reset,
    getValues,
    formState: { errors, isSubmitting },
  } = useValidatedForm({
    schema: tenantCreateSchema,
    defaultValues: {
      tenantCode: '',
      tenantName: '',
      planType: 'STARTER' as PlanType,
      dedicatedDbUrl: '',
    },
  });

  const messageFor = (key?: string) => (key ? t(key) : undefined);

  if (session && session.user?.role !== CosRole.SYSTEM_ADMIN) {
    return <main className="p-8 text-sm text-gray-600">{t('admin.unauthorized')}</main>;
  }

  const submit = handleSubmit((values) => {
    create.mutate(
      {
        tenantCode: values.tenantCode,
        tenantName: values.tenantName,
        planType: values.planType,
        dedicatedDbUrl: values.dedicatedDbUrl || undefined,
      },
      {
        onSuccess: () =>
          reset({
            tenantCode: '',
            tenantName: '',
            planType: getValues('planType'),
            dedicatedDbUrl: '',
          }),
      },
    );
  });

  const columns: Column<TenantRow>[] = [
    { headerKey: 'admin.colCode', cell: (x) => x.tenant_code },
    { headerKey: 'admin.colName', cell: (x) => x.tenant_name },
    { headerKey: 'admin.colPlan', cell: (x) => x.plan_type },
    {
      headerKey: 'table.status',
      cell: (x) => (x.is_active ? t('settings.active') : t('settings.inactive')),
    },
    {
      headerKey: 'admin.colDb',
      cell: (x) =>
        x.dedicated_db_url ? (x.dedicated_db_url.split('@')[1] ?? '—') : t('admin.shared'),
    },
    { headerKey: 'site.colDate', cell: (x) => formatDate(locale, x.created_at) },
    {
      headerKey: 'table.actions',
      cell: (x) =>
        x.is_active ? (
          <span className="flex gap-2">
            <button
              type="button"
              disabled={deactivate.isPending}
              onClick={() => deactivate.mutate(x.tenant_id)}
              className="rounded border border-red-600 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {t('settings.deactivate')}
            </button>
            {x.plan_type === 'ENTERPRISE' && (
              <button
                type="button"
                disabled={assignDb.isPending}
                onClick={() => {
                  const url = window.prompt('postgresql://...');
                  if (url) assignDb.mutate({ id: x.tenant_id, dedicatedDbUrl: url });
                }}
                className="rounded border border-blue-600 px-2 py-0.5 text-xs text-blue-600 hover:bg-blue-50 disabled:opacity-50"
              >
                {t('admin.assignDb')}
              </button>
            )}
            {/* §20.4.4 — enabled only for an ENTERPRISE tenant that is active with no dedicated DB yet. */}
            {x.plan_type === 'ENTERPRISE' && !x.dedicated_db_url && (
              <button
                type="button"
                disabled={markContracted.isPending}
                onClick={() => {
                  // Type-to-confirm safety (§20.4.4): operator retypes the tenant code.
                  const confirmCode = window.prompt(
                    `${t('admin.markContractedConfirm')} ${x.tenant_code}`,
                  );
                  if (confirmCode !== x.tenant_code) return;
                  const ref = window.prompt(t('admin.contractRef')) ?? '';
                  markContracted.mutate({
                    id: x.tenant_id,
                    contractReference: ref.trim() || undefined,
                  });
                }}
                className="rounded border border-amber-600 px-2 py-0.5 text-xs text-amber-700 hover:bg-amber-50 disabled:opacity-50"
              >
                {t('admin.markContracted')}
              </button>
            )}
          </span>
        ) : (
          '—'
        ),
    },
  ];

  return (
    <main className="mx-auto max-w-6xl p-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-800">{t('admin.title')}</h1>

      <form onSubmit={submit} noValidate className="mb-6 flex flex-wrap items-start gap-2">
        <Controller
          name="tenantCode"
          control={control}
          render={({ field }) => (
            <TextInputField
              {...field}
              label={t('admin.colCode')}
              errorMessage={messageFor(errors.tenantCode?.message)}
            />
          )}
        />
        <Controller
          name="tenantName"
          control={control}
          render={({ field }) => (
            <TextInputField
              {...field}
              label={t('admin.colName')}
              errorMessage={messageFor(errors.tenantName?.message)}
            />
          )}
        />
        <Controller
          name="planType"
          control={control}
          render={({ field }) => (
            <NativeSelectField
              {...field}
              label={t('admin.colPlan')}
              options={PLANS.map((p) => ({ id: p, label: p }))}
              errorMessage={messageFor(errors.planType?.message)}
            />
          )}
        />
        <div className="min-w-[16rem] flex-1">
          <Controller
            name="dedicatedDbUrl"
            control={control}
            render={({ field }) => (
              <TextInputField
                {...field}
                label={t('admin.dbUrlOptional')}
                errorMessage={messageFor(errors.dedicatedDbUrl?.message)}
              />
            )}
          />
        </div>
        <button
          type="submit"
          disabled={isSubmitting || create.isPending}
          className="mt-6 rounded-md bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {t('admin.createTenant')}
        </button>
      </form>

      <DataTable
        columns={columns}
        rows={query.data ?? []}
        rowKey={(x) => x.tenant_id}
        isLoading={query.isLoading}
      />
    </main>
  );
}
