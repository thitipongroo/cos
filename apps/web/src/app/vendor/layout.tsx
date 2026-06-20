'use client';

import Link from 'next/link';
import { useI18n } from '../../i18n';
import { LanguageSwitcher } from '../../components/shell/LanguageSwitcher';

/**
 * Vendor Portal shell (§20.7.12, ADR-030). A deliberately minimal EXTERNAL shell — no internal
 * AppShell, navigation, or role switcher. Vendors are network identities, not tenant users.
 */
export default function VendorLayout({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="flex items-center justify-between border-b bg-white px-6 py-4">
        <Link href="/vendor" className="text-lg font-semibold">
          {t('vendor.portalTitle')}
        </Link>
        <LanguageSwitcher />
      </header>
      <main className="mx-auto max-w-3xl p-6">{children}</main>
    </div>
  );
}
