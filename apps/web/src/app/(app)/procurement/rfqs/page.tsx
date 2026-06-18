'use client';

import { useState } from 'react';
import { DataTable, type Column } from '../../../../components/ui/DataTable';
import { useI18n } from '../../../../i18n';
import { useAllRfqs } from '../../../../lib/api/queries';
import type { RfqRow } from '../../../../lib/api/types';
import { formatDate } from '../../../../lib/format';

const STATUSES = ['DRAFT', 'PUBLISHED', 'CLOSED', 'EVALUATED', 'AWARDED', 'CANCELLED'];

/** Tenant-wide RFQ inbox (§20.7.3 → GET /rfqs, AIP-132). */
export default function RfqsPage() {
  const { t, locale } = useI18n();
  const [status, setStatus] = useState('');
  const query = useAllRfqs({ status: status || undefined });

  const columns: Column<RfqRow>[] = [
    { headerKey: 'pm.colNumber', cell: (r) => r.rfq_number },
    { headerKey: 'table.status', cell: (r) => r.status },
    { headerKey: 'pm.colDeadline', cell: (r) => formatDate(locale, r.deadline) },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">{t('proc.rfqsTitle')}</h1>
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
        rowKey={(r) => r.rfq_id}
        isLoading={query.isLoading}
      />
    </div>
  );
}
