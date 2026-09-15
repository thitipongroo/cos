/**
 * Pure helpers for the SYSTEM_ADMIN Central Price Register (R17.18; ADR-061). The React Query bindings are in
 * `lib/api/centralPrices.ts`.
 */

/**
 * A DECIMAL(19,4) price as the API sends it ("24850.0000") → display text with grouped thousands. Money never passes
 * through a JS number (financial-precision rule): the digits are regrouped as text. Two decimals are always shown and
 * a third or fourth only when it is not zero — "115.1250" reads "115.125" — so nothing stored is rounded away.
 * Anything that is not a plain decimal string is returned unchanged rather than guessed at.
 */
export function priceText(value: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return value;
  const [, sign, int, frac = ''] = match;
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const trimmed = frac.replace(/0+$/, '');
  return `${sign}${grouped}.${trimmed.padEnd(2, '0')}`;
}

/** The i18n key for a failed import, by status (COS-CPRICE-001…004 in docs/api/error-codes.md). */
export function importErrorKey(status: number | undefined): string {
  if (status === 400) return 'admin.errors.invalid';
  if (status === 403) return 'admin.errors.forbidden';
  if (status === 413) return 'admin.centralPrices.error.fileTooLarge';
  if (status === 415) return 'admin.centralPrices.error.unsupportedFileType';
  if (status === 422) return 'admin.centralPrices.error.importFailed';
  return 'admin.errors.generic';
}

/** The import form's accepted files — the API reads a UTF-8 CSV or an .xlsx workbook, 5 MiB at most. */
export const IMPORT_ACCEPT = '.csv,.xlsx';
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;

/** The backend's effective_period rule (central-price-rows.ts EFFECTIVE_PERIOD_RE), checked before the upload. */
export const EFFECTIVE_PERIOD_RE = /^[0-9A-Za-z][0-9A-Za-z._/-]{0,31}$/;
