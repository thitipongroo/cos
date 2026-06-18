'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useT } from '../../i18n';

/** Sub-navigation for a project's PM views (§20.7.2): overview + procurement/finance/site. */
export function ProjectTabs({ id }: { id: string }) {
  const t = useT();
  const pathname = usePathname();
  const tabs = [
    { href: `/projects/${id}`, labelKey: 'pm.detailOverview' },
    { href: `/projects/${id}/procurement`, labelKey: 'pm.tabProcurement' },
    { href: `/projects/${id}/finance`, labelKey: 'pm.tabFinance' },
    { href: `/projects/${id}/site`, labelKey: 'pm.tabSite' },
  ];
  return (
    <nav className="mb-6 flex gap-1 border-b border-gray-200">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-4 py-2 text-sm ${
              active
                ? 'border-b-2 border-blue-600 font-medium text-blue-700'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {t(tab.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
