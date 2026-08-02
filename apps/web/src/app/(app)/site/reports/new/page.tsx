'use client';

import { siteReportCreateSchema } from '@cos/schemas';
import { Controller } from 'react-hook-form';
import { DateField } from '../../../../../components/form/DateField';
import { NativeSelectField } from '../../../../../components/form/NativeSelectField';
import { TextInputField } from '../../../../../components/form/TextInputField';
import { useI18n } from '../../../../../i18n';
import { useCreateSiteReport, useProjects } from '../../../../../lib/api/queries';
import { useValidatedForm } from '../../../../../lib/forms';

/** Submit a daily site report — manpower, blockers (§20.7.6 → POST /site/reports). */
export default function NewSiteReportPage() {
  const { t } = useI18n();
  const projects = useProjects();
  const create = useCreateSiteReport();

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useValidatedForm({
    schema: siteReportCreateSchema,
    defaultValues: { project_id: '', report_date: '', summary: '', blockers: '' },
  });

  const messageFor = (key?: string) => (key ? t(key) : undefined);

  const submit = handleSubmit((values) => {
    create.mutate(values);
  });

  const projectOptions =
    projects.data?.items.map((p) => ({ id: p.project_id, label: p.project_name })) ?? [];

  return (
    <div className="max-w-lg">
      <h1 className="mb-4 text-2xl font-bold text-gray-800">{t('site.reportsNewTitle')}</h1>
      {create.isSuccess && (
        <p role="status" className="mb-3 text-sm text-green-700">
          {t('site.submitted')}
        </p>
      )}
      <form onSubmit={submit} noValidate className="space-y-3">
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
        {/* DateField, not <input type="date">: this is one of the four date-entry routes, and the
            OS picker renders Gregorian years even under a Thai locale (QM-3 Buddhist Era). The
            +41 KB it costs here is budgeted — see components/form/README.md. */}
        <Controller
          name="report_date"
          control={control}
          render={({ field }) => (
            <DateField
              {...field}
              label={t('site.fieldDate')}
              errorMessage={messageFor(errors.report_date?.message)}
            />
          )}
        />
        <Controller
          name="manpower_count"
          control={control}
          render={({ field }) => (
            <TextInputField
              label={t('site.fieldManpower')}
              value={field.value == null ? '' : String(field.value)}
              // The schema types manpower_count as a number; an empty field must be `undefined`
              // (not supplied) rather than NaN, which would fail as "not an integer" the moment the
              // user clears the box.
              onChange={(v) => field.onChange(v === '' ? undefined : Number(v))}
              onBlur={field.onBlur}
              name={field.name}
              errorMessage={messageFor(errors.manpower_count?.message)}
            />
          )}
        />
        <Controller
          name="summary"
          control={control}
          render={({ field }) => (
            <TextInputField
              {...field}
              multiline
              rows={3}
              label={t('site.fieldSummary')}
              errorMessage={messageFor(errors.summary?.message)}
            />
          )}
        />
        <Controller
          name="blockers"
          control={control}
          render={({ field }) => (
            <TextInputField
              {...field}
              multiline
              rows={2}
              label={t('site.fieldBlockers')}
              errorMessage={messageFor(errors.blockers?.message)}
            />
          )}
        />
        <button
          type="submit"
          disabled={isSubmitting || create.isPending}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {t('site.submit')}
        </button>
      </form>
    </div>
  );
}
