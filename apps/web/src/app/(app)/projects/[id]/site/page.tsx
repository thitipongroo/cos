'use client';
import { use } from 'react';

import { ProjectTabs } from '../../../../../components/project/ProjectTabs';
import { DataTable, type Column } from '../../../../../components/ui/DataTable';
import { useI18n } from '../../../../../i18n';
import { useProjectIssues, useProjectSiteReports } from '../../../../../lib/api/queries';
import type { IssueRow, SiteReportRow } from '../../../../../lib/api/types';
import { formatDate } from '../../../../../lib/format';

/** PM read-only site summary for a project (§20.7.2 → Phase 6): reports + issue triage. */
export default function ProjectSitePage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const { id } = params;
  const { t, locale } = useI18n();
  const reportsQuery = useProjectSiteReports(id);
  const issuesQuery = useProjectIssues(id);

  const reportCols: Column<SiteReportRow>[] = [
    { headerKey: 'pm.colDate', cell: (r) => formatDate(locale, r.report_date) },
    { headerKey: 'table.status', cell: (r) => r.status },
    { headerKey: 'pm.colManpower', cell: (r) => (r.manpower_count ?? '—').toString() },
  ];
  const issueCols: Column<IssueRow>[] = [
    { headerKey: 'table.title', cell: (i) => i.title },
    { headerKey: 'table.severity', cell: (i) => i.severity },
    { headerKey: 'table.status', cell: (i) => i.status },
  ];

  return (
    <div>
      <ProjectTabs id={id} />
      <h1 className="mb-6 text-2xl font-bold text-gray-800">{t('pm.siteTitle')}</h1>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold uppercase text-gray-500">
          {t('nav.site.reports')}
        </h2>
        <DataTable
          columns={reportCols}
          rows={reportsQuery.data?.items ?? []}
          rowKey={(r) => r.report_id}
          isLoading={reportsQuery.isLoading}
        />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase text-gray-500">{t('pm.openIssues')}</h2>
        <DataTable
          columns={issueCols}
          rows={issuesQuery.data?.items ?? []}
          rowKey={(i) => i.issue_id}
          isLoading={issuesQuery.isLoading}
        />
      </section>
    </div>
  );
}
