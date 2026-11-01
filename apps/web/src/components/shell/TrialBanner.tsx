'use client';

import { TRIAL_CONTACT, trialBanner, trialContactMailto } from '@cos/ui-logic';
import { useSession } from 'next-auth/react';
import { useI18n } from '../../i18n';
import { useMyTenant } from '../../lib/api/queries';
import { formatDate } from '../../lib/format';
import { interpolate, trialBannerCopy } from '../../lib/trial';

const TONE = {
  info: 'border-blue-200 bg-blue-50 text-blue-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  danger: 'border-red-200 bg-red-50 text-red-800',
} as const;

/**
 * The free-trial banner (§7.10, ADR-109): a countdown while the trial runs, and — once it has ended — why saving is
 * refused (403 COS-PLAN-003) while reading and exporting still work. Nothing for a paying tenant. The decision is
 * @cos/ui-logic's `trialBanner`, shared with mobile; the copy is lib/trial.ts.
 *
 * There is no in-app checkout — plans are sold by the team (ADR-109) — so the banner carries the two ways to choose
 * one: the published price list and a mail to sales naming the tenant (`TRIAL_CONTACT`).
 */
export function TrialBanner() {
  const { t, locale } = useI18n();
  const { status } = useSession();
  const tenant = useMyTenant(status === 'authenticated');

  const copy = trialBannerCopy(trialBanner(tenant.data, new Date()), (iso) =>
    formatDate(locale, iso),
  );
  if (!copy) return null;

  return (
    <div
      role={copy.tone === 'danger' ? 'alert' : 'status'}
      className={`flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-2 text-sm ${TONE[copy.tone]}`}
    >
      <span className="min-w-0 flex-1">{interpolate(t(copy.key), copy.values)}</span>
      <span className="flex shrink-0 items-center gap-3 font-medium">
        <a
          href={TRIAL_CONTACT.pricingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:no-underline"
        >
          {t('trial.banner.seePlans')}
        </a>
        <a
          href={trialContactMailto(tenant.data?.tenant_code ?? '', t('trial.banner.mailSubject'))}
          className="underline underline-offset-2 hover:no-underline"
        >
          {t('trial.banner.contact')}
        </a>
      </span>
    </div>
  );
}
