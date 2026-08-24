// Customers screen — CRM_SALES_MANAGER: read-only customer list (§20.7.10).
//
// "Read-only" is the spec's word, not a shortcut: the row is created by converting a won opportunity
// (crm.service.ts writes finance.customers), so there is no create action to render here. Source is
// GET /crm/customers, which reads finance.customers — the canonical store (ADR-024/029) — rather
// than a CRM-local copy.

import { FetchListScreen } from '../../components/FetchListScreen';
import { useT } from '../../i18n';
import type { Customer } from '../../api/crm';

export default function CustomersScreen(): React.JSX.Element {
  const t = useT();
  return (
    <FetchListScreen<Customer>
      heading={t('crm.customers.title')}
      endpoint="/crm/customers"
      testID="customers-screen"
      itemTestID="customer-item"
      listTestID="customer-list"
      emptyText={t('crm.customers.empty')}
      mapItem={(c) => ({
        key: c.customer_id,
        title: c.company_name,
        status: c.status,
      })}
    />
  );
}
