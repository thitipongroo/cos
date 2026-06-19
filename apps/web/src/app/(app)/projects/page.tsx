'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { StatusChip } from '../../../components/ui/StatusChip';
import { ReadOnlyBanner } from '../../../components/ui/ReadOnlyBanner';
import { useI18n } from '../../../i18n';
import { useReadOnly } from '../../../lib/auth/useReadOnly';
import { useCreateProject, useProjects } from '../../../lib/api/queries';
import type { ProjectRow, ProjectStatus, ProjectType } from '../../../lib/api/types';
import { formatMoney } from '../../../lib/format';

const TYPES: ProjectType[] = ['RESIDENTIAL', 'COMMERCIAL', 'INFRASTRUCTURE', 'INDUSTRIAL'];
const STATUSES: ProjectStatus[] = ['DRAFT', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'];

/** PM projects list + create (§20.7.2). Create yields a DRAFT project (Phase 3). */
export default function ProjectsPage() {
  const { t, locale } = useI18n();
  const readOnly = useReadOnly();
  const projectsQuery = useProjects();
  const create = useCreateProject();

  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    project_code: '',
    project_name: '',
    project_type: 'RESIDENTIAL' as ProjectType,
    budget_amount: '',
    budget_currency: 'THB',
  });

  const rows = useMemo(() => {
    const items = projectsQuery.data?.items ?? [];
    return items.filter(
      (p) =>
        (statusFilter === '' || p.status === statusFilter) &&
        (typeFilter === '' || p.project_type === typeFilter),
    );
  }, [projectsQuery.data, statusFilter, typeFilter]);

  const columns: Column<ProjectRow>[] = [
    { headerKey: 'table.code', cell: (p) => p.project_code },
    {
      headerKey: 'table.project',
      cell: (p) => (
        <Link href={`/projects/${p.project_id}`} className="text-blue-600 hover:underline">
          {p.project_name}
        </Link>
      ),
    },
    { headerKey: 'table.type', cell: (p) => t(`projectType.${p.project_type}`) },
    { headerKey: 'table.status', cell: (p) => <StatusChip status={p.status} /> },
    {
      headerKey: 'table.budget',
      cell: (p) => formatMoney(locale, p.budget_amount, p.budget_currency),
    },
  ];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    create.mutate(
      {
        project_code: form.project_code,
        project_name: form.project_name,
        project_type: form.project_type,
        budget_amount: form.budget_amount || undefined,
        budget_currency: form.budget_amount ? form.budget_currency : undefined,
      },
      { onSuccess: () => setShowForm(false) },
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">{t('pm.projectsTitle')}</h1>
        {!readOnly && (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {t('pm.newProject')}
          </button>
        )}
      </div>
      <ReadOnlyBanner />

      <div className="mb-4 flex gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value="">{t('pm.filterAll')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`projectStatus.${s}`)}
            </option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value="">{t('pm.filterAll')}</option>
          {TYPES.map((ty) => (
            <option key={ty} value={ty}>
              {t(`projectType.${ty}`)}
            </option>
          ))}
        </select>
      </div>

      {showForm && !readOnly && (
        <form
          onSubmit={submit}
          className="mb-6 grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:grid-cols-2"
        >
          <input
            required
            placeholder={t('pm.fieldCode')}
            value={form.project_code}
            onChange={(e) => setForm({ ...form, project_code: e.target.value })}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            required
            placeholder={t('pm.fieldName')}
            value={form.project_name}
            onChange={(e) => setForm({ ...form, project_name: e.target.value })}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <select
            value={form.project_type}
            onChange={(e) => setForm({ ...form, project_type: e.target.value as ProjectType })}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {TYPES.map((ty) => (
              <option key={ty} value={ty}>
                {t(`projectType.${ty}`)}
              </option>
            ))}
          </select>
          <input
            inputMode="decimal"
            placeholder={t('pm.fieldBudget')}
            value={form.budget_amount}
            onChange={(e) => setForm({ ...form, budget_amount: e.target.value })}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <div className="flex gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={create.isPending}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {t('pm.create')}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600"
            >
              {t('pm.cancel')}
            </button>
          </div>
        </form>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(p) => p.project_id}
        isLoading={projectsQuery.isLoading}
      />
    </div>
  );
}
