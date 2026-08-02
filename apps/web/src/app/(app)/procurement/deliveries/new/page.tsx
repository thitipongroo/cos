'use client';

import { deliveryRecordSchema } from '@cos/schemas';
import Link from 'next/link';
import { useState } from 'react';
import { Controller } from 'react-hook-form';
import { NativeSelectField } from '../../../../../components/form/NativeSelectField';
import { TextInputField } from '../../../../../components/form/TextInputField';
import { useI18n } from '../../../../../i18n';
import {
  useAllPurchaseOrders,
  usePurchaseOrder,
  useRecordDelivery,
} from '../../../../../lib/api/queries';
import { useValidatedForm } from '../../../../../lib/forms';

/** Record/receive a delivery against a purchase order (§20.7.3 → POST /procurement/deliveries).
 *  Pick a PO, then enter the quantity received per line item. */
export default function RecordDeliveryPage() {
  const { t } = useI18n();
  const orders = useAllPurchaseOrders({});
  const record = useRecordDelivery();

  // Per-line quantities stay in local state because the set of lines depends on which PO is
  // selected — they are UI state, not form state. What react-hook-form validates is the `items`
  // array they compose into, mirrored on every keystroke below, so the schema sees the real
  // payload rather than a parallel shape that could drift from it.
  const [received, setReceived] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    getValues,
    formState: { errors, isSubmitting },
  } = useValidatedForm({
    schema: deliveryRecordSchema,
    defaultValues: {
      po_id: '',
      delivered_at: new Date().toISOString().slice(0, 16),
      delivery_note: '',
      items: [],
    },
  });

  const messageFor = (key?: string) => (key ? t(key) : undefined);

  const poId = watch('po_id');
  const detail = usePurchaseOrder(poId);
  const lines = detail.data?.line_items ?? [];

  /** Mirror the typed quantities into the validated `items` array, dropping the blanks. */
  const syncItems = (next: Record<string, string>) => {
    setValue(
      'items',
      Object.entries(next)
        .filter(([, quantity]) => quantity.trim() !== '')
        .map(([line_id, quantity_received]) => ({ line_id, quantity_received })),
      { shouldValidate: true },
    );
  };

  const onQuantityChange = (lineId: string, value: string) => {
    setReceived((prev) => {
      const next = { ...prev, [lineId]: value };
      syncItems(next);
      return next;
    });
  };

  const onSelectPo = (id: string) => {
    setValue('po_id', id, { shouldValidate: true });
    // A different PO has different lines — carrying quantities across would post them against
    // line ids that belong to the previous order.
    setReceived({});
    syncItems({});
  };

  const submit = handleSubmit(async (values) => {
    setDone(false);
    await record.mutateAsync({
      po_id: values.po_id,
      delivery_note: values.delivery_note || undefined,
      // The field holds a local datetime; the API takes an absolute instant.
      delivered_at: new Date(values.delivered_at).toISOString(),
      items: values.items,
    });
    setDone(true);
    setReceived({});
    reset({
      po_id: getValues('po_id'),
      delivered_at: new Date().toISOString().slice(0, 16),
      delivery_note: '',
      items: [],
    });
  });

  return (
    <div className="max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">{t('proc.recordDeliveryTitle')}</h1>
        <Link href="/procurement/deliveries" className="text-sm text-blue-600 hover:underline">
          {t('proc.backToDeliveries')}
        </Link>
      </div>

      {done && (
        <p role="status" className="mb-3 text-sm text-green-700">
          {t('proc.deliveryRecorded')}
        </p>
      )}

      <form onSubmit={submit} noValidate className="space-y-4">
        <Controller
          name="po_id"
          control={control}
          render={({ field }) => (
            <NativeSelectField
              {...field}
              // Not field.onChange: switching PO must also clear the per-line quantities.
              onChange={onSelectPo}
              label={t('proc.selectPo')}
              placeholder={t('proc.selectPo')}
              options={
                orders.data?.items.map((po) => ({
                  id: po.po_id,
                  label: `${po.po_number} — ${po.status}`,
                })) ?? []
              }
              errorMessage={messageFor(errors.po_id?.message)}
            />
          )}
        />

        <div className="grid grid-cols-2 gap-3">
          {/* Native datetime-local rather than DateField: a goods-receipt time matters, and React
              Aria's DatePicker is date-only. */}
          <div className="flex flex-col gap-1">
            <label htmlFor="delivered-at" className="block text-sm font-medium text-gray-700">
              {t('proc.deliveredAt')}
            </label>
            <Controller
              name="delivered_at"
              control={control}
              render={({ field }) => (
                <>
                  <input
                    id="delivered-at"
                    type="datetime-local"
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                    onBlur={field.onBlur}
                    name={field.name}
                    aria-invalid={errors.delivered_at ? true : undefined}
                    aria-describedby={errors.delivered_at ? 'delivered-at-error' : undefined}
                    className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                  />
                  {errors.delivered_at ? (
                    <span id="delivered-at-error" role="alert" className="text-xs text-red-700">
                      {messageFor(errors.delivered_at.message)}
                    </span>
                  ) : null}
                </>
              )}
            />
          </div>
          <Controller
            name="delivery_note"
            control={control}
            render={({ field }) => (
              <TextInputField
                {...field}
                label={t('proc.deliveryNote')}
                errorMessage={messageFor(errors.delivery_note?.message)}
              />
            )}
          />
        </div>

        {poId && detail.isLoading && <p className="text-sm text-gray-500">{t('common.loading')}</p>}

        {lines.length > 0 && (
          <div className="overflow-x-auto rounded-md border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">{t('proc.colDescription')}</th>
                  <th className="px-3 py-2 text-right">{t('proc.colOrdered')}</th>
                  <th className="px-3 py-2 text-right">{t('proc.colReceived')}</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.line_id} className="border-t border-gray-100">
                    <td className="px-3 py-2">{l.description}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                      {l.quantity} {l.unit}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        step="0.0001"
                        min="0"
                        placeholder={l.quantity}
                        // Each row's input needs its own accessible name — the column header alone
                        // is not announced when focus lands inside the cell (WCAG 4.1.2).
                        aria-label={`${t('proc.colReceived')} — ${l.description}`}
                        value={received[l.line_id] ?? ''}
                        onChange={(e) => onQuantityChange(l.line_id, e.target.value)}
                        className="w-28 rounded border border-gray-300 px-2 py-1 text-right text-sm"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* The "no quantities entered" case used to be a silent `return` from the submit handler —
            the user pressed the button and nothing happened, with no explanation. The schema's
            non-empty `items` rule now says so out loud. */}
        {errors.items ? (
          <p role="alert" className="text-xs text-red-700">
            {messageFor(errors.items.message)}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting || record.isPending}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {t('proc.recordDelivery')}
        </button>
      </form>
    </div>
  );
}
