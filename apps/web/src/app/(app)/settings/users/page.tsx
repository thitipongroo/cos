'use client';

import { useState } from 'react';
import { DataTable, type Column } from '../../../../components/ui/DataTable';
import { useI18n } from '../../../../i18n';
import {
  useUsers,
  useCreateUser,
  useChangeUserRole,
  useDeactivateUser,
} from '../../../../lib/api/queries';
import type { UserRow } from '../../../../lib/api/types';

const ROLES = [
  'TENANT_ADMIN',
  'EXECUTIVE',
  'PROJECT_MANAGER',
  'PROCUREMENT_OFFICER',
  'FINANCE',
  'SAFETY_OFFICER',
  'SITE_ENGINEER',
  'SITE_WORKER',
  'VIEWER',
];

/** User management — list/create/change role/deactivate (§20.7.8 → /api/v1/users). */
export default function SettingsUsersPage() {
  const { t } = useI18n();
  const query = useUsers();
  const create = useCreateUser();
  const changeRole = useChangeUserRole();
  const deactivate = useDeactivateUser();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('SITE_ENGINEER');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate({ display_name: name, email, role });
    setName('');
    setEmail('');
  };

  const columns: Column<UserRow>[] = [
    { headerKey: 'settings.colName', cell: (u) => u.display_name },
    { headerKey: 'settings.colEmail', cell: (u) => u.email },
    {
      headerKey: 'settings.colRole',
      cell: (u) =>
        u.is_active ? (
          <select
            value={u.role}
            onChange={(e) => changeRole.mutate({ id: u.user_id, role: e.target.value })}
            className="rounded border border-gray-300 px-2 py-0.5 text-xs"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        ) : (
          u.role
        ),
    },
    {
      headerKey: 'table.status',
      cell: (u) => (u.is_active ? t('settings.active') : t('settings.inactive')),
    },
    {
      headerKey: 'table.actions',
      cell: (u) =>
        u.is_active ? (
          <button
            type="button"
            disabled={deactivate.isPending}
            onClick={() => deactivate.mutate(u.user_id)}
            className="rounded border border-red-600 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {t('settings.deactivate')}
          </button>
        ) : (
          '—'
        ),
    },
  ];

  const field = 'rounded-md border border-gray-300 px-3 py-1.5 text-sm';

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-gray-800">{t('settings.usersTitle')}</h1>
      <form onSubmit={submit} className="mb-6 flex flex-wrap items-center gap-2">
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('settings.colName')}
          className={field}
        />
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('settings.colEmail')}
          className={field}
        />
        <select value={role} onChange={(e) => setRole(e.target.value)} className={field}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={create.isPending || !name || !email}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {t('settings.createUser')}
        </button>
      </form>
      <DataTable
        columns={columns}
        rows={query.data?.data ?? []}
        rowKey={(u) => u.user_id}
        isLoading={query.isLoading}
      />
    </div>
  );
}
