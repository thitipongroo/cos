'use client';

import Link from 'next/link';
import { DataTable, type Column } from '../../../../components/ui/DataTable';
import { useI18n } from '../../../../i18n';
import { useAllDeliveries } from '../../../../lib/api/queries';
import type { DeliveryRow } from '../../../../lib/api/types';
import { formatDate } from '../../../../lib/format';
import { useReadOnly } from '../../../../lib/auth/useReadOnly';

/** Tenant-wide deliveries inbox (§20.7.3 → GET /deliveries, AIP-132). */
export default function DeliveriesPage() {
  const { t, locale } = useI18n();
  const query = useAllDeliveries('');
  const readOnly = useReadOnly();

  const columns: Column<DeliveryRow>[] = [
    { headerKey: 'proc.colPo', cell: (r) => r.po_id },
    { headerKey: 'proc.colDeliveryNote', cell: (r) => r.delivery_note ?? '—' },
    { headerKey: 'pm.colDate', cell: (r) => formatDate(locale, r.delivered_at) },
  ];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">{t('proc.deliveriesTitle')}</h1>
        {!readOnly && (
          <Link
            href="/procurement/deliveries/new"
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700"
          >
            {t('proc.recordDelivery')}
          </Link>
        )}
      </div>
      <DataTable
        columns={columns}
        rows={query.data?.items ?? []}
        rowKey={(r) => r.delivery_id}
        isLoading={query.isLoading}
      />
    </div>
  );
}
