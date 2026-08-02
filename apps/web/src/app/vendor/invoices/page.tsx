'use client';

import { vendorInvoiceSubmitSchema } from '@cos/schemas';
import { Controller } from 'react-hook-form';
import { DateField } from '../../../components/form/DateField';
import { TextInputField } from '../../../components/form/TextInputField';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { useI18n } from '../../../i18n';
import { useValidatedForm } from '../../../lib/forms';
import { useVendorInvoices, useSubmitInvoice, type VendorInvoice } from '../../../lib/api/vendor';

/** Tier-2: submit + list the vendor's own invoices (§20.7.12). */
export default function VendorInvoicesPage() {
  const { t } = useI18n();
  const query = useVendorInvoices();
  const submit = useSubmitInvoice();

  const {
    control,
    handleSubmit,
    reset,
    getValues,
    formState: { errors, isSubmitting },
  } = useValidatedForm({
    schema: vendorInvoiceSubmitSchema,
    defaultValues: {
      po_id: '',
      invoice_number: '',
      amount: '',
      currency_code: 'THB',
      invoice_date: '',
      due_date: '',
    },
  });

  const messageFor = (key?: string) => (key ? t(key) : undefined);

  const onSubmit = handleSubmit((values) => {
    submit.mutate(values, {
      // Keep the currency: a vendor invoices in one currency, not a different one each time.
      onSuccess: () =>
        reset({
          po_id: '',
          invoice_number: '',
          amount: '',
          currency_code: getValues('currency_code'),
          invoice_date: '',
          due_date: '',
        }),
    });
  });

  const columns: Column<VendorInvoice>[] = [
    { headerKey: 'vendor.colInvoiceNumber', cell: (i) => i.invoice_number },
    { headerKey: 'vendor.totalAmount', cell: (i) => `${i.amount} ${i.currency_code}` },
    { headerKey: 'vendor.invoiceDate', cell: (i) => new Date(i.invoice_date).toLocaleDateString() },
    { headerKey: 'table.status', cell: (i) => i.status },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{t('vendor.invoices')}</h1>

      <form onSubmit={onSubmit} noValidate className="grid grid-cols-2 gap-3">
        <Controller
          name="po_id"
          control={control}
          render={({ field }) => (
            <TextInputField
              {...field}
              label={t('vendor.poId')}
              errorMessage={messageFor(errors.po_id?.message)}
            />
          )}
        />
        <Controller
          name="invoice_number"
          control={control}
          render={({ field }) => (
            <TextInputField
              {...field}
              label={t('vendor.colInvoiceNumber')}
              errorMessage={messageFor(errors.invoice_number?.message)}
            />
          )}
        />
        <Controller
          name="amount"
          control={control}
          render={({ field }) => (
            <TextInputField
              {...field}
              label={t('vendor.totalAmount')}
              errorMessage={messageFor(errors.amount?.message)}
            />
          )}
        />
        <Controller
          name="currency_code"
          control={control}
          render={({ field }) => (
            <TextInputField
              name={field.name}
              onBlur={field.onBlur}
              value={field.value}
              // The schema requires three uppercase letters; upper-casing as the vendor types
              // keeps that from reading as a validation failure for `thb`.
              onChange={(v) => field.onChange(v.toUpperCase())}
              label={t('vendor.currency')}
              errorMessage={messageFor(errors.currency_code?.message)}
            />
          )}
        />
        <Controller
          name="invoice_date"
          control={control}
          render={({ field }) => (
            <DateField
              {...field}
              label={t('vendor.invoiceDate')}
              errorMessage={messageFor(errors.invoice_date?.message)}
            />
          )}
        />
        <Controller
          name="due_date"
          control={control}
          render={({ field }) => (
            <DateField
              {...field}
              label={t('vendor.dueDate')}
              errorMessage={messageFor(errors.due_date?.message)}
            />
          )}
        />
        {submit.isError && (
          <p role="alert" className="col-span-2 text-sm text-red-600">
            {t('vendor.submitFailed')}
          </p>
        )}
        <button
          type="submit"
          disabled={isSubmitting || submit.isPending}
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
