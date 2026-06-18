'use client';

import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useT } from '../../i18n';
import { navForRole } from '../../lib/nav';
import { LanguageSwitcher } from './LanguageSwitcher';
import { NotificationBell } from './NotificationBell';
import { OfflineIndicator } from './OfflineIndicator';

/**
 * Authenticated app shell (§20.6.2): role-filtered left navigation + top bar
 * with the notification bell, offline/sync indicator, language switcher, and
 * sign-out. Navigation is derived from the session `role` claim so a role never
 * sees links to pages it cannot access (RBAC). Per-resource ABAC
 * (project_membership / ownership) is enforced server-side via the JWT.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const t = useT();
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = session?.user?.role;
  const items = navForRole(role);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="hidden w-60 shrink-0 border-r border-gray-200 bg-white md:block">
        <div className="px-4 py-4 text-lg font-bold text-gray-800">{t('common.appName')}</div>
        <nav className="px-2">
          {items.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded px-3 py-2 text-sm ${
                  active
                    ? 'bg-blue-50 font-medium text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end gap-3 border-b border-gray-200 bg-white px-4 py-2">
          <OfflineIndicator />
          <NotificationBell />
          <LanguageSwitcher />
          <Link href="/logout" className="text-sm text-gray-600 hover:text-gray-900">
            {t('common.signOut')}
          </Link>
        </header>
        <main className="min-w-0 flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
