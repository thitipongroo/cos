'use client';

import { useI18n } from '../../../../i18n';
import { useCompliance } from '../../../../lib/api/queries';

function Metric({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div
        className={`mt-1 text-2xl font-bold ${danger && value > 0 ? 'text-red-600' : 'text-gray-800'}`}
      >
        {value}
      </div>
    </div>
  );
}

/** Compliance status + violation alerts (§20.7.7 → GET /safety/compliance; ADR-027). */
export default function SafetyCompliancePage() {
  const { t } = useI18n();
  const query = useCompliance();
  const d = query.data;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">{t('safety.complianceTitle')}</h1>
      {d && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label={t('safety.openIncidents')} value={d.open_incidents} />
          <Metric label={t('safety.highCritical')} value={d.high_critical_incidents} danger />
          <Metric label={t('safety.expiredPermits')} value={d.expired_permits} danger />
          <Metric label={t('safety.revokedPermits')} value={d.revoked_permits} danger />
        </div>
      )}
    </div>
  );
}
