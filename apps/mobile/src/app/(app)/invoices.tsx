// Invoices screen — FINANCE: vendor invoices list (read). Source: GET /procurement/vendor-invoices.

import { FetchListScreen } from '../../components/FetchListScreen';
import { useT } from '../../i18n';

type Row = Record<string, unknown>;

export default function InvoicesScreen() {
  const t = useT();
  return (
    <FetchListScreen<Row>
      heading={t('finance.invoices.title')}
      endpoint="/procurement/vendor-invoices"
      testID="invoices-screen"
      itemTestID="invoice-item"
      emptyText={t('finance.invoices.empty')}
      mapItem={(r) => ({
        key: String(r['vendor_invoice_id'] ?? r['invoice_id'] ?? ''),
        title: String(r['invoice_number'] ?? r['vendor_invoice_id'] ?? '—'),
        status: r['status'] as string | undefined,
      })}
    />
  );
}
