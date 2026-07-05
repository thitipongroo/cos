// RFQs screen — PROCUREMENT: RFQ list with status. Source: GET /procurement/rfqs.

import { FetchListScreen } from '../../components/FetchListScreen';
import { useT } from '../../i18n';

type Row = Record<string, unknown>;

export default function RfqsScreen() {
  const t = useT();
  return (
    <FetchListScreen<Row>
      heading={t('procurement.rfqs.title')}
      endpoint="/procurement/rfqs"
      testID="rfqs-screen"
      itemTestID="rfq-item"
      emptyText={t('procurement.rfqs.empty')}
      mapItem={(r) => ({
        key: String(r['rfq_id'] ?? ''),
        title: String(r['rfq_number'] ?? r['rfq_id'] ?? '—'),
        status: r['status'] as string | undefined,
      })}
    />
  );
}
