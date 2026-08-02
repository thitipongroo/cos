'use client';

import { incidentReportSchema } from '@cos/schemas';
import { Controller } from 'react-hook-form';
import { NativeSelectField } from '../../../../components/form/NativeSelectField';
import { TextInputField } from '../../../../components/form/TextInputField';
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
import { useReadOnly } from '../../../../lib/auth/useReadOnly';
import { useValidatedForm } from '../../../../lib/forms';

const SEVERITIES: IncidentSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/** Report and track safety incidents (§20.7.7 → /safety/incidents). */
export default function SafetyIncidentsPage() {
  const { t, locale } = useI18n();
  const projects = useProjects();
  const query = useIncidents();
  const report = useReportIncident();
  const ack = useAcknowledgeIncident();
  const readOnly = useReadOnly();

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useValidatedForm({
    schema: incidentReportSchema,
    defaultValues: { project_id: '', incident_type: '', severity: 'MEDIUM' as const },
  });

  const messageFor = (key?: string) => (key ? t(key) : undefined);

  const submit = handleSubmit((values) => {
    report.mutate(values);
    // Keep the project and severity so a second incident on the same site is one field of typing;
    // only the description of what happened is cleared.
    reset({ ...values, incident_type: '' });
  });

  const columns: Column<IncidentRow>[] = [
    { headerKey: 'safety.colType', cell: (i) => i.incident_type },
    { headerKey: 'site.colSeverity', cell: (i) => i.severity },
    { headerKey: 'table.status', cell: (i) => i.status },
    { headerKey: 'site.colDate', cell: (i) => formatDate(locale, i.created_at) },
    {
      headerKey: 'table.actions',
      cell: (i) =>
        i.status === 'OPEN' && !readOnly ? (
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

  const projectOptions =
    projects.data?.items.map((p) => ({ id: p.project_id, label: p.project_name })) ?? [];

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-gray-800">{t('safety.incidentsTitle')}</h1>
      {/* items-start, not items-center: each field now carries a label above and an error below, so
          centring would leave the inputs on different baselines. */}
      <form onSubmit={submit} noValidate className="mb-6 flex flex-wrap items-start gap-2">
        <Controller
          name="project_id"
          control={control}
          render={({ field }) => (
            <NativeSelectField
              {...field}
              label={t('site.selectProject')}
              placeholder={t('site.selectProject')}
              options={projectOptions}
              errorMessage={messageFor(errors.project_id?.message)}
            />
          )}
        />
        <Controller
          name="incident_type"
          control={control}
          render={({ field }) => (
            <TextInputField
              {...field}
              label={t('safety.colType')}
              errorMessage={messageFor(errors.incident_type?.message)}
            />
          )}
        />
        <Controller
          name="severity"
          control={control}
          render={({ field }) => (
            <NativeSelectField
              {...field}
              label={t('site.colSeverity')}
              options={SEVERITIES.map((s) => ({ id: s, label: s }))}
              errorMessage={messageFor(errors.severity?.message)}
            />
          )}
        />
        <button
          type="submit"
          disabled={isSubmitting || report.isPending}
          className="mt-6 rounded-md bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
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
