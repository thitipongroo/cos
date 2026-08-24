'use client';

// Project Knowledge-Graph tab (Phase 13 graph APIs). Grounded strictly in the five
// GraphService endpoints — no other data source:
//   /graph/projects/:id/vendors        → vendors supplying the project
//   /graph/projects/:id/supply-chain   → material → vendor edges
//   /graph/projects/:id/inspections    → inspection pass/fail
//   /graph/vendors/:id/projects        → other projects sharing a vendor (drill-down)
//   /graph/vendors/:id/invoices        → that vendor's invoices (drill-down)
// The graph controller reads `tenantId` from a query param (Phase-13 contract), so it is
// derived from the session and appended to every call. Session-authenticated via useApi.
import { use, useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { ProjectTabs } from '../../../../../components/project/ProjectTabs';
import { DataTable, type Column } from '../../../../../components/ui/DataTable';
import { useApi } from '../../../../../lib/api/client';
import { useT } from '../../../../../i18n';

interface VendorNode {
  vendorId: string;
  vendorName: string;
}
interface SupplyChainEdge {
  materialId: string;
  description: string;
  vendorId: string;
  vendorName: string;
}
interface InspectionNode {
  inspectionId: string;
  status: string;
  inspectedAt: string;
}
interface ProjectNode {
  projectId: string;
  projectName: string;
}
interface InvoiceNode {
  invoiceId: string;
  amount: string;
  currency: string;
  status: string;
}

interface VendorDetail {
  vendor: VendorNode;
  projects: ProjectNode[];
  invoices: InvoiceNode[];
}

function StatusBadge({ status }: { status: string }) {
  const pass = status === 'PASSED';
  const fail = status === 'FAILED';
  const cls = pass
    ? 'bg-green-50 text-green-700'
    : fail
      ? 'bg-red-50 text-red-700'
      : 'bg-gray-100 text-gray-600';
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${cls}`}>{status}</span>;
}

export default function ProjectGraphPage(props: { params: Promise<{ id: string }> }) {
  const { id } = use(props.params);
  const t = useT();
  const api = useApi();
  const { data: session } = useSession();
  // Tenant isolation is enforced server-side from the JWT; the client sends no tenantId.
  // Gate fetches on the access token being present so requests carry the Bearer header.
  const ready = Boolean(session?.accessToken);

  const [vendors, setVendors] = useState<VendorNode[]>([]);
  const [supplyChain, setSupplyChain] = useState<SupplyChainEdge[]>([]);
  const [inspections, setInspections] = useState<InspectionNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<VendorDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (!ready) {
      return;
    }
    Promise.all([
      api<VendorNode[]>(`/graph/projects/${id}/vendors`),
      api<SupplyChainEdge[]>(`/graph/projects/${id}/supply-chain`),
      api<InspectionNode[]>(`/graph/projects/${id}/inspections`),
    ])
      .then(([v, s, i]) => {
        setVendors(v);
        setSupplyChain(s);
        setInspections(i);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [id, ready, api]);

  const openVendor = useCallback(
    (vendor: VendorNode) => {
      setDetail({ vendor, projects: [], invoices: [] });
      setDetailLoading(true);
      Promise.all([
        api<ProjectNode[]>(`/graph/vendors/${vendor.vendorId}/projects`),
        api<InvoiceNode[]>(`/graph/vendors/${vendor.vendorId}/invoices`),
      ])
        .then(([projects, invoices]) => setDetail({ vendor, projects, invoices }))
        .catch(() => undefined)
        .finally(() => setDetailLoading(false));
    },
    [api],
  );

  const vendorCols: Column<VendorNode>[] = [
    { headerKey: 'pm.colVendor', cell: (r) => r.vendorName },
    {
      headerKey: 'table.actions',
      className: 'text-right',
      cell: (r) => (
        <button
          type="button"
          onClick={() => openVendor(r)}
          className="text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          {t('pm.graphViewVendor')}
        </button>
      ),
    },
  ];

  const supplyCols: Column<SupplyChainEdge>[] = [
    { headerKey: 'pm.colMaterial', cell: (r) => r.description },
    { headerKey: 'pm.colVendor', cell: (r) => r.vendorName },
  ];

  const inspectionCols: Column<InspectionNode>[] = [
    { headerKey: 'pm.colDate', cell: (r) => r.inspectedAt.slice(0, 10) },
    { headerKey: 'table.status', cell: (r) => <StatusBadge status={r.status} /> },
  ];

  const projectCols: Column<ProjectNode>[] = [
    { headerKey: 'pm.colProject', cell: (r) => r.projectName },
  ];
  const invoiceCols: Column<InvoiceNode>[] = [
    { headerKey: 'pm.colInvoice', cell: (r) => r.invoiceId.slice(0, 8) },
    {
      headerKey: 'pm.colAmount',
      className: 'text-right',
      cell: (r) => Number(r.amount).toLocaleString(),
    },
    { headerKey: 'pm.colCurrency', cell: (r) => r.currency },
    { headerKey: 'table.status', cell: (r) => r.status },
  ];

  const empty =
    !loading && vendors.length === 0 && supplyChain.length === 0 && inspections.length === 0;

  return (
    <div>
      <ProjectTabs id={id} />
      <h1 className="mb-1 text-2xl font-bold text-gray-800">{t('pm.graphTitle')}</h1>
      <p className="mb-6 text-sm text-gray-500">{t('pm.graphSubtitle')}</p>

      {empty ? (
        <div className="py-8 text-center text-sm text-gray-400">{t('pm.graphEmpty')}</div>
      ) : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <section className="lg:col-span-2">
            <h2 className="mb-2 text-sm font-semibold uppercase text-gray-500">
              {t('pm.graphVendors')}
            </h2>
            <DataTable
              columns={vendorCols}
              rows={vendors}
              rowKey={(r) => r.vendorId}
              isLoading={loading}
              emptyKey="pm.graphEmpty"
            />
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase text-gray-500">
              {t('pm.graphSupplyChain')}
            </h2>
            <DataTable
              columns={supplyCols}
              rows={supplyChain}
              rowKey={(r) => `${r.materialId}-${r.vendorId}`}
              isLoading={loading}
              emptyKey="pm.graphEmpty"
            />
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase text-gray-500">
              {t('pm.graphInspections')}
            </h2>
            <DataTable
              columns={inspectionCols}
              rows={inspections}
              rowKey={(r) => r.inspectionId}
              isLoading={loading}
              emptyKey="pm.graphEmpty"
            />
          </section>
        </div>
      )}

      <section className="mt-10 rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase text-gray-500">
          {t('pm.graphVendorDetail')}
        </h2>
        {!detail ? (
          <p className="py-4 text-sm text-gray-400">{t('pm.graphSelectVendor')}</p>
        ) : (
          <div>
            <p className="mb-4 text-base font-medium text-gray-800">{detail.vendor.vendorName}</p>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase text-gray-400">
                  {t('pm.graphOtherProjects')}
                </h3>
                <DataTable
                  columns={projectCols}
                  rows={detail.projects}
                  rowKey={(r) => r.projectId}
                  isLoading={detailLoading}
                  emptyKey="pm.graphEmpty"
                />
              </div>
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase text-gray-400">
                  {t('pm.graphInvoices')}
                </h3>
                <DataTable
                  columns={invoiceCols}
                  rows={detail.invoices}
                  rowKey={(r) => r.invoiceId}
                  isLoading={detailLoading}
                  emptyKey="pm.graphEmpty"
                />
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
