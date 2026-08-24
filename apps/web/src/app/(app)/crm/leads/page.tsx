'use client';

import { leadCreateSchema } from '@cos/schemas';
import { Controller } from 'react-hook-form';
import { TextInputField } from '../../../../components/form/TextInputField';
import { DataTable, type Column } from '../../../../components/ui/DataTable';
import { useI18n } from '../../../../i18n';
import { useCrmLeads, useCreateLead } from '../../../../lib/api/queries';
import type { LeadRow } from '../../../../lib/api/types';
import { formatDate } from '../../../../lib/format';
import { useValidatedForm } from '../../../../lib/forms';

/** CRM leads — list + create (§20.7.10 → /crm/leads, ADR-029). */
export default function CrmLeadsPage() {
  const { t, locale } = useI18n();
  const query = useCrmLeads();
  const create = useCreateLead();
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useValidatedForm({
    schema: leadCreateSchema,
    defaultValues: { contact_name: '', company: '', source: '' },
  });

  const messageFor = (key?: string) => (key ? t(key) : undefined);

  const submit = handleSubmit((values) => {
    // Empty strings become undefined so the API receives no key at all rather than a blank one —
    // CreateLeadInput declares every field optional.
    create.mutate(
      {
        contact_name: values.contact_name || undefined,
        company: values.company || undefined,
        source: values.source || undefined,
      },
      { onSuccess: () => reset({ contact_name: '', company: '', source: '' }) },
    );
  });

  const columns: Column<LeadRow>[] = [
    { headerKey: 'crm.colContact', cell: (l) => l.contact_name ?? '—' },
    { headerKey: 'crm.colCompany', cell: (l) => l.company ?? '—' },
    { headerKey: 'table.status', cell: (l) => l.status },
    { headerKey: 'crm.colSource', cell: (l) => l.source ?? '—' },
    { headerKey: 'site.colDate', cell: (l) => formatDate(locale, l.created_at) },
  ];

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-gray-800">{t('crm.leadsTitle')}</h1>
      <form onSubmit={submit} noValidate className="mb-6 flex flex-wrap items-start gap-2">
        <Controller
          name="contact_name"
          control={control}
          render={({ field }) => (
            <TextInputField
              {...field}
              label={t('crm.colContact')}
              errorMessage={messageFor(errors.contact_name?.message)}
            />
          )}
        />
        <Controller
          name="company"
          control={control}
          render={({ field }) => (
            <TextInputField
              {...field}
              label={t('crm.colCompany')}
              errorMessage={messageFor(errors.company?.message)}
            />
          )}
        />
        <Controller
          name="source"
          control={control}
          render={({ field }) => (
            <TextInputField
              {...field}
              label={t('crm.colSource')}
              errorMessage={messageFor(errors.source?.message)}
            />
          )}
        />
        {/* The button is no longer disabled on "contact or company empty": the schema owns that
            rule now, and a disabled submit gives a screen-reader user no reason why. */}
        <button
          type="submit"
          disabled={isSubmitting || create.isPending}
          className="mt-6 rounded-md bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {t('crm.createLead')}
        </button>
      </form>
      <DataTable
        columns={columns}
        rows={query.data ?? []}
        rowKey={(l) => l.lead_id}
        isLoading={query.isLoading}
      />
    </div>
  );
}
