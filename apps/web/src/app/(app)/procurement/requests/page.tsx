'use client';

import { useState } from 'react';
import { DataTable, type Column } from '../../../../components/ui/DataTable';
import { useI18n } from '../../../../i18n';
import { useAllPurchaseRequests } from '../../../../lib/api/queries';
import type { PurchaseRequestRow } from '../../../../lib/api/types';
import { formatDate } from '../../../../lib/format';

const STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PO_CREATED'];

/** Tenant-wide purchase requests inbox (§20.7.3 → GET /purchase-requests, AIP-132). */
export default function PurchaseRequestsPage() {
  const { t, locale } = useI18n();
  const [status, setStatus] = useState('');
  const query = useAllPurchaseRequests({ status: status || undefined });

  const columns: Column<PurchaseRequestRow>[] = [
    { headerKey: 'pm.colNumber', cell: (r) => r.pr_number },
    { headerKey: 'table.status', cell: (r) => r.status },
    { headerKey: 'pm.colDate', cell: (r) => formatDate(locale, r.required_date) },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">{t('proc.requestsTitle')}</h1>
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
        rowKey={(r) => r.pr_id}
        isLoading={query.isLoading}
      />
    </div>
  );
}
