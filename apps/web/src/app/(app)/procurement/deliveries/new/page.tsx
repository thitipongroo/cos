'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useI18n } from '../../../../../i18n';
import {
  useAllPurchaseOrders,
  usePurchaseOrder,
  useRecordDelivery,
} from '../../../../../lib/api/queries';

/** Record/receive a delivery against a purchase order (§20.7.3 → POST /procurement/deliveries).
 *  Pick a PO, then enter the quantity received per line item. */
export default function RecordDeliveryPage() {
  const { t } = useI18n();
  const orders = useAllPurchaseOrders({});
  const record = useRecordDelivery();

  const [poId, setPoId] = useState('');
  const [deliveredAt, setDeliveredAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [deliveryNote, setDeliveryNote] = useState('');
  const [received, setReceived] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  const detail = usePurchaseOrder(poId);
  const lines = detail.data?.line_items ?? [];

  const field = 'w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDone(false);
    const items = lines
      .map((l) => ({ line_id: l.line_id, quantity_received: received[l.line_id] ?? '' }))
      .filter((it) => it.quantity_received.trim() !== '');
    if (items.length === 0) return;
    await record.mutateAsync({
      po_id: poId,
      delivery_note: deliveryNote || undefined,
      delivered_at: new Date(deliveredAt).toISOString(),
      items,
    });
    setDone(true);
    setReceived({});
    setDeliveryNote('');
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">{t('proc.recordDeliveryTitle')}</h1>
        <Link href="/procurement/deliveries" className="text-sm text-blue-600 hover:underline">
          {t('proc.backToDeliveries')}
        </Link>
      </div>

      {done && <p className="mb-3 text-sm text-green-700">{t('proc.deliveryRecorded')}</p>}

      <form onSubmit={submit} className="space-y-4">
        <select required value={poId} onChange={(e) => setPoId(e.target.value)} className={field}>
          <option value="">{t('proc.selectPo')}</option>
          {orders.data?.items.map((po) => (
            <option key={po.po_id} value={po.po_id}>
              {po.po_number} — {po.status}
            </option>
          ))}
        </select>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-gray-600">{t('proc.deliveredAt')}</span>
            <input
              type="datetime-local"
              required
              value={deliveredAt}
              onChange={(e) => setDeliveredAt(e.target.value)}
              className={field}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-gray-600">{t('proc.deliveryNote')}</span>
            <input
              value={deliveryNote}
              onChange={(e) => setDeliveryNote(e.target.value)}
              maxLength={100}
              className={field}
            />
          </label>
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
                        value={received[l.line_id] ?? ''}
                        onChange={(e) =>
                          setReceived((r) => ({ ...r, [l.line_id]: e.target.value }))
                        }
                        className="w-28 rounded border border-gray-300 px-2 py-1 text-right text-sm"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button
          type="submit"
          disabled={record.isPending || !poId || lines.length === 0}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {t('proc.recordDelivery')}
        </button>
      </form>
    </div>
  );
}
