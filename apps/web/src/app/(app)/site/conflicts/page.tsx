'use client';

import { DataTable, type Column } from '../../../../components/ui/DataTable';
import { ReadOnlyBanner } from '../../../../components/ui/ReadOnlyBanner';
import { useI18n } from '../../../../i18n';
import { useReadOnly } from '../../../../lib/auth/useReadOnly';
import { useConflictRecords, useResolveConflict } from '../../../../lib/api/queries';
import type { ConflictRecordRow } from '../../../../lib/api/types';
import { formatDate } from '../../../../lib/format';

/** Offline-sync conflict resolution (§20.7.5 → GET·PATCH /site/conflict-records). */
export default function SiteConflictsPage() {
  const { t, locale } = useI18n();
  const readOnly = useReadOnly();
  const query = useConflictRecords();
  const resolve = useResolveConflict();

  const columns: Column<ConflictRecordRow>[] = [
    { headerKey: 'site.colEntity', cell: (c) => c.entity_type },
    { headerKey: 'site.colEntityId', cell: (c) => c.entity_id },
    { headerKey: 'site.colConflictType', cell: (c) => c.conflict_type },
    { headerKey: 'site.colDate', cell: (c) => formatDate(locale, c.created_at) },
    ...(readOnly
      ? []
      : [
          {
            headerKey: 'table.actions' as const,
            cell: (c: ConflictRecordRow) => (
              <button
                type="button"
                disabled={resolve.isPending}
                onClick={() => resolve.mutate(c.conflict_id)}
                className="rounded border border-blue-600 px-2 py-0.5 text-xs text-blue-600 hover:bg-blue-50 disabled:opacity-50"
              >
                {t('site.resolve')}
              </button>
            ),
          },
        ]),
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">{t('site.conflictsTitle')}</h1>
      <ReadOnlyBanner />
      <DataTable
        columns={columns}
        rows={query.data ?? []}
        rowKey={(c) => c.conflict_id}
        isLoading={query.isLoading}
      />
    </div>
  );
}
