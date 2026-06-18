'use client';

import { useState } from 'react';
import { DataTable, type Column } from '../../../../components/ui/DataTable';
import { useI18n } from '../../../../i18n';
import { useAllPurchaseOrders } from '../../../../lib/api/queries';
import type { PurchaseOrderRow } from '../../../../lib/api/types';

const STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'SENT',
  'ACKNOWLEDGED',
  'PARTIALLY_DELIVERED',
  'FULLY_DELIVERED',
  'INVOICED',
  'PAID',
  'DISPUTED',
];

/** Tenant-wide purchase orders inbox (§20.7.3 → GET /purchase-orders, AIP-132). */
export default function PurchaseOrdersPage() {
  const { t } = useI18n();
  const [status, setStatus] = useState('');
  const query = useAllPurchaseOrders({ status: status || undefined });

  const columns: Column<PurchaseOrderRow>[] = [
    { headerKey: 'pm.colNumber', cell: (r) => r.po_number },
    { headerKey: 'table.status', cell: (r) => r.status },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">{t('proc.ordersTitle')}</h1>
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="mb-4 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
      >
        <option value="">{t('proc.allStatuses')}</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <DataTable
        columns={columns}
        rows={query.data?.items ?? []}
        rowKey={(r) => r.po_id}
        isLoading={query.isLoading}
      />
    </div>
  );
}
