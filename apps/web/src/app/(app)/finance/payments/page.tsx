'use client';

import { DataTable, type Column } from '../../../../components/ui/DataTable';
import { useI18n } from '../../../../i18n';
import { usePayments } from '../../../../lib/api/queries';
import type { PaymentRow } from '../../../../lib/api/types';
import { formatDate, formatMoney } from '../../../../lib/format';

/** Tenant-wide AP payment queue (§20.7.4 → GET /finance/payments, AIP-132). */
export default function PaymentsPage() {
  const { t, locale } = useI18n();
  const query = usePayments('');

  const columns: Column<PaymentRow>[] = [
    { headerKey: 'pm.colNumber', cell: (p) => p.invoice_id },
    { headerKey: 'pm.colAmount', cell: (p) => formatMoney(locale, p.amount, p.currency_code) },
    { headerKey: 'pm.colDate', cell: (p) => formatDate(locale, p.payment_date) },
    { headerKey: 'table.status', cell: (p) => p.status },
    { headerKey: 'finance.colReference', cell: (p) => p.payment_reference ?? '—' },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">{t('finance.paymentsTitle')}</h1>
      <DataTable
        columns={columns}
        rows={query.data?.items ?? []}
        rowKey={(p) => p.payment_id}
        isLoading={query.isLoading}
      />
    </div>
  );
}
