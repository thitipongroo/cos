'use client';

import { DataTable, type Column } from '../../../components/ui/DataTable';
import { useI18n } from '../../../i18n';
import { useVendorQuotations, type VendorQuotation } from '../../../lib/api/vendor';

/** Tier-2: submitted-quotation history for the vendor (§20.7.12 → GET /vendor/quotations). */
export default function VendorQuotationsPage() {
  const { t } = useI18n();
  const query = useVendorQuotations();

  const columns: Column<VendorQuotation>[] = [
    { headerKey: 'vendor.rfqNumber', cell: (q) => q.rfq_id },
    { headerKey: 'vendor.totalAmount', cell: (q) => `${q.total_amount} ${q.currency_code}` },
    { headerKey: 'vendor.validityDays', cell: (q) => String(q.validity_days) },
    {
      headerKey: 'vendor.submittedAt',
      cell: (q) => new Date(q.submitted_at).toLocaleDateString(),
    },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t('vendor.quotations')}</h1>
      <DataTable
        columns={columns}
        rows={query.data ?? []}
        rowKey={(q) => q.quotation_id}
        isLoading={query.isLoading}
        emptyKey="vendor.noQuotations"
      />
    </div>
  );
}
