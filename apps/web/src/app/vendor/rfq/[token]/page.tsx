'use client';

import { useState, use } from 'react';
import Link from 'next/link';
import { useI18n } from '../../../../i18n';
import { useVendorRfq, useSubmitQuotation } from '../../../../lib/api/vendor';

/** Tier-1 magic-link page (§20.7.12): open an invited RFQ and submit a quotation — no account. */
export default function VendorRfqPage(props: { params: Promise<{ token: string }> }) {
  const params = use(props.params);
  const { token } = params;
  const { t } = useI18n();
  const rfq = useVendorRfq(token);
  const submit = useSubmitQuotation(token);

  const [totalAmount, setTotalAmount] = useState('');
  const [currency, setCurrency] = useState('THB');
  const [validityDays, setValidityDays] = useState('30');

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit.mutate({
      total_amount: totalAmount,
      currency_code: currency,
      validity_days: Number(validityDays),
    });
  };

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

      <form onSubmit={onSubmit} className="space-y-3">
        <h2 className="font-medium">{t('vendor.submitQuotation')}</h2>
        <label className="block text-sm">
          {t('vendor.totalAmount')}
          <input
            required
            value={totalAmount}
            onChange={(e) => setTotalAmount(e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2"
            inputMode="decimal"
          />
        </label>
        <label className="block text-sm">
          {t('vendor.currency')}
          <input
            required
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            maxLength={3}
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          {t('vendor.validityDays')}
          <input
            required
            type="number"
            min={1}
            max={365}
            value={validityDays}
            onChange={(e) => setValidityDays(e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </label>
        {submit.isError && <p className="text-sm text-red-600">{t('vendor.submitFailed')}</p>}
        <button
          type="submit"
          disabled={submit.isPending}
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {t('vendor.submitQuotation')}
        </button>
      </form>
    </div>
  );
}
