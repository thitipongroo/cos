'use client';

import { tenantSettingsSchema } from '@cos/schemas';
import { useEffect } from 'react';
import { Controller } from 'react-hook-form';
import { TextInputField } from '../../../../components/form/TextInputField';
import { useI18n } from '../../../../i18n';
import { useTenantSettings, useUpdateTenantSettings } from '../../../../lib/api/queries';
import { useValidatedForm } from '../../../../lib/forms';

/** Tenant settings — variance/retention defaults, LINE token, notifications (§20.7.8, ADR-028). */
export default function SettingsTenantPage() {
  const { t } = useI18n();
  const query = useTenantSettings();
  const update = useUpdateTenantSettings();

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useValidatedForm({
    schema: tenantSettingsSchema,
    defaultValues: {
      variance_alert_threshold: 0,
      retention_percentage: 0,
      line_channel_token: '',
      notifications_enabled: true,
    },
  });

  const messageFor = (key?: string) => (key ? t(key) : undefined);

  // The API returns the thresholds as strings (NUMERIC columns); the form and schema hold numbers.
  useEffect(() => {
    if (query.data) {
      reset({
        variance_alert_threshold: Number(query.data.variance_alert_threshold),
        retention_percentage: Number(query.data.retention_percentage),
        line_channel_token: query.data.line_channel_token ?? '',
        notifications_enabled: query.data.notifications_enabled,
      });
    }
  }, [query.data, reset]);

  const submit = handleSubmit((values) => {
    update.mutate(values);
  });

  return (
    <div className="max-w-lg">
      <h1 className="mb-4 text-2xl font-bold text-gray-800">{t('settings.tenantTitle')}</h1>
      {update.isSuccess && <p className="mb-3 text-sm text-green-700">{t('settings.saved')}</p>}
      <form onSubmit={submit} noValidate className="space-y-4">
        {/* Both thresholds are numbers in the schema; the text input yields strings, so each is
            converted on the way in. An empty box becomes undefined rather than NaN — the field is
            optional, and NaN would fail as "out of range" the moment the admin clears it. */}
        <Controller
          name="variance_alert_threshold"
          control={control}
          render={({ field }) => (
            <TextInputField
              name={field.name}
              onBlur={field.onBlur}
              value={field.value == null ? '' : String(field.value)}
              onChange={(v) => field.onChange(v === '' ? undefined : Number(v))}
              label={t('settings.variance')}
              errorMessage={messageFor(errors.variance_alert_threshold?.message)}
            />
          )}
        />
        <Controller
          name="retention_percentage"
          control={control}
          render={({ field }) => (
            <TextInputField
              name={field.name}
              onBlur={field.onBlur}
              value={field.value == null ? '' : String(field.value)}
              onChange={(v) => field.onChange(v === '' ? undefined : Number(v))}
              label={t('settings.retention')}
              errorMessage={messageFor(errors.retention_percentage?.message)}
            />
          )}
        />
        <Controller
          name="line_channel_token"
          control={control}
          render={({ field }) => (
            <TextInputField
              {...field}
              label={t('settings.lineToken')}
              errorMessage={messageFor(errors.line_channel_token?.message)}
            />
          )}
        />
        <Controller
          name="notifications_enabled"
          control={control}
          render={({ field }) => (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                name={field.name}
                checked={field.value ?? false}
                onChange={(e) => field.onChange(e.target.checked)}
                onBlur={field.onBlur}
              />
              {t('settings.notifications')}
            </label>
          )}
        />
        <button
          type="submit"
          disabled={isSubmitting || update.isPending || query.isLoading}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {t('settings.save')}
        </button>
      </form>
    </div>
  );
}
