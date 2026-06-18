'use client';

import { useMemo } from 'react';
import { useI18n } from '../../../i18n';
import { useCriticalIssues, useExecutiveDashboard, useProjects } from '../../../lib/api/queries';
import { defaultDateRange, formatPercent } from '../../../lib/format';

/**
 * Executive risk alerts (§20.7.1) — budget overrun (at-risk projects from
 * executive analytics) and open critical issues. Delay-risk alerts derive from
 * the AI delay-risk endpoint (ai-gateway) and are added once the LLM provider
 * is configured; they are intentionally not fabricated here.
 */
export default function AlertsPage() {
  const { t, locale } = useI18n();
  const dateRange = useMemo(() => defaultDateRange(), []);

  const projectsQuery = useProjects();
  const projects = projectsQuery.data?.items ?? [];
  const nameById = useMemo(
    () => new Map(projects.map((p) => [p.project_id, p.project_name])),
    [projects],
  );
  const projectIds = useMemo(() => projects.map((p) => p.project_id), [projects]);

  const execQuery = useExecutiveDashboard(projectIds, dateRange);
  const atRisk = (execQuery.data ?? []).filter((r) => r.atRisk);
  const criticalQuery = useCriticalIssues();
  const criticalIssues = criticalQuery.data?.items ?? [];

  const hasAlerts = atRisk.length > 0 || criticalIssues.length > 0;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-800">{t('exec.alertsTitle')}</h1>

      {!hasAlerts && !execQuery.isLoading && !criticalQuery.isLoading && (
        <p className="text-sm text-gray-400">{t('exec.noAlerts')}</p>
      )}

      {atRisk.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase text-gray-500">
            {t('exec.alertsBudget')}
          </h2>
          <ul className="space-y-2">
            {atRisk.map((r) => (
              <li
                key={r.projectId}
                className="flex items-center justify-between rounded border border-red-200 bg-red-50 px-4 py-2 text-sm"
              >
                <span className="text-gray-800">{nameById.get(r.projectId) ?? r.projectId}</span>
                <span className="font-semibold text-red-600">
                  {formatPercent(locale, r.utilizationPct)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {criticalIssues.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase text-gray-500">
            {t('exec.alertsCritical')}
          </h2>
          <ul className="space-y-2">
            {criticalIssues.map((issue) => (
              <li
                key={issue.issue_id}
                className="rounded border border-orange-200 bg-orange-50 px-4 py-2 text-sm"
              >
                <span className="font-medium text-gray-800">{issue.title}</span>
                <span className="ml-2 text-gray-500">
                  {nameById.get(issue.project_id) ?? issue.project_id}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
