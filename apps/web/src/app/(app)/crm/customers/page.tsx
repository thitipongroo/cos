'use client';

import { DataTable, type Column } from '../../../../components/ui/DataTable';
import { useI18n } from '../../../../i18n';
import { useCrmCustomers } from '../../../../lib/api/queries';
import type { CrmCustomerRow } from '../../../../lib/api/types';
import { formatDate } from '../../../../lib/format';

/** CRM customers — won opportunities converted to customers (§20.7.10 → /crm/customers). */
export default function CrmCustomersPage() {
  const { t, locale } = useI18n();
  const query = useCrmCustomers();

  const columns: Column<CrmCustomerRow>[] = [
    { headerKey: 'crm.colCompany', cell: (c) => c.company_name },
    { headerKey: 'table.status', cell: (c) => c.status },
    { headerKey: 'site.colDate', cell: (c) => formatDate(locale, c.created_at) },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">{t('crm.customersTitle')}</h1>
      <DataTable
        columns={columns}
        rows={query.data ?? []}
        rowKey={(c) => c.customer_id}
        isLoading={query.isLoading}
      />
    </div>
  );
}
