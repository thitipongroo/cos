'use client';

import { useState } from 'react';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { useI18n } from '../../../i18n';
import { useVendorInvoices, useSubmitInvoice, type VendorInvoice } from '../../../lib/api/vendor';

/** Tier-2: submit + list the vendor's own invoices (§20.7.12). */
export default function VendorInvoicesPage() {
  const { t } = useI18n();
  const query = useVendorInvoices();
  const submit = useSubmitInvoice();

  const [poId, setPoId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('THB');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [dueDate, setDueDate] = useState('');

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit.mutate(
      {
        po_id: poId,
        invoice_number: invoiceNumber,
        amount,
        currency_code: currency,
        invoice_date: invoiceDate,
        due_date: dueDate,
      },
      {
        onSuccess: () => {
          setPoId('');
          setInvoiceNumber('');
          setAmount('');
          setInvoiceDate('');
          setDueDate('');
        },
      },
    );
  };

  const columns: Column<VendorInvoice>[] = [
    { headerKey: 'vendor.colInvoiceNumber', cell: (i) => i.invoice_number },
    { headerKey: 'vendor.totalAmount', cell: (i) => `${i.amount} ${i.currency_code}` },
    { headerKey: 'vendor.invoiceDate', cell: (i) => new Date(i.invoice_date).toLocaleDateString() },
    { headerKey: 'table.status', cell: (i) => i.status },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{t('vendor.invoices')}</h1>

      <form onSubmit={onSubmit} className="grid grid-cols-2 gap-3">
        <input
          required
          placeholder={t('vendor.poId')}
          value={poId}
          onChange={(e) => setPoId(e.target.value)}
          className="rounded border px-3 py-2"
        />
        <input
          required
          placeholder={t('vendor.colInvoiceNumber')}
          value={invoiceNumber}
          onChange={(e) => setInvoiceNumber(e.target.value)}
          className="rounded border px-3 py-2"
        />
        <input
          required
          placeholder={t('vendor.totalAmount')}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          className="rounded border px-3 py-2"
        />
        <input
          required
          value={currency}
          onChange={(e) => setCurrency(e.target.value.toUpperCase())}
          maxLength={3}
          className="rounded border px-3 py-2"
        />
        <label className="text-sm text-gray-600">
          {t('vendor.invoiceDate')}
          <input
            required
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm text-gray-600">
          {t('vendor.dueDate')}
          <input
            required
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </label>
        {submit.isError && (
          <p className="col-span-2 text-sm text-red-600">{t('vendor.submitFailed')}</p>
        )}
        <button
          type="submit"
          disabled={submit.isPending}
          className="col-span-2 rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {t('vendor.submitInvoice')}
        </button>
      </form>

      <DataTable
        columns={columns}
        rows={query.data ?? []}
        rowKey={(i) => i.invoice_id}
        isLoading={query.isLoading}
        emptyKey="vendor.noInvoices"
      />
    </div>
  );
}
