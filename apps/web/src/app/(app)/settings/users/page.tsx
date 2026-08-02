'use client';

import { userCreateSchema } from '@cos/schemas';
import { Controller } from 'react-hook-form';
import { NativeSelectField } from '../../../../components/form/NativeSelectField';
import { TextInputField } from '../../../../components/form/TextInputField';
import { DataTable, type Column } from '../../../../components/ui/DataTable';
import { useI18n } from '../../../../i18n';
import {
  useUsers,
  useCreateUser,
  useChangeUserRole,
  useDeactivateUser,
} from '../../../../lib/api/queries';
import type { UserRow } from '../../../../lib/api/types';
import { useValidatedForm } from '../../../../lib/forms';

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

  const {
    control,
    handleSubmit,
    reset,
    getValues,
    formState: { errors, isSubmitting },
  } = useValidatedForm({
    schema: userCreateSchema,
    defaultValues: { display_name: '', email: '', role: 'SITE_ENGINEER' as const },
  });

  const messageFor = (key?: string) => (key ? t(key) : undefined);

  const submit = handleSubmit((values) => {
    create.mutate({
      display_name: values.display_name,
      email: values.email,
      role: values.role,
    });
    // Keep the role: an admin inviting a crew invites several people into the same one.
    reset({ display_name: '', email: '', role: getValues('role') });
  });

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

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-gray-800">{t('settings.usersTitle')}</h1>
      <form onSubmit={submit} noValidate className="mb-6 flex flex-wrap items-start gap-2">
        <Controller
          name="display_name"
          control={control}
          render={({ field }) => (
            <TextInputField
              {...field}
              label={t('settings.colName')}
              errorMessage={messageFor(errors.display_name?.message)}
            />
          )}
        />
        <Controller
          name="email"
          control={control}
          render={({ field }) => (
            <TextInputField
              {...field}
              type="email"
              label={t('settings.colEmail')}
              errorMessage={messageFor(errors.email?.message)}
            />
          )}
        />
        {/* ROLES is this page's own list and is narrower than @cos/schemas' ASSIGNABLE_ROLE —
            PROC_MANAGER and CRM_SALES_MANAGER are omitted here. Left as-is: which roles a tenant
            admin may hand out is a product decision, and the schema accepting a superset only
            means the server still has the final say. */}
        <Controller
          name="role"
          control={control}
          render={({ field }) => (
            <NativeSelectField
              {...field}
              label={t('settings.colRole')}
              options={ROLES.map((r) => ({ id: r, label: r }))}
              errorMessage={messageFor(errors.role?.message)}
            />
          )}
        />
        <button
          type="submit"
          disabled={isSubmitting || create.isPending}
          className="mt-6 rounded-md bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
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
