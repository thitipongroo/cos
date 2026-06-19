'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { CosRole } from '@cos/types';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { useI18n } from '../../i18n';
import {
  useTenants,
  useCreateTenant,
  useDeactivateTenant,
  useAssignDedicatedDb,
} from '../../lib/api/queries';
import type { PlanType, TenantRow } from '../../lib/api/types';
import { formatDate } from '../../lib/format';

const PLANS: PlanType[] = ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'];

/** SYSTEM_ADMIN cross-tenant platform panel (§20.4 / §20.7.11). Separate from the tenant client. */
export default function AdminPanelPage() {
  const { t, locale } = useI18n();
  const { data: session } = useSession();
  const query = useTenants();
  const create = useCreateTenant();
  const deactivate = useDeactivateTenant();
  const assignDb = useAssignDedicatedDb();

  const [form, setForm] = useState({
    tenantCode: '',
    tenantName: '',
    planType: 'STARTER' as PlanType,
    dedicatedDbUrl: '',
  });

  if (session && session.user?.role !== CosRole.SYSTEM_ADMIN) {
    return <main className="p-8 text-sm text-gray-600">{t('admin.unauthorized')}</main>;
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(
      {
        tenantCode: form.tenantCode,
        tenantName: form.tenantName,
        planType: form.planType,
        dedicatedDbUrl: form.dedicatedDbUrl || undefined,
      },
      { onSuccess: () => setForm({ ...form, tenantCode: '', tenantName: '', dedicatedDbUrl: '' }) },
    );
  };

  const columns: Column<TenantRow>[] = [
    { headerKey: 'admin.colCode', cell: (x) => x.tenant_code },
    { headerKey: 'admin.colName', cell: (x) => x.tenant_name },
    { headerKey: 'admin.colPlan', cell: (x) => x.plan_type },
    {
      headerKey: 'table.status',
      cell: (x) => (x.is_active ? t('settings.active') : t('settings.inactive')),
    },
    {
      headerKey: 'admin.colDb',
      cell: (x) =>
        x.dedicated_db_url ? (x.dedicated_db_url.split('@')[1] ?? '—') : t('admin.shared'),
    },
    { headerKey: 'site.colDate', cell: (x) => formatDate(locale, x.created_at) },
    {
      headerKey: 'table.actions',
      cell: (x) =>
        x.is_active ? (
          <span className="flex gap-2">
            <button
              type="button"
              disabled={deactivate.isPending}
              onClick={() => deactivate.mutate(x.tenant_id)}
              className="rounded border border-red-600 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {t('settings.deactivate')}
            </button>
            {x.plan_type === 'ENTERPRISE' && (
              <button
                type="button"
                disabled={assignDb.isPending}
                onClick={() => {
                  const url = window.prompt('postgresql://...');
                  if (url) assignDb.mutate({ id: x.tenant_id, dedicatedDbUrl: url });
                }}
                className="rounded border border-blue-600 px-2 py-0.5 text-xs text-blue-600 hover:bg-blue-50 disabled:opacity-50"
              >
                {t('admin.assignDb')}
              </button>
            )}
          </span>
        ) : (
          '—'
        ),
    },
  ];

  const field = 'rounded-md border border-gray-300 px-3 py-1.5 text-sm';

  return (
    <main className="mx-auto max-w-6xl p-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-800">{t('admin.title')}</h1>

      <form onSubmit={submit} className="mb-6 flex flex-wrap items-end gap-2">
        <input
          required
          value={form.tenantCode}
          onChange={(e) => setForm({ ...form, tenantCode: e.target.value })}
          placeholder={t('admin.colCode')}
          className={field}
        />
        <input
          required
          value={form.tenantName}
          onChange={(e) => setForm({ ...form, tenantName: e.target.value })}
          placeholder={t('admin.colName')}
          className={field}
        />
        <select
          value={form.planType}
          onChange={(e) => setForm({ ...form, planType: e.target.value as PlanType })}
          className={field}
        >
          {PLANS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <input
          value={form.dedicatedDbUrl}
          onChange={(e) => setForm({ ...form, dedicatedDbUrl: e.target.value })}
          placeholder={t('admin.dbUrlOptional')}
          className={`${field} min-w-[16rem] flex-1`}
        />
        <button
          type="submit"
          disabled={create.isPending || !form.tenantCode || !form.tenantName}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {t('admin.createTenant')}
        </button>
      </form>

      <DataTable
        columns={columns}
        rows={query.data ?? []}
        rowKey={(x) => x.tenant_id}
        isLoading={query.isLoading}
      />
    </main>
  );
}
