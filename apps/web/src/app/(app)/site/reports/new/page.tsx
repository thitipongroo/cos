'use client';

import { useState } from 'react';
import { useI18n } from '../../../../../i18n';
import { useProjects, useCreateSiteReport } from '../../../../../lib/api/queries';

/** Submit a daily site report — manpower, blockers (§20.7.6 → POST /site/reports). */
export default function NewSiteReportPage() {
  const { t } = useI18n();
  const projects = useProjects();
  const create = useCreateSiteReport();
  const [projectId, setProjectId] = useState('');
  const [reportDate, setReportDate] = useState('');
  const [summary, setSummary] = useState('');
  const [blockers, setBlockers] = useState('');
  const [manpower, setManpower] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate({
      project_id: projectId,
      report_date: reportDate,
      summary: summary || undefined,
      blockers: blockers || undefined,
      manpower_count: manpower ? Number(manpower) : undefined,
    });
  };

  const field = 'w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm';

  return (
    <div className="max-w-lg">
      <h1 className="mb-4 text-2xl font-bold text-gray-800">{t('site.reportsNewTitle')}</h1>
      {create.isSuccess && <p className="mb-3 text-sm text-green-700">{t('site.submitted')}</p>}
      <form onSubmit={submit} className="space-y-3">
        <select
          required
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className={field}
        >
          <option value="">{t('site.selectProject')}</option>
          {projects.data?.items.map((p) => (
            <option key={p.project_id} value={p.project_id}>
              {p.project_name}
            </option>
          ))}
        </select>
        <input
          required
          type="date"
          value={reportDate}
          onChange={(e) => setReportDate(e.target.value)}
          className={field}
          aria-label={t('site.fieldDate')}
        />
        <input
          type="number"
          min={0}
          value={manpower}
          onChange={(e) => setManpower(e.target.value)}
          placeholder={t('site.fieldManpower')}
          className={field}
        />
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder={t('site.fieldSummary')}
          className={field}
          rows={3}
        />
        <textarea
          value={blockers}
          onChange={(e) => setBlockers(e.target.value)}
          placeholder={t('site.fieldBlockers')}
          className={field}
          rows={2}
        />
        <button
          type="submit"
          disabled={create.isPending || !projectId || !reportDate}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {t('site.submit')}
        </button>
      </form>
    </div>
  );
}
