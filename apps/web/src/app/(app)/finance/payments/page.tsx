'use client';

import { paymentRecordSchema } from '@cos/schemas';
import { Controller } from 'react-hook-form';
import { DateField } from '../../../../components/form/DateField';
import { NativeSelectField } from '../../../../components/form/NativeSelectField';
import { TextInputField } from '../../../../components/form/TextInputField';
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
import { useValidatedForm } from '../../../../lib/forms';

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

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useValidatedForm({
    schema: paymentRecordSchema,
    defaultValues: {
      project_id: '',
      invoice_id: '',
      amount: '',
      currency_code: 'THB',
      payment_date: '',
      payment_reference: '',
    },
  });

  const messageFor = (key?: string) => (key ? t(key) : undefined);

  const onSelectInvoice = (id: string) => {
    setValue('invoice_id', id, { shouldValidate: true });
    // Pre-fill amount + currency from the chosen invoice (still editable so a partial or
    // over-budget amount can be recorded).
    const inv = invoices.data?.items.find((i) => i.invoice_id === id);
    if (inv) {
      setValue('amount', inv.amount, { shouldValidate: true });
      setValue('currency_code', inv.currency_code, { shouldValidate: true });
    }
  };

  const submit = handleSubmit(async (values) => {
    await record.mutateAsync({
      ...values,
      payment_reference: values.payment_reference || undefined,
    });
    // Keep project and invoice: recording a second instalment against the same invoice is common.
    reset({
      project_id: getValues('project_id'),
      invoice_id: getValues('invoice_id'),
      amount: '',
      currency_code: getValues('currency_code'),
      payment_date: '',
      payment_reference: '',
    });
  });

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
        <form onSubmit={submit} noValidate className="mb-4 flex flex-wrap items-start gap-2">
          <Controller
            name="project_id"
            control={control}
            render={({ field }) => (
              <NativeSelectField
                {...field}
                label={t('finance.selectProject')}
                placeholder={t('finance.selectProject')}
                options={
                  projects.data?.items.map((p) => ({ id: p.project_id, label: p.project_name })) ??
                  []
                }
                errorMessage={messageFor(errors.project_id?.message)}
              />
            )}
          />
          <Controller
            name="invoice_id"
            control={control}
            render={({ field }) => (
              <NativeSelectField
                {...field}
                // Not field.onChange: picking an invoice also pre-fills amount and currency.
                onChange={onSelectInvoice}
                label={t('finance.selectInvoice')}
                placeholder={t('finance.selectInvoice')}
                options={
                  invoices.data?.items.map((i) => ({
                    id: i.invoice_id,
                    label: i.invoice_number,
                  })) ?? []
                }
                errorMessage={messageFor(errors.invoice_id?.message)}
              />
            )}
          />
          <Controller
            name="amount"
            control={control}
            render={({ field }) => (
              <TextInputField
                {...field}
                label={t('finance.amount')}
                errorMessage={messageFor(errors.amount?.message)}
              />
            )}
          />
          {/* DateField, not <input type="date">: the OS picker is always Gregorian, and a payment
              date is one a Thai finance user reads in Buddhist Era (QM-3). */}
          <Controller
            name="payment_date"
            control={control}
            render={({ field }) => (
              <DateField
                {...field}
                label={t('finance.paymentDate')}
                errorMessage={messageFor(errors.payment_date?.message)}
              />
            )}
          />
          <Controller
            name="payment_reference"
            control={control}
            render={({ field }) => (
              <TextInputField
                {...field}
                label={t('finance.paymentReference')}
                errorMessage={messageFor(errors.payment_reference?.message)}
              />
            )}
          />
          <button
            type="submit"
            disabled={isSubmitting || record.isPending}
            className="mt-6 rounded-md bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
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
