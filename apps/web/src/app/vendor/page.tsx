'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { useI18n } from '../../i18n';
import {
  getVendorSession,
  useVendorInvitedRfqs,
  useVendorPurchaseOrders,
  type VendorInvitedRfq,
  type VendorPurchaseOrder,
} from '../../lib/api/vendor';

/** Vendor dashboard (§20.7.12) — Tier-2 overview (invited RFQs + linked POs) once a session exists. */
export default function VendorDashboardPage() {
  const { t } = useI18n();
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    setHasSession(getVendorSession() !== null);
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{t('vendor.dashboardTitle')}</h1>
      {hasSession ? (
        <>
          <VendorOverview />
          <nav className="flex flex-col gap-2">
            <Link href="/vendor/purchase-orders" className="text-blue-600 underline">
              {t('vendor.purchaseOrders')}
            </Link>
            <Link href="/vendor/quotations" className="text-blue-600 underline">
              {t('vendor.quotations')}
            </Link>
            <Link href="/vendor/invoices" className="text-blue-600 underline">
              {t('vendor.invoices')}
            </Link>
          </nav>
        </>
      ) : (
        <p className="text-gray-600">{t('vendor.noSession')}</p>
      )}
    </div>
  );
}

// Rendered only when a session exists, so the Tier-2 hooks never fire without one.
function VendorOverview() {
  const { t } = useI18n();
  const rfqs = useVendorInvitedRfqs();
  const pos = useVendorPurchaseOrders();

  const rfqCols: Column<VendorInvitedRfq>[] = [
    { headerKey: 'vendor.rfqNumber', cell: (r) => r.rfq_number },
    { headerKey: 'table.status', cell: (r) => r.status },
    { headerKey: 'vendor.deadline', cell: (r) => new Date(r.deadline).toLocaleDateString() },
  ];
  const poCols: Column<VendorPurchaseOrder>[] = [
    { headerKey: 'vendor.colPoNumber', cell: (p) => p.po_number },
    { headerKey: 'table.status', cell: (p) => p.status },
    {
      headerKey: 'vendor.deliveryDate',
      cell: (p) => new Date(p.delivery_date).toLocaleDateString(),
    },
  ];

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase text-gray-500">{t('vendor.invitedRfqs')}</h2>
        <DataTable
          columns={rfqCols}
          rows={rfqs.data ?? []}
          rowKey={(r) => r.rfq_id}
          isLoading={rfqs.isLoading}
          emptyKey="vendor.noInvitedRfqs"
        />
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase text-gray-500">
          {t('vendor.purchaseOrders')}
        </h2>
        <DataTable
          columns={poCols}
          rows={pos.data ?? []}
          rowKey={(p) => p.po_id}
          isLoading={pos.isLoading}
          emptyKey="vendor.noPurchaseOrders"
        />
      </section>
    </div>
  );
}
