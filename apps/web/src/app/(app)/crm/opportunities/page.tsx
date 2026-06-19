'use client';

import { useState } from 'react';
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

/** CRM opportunities — create from a lead + convert to customer (§20.7.10 → /crm/opportunities). */
export default function CrmOpportunitiesPage() {
  const { t, locale } = useI18n();
  const leads = useCrmLeads();
  const query = useCrmOpportunities();
  const create = useCreateOpportunity();
  const convert = useConvertOpportunity();
  const [leadId, setLeadId] = useState('');
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(
      { lead_id: leadId, title, value: value || undefined },
      {
        onSuccess: () => {
          setTitle('');
          setValue('');
        },
      },
    );
  };

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

  const field = 'rounded-md border border-gray-300 px-3 py-1.5 text-sm';

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-gray-800">{t('crm.opportunitiesTitle')}</h1>
      <form onSubmit={submit} className="mb-6 flex flex-wrap items-center gap-2">
        <select
          required
          value={leadId}
          onChange={(e) => setLeadId(e.target.value)}
          className={field}
        >
          <option value="">{t('crm.selectLead')}</option>
          {leads.data?.map((l) => (
            <option key={l.lead_id} value={l.lead_id}>
              {l.company ?? l.contact_name ?? l.lead_id}
            </option>
          ))}
        </select>
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('crm.colTitle')}
          className={field}
        />
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t('crm.colValue')}
          className={field}
        />
        <button
          type="submit"
          disabled={create.isPending || !leadId || !title}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
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
