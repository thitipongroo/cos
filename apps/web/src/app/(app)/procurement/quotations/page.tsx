'use client';

import { useState } from 'react';
import { DataTable, type Column } from '../../../../components/ui/DataTable';
import { useI18n } from '../../../../i18n';
import { useAllRfqs, useAwardRfq, useQuotations } from '../../../../lib/api/queries';
import type { QuotationRow } from '../../../../lib/api/types';
import { formatMoney } from '../../../../lib/format';

/**
 * Quotation comparison (§20.7.3). Quotations are RFQ-scoped in the backend:
 * GET /rfqs/{id}/quotations requires the RFQ to be CLOSED; award (POST
 * /rfqs/{id}/award) requires EVALUATED. The page surfaces those constraints
 * via a hint rather than hiding them.
 */
export default function QuotationsPage() {
  const { t, locale } = useI18n();
  const [rfqId, setRfqId] = useState('');
  const rfqsQuery = useAllRfqs({});
  const quotationsQuery = useQuotations(rfqId);
  const award = useAwardRfq(rfqId);

  const columns: Column<QuotationRow>[] = [
    { headerKey: 'proc.colVendor', cell: (q) => q.vendor_id },
    {
      headerKey: 'pm.colAmount',
      cell: (q) => formatMoney(locale, q.total_amount, q.currency_code),
    },
    { headerKey: 'proc.colValidity', cell: (q) => String(q.validity_days) },
    {
      headerKey: 'table.status',
      cell: (q) =>
        q.is_selected ? (
          <span className="font-medium text-green-700">{t('proc.selected')}</span>
        ) : (
          <button
            type="button"
            disabled={award.isPending}
            onClick={() => award.mutate(q.quotation_id)}
            className="rounded border border-blue-600 px-2 py-0.5 text-xs text-blue-600 hover:bg-blue-50 disabled:opacity-50"
          >
            {t('proc.award')}
          </button>
        ),
    },
  ];

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-gray-800">{t('proc.quotationsTitle')}</h1>
      <p className="mb-4 text-xs text-gray-400">{t('proc.quotationsHint')}</p>

      <select
        value={rfqId}
        onChange={(e) => setRfqId(e.target.value)}
        className="mb-4 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
      >
        <option value="">{t('proc.selectRfq')}</option>
        {(rfqsQuery.data?.items ?? []).map((r) => (
          <option key={r.rfq_id} value={r.rfq_id}>
            {r.rfq_number} ({r.status})
          </option>
        ))}
      </select>

      {rfqId !== '' && (
        <DataTable
          columns={columns}
          rows={quotationsQuery.data ?? []}
          rowKey={(q) => q.quotation_id}
          isLoading={quotationsQuery.isLoading}
        />
      )}
    </div>
  );
}
