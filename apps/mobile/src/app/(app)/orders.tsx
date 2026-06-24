// Orders screen — PROCUREMENT: purchase order list with status. Source: GET /procurement/purchase-orders.

import { FetchListScreen } from '../../components/FetchListScreen';

type Row = Record<string, unknown>;

export default function OrdersScreen() {
  return (
    <FetchListScreen<Row>
      heading="Purchase Orders"
      endpoint="/procurement/purchase-orders"
      testID="orders-screen"
      itemTestID="order-item"
      emptyText="No purchase orders"
      mapItem={(r) => ({
        key: String(r['po_id'] ?? ''),
        title: String(r['po_number'] ?? r['po_id'] ?? '—'),
        status: r['status'] as string | undefined,
      })}
    />
  );
}
