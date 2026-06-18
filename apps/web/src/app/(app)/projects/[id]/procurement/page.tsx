'use client';

import { ProjectTabs } from '../../../../../components/project/ProjectTabs';
import { DataTable, type Column } from '../../../../../components/ui/DataTable';
import { useI18n } from '../../../../../i18n';
import { useProjectProcurement } from '../../../../../lib/api/queries';
import type { PurchaseOrderRow, PurchaseRequestRow, RfqRow } from '../../../../../lib/api/types';
import { formatDate } from '../../../../../lib/format';

/** PM read-only procurement status for a project (§20.7.2 → Phase 5 read). */
export default function ProjectProcurementPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { t, locale } = useI18n();
  const { prs, rfqs, pos } = useProjectProcurement(id);

  const prCols: Column<PurchaseRequestRow>[] = [
    { headerKey: 'pm.colNumber', cell: (r) => r.pr_number },
    { headerKey: 'table.status', cell: (r) => r.status },
    { headerKey: 'pm.colDate', cell: (r) => formatDate(locale, r.required_date) },
  ];
  const rfqCols: Column<RfqRow>[] = [
    { headerKey: 'pm.colNumber', cell: (r) => r.rfq_number },
    { headerKey: 'table.status', cell: (r) => r.status },
    { headerKey: 'pm.colDeadline', cell: (r) => formatDate(locale, r.deadline) },
  ];
  const poCols: Column<PurchaseOrderRow>[] = [
    { headerKey: 'pm.colNumber', cell: (r) => r.po_number },
    { headerKey: 'table.status', cell: (r) => r.status },
  ];

  return (
    <div>
      <ProjectTabs id={id} />
      <h1 className="mb-6 text-2xl font-bold text-gray-800">{t('pm.procurementTitle')}</h1>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold uppercase text-gray-500">{t('pm.prs')}</h2>
        <DataTable
          columns={prCols}
          rows={prs.data?.items ?? []}
          rowKey={(r) => r.pr_id}
          isLoading={prs.isLoading}
        />
      </section>
      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold uppercase text-gray-500">{t('pm.rfqs')}</h2>
        <DataTable
          columns={rfqCols}
          rows={rfqs.data?.items ?? []}
          rowKey={(r) => r.rfq_id}
          isLoading={rfqs.isLoading}
        />
      </section>
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase text-gray-500">{t('pm.pos')}</h2>
        <DataTable
          columns={poCols}
          rows={pos.data?.items ?? []}
          rowKey={(r) => r.po_id}
          isLoading={pos.isLoading}
        />
      </section>
    </div>
  );
}
