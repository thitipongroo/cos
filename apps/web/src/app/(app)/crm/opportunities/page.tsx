'use client';

import { opportunityCreateSchema } from '@cos/schemas';
import { Controller } from 'react-hook-form';
import { NativeSelectField } from '../../../../components/form/NativeSelectField';
import { TextInputField } from '../../../../components/form/TextInputField';
import { DataTable, type Column } from '../../../../components/ui/DataTable';
import { useI18n } from '../../../../i18n';
import {
  useCrmLeads,
  useCrmOpportunities,
  useCreateOpportunity,
  useConvertOpportunity,
} from '../../../../lib/api/queries';
import type { OpportunityRow } from '../../../../lib/api/types';
import { formatDate, formatMoney } from '../../../../lib/format';
import { useValidatedForm } from '../../../../lib/forms';

/** CRM opportunities — create from a lead + convert to customer (§20.7.10 → /crm/opportunities). */
export default function CrmOpportunitiesPage() {
  const { t, locale } = useI18n();
  const leads = useCrmLeads();
  const query = useCrmOpportunities();
  const create = useCreateOpportunity();
  const convert = useConvertOpportunity();
  const {
    control,
    handleSubmit,
    reset,
    getValues,
    formState: { errors, isSubmitting },
  } = useValidatedForm({
    schema: opportunityCreateSchema,
    defaultValues: { lead_id: '', title: '', value: '' },
  });

  const messageFor = (key?: string) => (key ? t(key) : undefined);

  const submit = handleSubmit((values) => {
    create.mutate(
      { lead_id: values.lead_id, title: values.title, value: values.value || undefined },
      // Keep the lead selected — several opportunities against one lead is the normal case.
      { onSuccess: () => reset({ lead_id: getValues('lead_id'), title: '', value: '' }) },
    );
  });

  const columns: Column<OpportunityRow>[] = [
    { headerKey: 'crm.colTitle', cell: (o) => o.title },
    {
      headerKey: 'crm.colValue',
      cell: (o) => (o.value ? formatMoney(locale, o.value, 'THB') : '—'),
    },
    { headerKey: 'table.status', cell: (o) => o.status },
    {
      headerKey: 'crm.colCloseDate',
      cell: (o) => (o.expected_close_date ? formatDate(locale, o.expected_close_date) : '—'),
    },
    {
      headerKey: 'table.actions',
      cell: (o) =>
        o.status === 'OPEN' ? (
          <button
            type="button"
            disabled={convert.isPending}
            onClick={() => convert.mutate(o.opportunity_id)}
            className="rounded border border-green-600 px-2 py-0.5 text-xs text-green-700 hover:bg-green-50 disabled:opacity-50"
          >
            {t('crm.convert')}
          </button>
        ) : (
          o.status
        ),
    },
  ];

  const leadOptions =
    leads.data?.map((l) => ({
      id: l.lead_id,
      label: l.company ?? l.contact_name ?? l.lead_id,
    })) ?? [];

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-gray-800">{t('crm.opportunitiesTitle')}</h1>
      <form onSubmit={submit} noValidate className="mb-6 flex flex-wrap items-start gap-2">
        <Controller
          name="lead_id"
          control={control}
          render={({ field }) => (
            <NativeSelectField
              {...field}
              label={t('crm.selectLead')}
              placeholder={t('crm.selectLead')}
              options={leadOptions}
              errorMessage={messageFor(errors.lead_id?.message)}
            />
          )}
        />
        <Controller
          name="title"
          control={control}
          render={({ field }) => (
            <TextInputField
              {...field}
              label={t('crm.colTitle')}
              errorMessage={messageFor(errors.title?.message)}
            />
          )}
        />
        <Controller
          name="value"
          control={control}
          render={({ field }) => (
            <TextInputField
              {...field}
              label={t('crm.colValue')}
              errorMessage={messageFor(errors.value?.message)}
            />
          )}
        />
        <button
          type="submit"
          disabled={isSubmitting || create.isPending}
          className="mt-6 rounded-md bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {t('crm.createOpportunity')}
        </button>
      </form>
      <DataTable
        columns={columns}
        rows={query.data ?? []}
        rowKey={(o) => o.opportunity_id}
        isLoading={query.isLoading}
      />
    </div>
  );
}
