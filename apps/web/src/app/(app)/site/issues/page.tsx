'use client';

import { useState } from 'react';
import { DataTable, type Column } from '../../../../components/ui/DataTable';
import { useI18n } from '../../../../i18n';
import { useIssues } from '../../../../lib/api/queries';
import type { IssueRow } from '../../../../lib/api/types';
import { formatDate } from '../../../../lib/format';

const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

/** Issue list, triage and escalation (§20.7.5 → GET /site/issues). */
export default function SiteIssuesPage() {
  const { t, locale } = useI18n();
  const [status, setStatus] = useState('');
  const query = useIssues(status || undefined);

  const columns: Column<IssueRow>[] = [
    { headerKey: 'site.colTitle', cell: (i) => i.title },
    { headerKey: 'site.colSeverity', cell: (i) => i.severity },
    { headerKey: 'table.status', cell: (i) => i.status },
    { headerKey: 'site.colDate', cell: (i) => formatDate(locale, i.created_at) },
  ];

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-gray-800">{t('site.issuesTitle')}</h1>
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="mb-4 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
      >
        <option value="">{t('site.allStatuses')}</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <DataTable
        columns={columns}
        rows={query.data?.items ?? []}
        rowKey={(i) => i.issue_id}
        isLoading={query.isLoading}
      />
    </div>
  );
}
