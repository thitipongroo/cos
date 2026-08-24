'use client';

import { riskCreateSchema } from '@cos/schemas';
import { use, useState } from 'react';
import { Controller } from 'react-hook-form';

import { NativeSelectField } from '../../../../../components/form/NativeSelectField';
import { TextInputField } from '../../../../../components/form/TextInputField';
import { ProjectTabs } from '../../../../../components/project/ProjectTabs';
import { RiskHeatMap } from '../../../../../components/project/RiskHeatMap';
import { DataTable, type Column } from '../../../../../components/ui/DataTable';
import { ReadOnlyBanner } from '../../../../../components/ui/ReadOnlyBanner';
import { useI18n } from '../../../../../i18n';
import { useReadOnly } from '../../../../../lib/auth/useReadOnly';
import {
  useProjectRisks,
  useRaiseRisk,
  useUpdateRisk,
  useTransitionRiskStatus,
} from '../../../../../lib/api/queries';
import type { RiskCategory, RiskRow, RiskStatus } from '../../../../../lib/api/types';
import { useValidatedForm } from '../../../../../lib/forms';
import { scoreBand, type RiskBand } from '../../../../../lib/riskHeatMap';

const CATEGORIES: RiskCategory[] = [
  'SAFETY',
  'FINANCIAL',
  'SCHEDULE',
  'TECHNICAL',
  'EXTERNAL',
  'OTHER',
];
const STATUSES: RiskStatus[] = ['OPEN', 'MITIGATING', 'CLOSED', 'ACCEPTED'];
const SCORES = [1, 2, 3, 4, 5];

const BAND_CHIP: Record<RiskBand, string> = {
  low: 'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
};

const EMPTY_FORM = {
  title: '',
  description: '',
  category: 'SCHEDULE' as RiskCategory,
  likelihood: 3,
  impact: 3,
  mitigation: '',
  owner: '',
};

