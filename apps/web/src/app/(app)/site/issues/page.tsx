'use client';

import { useState } from 'react';
import { DataTable, type Column } from '../../../../components/ui/DataTable';
import { useI18n } from '../../../../i18n';
import { useIssues, useEscalateIssue } from '../../../../lib/api/queries';
import type { IssueRow } from '../../../../lib/api/types';
import { formatDate } from '../../../../lib/format';
import { useReadOnly } from '../../../../lib/auth/useReadOnly';

const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

/** Issue list, triage and escalation (§20.7.5 → GET /site/issues; escalate → POST .../escalate). */
export default function SiteIssuesPage() {
  const { t, locale } = useI18n();
  const [status, setStatus] = useState('');
  const query = useIssues(status || undefined);
  const escalate = useEscalateIssue();
  const readOnly = useReadOnly();

  const columns: Column<IssueRow>[] = [
    { headerKey: 'site.colTitle', cell: (i) => i.title },
    { headerKey: 'site.colSeverity', cell: (i) => i.severity },
    { headerKey: 'table.status', cell: (i) => i.status },
    { headerKey: 'site.colDate', cell: (i) => formatDate(locale, i.created_at) },
    ...(readOnly
      ? []
      : [
          {
            headerKey: 'table.actions' as const,
            cell: (i: IssueRow) =>
              i.status === 'OPEN' || i.status === 'IN_PROGRESS' ? (
                <button
                  type="button"
                  disabled={escalate.isPending}
                  onClick={() => escalate.mutate(i.issue_id)}
                  className="rounded border border-amber-600 px-2 py-0.5 text-xs text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                >
                  {t('site.escalate')}
                </button>
              ) : (
                '—'
              ),
          },
        ]),
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
