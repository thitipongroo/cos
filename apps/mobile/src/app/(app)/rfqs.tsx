// RFQs screen — PROCUREMENT: RFQ list with status. Source: GET /procurement/rfqs.

import { FetchListScreen } from '../../components/FetchListScreen';

type Row = Record<string, unknown>;

export default function RfqsScreen() {
  return (
    <FetchListScreen<Row>
      heading="RFQs"
      endpoint="/procurement/rfqs"
      testID="rfqs-screen"
      itemTestID="rfq-item"
      emptyText="No RFQs"
      mapItem={(r) => ({
        key: String(r['rfq_id'] ?? ''),
        title: String(r['rfq_number'] ?? r['rfq_id'] ?? '—'),
        status: r['status'] as string | undefined,
      })}
    />
  );
}
