'use client';

import { useState } from 'react';
import { DataTable, type Column } from '../../../../components/ui/DataTable';
import { useI18n } from '../../../../i18n';
import {
  usePayments,
  useApprovePayment,
  useRecordPayment,
  useProjects,
  useFinanceInvoices,
} from '../../../../lib/api/queries';
import type { PaymentRow } from '../../../../lib/api/types';
import { formatDate, formatMoney } from '../../../../lib/format';
import { useReadOnly } from '../../../../lib/auth/useReadOnly';

/** Tenant-wide AP payment queue (§20.7.4 → GET /finance/payments; approve via
 *  PATCH /finance/payments/:id/approve). Records a payment against a vendor invoice
 *  (POST /finance/payments) — the actual-cost entry that feeds budget vs actual / variance. */
export default function PaymentsPage() {
  const { t, locale } = useI18n();
  const query = usePayments('');
  const approve = useApprovePayment();
  const record = useRecordPayment();
  const projects = useProjects();
  const invoices = useFinanceInvoices('');
  const readOnly = useReadOnly();

  const [projectId, setProjectId] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [amount, setAmount] = useState('');
  const [currencyCode, setCurrencyCode] = useState('THB');
  const [paymentDate, setPaymentDate] = useState('');
  const [reference, setReference] = useState('');

  const onSelectInvoice = (id: string) => {
    setInvoiceId(id);
    // Pre-fill amount + currency from the chosen invoice (still editable so a partial or
    // over-budget amount can be recorded).
    const inv = invoices.data?.items.find((i) => i.invoice_id === id);
    if (inv) {
      setAmount(inv.amount);
      setCurrencyCode(inv.currency_code);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await record.mutateAsync({
      project_id: projectId,
      invoice_id: invoiceId,
      amount,
      currency_code: currencyCode,
      payment_date: paymentDate,
      payment_reference: reference || undefined,
    });
    setAmount('');
    setReference('');
    setPaymentDate('');
  };

  const field = 'rounded-md border border-gray-300 px-3 py-1.5 text-sm';

  const columns: Column<PaymentRow>[] = [
    { headerKey: 'pm.colNumber', cell: (p) => p.invoice_id },
    { headerKey: 'pm.colAmount', cell: (p) => formatMoney(locale, p.amount, p.currency_code) },
    { headerKey: 'pm.colDate', cell: (p) => formatDate(locale, p.payment_date) },
    { headerKey: 'table.status', cell: (p) => p.status },
    { headerKey: 'finance.colReference', cell: (p) => p.payment_reference ?? '—' },
    {
      headerKey: 'table.actions',
      cell: (p) =>
        p.status === 'PENDING' && !readOnly ? (
          <button
            type="button"
            disabled={approve.isPending}
            onClick={() => approve.mutate(p.payment_id)}
            className="rounded border border-green-600 px-2 py-0.5 text-xs text-green-700 hover:bg-green-50 disabled:opacity-50"
          >
            {t('finance.approve')}
          </button>
        ) : (
          '—'
        ),
    },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">{t('finance.paymentsTitle')}</h1>

      {!readOnly && (
        <form onSubmit={submit} className="mb-4 flex flex-wrap items-end gap-2">
          <select
            required
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className={field}
          >
            <option value="">{t('finance.selectProject')}</option>
            {projects.data?.items.map((p) => (
              <option key={p.project_id} value={p.project_id}>
                {p.project_name}
              </option>
            ))}
          </select>
          <select
            required
            value={invoiceId}
            onChange={(e) => onSelectInvoice(e.target.value)}
            className={field}
          >
            <option value="">{t('finance.selectInvoice')}</option>
            {invoices.data?.items.map((i) => (
              <option key={i.invoice_id} value={i.invoice_id}>
                {i.invoice_number}
              </option>
            ))}
          </select>
          <input
            required
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={t('finance.amount')}
            className={field}
          />
          <input
            required
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            aria-label={t('finance.paymentDate')}
            className={field}
          />
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder={t('finance.paymentReference')}
            maxLength={100}
            className={field}
          />
          <button
            type="submit"
            disabled={record.isPending || !projectId || !invoiceId || !amount || !paymentDate}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {t('finance.recordPayment')}
          </button>
        </form>
      )}

      <DataTable
        columns={columns}
        rows={query.data?.items ?? []}
        rowKey={(p) => p.payment_id}
        isLoading={query.isLoading}
      />
    </div>
  );
}
