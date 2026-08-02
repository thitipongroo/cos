'use client';

import { purchaseRequestCreateSchema } from '@cos/schemas';
import { useState } from 'react';
import { Controller } from 'react-hook-form';
import { DateField } from '../../../../components/form/DateField';
import { NativeSelectField } from '../../../../components/form/NativeSelectField';
import { TextInputField } from '../../../../components/form/TextInputField';
import { DataTable, type Column } from '../../../../components/ui/DataTable';
import { useI18n } from '../../../../i18n';
import {
  useAllPurchaseRequests,
  useCreatePurchaseRequest,
  useProjects,
} from '../../../../lib/api/queries';
import type { PurchaseRequestRow } from '../../../../lib/api/types';
import { formatDate } from '../../../../lib/format';
import { useReadOnly } from '../../../../lib/auth/useReadOnly';
import { useValidatedForm } from '../../../../lib/forms';

const STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PO_CREATED'];

/** Tenant-wide purchase requests inbox + create (§20.7.3 → GET/POST /purchase-requests). */
export default function PurchaseRequestsPage() {
  const { t, locale } = useI18n();
  const [status, setStatus] = useState('');
  const query = useAllPurchaseRequests({ status: status || undefined });
  const projects = useProjects();
  const create = useCreatePurchaseRequest();
  const readOnly = useReadOnly();

  const {
    control,
    handleSubmit,
    reset,
    getValues,
    formState: { errors, isSubmitting },
  } = useValidatedForm({
    schema: purchaseRequestCreateSchema,
    defaultValues: { project_id: '', pr_number: '', required_date: '' },
  });

  const messageFor = (key?: string) => (key ? t(key) : undefined);

  const submitForm = handleSubmit((values) => {
    create.mutate(
      { ...values, required_date: values.required_date || undefined },
      // Keep the project: a procurement officer raises several PRs against one project in a row.
      {
        onSuccess: () =>
          reset({ project_id: getValues('project_id'), pr_number: '', required_date: '' }),
      },
    );
  });

  const columns: Column<PurchaseRequestRow>[] = [
    { headerKey: 'pm.colNumber', cell: (r) => r.pr_number },
    { headerKey: 'table.status', cell: (r) => r.status },
    { headerKey: 'pm.colDate', cell: (r) => formatDate(locale, r.required_date) },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">{t('proc.requestsTitle')}</h1>

      {!readOnly && (
        <form onSubmit={submitForm} noValidate className="mb-4 flex flex-wrap items-start gap-2">
          <Controller
            name="project_id"
            control={control}
            render={({ field }) => (
              <NativeSelectField
                {...field}
                label={t('site.selectProject')}
                placeholder={t('site.selectProject')}
                options={
                  projects.data?.items.map((p) => ({ id: p.project_id, label: p.project_name })) ??
                  []
                }
                errorMessage={messageFor(errors.project_id?.message)}
              />
            )}
          />
          <Controller
            name="pr_number"
            control={control}
            render={({ field }) => (
              <TextInputField
                {...field}
                label={t('proc.prNumber')}
                errorMessage={messageFor(errors.pr_number?.message)}
              />
            )}
          />
          <Controller
            name="required_date"
            control={control}
            render={({ field }) => (
              <DateField
                {...field}
                label={t('proc.requiredDate')}
                errorMessage={messageFor(errors.required_date?.message)}
              />
            )}
          />
          <button
            type="submit"
            disabled={isSubmitting || create.isPending}
            className="mt-6 rounded-md bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {t('proc.createRequest')}
          </button>
        </form>
      )}

      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="mb-4 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
      >
        <option value="">{t('proc.allStatuses')}</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <DataTable
        columns={columns}
        rows={query.data?.items ?? []}
        rowKey={(r) => r.pr_id}
        isLoading={query.isLoading}
      />
    </div>
  );
}
