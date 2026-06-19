'use client';

import { useState } from 'react';
import { DataTable, type Column } from '../../../../components/ui/DataTable';
import { useI18n } from '../../../../i18n';
import { useCrmLeads, useCreateLead } from '../../../../lib/api/queries';
import type { LeadRow } from '../../../../lib/api/types';
import { formatDate } from '../../../../lib/format';

/** CRM leads — list + create (§20.7.10 → /crm/leads, ADR-029). */
export default function CrmLeadsPage() {
  const { t, locale } = useI18n();
  const query = useCrmLeads();
  const create = useCreateLead();
  const [contactName, setContactName] = useState('');
  const [company, setCompany] = useState('');
  const [source, setSource] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(
      {
        contact_name: contactName || undefined,
        company: company || undefined,
        source: source || undefined,
      },
      {
        onSuccess: () => {
          setContactName('');
          setCompany('');
          setSource('');
        },
      },
    );
  };

  const columns: Column<LeadRow>[] = [
    { headerKey: 'crm.colContact', cell: (l) => l.contact_name ?? '—' },
    { headerKey: 'crm.colCompany', cell: (l) => l.company ?? '—' },
    { headerKey: 'table.status', cell: (l) => l.status },
    { headerKey: 'crm.colSource', cell: (l) => l.source ?? '—' },
    { headerKey: 'site.colDate', cell: (l) => formatDate(locale, l.created_at) },
  ];

  const field = 'rounded-md border border-gray-300 px-3 py-1.5 text-sm';

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-gray-800">{t('crm.leadsTitle')}</h1>
      <form onSubmit={submit} className="mb-6 flex flex-wrap items-center gap-2">
        <input
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          placeholder={t('crm.colContact')}
          className={field}
        />
        <input
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder={t('crm.colCompany')}
          className={field}
        />
        <input
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder={t('crm.colSource')}
          className={field}
        />
        <button
          type="submit"
          disabled={create.isPending || (!contactName && !company)}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
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
