'use client';

import { DataTable, type Column } from '../../../../components/ui/DataTable';
import { useI18n } from '../../../../i18n';
import { useChecklists } from '../../../../lib/api/queries';
import type { SafetyChecklistRow } from '../../../../lib/api/types';

/** Assigned safety checklists (§20.7.6 → GET /site/checklists). Completion is recorded by
 *  submitting an inspection against the checklist (POST /site/inspections). */
export default function SiteChecklistsPage() {
  const { t } = useI18n();
  const query = useChecklists();

  const columns: Column<SafetyChecklistRow>[] = [
    { headerKey: 'site.colChecklistName', cell: (c) => c.checklist_name },
    { headerKey: 'site.colVersion', cell: (c) => `v${c.version}` },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">{t('site.checklistsTitle')}</h1>
      <DataTable
        columns={columns}
        rows={query.data ?? []}
        rowKey={(c) => c.checklist_id}
        isLoading={query.isLoading}
      />
    </div>
  );
}
