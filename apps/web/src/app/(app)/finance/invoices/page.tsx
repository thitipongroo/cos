'use client';

import { useState } from 'react';
import { DataTable, type Column } from '../../../../components/ui/DataTable';
import { useI18n } from '../../../../i18n';
import { useApproveInvoice, useFinanceInvoices } from '../../../../lib/api/queries';
import type { FinanceInvoiceRow } from '../../../../lib/api/types';
import { formatDate, formatMoney } from '../../../../lib/format';

const STATUSES = ['RECEIVED', 'VERIFIED', 'APPROVED', 'PAID', 'DISPUTED'];

/** Finance AP invoice queue (§20.7.4). Vendor invoices are owned by procurement
 *  (ADR-023); Finance views and approves them. */
export default function FinanceInvoicesPage() {
  const { t, locale } = useI18n();
  const [status, setStatus] = useState('');
  const query = useFinanceInvoices(status);
  const approve = useApproveInvoice();

  const columns: Column<FinanceInvoiceRow>[] = [
    { headerKey: 'finance.colNumber', cell: (i) => i.invoice_number },
    { headerKey: 'finance.colVendor', cell: (i) => i.vendor_id },
    { headerKey: 'pm.colAmount', cell: (i) => formatMoney(locale, i.amount, i.currency_code) },
    { headerKey: 'finance.colDueDate', cell: (i) => formatDate(locale, i.due_date) },
    {
      headerKey: 'table.status',
      cell: (i) =>
        i.status === 'RECEIVED' || i.status === 'VERIFIED' ? (
          <button
            type="button"
            disabled={approve.isPending}
            onClick={() => approve.mutate(i.invoice_id)}
            className="rounded border border-blue-600 px-2 py-0.5 text-xs text-blue-600 hover:bg-blue-50 disabled:opacity-50"
          >
            {t('finance.approve')}
          </button>
        ) : (
          i.status
        ),
    },
  ];

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-gray-800">{t('finance.invoicesTitle')}</h1>
      <p className="mb-4 text-xs text-gray-400">{t('finance.invoicesHint')}</p>
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="mb-4 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
      >
        <option value="">{t('finance.allStatuses')}</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <DataTable
        columns={columns}
        rows={query.data?.items ?? []}
        rowKey={(i) => i.invoice_id}
        isLoading={query.isLoading}
      />
    </div>
  );
}
