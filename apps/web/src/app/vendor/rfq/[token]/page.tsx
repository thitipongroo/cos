'use client';

import { quotationSubmitSchema } from '@cos/schemas';
import Link from 'next/link';
import { use } from 'react';
import { Controller } from 'react-hook-form';
import { TextInputField } from '../../../../components/form/TextInputField';
import { useI18n } from '../../../../i18n';
import { useVendorRfq, useSubmitQuotation } from '../../../../lib/api/vendor';
import { useValidatedForm } from '../../../../lib/forms';

/** Tier-1 magic-link page (§20.7.12): open an invited RFQ and submit a quotation — no account. */
export default function VendorRfqPage(props: { params: Promise<{ token: string }> }) {
  const params = use(props.params);
  const { token } = params;
  const { t } = useI18n();
  const rfq = useVendorRfq(token);
  const submit = useSubmitQuotation(token);

  // Declared before the loading/error early returns below — hooks cannot be called conditionally.
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useValidatedForm({
    schema: quotationSubmitSchema,
    defaultValues: { total_amount: '', currency_code: 'THB', validity_days: 30 },
  });

  const messageFor = (key?: string) => (key ? t(key) : undefined);

  const onSubmit = handleSubmit((values) => {
    submit.mutate(values);
  });

  if (rfq.isLoading) return <p>{t('common.loading')}</p>;
  if (rfq.isError || !rfq.data) return <p className="text-red-600">{t('vendor.rfqUnavailable')}</p>;

  if (submit.isSuccess) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-green-700">{t('vendor.quotationSent')}</h1>
        <Link href="/vendor" className="text-blue-600 underline">
          {t('vendor.goToDashboard')}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-xl font-semibold">{t('vendor.rfqTitle')}</h1>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <dt className="text-gray-500">{t('vendor.rfqNumber')}</dt>
          <dd>{rfq.data.rfq_number}</dd>
          <dt className="text-gray-500">{t('table.status')}</dt>
          <dd>{rfq.data.status}</dd>
          <dt className="text-gray-500">{t('vendor.deadline')}</dt>
          <dd>{new Date(rfq.data.deadline).toLocaleDateString()}</dd>
        </dl>
      </section>

      <form onSubmit={onSubmit} noValidate className="space-y-3">
        <h2 className="font-medium">{t('vendor.submitQuotation')}</h2>
        <Controller
          name="total_amount"
          control={control}
          render={({ field }) => (
            <TextInputField
              {...field}
              label={t('vendor.totalAmount')}
              errorMessage={messageFor(errors.total_amount?.message)}
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
              onChange={(v) => field.onChange(v.toUpperCase())}
              label={t('vendor.currency')}
              errorMessage={messageFor(errors.currency_code?.message)}
            />
          )}
        />
        <Controller
          name="validity_days"
          control={control}
          render={({ field }) => (
            <TextInputField
              name={field.name}
              onBlur={field.onBlur}
              value={field.value == null ? '' : String(field.value)}
              onChange={(v) => field.onChange(v === '' ? undefined : Number(v))}
              label={t('vendor.validityDays')}
              errorMessage={messageFor(errors.validity_days?.message)}
            />
          )}
        />
        {submit.isError && (
          <p role="alert" className="text-sm text-red-600">
            {t('vendor.submitFailed')}
          </p>
        )}
        <button
          type="submit"
          disabled={isSubmitting || submit.isPending}
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {t('vendor.submitQuotation')}
        </button>
      </form>
    </div>
  );
}
