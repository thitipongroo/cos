'use client';

import { useState } from 'react';
import { DataTable, type Column } from '../../../../components/ui/DataTable';
import { useI18n } from '../../../../i18n';
import {
  useAllPurchaseRequests,
  useCreatePurchaseRequest,
  useProjects,
} from '../../../../lib/api/queries';
import type { PurchaseRequestRow } from '../../../../lib/api/types';
import { formatDate } from '../../../../lib/format';
import { useReadOnly } from '../../../../lib/auth/useReadOnly';

const STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PO_CREATED'];

/** Tenant-wide purchase requests inbox + create (§20.7.3 → GET/POST /purchase-requests). */
export default function PurchaseRequestsPage() {
  const { t, locale } = useI18n();
  const [status, setStatus] = useState('');
  const query = useAllPurchaseRequests({ status: status || undefined });
  const projects = useProjects();
  const create = useCreatePurchaseRequest();
  const readOnly = useReadOnly();

  const [projectId, setProjectId] = useState('');
  const [prNumber, setPrNumber] = useState('');
  const [requiredDate, setRequiredDate] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await create.mutateAsync({
      project_id: projectId,
      pr_number: prNumber,
      required_date: requiredDate || undefined,
    });
    setPrNumber('');
    setRequiredDate('');
  };

  const field = 'rounded-md border border-gray-300 px-3 py-1.5 text-sm';

  const columns: Column<PurchaseRequestRow>[] = [
    { headerKey: 'pm.colNumber', cell: (r) => r.pr_number },
    { headerKey: 'table.status', cell: (r) => r.status },
    { headerKey: 'pm.colDate', cell: (r) => formatDate(locale, r.required_date) },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">{t('proc.requestsTitle')}</h1>

      {!readOnly && (
        <form onSubmit={submit} className="mb-4 flex flex-wrap items-end gap-2">
          <select
            required
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className={field}
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
            value={prNumber}
            onChange={(e) => setPrNumber(e.target.value)}
            placeholder={t('proc.prNumber')}
            maxLength={50}
            className={field}
          />
          <input
            type="date"
            value={requiredDate}
            onChange={(e) => setRequiredDate(e.target.value)}
            aria-label={t('proc.requiredDate')}
            className={field}
          />
          <button
            type="submit"
            disabled={create.isPending || !projectId || !prNumber}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {t('proc.createRequest')}
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
        rowKey={(r) => r.pr_id}
        isLoading={query.isLoading}
      />
    </div>
  );
}
