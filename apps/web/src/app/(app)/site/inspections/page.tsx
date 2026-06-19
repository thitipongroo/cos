'use client';

import { useState } from 'react';
import { DataTable, type Column } from '../../../../components/ui/DataTable';
import { ReadOnlyBanner } from '../../../../components/ui/ReadOnlyBanner';
import { useI18n } from '../../../../i18n';
import { useReadOnly } from '../../../../lib/auth/useReadOnly';
import { useInspections, useUpdateInspection } from '../../../../lib/api/queries';
import type { InspectionRow } from '../../../../lib/api/types';
import { formatDate } from '../../../../lib/format';

const STATUSES = ['PENDING', 'PASSED', 'FAILED', 'REQUIRES_REINSPECTION'];

/** Inspection results + approval / re-inspection (§20.7.5 → GET·PATCH /site/inspections, ADR-025). */
export default function SiteInspectionsPage() {
  const { t, locale } = useI18n();
  const readOnly = useReadOnly();
  const [status, setStatus] = useState('');
  const query = useInspections(status || undefined);
  const update = useUpdateInspection();

  const columns: Column<InspectionRow>[] = [
    { headerKey: 'site.colChecklist', cell: (i) => i.checklist_id },
    { headerKey: 'table.status', cell: (i) => i.status },
    { headerKey: 'site.colInspectedAt', cell: (i) => formatDate(locale, i.inspected_at) },
    { headerKey: 'site.colNotes', cell: (i) => i.notes ?? '—' },
    ...(readOnly
      ? []
      : [
          {
            headerKey: 'table.actions' as const,
            cell: (i: InspectionRow) =>
              i.status === 'PASSED' ? (
                '—'
              ) : (
                <span className="flex gap-2">
                  <button
                    type="button"
                    disabled={update.isPending}
                    onClick={() =>
                      update.mutate({ id: i.inspection_id, input: { status: 'PASSED' } })
                    }
                    className="rounded border border-green-600 px-2 py-0.5 text-xs text-green-700 hover:bg-green-50 disabled:opacity-50"
                  >
                    {t('site.approve')}
                  </button>
                  <button
                    type="button"
                    disabled={update.isPending}
                    onClick={() =>
                      update.mutate({
                        id: i.inspection_id,
                        input: { status: 'REQUIRES_REINSPECTION' },
                      })
                    }
                    className="rounded border border-amber-600 px-2 py-0.5 text-xs text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                  >
                    {t('site.requestReinspection')}
                  </button>
                </span>
              ),
          },
        ]),
  ];

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-gray-800">{t('site.inspectionsTitle')}</h1>
      <ReadOnlyBanner />
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="mb-4 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
      >
        <option value="">{t('site.allStatuses')}</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <DataTable
        columns={columns}
        rows={query.data?.items ?? []}
        rowKey={(i) => i.inspection_id}
        isLoading={query.isLoading}
      />
    </div>
  );
}
