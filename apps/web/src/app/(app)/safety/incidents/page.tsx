'use client';

import { useState } from 'react';
import { DataTable, type Column } from '../../../../components/ui/DataTable';
import { useI18n } from '../../../../i18n';
import {
  useProjects,
  useIncidents,
  useReportIncident,
  useAcknowledgeIncident,
} from '../../../../lib/api/queries';
import type { IncidentRow, IncidentSeverity } from '../../../../lib/api/types';
import { formatDate } from '../../../../lib/format';

const SEVERITIES: IncidentSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/** Report and track safety incidents (§20.7.7 → /safety/incidents). */
export default function SafetyIncidentsPage() {
  const { t, locale } = useI18n();
  const projects = useProjects();
  const query = useIncidents();
  const report = useReportIncident();
  const ack = useAcknowledgeIncident();
  const [projectId, setProjectId] = useState('');
  const [type, setType] = useState('');
  const [severity, setSeverity] = useState<IncidentSeverity>('MEDIUM');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    report.mutate({ project_id: projectId, incident_type: type, severity });
    setType('');
  };

  const columns: Column<IncidentRow>[] = [
    { headerKey: 'safety.colType', cell: (i) => i.incident_type },
    { headerKey: 'site.colSeverity', cell: (i) => i.severity },
    { headerKey: 'table.status', cell: (i) => i.status },
    { headerKey: 'site.colDate', cell: (i) => formatDate(locale, i.created_at) },
    {
      headerKey: 'table.actions',
      cell: (i) =>
        i.status === 'OPEN' ? (
          <button
            type="button"
            disabled={ack.isPending}
            onClick={() => ack.mutate(i.incident_id)}
            className="rounded border border-blue-600 px-2 py-0.5 text-xs text-blue-600 hover:bg-blue-50 disabled:opacity-50"
          >
            {t('safety.acknowledge')}
          </button>
        ) : (
          '—'
        ),
    },
  ];

  const field = 'rounded-md border border-gray-300 px-3 py-1.5 text-sm';

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-gray-800">{t('safety.incidentsTitle')}</h1>
      <form onSubmit={submit} className="mb-6 flex flex-wrap items-center gap-2">
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
          value={type}
          onChange={(e) => setType(e.target.value)}
          placeholder={t('safety.colType')}
          className={field}
        />
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value as IncidentSeverity)}
          className={field}
        >
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={report.isPending || !projectId || !type}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {t('safety.report')}
        </button>
      </form>
      <DataTable
        columns={columns}
        rows={query.data?.items ?? []}
        rowKey={(i) => i.incident_id}
        isLoading={query.isLoading}
      />
    </div>
  );
}
