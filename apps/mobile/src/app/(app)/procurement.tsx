// Procurement screen — PROJECT_MANAGER procurement status (read-only).
// Fetches GET /procurement/purchase-orders and lists POs with delivery status.

import { FetchListScreen } from '../../components/FetchListScreen';
import { useT } from '../../i18n';

interface PoRow {
  po_id: string;
  po_number?: string;
  status: string;
}

export default function ProcurementScreen() {
  const t = useT();
  return (
    <FetchListScreen<PoRow>
      heading={t('pm.procurement.title')}
      endpoint="/procurement/purchase-orders"
      testID="procurement-screen"
      listTestID="po-list"
      itemTestID="po-item"
      emptyText={t('pm.procurement.empty')}
      mapItem={(item) => ({
        key: item.po_id,
        title: item.po_number ?? item.po_id.slice(0, 8),
        status: item.status,
      })}
    />
  );
}
