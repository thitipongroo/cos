'use client';

import { useMutation } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { useState } from 'react';
import { useI18n } from '../../../i18n';
import { ApiError, useApi } from '../../../lib/api/client';
import { useProjects } from '../../../lib/api/queries';
import type { AiReportResponse } from '../../../lib/api/types';

/**
 * Executive AI reports (§20.7.1) — POST /api/v1/ai/reports/executive-summary
 * (Kong routes /api/v1/ai → ai-gateway). When the LLM provider is the Phase 11
 * stub the endpoint returns 503; that is surfaced as an honest "unavailable"
 * state rather than an error dump.
 */
export default function ReportsPage() {
  const { t } = useI18n();
  const api = useApi();
  const { data: session } = useSession();
  const projectsQuery = useProjects();
  const projects = projectsQuery.data?.items ?? [];
  const [projectId, setProjectId] = useState('');

  const mutation = useMutation<AiReportResponse, Error>({
    mutationFn: () =>
      api<AiReportResponse>('/ai/reports/executive-summary', {
        method: 'POST',
        body: JSON.stringify({
          project_id: projectId,
          tenant_id: session?.user?.tenantId,
          generated_by: session?.user?.id,
        }),
      }),
  });

  const unavailable = mutation.error instanceof ApiError && mutation.error.status === 503;
  const summary =
    typeof mutation.data?.content.executive_summary === 'string'
      ? (mutation.data.content.executive_summary as string)
      : null;

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold text-gray-800">{t('exec.reportsTitle')}</h1>

      <div className="mb-4 flex gap-2">
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="flex-1 rounded-md border border-gray-300 px-3 py-2"
        >
          <option value="">{t('exec.selectProject')}</option>
          {projects.map((p) => (
            <option key={p.project_id} value={p.project_id}>
              {p.project_name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!projectId || mutation.isPending}
          onClick={() => mutation.mutate()}
          className="rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {mutation.isPending ? t('exec.generating') : t('exec.generate')}
        </button>
      </div>

      {unavailable && (
        <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {t('exec.reportUnavailable')}
        </div>
      )}

      {summary && (
        <article className="rounded-lg border border-gray-200 bg-white p-4">
          {mutation.data?.low_confidence && (
            <p className="mb-2 text-xs font-medium text-amber-600">{t('exec.lowConfidence')}</p>
          )}
          <p className="whitespace-pre-wrap text-sm text-gray-700">{summary}</p>
        </article>
      )}
    </div>
  );
}