/** PM/SE project risk register — 5×5 heat map + raise / edit / status transition (ADR-065, §20:426). */
export default function ProjectRisksPage(props: { params: Promise<{ id: string }> }) {
  const { id } = use(props.params);
  const { t } = useI18n();
  const readOnly = useReadOnly();

  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const risksQuery = useProjectRisks(id, {
    status: statusFilter || undefined,
    category: categoryFilter || undefined,
  });
  const raise = useRaiseRisk(id);
  const update = useUpdateRisk(id);
  const transition = useTransitionRiskStatus(id);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // One form serves both raise and edit — `reset` swaps the values, so the validation rules,
  // error wiring and focus-first-invalid behaviour are identical in both modes.
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useValidatedForm({ schema: riskCreateSchema, defaultValues: EMPTY_FORM });

  const messageFor = (key?: string) => (key ? t(key) : undefined);

  const risks = risksQuery.data ?? [];

  function openCreate() {
    setEditingId(null);
    reset(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(r: RiskRow) {
    setEditingId(r.risk_id);
    reset({
      title: r.title,
      description: r.description ?? '',
      category: r.category,
      likelihood: r.likelihood,
      impact: r.impact,
      mitigation: r.mitigation ?? '',
      owner: r.owner ?? '',
    });
    setShowForm(true);
  }

  const submit = handleSubmit((values) => {
    const input = {
      title: values.title,
      description: values.description || undefined,
      category: values.category,
      likelihood: values.likelihood,
      impact: values.impact,
      mitigation: values.mitigation || undefined,
      owner: values.owner || undefined,
    };
    const done = { onSuccess: () => setShowForm(false) };
    if (editingId) update.mutate({ riskId: editingId, input }, done);
    else raise.mutate(input, done);
  });

  const columns: Column<RiskRow>[] = [
    {
      headerKey: 'risk.colTitle',
      cell: (r) => (
        <span>
          {r.title}
          {r.source === 'AI_SUGGESTED' && (
            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
              {t('risk.aiSuggested')}
            </span>
          )}
        </span>
      ),
    },
    { headerKey: 'risk.colCategory', cell: (r) => t(`riskCategory.${r.category}`) },
    {
      headerKey: 'risk.colScore',
      cell: (r) => (
        <span
          className={`rounded px-2 py-0.5 text-xs font-semibold ${BAND_CHIP[scoreBand(r.risk_score)]}`}
        >
          {r.likelihood}×{r.impact} = {r.risk_score}
        </span>
      ),
    },
    {
      headerKey: 'risk.colStatus',
      cell: (r) =>
        readOnly ? (
          t(`riskStatus.${r.status}`)
        ) : (
          <select
            value={r.status}
            onChange={(e) =>
              transition.mutate({ riskId: r.risk_id, status: e.target.value as RiskStatus })
            }
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`riskStatus.${s}`)}
              </option>
            ))}
          </select>
        ),
    },
    {
      headerKey: 'risk.colActions',
      cell: (r) =>
        readOnly ? null : (
          <button
            type="button"
            onClick={() => openEdit(r)}
            className="text-sm text-blue-600 hover:underline"
          >
            {t('risk.edit')}
          </button>
        ),
    },
  ];

  return (
    <div>
      <ProjectTabs id={id} />
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">{t('risk.title')}</h1>
        {!readOnly && (
          <button
            type="button"
            onClick={openCreate}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {t('risk.raise')}
          </button>
        )}
      </div>
      <ReadOnlyBanner />

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold uppercase text-gray-500">{t('risk.heatMap')}</h2>
        <RiskHeatMap
          risks={risks}
          labels={{ impact: t('risk.impact'), likelihood: t('risk.likelihood') }}
        />
      </section>

      <div className="mb-4 flex gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value="">{t('risk.filterAllStatus')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`riskStatus.${s}`)}
            </option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value="">{t('risk.filterAllCategory')}</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`riskCategory.${c}`)}
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
          <div className="sm:col-span-2">
            <Controller
              name="title"
              control={control}
              render={({ field }) => (
                <TextInputField
                  {...field}
                  label={t('risk.fieldTitle')}
                  errorMessage={messageFor(errors.title?.message)}
                />
              )}
            />
          </div>
          <div className="sm:col-span-2">
            <Controller
              name="description"
              control={control}
              render={({ field }) => (
                <TextInputField
                  {...field}
                  multiline
                  label={t('risk.fieldDescription')}
                  errorMessage={messageFor(errors.description?.message)}
                />
              )}
            />
          </div>
          <Controller
            name="category"
            control={control}
            render={({ field }) => (
              <NativeSelectField
                {...field}
                label={t('risk.colCategory')}
                options={CATEGORIES.map((c) => ({ id: c, label: t(`riskCategory.${c}`) }))}
                errorMessage={messageFor(errors.category?.message)}
              />
            )}
          />
          <Controller
            name="mitigation"
            control={control}
            render={({ field }) => (
              <TextInputField
                {...field}
                label={t('risk.fieldMitigation')}
                errorMessage={messageFor(errors.mitigation?.message)}
              />
            )}
          />
          <Controller
            name="owner"
            control={control}
            render={({ field }) => (
              <TextInputField
                {...field}
                label={t('risk.fieldOwner')}
                errorMessage={messageFor(errors.owner?.message)}
              />
            )}
          />
          {/* likelihood and impact are numbers in the schema; the select yields strings, so each
              is converted on the way in. Without it the 1–5 range check sees "3" and rejects it as
              not a number. */}
          <Controller
            name="likelihood"
            control={control}
            render={({ field }) => (
              <NativeSelectField
                name={field.name}
                onBlur={field.onBlur}
                value={String(field.value)}
                onChange={(v) => field.onChange(Number(v))}
                label={t('risk.likelihood')}
                options={SCORES.map((n) => ({ id: String(n), label: String(n) }))}
                errorMessage={messageFor(errors.likelihood?.message)}
              />
            )}
          />
          <Controller
            name="impact"
            control={control}
            render={({ field }) => (
              <NativeSelectField
                name={field.name}
                onBlur={field.onBlur}
                value={String(field.value)}
                onChange={(v) => field.onChange(Number(v))}
                label={t('risk.impact')}
                options={SCORES.map((n) => ({ id: String(n), label: String(n) }))}
                errorMessage={messageFor(errors.impact?.message)}
              />
            )}
          />
          <div className="flex gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={isSubmitting || raise.isPending || update.isPending}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {editingId ? t('risk.save') : t('risk.raise')}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600"
            >
              {t('risk.cancel')}
            </button>
          </div>
        </form>
      )}

      <DataTable
        columns={columns}
        rows={risks}
        rowKey={(r) => r.risk_id}
        isLoading={risksQuery.isLoading}
      />
    </div>
  );
}
