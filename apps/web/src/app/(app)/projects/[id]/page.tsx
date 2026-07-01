'use client';

import { useState, use } from 'react';
import { DataTable, type Column } from '../../../../components/ui/DataTable';
import { StatusChip } from '../../../../components/ui/StatusChip';
import { ProjectTabs } from '../../../../components/project/ProjectTabs';
import { ReadOnlyBanner } from '../../../../components/ui/ReadOnlyBanner';
import { useI18n } from '../../../../i18n';
import { useReadOnly } from '../../../../lib/auth/useReadOnly';
import {
  useBoqVersions,
  useProject,
  useProjectDocuments,
  useProjectMembers,
  useTransitionProject,
} from '../../../../lib/api/queries';
import type {
  BoqVersionRow,
  ProjectDocumentRow,
  ProjectMemberRow,
  ProjectTransitionTarget,
} from '../../../../lib/api/types';
import { formatDate, formatMoney } from '../../../../lib/format';

const TRANSITIONS: ProjectTransitionTarget[] = ['ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'];

/** PM project detail (§20.7.2): status + transition, members, documents, BOQ summary. */
export default function ProjectDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const { id } = params;
  const { t, locale } = useI18n();
  const readOnly = useReadOnly();
  const projectQuery = useProject(id);
  const membersQuery = useProjectMembers(id);
  const documentsQuery = useProjectDocuments(id);
  const boqQuery = useBoqVersions(id);
  const transition = useTransitionProject(id);

  const [target, setTarget] = useState<ProjectTransitionTarget>('ACTIVE');
  const [reason, setReason] = useState('');

  const project = projectQuery.data;

  const memberCols: Column<ProjectMemberRow>[] = [
    { headerKey: 'pm.colRole', cell: (m) => m.role },
    { headerKey: 'pm.members', cell: (m) => m.user_id },
  ];
  const docCols: Column<ProjectDocumentRow>[] = [
    { headerKey: 'pm.documents', cell: (d) => d.document_type ?? d.document_id },
    { headerKey: 'pm.colDate', cell: (d) => formatDate(locale, d.uploaded_at) },
  ];
  const boqCols: Column<BoqVersionRow>[] = [
    { headerKey: 'pm.colVersion', cell: (v) => `v${v.version_number}` },
    { headerKey: 'table.status', cell: (v) => v.status },
    {
      headerKey: 'pm.colAmount',
      cell: (v) => formatMoney(locale, v.total_estimated_amount, v.total_estimated_currency),
    },
  ];

  return (
    <div>
      <ProjectTabs id={id} />

      {project && (
        <div className="mb-6 flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-800">{project.project_name}</h1>
          <span className="text-sm text-gray-400">{project.project_code}</span>
          <StatusChip status={project.status} />
        </div>
      )}

      <ReadOnlyBanner />

      {!readOnly && (
        <section className="mb-8 rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase text-gray-500">
            {t('pm.transition')}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value as ProjectTransitionTarget)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {TRANSITIONS.map((tr) => (
                <option key={tr} value={tr}>
                  {t(`projectStatus.${tr}`)}
                </option>
              ))}
            </select>
            <input
              placeholder={t('pm.reason')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={transition.isPending}
              onClick={() => transition.mutate({ to: target, reason: reason || undefined })}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {t('pm.apply')}
            </button>
          </div>
        </section>
      )}

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold uppercase text-gray-500">{t('pm.boqSummary')}</h2>
        <DataTable
          columns={boqCols}
          rows={boqQuery.data ?? []}
          rowKey={(v) => v.version_id}
          isLoading={boqQuery.isLoading}
        />
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold uppercase text-gray-500">{t('pm.members')}</h2>
        <DataTable
          columns={memberCols}
          rows={membersQuery.data ?? []}
          rowKey={(m) => m.membership_id}
          isLoading={membersQuery.isLoading}
        />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase text-gray-500">{t('pm.documents')}</h2>
        <DataTable
          columns={docCols}
          rows={documentsQuery.data ?? []}
          rowKey={(d) => d.document_id}
          isLoading={documentsQuery.isLoading}
        />
      </section>
    </div>
  );
}
