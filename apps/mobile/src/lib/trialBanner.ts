// The mobile trial banner's copy (§7.10, ADR-109). WHICH banner is @cos/ui-logic's `trialBanner`, shared with the
// web app (ADR-068); this maps it onto this app's i18n keys, ICU values and palette role.

import type { TrialBanner } from '@cos/ui-logic';

export interface TrialBannerCopy {
  /** i18n key — never copy (QM-3). */
  key: string;
  values: Record<string, string | number>;
  /** Which palette colour the banner is tinted with. */
  tone: 'primary' | 'warning' | 'danger';
}

export function trialBannerCopy(
  banner: TrialBanner | null,
  formatDate: (iso: string) => string,
): TrialBannerCopy | null {
  if (!banner) return null;
  switch (banner.kind) {
    case 'trial':
      return {
        key: banner.daysLeft === 0 ? 'trial.banner.endsToday' : 'trial.banner.running',
        values: { days: banner.daysLeft, date: formatDate(banner.endsAt) },
        tone: banner.urgent ? 'warning' : 'primary',
      };
    case 'readOnly':
      return {
        key: banner.until ? 'trial.banner.readOnly' : 'trial.banner.readOnlyNoDate',
        values: banner.until ? { date: formatDate(banner.until) } : {},
        tone: 'danger',
      };
    case 'deletionPending':
      return { key: 'trial.banner.deletionPending', values: {}, tone: 'danger' };
  }
}
