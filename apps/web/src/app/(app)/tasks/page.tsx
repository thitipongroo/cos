'use client';

import { useState } from 'react';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { useI18n } from '../../../i18n';
import { useProjects, useTasks, useUpdateTask } from '../../../lib/api/queries';
import type { TaskRow } from '../../../lib/api/types';
import { useReadOnly } from '../../../lib/auth/useReadOnly';

/** Assigned tasks + progress update (§20.7.6 → /projects/:id/tasks, PATCH /tasks/:id). */
export default function TasksPage() {
  const { t } = useI18n();
  const projects = useProjects();
  const [projectId, setProjectId] = useState('');
  const tasks = useTasks(projectId);
  const update = useUpdateTask();
  const readOnly = useReadOnly();

  const columns: Column<TaskRow>[] = [
    { headerKey: 'site.colTaskName', cell: (tk) => tk.task_name },
    { headerKey: 'table.status', cell: (tk) => tk.status },
    { headerKey: 'site.colProgress', cell: (tk) => `${tk.progress_percent}%` },
    {
      headerKey: 'table.actions',
      cell: (tk) =>
        readOnly ? (
          '—'
        ) : (
          <span className="flex gap-2">
            <button
              type="button"
              disabled={update.isPending || tk.progress_percent >= 100}
              onClick={() =>
                update.mutate({
                  id: tk.task_id,
                  input: { progress_percent: Math.min(100, tk.progress_percent + 25) },
                })
              }
              className="rounded border border-gray-400 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              +25%
            </button>
            {tk.status !== 'COMPLETED' && (
              <button
                type="button"
                disabled={update.isPending}
                onClick={() => update.mutate({ id: tk.task_id, input: { status: 'COMPLETED' } })}
                className="rounded border border-green-600 px-2 py-0.5 text-xs text-green-700 hover:bg-green-50 disabled:opacity-50"
              >
                {t('site.complete')}
              </button>
            )}
          </span>
        ),
    },
  ];

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-gray-800">{t('site.tasksTitle')}</h1>
      <select
        value={projectId}
        onChange={(e) => setProjectId(e.target.value)}
        className="mb-4 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
      >
        <option value="">{t('site.selectProject')}</option>
        {projects.data?.items.map((p) => (
          <option key={p.project_id} value={p.project_id}>
            {p.project_name}
          </option>
        ))}
      </select>
      {update.isError && <p className="mb-2 text-sm text-red-600">{t('site.completeBlocked')}</p>}
      {projectId && (
        <DataTable
          columns={columns}
          rows={tasks.data?.items ?? []}
          rowKey={(tk) => tk.task_id}
          isLoading={tasks.isLoading}
        />
      )}
    </div>
  );
}
