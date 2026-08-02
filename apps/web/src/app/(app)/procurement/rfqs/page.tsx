'use client';

import { rfqCreateSchema } from '@cos/schemas';
import { useState } from 'react';
import { Controller } from 'react-hook-form';
import { NativeSelectField } from '../../../../components/form/NativeSelectField';
import { TextInputField } from '../../../../components/form/TextInputField';
import { DataTable, type Column } from '../../../../components/ui/DataTable';
import { useI18n } from '../../../../i18n';
import {
  useAllRfqs,
  usePublishRfq,
  useCloseRfq,
  useCancelRfq,
  useCreateRfq,
  useProjects,
} from '../../../../lib/api/queries';
import type { RfqRow } from '../../../../lib/api/types';
import { formatDate } from '../../../../lib/format';
import { useReadOnly } from '../../../../lib/auth/useReadOnly';
import { useValidatedForm } from '../../../../lib/forms';

const STATUSES = ['DRAFT', 'PUBLISHED', 'CLOSED', 'EVALUATED', 'AWARDED', 'CANCELLED'];

/** Tenant-wide RFQ inbox (§20.7.3 → GET /rfqs; lifecycle via publish/close/cancel). */
export default function RfqsPage() {
  const { t, locale } = useI18n();
  const [status, setStatus] = useState('');
  const query = useAllRfqs({ status: status || undefined });
  const publish = usePublishRfq();
  const close = useCloseRfq();
  const cancel = useCancelRfq();
  const readOnly = useReadOnly();
  const busy = publish.isPending || close.isPending || cancel.isPending;
  const projects = useProjects();
  const create = useCreateRfq();
  const {
    control,
    handleSubmit,
    reset,
    getValues,
    formState: { errors, isSubmitting },
  } = useValidatedForm({
    schema: rfqCreateSchema,
    defaultValues: { project_id: '', rfq_number: '', deadline: '' },
  });

  const messageFor = (key?: string) => (key ? t(key) : undefined);

  const submitCreate = handleSubmit(async (values) => {
    await create.mutateAsync({
      project_id: values.project_id,
      rfq_number: values.rfq_number,
      // The field holds a local datetime; the API takes an absolute instant.
      deadline: new Date(values.deadline).toISOString(),
    });
    reset({ project_id: getValues('project_id'), rfq_number: '', deadline: '' });
  });

  const columns: Column<RfqRow>[] = [
    { headerKey: 'pm.colNumber', cell: (r) => r.rfq_number },
    { headerKey: 'table.status', cell: (r) => r.status },
    { headerKey: 'pm.colDeadline', cell: (r) => formatDate(locale, r.deadline) },
    {
      headerKey: 'table.actions',
      cell: (r) => {
        if (readOnly) return '—';
        if (r.status === 'DRAFT') {
          return (
            <ActionBtn
              label={t('proc.publish')}
              disabled={busy}
              onClick={() => publish.mutate(r.rfq_id)}
            />
          );
        }
        if (r.status === 'PUBLISHED') {
          return (
            <span className="flex gap-2">
              <ActionBtn
                label={t('proc.close')}
                disabled={busy}
                onClick={() => close.mutate(r.rfq_id)}
              />
              <ActionBtn
                label={t('proc.cancel')}
                danger
                disabled={busy}
                onClick={() => cancel.mutate(r.rfq_id)}
              />
            </span>
          );
        }
        return '—';
      },
    },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">{t('proc.rfqsTitle')}</h1>

      {!readOnly && (
        <form onSubmit={submitCreate} noValidate className="mb-4 flex flex-wrap items-start gap-2">
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
            name="rfq_number"
            control={control}
            render={({ field }) => (
              <TextInputField
                {...field}
                label={t('proc.rfqNumber')}
                errorMessage={messageFor(errors.rfq_number?.message)}
              />
            )}
          />
          {/* Stays a native datetime-local rather than DateField: React Aria's DatePicker is
              date-only, and an RFQ deadline needs the hour. Buddhist Era does not apply to a
              deadline instant the vendor sees in their own locale. */}
          <div className="flex flex-col gap-1">
            <label htmlFor="rfq-deadline" className="block text-sm font-medium text-gray-700">
              {t('proc.deadline')}
            </label>
            <Controller
              name="deadline"
              control={control}
              render={({ field }) => (
                <>
                  <input
                    id="rfq-deadline"
                    type="datetime-local"
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                    onBlur={field.onBlur}
                    name={field.name}
                    aria-invalid={errors.deadline ? true : undefined}
                    aria-describedby={errors.deadline ? 'rfq-deadline-error' : undefined}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                  />
                  {errors.deadline ? (
                    <span id="rfq-deadline-error" role="alert" className="text-xs text-red-700">
                      {messageFor(errors.deadline.message)}
                    </span>
                  ) : null}
                </>
              )}
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting || create.isPending}
            className="mt-6 rounded-md bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {t('proc.createRfq')}
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
        rowKey={(r) => r.rfq_id}
        isLoading={query.isLoading}
      />
    </div>
  );
}

function ActionBtn({
  label,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded border px-2 py-0.5 text-xs disabled:opacity-50 ${
        danger
          ? 'border-red-600 text-red-600 hover:bg-red-50'
          : 'border-blue-600 text-blue-600 hover:bg-blue-50'
      }`}
    >
      {label}
    </button>
  );
}
