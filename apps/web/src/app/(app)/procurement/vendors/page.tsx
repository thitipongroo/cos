'use client';

import { DataTable, type Column } from '../../../../components/ui/DataTable';
import { useI18n } from '../../../../i18n';
import { useVendors, useVendorScore } from '../../../../lib/api/queries';
import type { VendorRow } from '../../../../lib/api/types';

/** Vendor master + scorecard grade (§20.7.3 → GET /vendors; per-row grade → GET /vendors/:id/score, G-W5). */
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
    { headerKey: 'proc.colScore', cell: (v) => <VendorScoreCell vendorId={v.vendor_id} /> },
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

// Per-vendor scorecard grade (lazy; React Query caches per vendorId). "—" when the vendor has no
// scoring data yet (new vendor / no deliveries, invoices or quotations).
function VendorScoreCell({ vendorId }: { vendorId: string }) {
  const q = useVendorScore(vendorId);
  if (q.isLoading) return <span className="text-gray-300">…</span>;
  const grade = q.data?.grade ?? null;
  if (!grade) return <span className="text-gray-400">—</span>;
  const color =
    grade === 'A' || grade === 'B'
      ? 'text-green-700'
      : grade === 'C'
        ? 'text-amber-600'
        : 'text-red-600';
  return <span className={`font-semibold ${color}`}>{grade}</span>;
}
