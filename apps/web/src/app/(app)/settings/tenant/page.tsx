'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '../../../../i18n';
import { useTenantSettings, useUpdateTenantSettings } from '../../../../lib/api/queries';

/** Tenant settings — variance/retention defaults, LINE token, notifications (§20.7.8, ADR-028). */
export default function SettingsTenantPage() {
  const { t } = useI18n();
  const query = useTenantSettings();
  const update = useUpdateTenantSettings();

  const [variance, setVariance] = useState('');
  const [retention, setRetention] = useState('');
  const [lineToken, setLineToken] = useState('');
  const [notifications, setNotifications] = useState(true);

  useEffect(() => {
    if (query.data) {
      setVariance(query.data.variance_alert_threshold);
      setRetention(query.data.retention_percentage);
      setLineToken(query.data.line_channel_token ?? '');
      setNotifications(query.data.notifications_enabled);
    }
  }, [query.data]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate({
      variance_alert_threshold: Number(variance),
      retention_percentage: Number(retention),
      line_channel_token: lineToken,
      notifications_enabled: notifications,
    });
  };

  const field = 'w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm';
  const label = 'block text-sm font-medium text-gray-600 mb-1';

  return (
    <div className="max-w-lg">
      <h1 className="mb-4 text-2xl font-bold text-gray-800">{t('settings.tenantTitle')}</h1>
      {update.isSuccess && <p className="mb-3 text-sm text-green-700">{t('settings.saved')}</p>}
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={label}>{t('settings.variance')}</label>
          <input
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={variance}
            onChange={(e) => setVariance(e.target.value)}
            className={field}
          />
        </div>
        <div>
          <label className={label}>{t('settings.retention')}</label>
          <input
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={retention}
            onChange={(e) => setRetention(e.target.value)}
            className={field}
          />
        </div>
        <div>
          <label className={label}>{t('settings.lineToken')}</label>
          <input
            type="text"
            value={lineToken}
            onChange={(e) => setLineToken(e.target.value)}
            placeholder="LINE Channel Access Token"
            className={field}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={notifications}
            onChange={(e) => setNotifications(e.target.checked)}
          />
          {t('settings.notifications')}
        </label>
        <button
          type="submit"
          disabled={update.isPending || query.isLoading}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {t('settings.save')}
        </button>
      </form>
    </div>
  );
}
