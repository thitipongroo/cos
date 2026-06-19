'use client';

import { DataTable, type Column } from '../../../../components/ui/DataTable';
import { useI18n } from '../../../../i18n';
import { useSiteReports } from '../../../../lib/api/queries';
import type { SiteReportRow } from '../../../../lib/api/types';
import { formatDate } from '../../../../lib/format';

/** Daily site reports review + manpower overview (§20.7.5 → GET /site/reports). */
export default function SiteReportsPage() {
  const { t, locale } = useI18n();
  const query = useSiteReports();

  const columns: Column<SiteReportRow>[] = [
    { headerKey: 'site.colDate', cell: (r) => formatDate(locale, r.report_date) },
    { headerKey: 'table.status', cell: (r) => r.status },
    { headerKey: 'site.colManpower', cell: (r) => r.manpower_count ?? '—' },
    { headerKey: 'site.colSummary', cell: (r) => r.summary ?? '—' },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">{t('site.reportsTitle')}</h1>
      <DataTable
        columns={columns}
        rows={query.data?.items ?? []}
        rowKey={(r) => r.report_id}
        isLoading={query.isLoading}
      />
    </div>
  );
}
