'use client';

import { useI18n } from '../../i18n';
import { useReadOnly } from '../../lib/auth/useReadOnly';

/** §20.7.9 — a small notice shown to VIEWER role; pages also omit their action UI. */
export function ReadOnlyBanner() {
  const { t } = useI18n();
  if (!useReadOnly()) return null;
  return (
    <p className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
      {t('common.readOnly')}
    </p>
  );
}
