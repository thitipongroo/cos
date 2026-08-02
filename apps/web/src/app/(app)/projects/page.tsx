'use client';

import { projectCreateSchema } from '@cos/schemas';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Controller } from 'react-hook-form';
import { NativeSelectField } from '../../../components/form/NativeSelectField';
import { TextInputField } from '../../../components/form/TextInputField';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { StatusChip } from '../../../components/ui/StatusChip';
import { ReadOnlyBanner } from '../../../components/ui/ReadOnlyBanner';
import { useI18n } from '../../../i18n';
import { useReadOnly } from '../../../lib/auth/useReadOnly';
import { useCreateProject, useProjects } from '../../../lib/api/queries';
import type { ProjectRow, ProjectStatus, ProjectType } from '../../../lib/api/types';
import { formatMoney } from '../../../lib/format';
import { useValidatedForm } from '../../../lib/forms';

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

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useValidatedForm({
    schema: projectCreateSchema,
    defaultValues: {
      project_code: '',
      project_name: '',
      project_type: 'RESIDENTIAL' as ProjectType,
      budget_amount: '',
      budget_currency: 'THB',
    },
  });

  const messageFor = (key?: string) => (key ? t(key) : undefined);

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

  const submit = handleSubmit((values) => {
    create.mutate(
      {
        project_code: values.project_code,
        project_name: values.project_name,
        project_type: values.project_type,
        budget_amount: values.budget_amount || undefined,
        // A currency with no amount means nothing to the API — send it only when there is a figure.
        budget_currency: values.budget_amount ? values.budget_currency : undefined,
      },
      { onSuccess: () => setShowForm(false) },
    );
  });

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
          noValidate
          className="mb-6 grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:grid-cols-2"
        >
          <Controller
            name="project_code"
            control={control}
            render={({ field }) => (
              <TextInputField
                {...field}
                label={t('pm.fieldCode')}
                errorMessage={messageFor(errors.project_code?.message)}
              />
            )}
          />
          <Controller
            name="project_name"
            control={control}
            render={({ field }) => (
              <TextInputField
                {...field}
                label={t('pm.fieldName')}
                errorMessage={messageFor(errors.project_name?.message)}
              />
            )}
          />
          <Controller
            name="project_type"
            control={control}
            render={({ field }) => (
              <NativeSelectField
                {...field}
                label={t('table.type')}
                options={TYPES.map((ty) => ({ id: ty, label: t(`projectType.${ty}`) }))}
                errorMessage={messageFor(errors.project_type?.message)}
              />
            )}
          />
          <Controller
            name="budget_amount"
            control={control}
            render={({ field }) => (
              <TextInputField
                {...field}
                label={t('pm.fieldBudget')}
                errorMessage={messageFor(errors.budget_amount?.message)}
              />
            )}
          />
          <div className="flex gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={isSubmitting || create.isPending}
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
