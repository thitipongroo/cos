'use client';

import { useState } from 'react';
import { DataTable, type Column } from '../../../../components/ui/DataTable';
import { useI18n } from '../../../../i18n';
import {
  useAllRfqs,
  usePublishRfq,
  useCloseRfq,
  useCancelRfq,
  useCreateRfq,
  useProjects,
} from '../../../../lib/api/queries';
import type { RfqRow } from '../../../../lib/api/types';
import { formatDate } from '../../../../lib/format';
import { useReadOnly } from '../../../../lib/auth/useReadOnly';

const STATUSES = ['DRAFT', 'PUBLISHED', 'CLOSED', 'EVALUATED', 'AWARDED', 'CANCELLED'];

/** Tenant-wide RFQ inbox (§20.7.3 → GET /rfqs; lifecycle via publish/close/cancel). */
export default function RfqsPage() {
  const { t, locale } = useI18n();
  const [status, setStatus] = useState('');
  const query = useAllRfqs({ status: status || undefined });
  const publish = usePublishRfq();
  const close = useCloseRfq();
  const cancel = useCancelRfq();
  const readOnly = useReadOnly();
  const busy = publish.isPending || close.isPending || cancel.isPending;
  const projects = useProjects();
  const create = useCreateRfq();
  const [projectId, setProjectId] = useState('');
  const [rfqNumber, setRfqNumber] = useState('');
  const [deadline, setDeadline] = useState('');

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await create.mutateAsync({
      project_id: projectId,
      rfq_number: rfqNumber,
      deadline: new Date(deadline).toISOString(),
    });
    setRfqNumber('');
    setDeadline('');
  };
  const f = 'rounded-md border border-gray-300 px-3 py-1.5 text-sm';

  const columns: Column<RfqRow>[] = [
    { headerKey: 'pm.colNumber', cell: (r) => r.rfq_number },
    { headerKey: 'table.status', cell: (r) => r.status },
    { headerKey: 'pm.colDeadline', cell: (r) => formatDate(locale, r.deadline) },
    {
      headerKey: 'table.actions',
      cell: (r) => {
        if (readOnly) return '—';
        if (r.status === 'DRAFT') {
          return (
            <ActionBtn
              label={t('proc.publish')}
              disabled={busy}
              onClick={() => publish.mutate(r.rfq_id)}
            />
          );
        }
        if (r.status === 'PUBLISHED') {
          return (
            <span className="flex gap-2">
              <ActionBtn
                label={t('proc.close')}
                disabled={busy}
                onClick={() => close.mutate(r.rfq_id)}
              />
              <ActionBtn
                label={t('proc.cancel')}
                danger
                disabled={busy}
                onClick={() => cancel.mutate(r.rfq_id)}
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
      <h1 className="mb-6 text-2xl font-bold text-gray-800">{t('proc.rfqsTitle')}</h1>

      {!readOnly && (
        <form onSubmit={submitCreate} className="mb-4 flex flex-wrap items-end gap-2">
          <select
            required
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className={f}
          >
            <option value="">{t('site.selectProject')}</option>
            {projects.data?.items.map((p) => (
              <option key={p.project_id} value={p.project_id}>
                {p.project_name}
              </option>
            ))}
          </select>
          <input
            required
            value={rfqNumber}
            onChange={(e) => setRfqNumber(e.target.value)}
            placeholder={t('proc.rfqNumber')}
            maxLength={50}
            className={f}
          />
          <input
            type="datetime-local"
            required
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            aria-label={t('proc.deadline')}
            className={f}
          />
          <button
            type="submit"
            disabled={create.isPending || !projectId || !rfqNumber || !deadline}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {t('proc.createRfq')}
          </button>
        </form>
      )}

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
        rowKey={(r) => r.rfq_id}
        isLoading={query.isLoading}
      />
    </div>
  );
}

function ActionBtn({
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
          : 'border-blue-600 text-blue-600 hover:bg-blue-50'
      }`}
    >
      {label}
    </button>
  );
}
