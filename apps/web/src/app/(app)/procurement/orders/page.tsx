'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { DataTable, type Column } from '../../../../components/ui/DataTable';
import { useI18n } from '../../../../i18n';
import {
  useAllPurchaseOrders,
  useSubmitPo,
  useApprovePo,
  useRejectPo,
  type PoApprovalTier,
} from '../../../../lib/api/queries';
import type { PurchaseOrderRow } from '../../../../lib/api/types';
import { useReadOnly } from '../../../../lib/auth/useReadOnly';

const STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'SENT',
  'ACKNOWLEDGED',
  'PARTIALLY_DELIVERED',
  'FULLY_DELIVERED',
  'INVOICED',
  'PAID',
  'DISPUTED',
];

// Approver's tier is derived from their role (product-owner ruling; the approve endpoint takes a
// tier and there is no separate role→tier mapping server-side).
const ROLE_TO_TIER: Record<string, PoApprovalTier> = {
  PROJECT_MANAGER: 'PM',
  FINANCE: 'FINANCE',
  EXECUTIVE: 'EXECUTIVE',
  TENANT_ADMIN: 'TENANT_ADMIN',
};

/** Tenant-wide purchase orders inbox + approval chain (§20.7.3). */
export default function PurchaseOrdersPage() {
  const { t } = useI18n();
  const { data: session } = useSession();
  const [status, setStatus] = useState('');
  const query = useAllPurchaseOrders({ status: status || undefined });
  const submit = useSubmitPo();
  const approve = useApprovePo();
  const reject = useRejectPo();
  const readOnly = useReadOnly();

  const tier = session?.user?.role ? ROLE_TO_TIER[session.user.role] : undefined;
  const busy = submit.isPending || approve.isPending || reject.isPending;

  const onReject = (poId: string) => {
    const reason = window.prompt(t('proc.rejectReason'));
    if (reason && reason.trim()) reject.mutate({ poId, reason: reason.trim() });
  };

  const columns: Column<PurchaseOrderRow>[] = [
    { headerKey: 'pm.colNumber', cell: (r) => r.po_number },
    { headerKey: 'table.status', cell: (r) => r.status },
    {
      headerKey: 'table.actions',
      cell: (r) => {
        if (readOnly) return '—';
        if (r.status === 'DRAFT') {
          return (
            <Btn label={t('proc.submit')} disabled={busy} onClick={() => submit.mutate(r.po_id)} />
          );
        }
        if (r.status === 'PENDING_APPROVAL') {
          return (
            <span className="flex gap-2">
              {tier && (
                <Btn
                  label={t('proc.approve')}
                  disabled={busy}
                  onClick={() => approve.mutate({ poId: r.po_id, tier })}
                />
              )}
              <Btn
                label={t('proc.reject')}
                danger
                disabled={busy}
                onClick={() => onReject(r.po_id)}
              />
            </span>
          );
        }
        return '—';
      },
    },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">{t('proc.ordersTitle')}</h1>
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="mb-4 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
      >
        <option value="">{t('proc.allStatuses')}</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <DataTable
        columns={columns}
        rows={query.data?.items ?? []}
        rowKey={(r) => r.po_id}
        isLoading={query.isLoading}
      />
    </div>
  );
}

function Btn({
  label,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded border px-2 py-0.5 text-xs disabled:opacity-50 ${
        danger
          ? 'border-red-600 text-red-600 hover:bg-red-50'
          : 'border-green-600 text-green-700 hover:bg-green-50'
      }`}
    >
      {label}
    </button>
  );
}
