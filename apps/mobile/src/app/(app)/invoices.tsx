// Invoices screen — FINANCE: vendor invoices list (read). Source: GET /procurement/vendor-invoices.

import { FetchListScreen } from '../../components/FetchListScreen';

type Row = Record<string, unknown>;

export default function InvoicesScreen() {
  return (
    <FetchListScreen<Row>
      heading="Invoices"
      endpoint="/procurement/vendor-invoices"
      testID="invoices-screen"
      itemTestID="invoice-item"
      emptyText="No invoices"
      mapItem={(r) => ({
        key: String(r['vendor_invoice_id'] ?? r['invoice_id'] ?? ''),
        title: String(r['invoice_number'] ?? r['vendor_invoice_id'] ?? '—'),
        status: r['status'] as string | undefined,
      })}
    />
  );
}
