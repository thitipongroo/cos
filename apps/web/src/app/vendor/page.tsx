'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '../../i18n';
import { getVendorSession } from '../../lib/api/vendor';

/** Vendor dashboard (§20.7.12). Tier-2 links appear once a session exists (after responding to an RFQ). */
export default function VendorDashboardPage() {
  const { t } = useI18n();
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    setHasSession(getVendorSession() !== null);
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t('vendor.dashboardTitle')}</h1>
      {hasSession ? (
        <nav className="flex flex-col gap-2">
          <Link href="/vendor/purchase-orders" className="text-blue-600 underline">
            {t('vendor.purchaseOrders')}
          </Link>
          <Link href="/vendor/invoices" className="text-blue-600 underline">
            {t('vendor.invoices')}
          </Link>
        </nav>
      ) : (
        <p className="text-gray-600">{t('vendor.noSession')}</p>
      )}
    </div>
  );
}
