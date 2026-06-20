'use client';

import { DataTable, type Column } from '../../../components/ui/DataTable';
import { useI18n } from '../../../i18n';
import { useVendorPurchaseOrders, type VendorPurchaseOrder } from '../../../lib/api/vendor';

/** Tier-2: track PO status across the vendor's linked trading relationship (§20.7.12). */
export default function VendorPurchaseOrdersPage() {
  const { t } = useI18n();
  const query = useVendorPurchaseOrders();

  const columns: Column<VendorPurchaseOrder>[] = [
    { headerKey: 'vendor.colPoNumber', cell: (po) => po.po_number },
    { headerKey: 'table.status', cell: (po) => po.status },
    { headerKey: 'vendor.totalAmount', cell: (po) => `${po.total_amount} ${po.currency_code}` },
    {
      headerKey: 'vendor.deliveryDate',
      cell: (po) => new Date(po.delivery_date).toLocaleDateString(),
    },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t('vendor.purchaseOrders')}</h1>
      <DataTable
        columns={columns}
        rows={query.data ?? []}
        rowKey={(po) => po.po_id}
        isLoading={query.isLoading}
        emptyKey="vendor.noPurchaseOrders"
      />
    </div>
  );
}
