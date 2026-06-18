'use client';

import { DataTable, type Column } from '../../../../components/ui/DataTable';
import { useI18n } from '../../../../i18n';
import { useVendors } from '../../../../lib/api/queries';
import type { VendorRow } from '../../../../lib/api/types';

/** Vendor master (§20.7.3 → GET /vendors, tenant-wide). */
export default function VendorsPage() {
  const { t } = useI18n();
  const query = useVendors();

  const columns: Column<VendorRow>[] = [
    { headerKey: 'proc.colCode', cell: (v) => v.vendor_code },
    { headerKey: 'proc.colName', cell: (v) => v.vendor_name },
    { headerKey: 'proc.colContact', cell: (v) => v.contact_email ?? v.contact_phone ?? '—' },
    {
      headerKey: 'table.status',
      cell: (v) => (
        <span className={v.is_active ? 'text-green-700' : 'text-gray-400'}>
          {v.is_active ? t('proc.active') : t('proc.inactive')}
        </span>
      ),
    },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">{t('proc.vendorsTitle')}</h1>
      <DataTable
        columns={columns}
        rows={query.data ?? []}
        rowKey={(v) => v.vendor_id}
        isLoading={query.isLoading}
      />
    </div>
  );
}
