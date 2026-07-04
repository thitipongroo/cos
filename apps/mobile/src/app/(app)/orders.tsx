// Orders screen — PROCUREMENT: purchase order list with status. Source: GET /procurement/purchase-orders.

import { FetchListScreen } from '../../components/FetchListScreen';
import { useT } from '../../i18n';

type Row = Record<string, unknown>;

export default function OrdersScreen() {
  const t = useT();
  return (
    <FetchListScreen<Row>
      heading={t('procurement.orders.title')}
      endpoint="/procurement/purchase-orders"
      testID="orders-screen"
      itemTestID="order-item"
      emptyText={t('procurement.orders.empty')}
      mapItem={(r) => ({
        key: String(r['po_id'] ?? ''),
        title: String(r['po_number'] ?? r['po_id'] ?? '—'),
        status: r['status'] as string | undefined,
      })}
    />
  );
}
