/**
 * The web trial banner's copy (§7.10): which message, with which values. The decision of WHICH banner is
 * @cos/ui-logic's `trialBanner`, shared with mobile; this maps it onto this app's i18n keys and tone.
 */

import type { TrialBanner } from '@cos/ui-logic';

export interface TrialBannerCopy {
  /** i18n key — never copy (QM-3). */
  key: string;
  /** ICU values. Dates are passed through `formatDate` so they follow the chosen locale. */
  values: Record<string, string | number>;
  tone: 'info' | 'warning' | 'danger';
}

export function trialBannerCopy(
  banner: TrialBanner | null,
  formatDate: (iso: string | null) => string,
): TrialBannerCopy | null {
  if (!banner) return null;
  switch (banner.kind) {
    case 'trial':
      return {
        key: banner.daysLeft === 0 ? 'trial.banner.endsToday' : 'trial.banner.running',
        values: { days: banner.daysLeft, date: formatDate(banner.endsAt) },
        tone: banner.urgent ? 'warning' : 'info',
      };
    case 'readOnly':
      return {
        key: 'trial.banner.readOnly',
        values: { date: formatDate(banner.until) },
        tone: 'danger',
      };
    case 'deletionPending':
      return { key: 'trial.banner.deletionPending', values: {}, tone: 'danger' };
  }
}

/**
 * Fill `{name}` placeholders in a translated message. This app's `t()` has no interpolation — screens compose copy
 * from pieces — and a banner sentence with a number and a date in it reads wrong in Thai when cut into pieces, so
 * the banner's messages carry their own placeholders. An unknown placeholder is left as written.
 */
export function interpolate(message: string, values: Record<string, string | number>): string {
  return message.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : whole,
  );
}
