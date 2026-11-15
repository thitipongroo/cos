'use client';

import { useI18n } from '../../i18n';

/**
 * Says the page shows sample records, not the tenant's data (fix/web-sample-data-notice, product owner
 * 2026-11-16). Nine 6a076c6d pages render module-level sample constants and read nothing from the API —
 * leasing, a property, a tender, factoring, AI vision, the contractor portal, an RFQ evaluation, a digital
 * twin, carbon — and without this a reader could take the figures for their own.
 */
export function SampleDataNotice() {
  const { t } = useI18n();
  return (
    <p
      role="note"
      className="mx-6 mt-4 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200"
    >
      {t('sample.notice')}
    </p>
  );
}
