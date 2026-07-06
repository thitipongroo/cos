'use client';

import { DataTable, type Column } from '../../../../components/ui/DataTable';
import { useI18n } from '../../../../i18n';
import { usePermits, useApprovePermit, useRejectPermit } from '../../../../lib/api/queries';
import type { PermitRow } from '../../../../lib/api/types';
import { formatDate } from '../../../../lib/format';
import { useReadOnly } from '../../../../lib/auth/useReadOnly';

/** Work-permit approval (§20.7.7 → /safety/permits; §15.5 SE → Safety Officer → PM). */
export default function SafetyPermitsPage() {
  const { t, locale } = useI18n();
  const query = usePermits();
  const approve = useApprovePermit();
  const reject = useRejectPermit();
  const readOnly = useReadOnly();
  const busy = approve.isPending || reject.isPending;

  const columns: Column<PermitRow>[] = [
    { headerKey: 'safety.colPermitNo', cell: (p) => p.permit_number },
    { headerKey: 'safety.colPermitType', cell: (p) => p.permit_type },
    { headerKey: 'table.status', cell: (p) => p.status },
    {
      headerKey: 'safety.colValidUntil',
      cell: (p) => (p.valid_until ? formatDate(locale, p.valid_until) : '—'),
    },
    {
      headerKey: 'table.actions',
      cell: (p) =>
        p.status === 'PENDING' && !readOnly ? (
          <span className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => approve.mutate({ id: p.permit_id, tier: 'SAFETY_OFFICER' })}
              className="rounded border border-green-600 px-2 py-0.5 text-xs text-green-700 hover:bg-green-50 disabled:opacity-50"
            >
              {t('safety.approve')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => reject.mutate(p.permit_id)}
              className="rounded border border-red-600 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {t('safety.reject')}
            </button>
          </span>
        ) : (
          '—'
        ),
    },
  ];

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-gray-800">{t('safety.permitsTitle')}</h1>
      <p className="mb-4 text-xs text-gray-400">{t('safety.permitsHint')}</p>
      {approve.isError && (
        <p className="mb-2 text-sm text-red-600">{t('safety.permitPmRequired')}</p>
      )}
      <DataTable
        columns={columns}
        rows={query.data?.items ?? []}
        rowKey={(p) => p.permit_id}
        isLoading={query.isLoading}
      />
    </div>
  );
}
