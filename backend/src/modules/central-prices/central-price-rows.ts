// Validation of imported central price rows — pure, no I/O (ADR-061 §Ingestion).
//
// The same rules apply to a SYSTEM_ADMIN file import and to records a CentralPriceAdapter fetches, so a
// price can never enter the catalog by one path in a shape the other would have refused.
//
// MONEY (§32.5, .claude/rules/financial-precision.md). `central_price` arrives as text and stays text
// until decimal.js has it: a CSV cell is a string, and the .xlsx reader is told to hand numbers back as
// their stored string (`parseNumber: (s) => s`) so no value ever passes through a JS float. A price with
// more than four decimal places is REJECTED rather than rounded — DECIMAL(19,4) would round it silently
// on insert, and "never round intermediate values" rules out doing it here on the caller's behalf.

import { Decimal } from '@cos/financial';
import type { CentralPriceSource, RejectedRow } from './central-prices.types';

/** The columns a file must have. Header matching is case-insensitive and ignores surrounding spaces. */
export const REQUIRED_COLUMNS = ['code', 'description', 'unit', 'central_price'] as const;

/** The downloadable template's header, in order. `category` and `currency_code` are optional columns. */
export const TEMPLATE_COLUMNS = [
  'code',
  'description',
  'category',
  'unit',
  'central_price',
  'currency_code',
] as const;

/**
 * Most data rows one file may carry. A national ราคากลาง list runs to thousands of lines, not hundreds
 * of thousands; the cap bounds the memory an import holds and the size of one transaction.
 */
export const MAX_DATA_ROWS = 20_000;

/**
 * ADR-061 effective_period ("year/version"): 1-32 characters, starting with a letter or digit, then
 * letters, digits, `.`, `_`, `/` or `-` — `2569`, `2569-01`, `2026/Q3`. No spaces: the value is compared
 * byte-wise to find the latest period (CentralPriceCatalogService.findReferencePrice), and a trailing
 * space would make two periods that look identical sort apart.
 */
export const EFFECTIVE_PERIOD_RE = /^[0-9A-Za-z][0-9A-Za-z._/-]{0,31}$/;

/** When a row omits currency_code. ราคากลาง is a Thai national price list. */
export const DEFAULT_CURRENCY = 'THB';

const CODE_MAX = 100; // boq_items.item_code VARCHAR(100)
const DESCRIPTION_MAX = 5000; // AddBoqItemDto.description
const UNIT_MAX = 50; // boq_items.unit VARCHAR(50)
const CATEGORY_MAX = 255;

/** Non-negative, at most 15 integer digits (DECIMAL(19,4)) and 4 decimal places. No sign, no exponent. */
const PRICE_RE = /^\d{1,15}(\.\d{1,4})?$/;
const CURRENCY_RE = /^[A-Z]{3}$/;

/** A validated row, ready to write. */
export interface CentralPriceInputRow {
  code: string;
  description: string;
  category: string | null;
  unit: string;
  /** Normalised by decimal.js to exactly four decimal places. */
  central_price: string;
  currency_code: string;
}

/** A row before validation: every value is whatever the source held, as text or absent. */
export type CentralPriceRecordInput = Partial<
  Record<(typeof TEMPLATE_COLUMNS)[number], string | null>
>;

export type RecordValidation =
  { ok: true; row: CentralPriceInputRow } | { ok: false; reason: string };

export type TableErrorCode = 'EMPTY_FILE' | 'MISSING_COLUMNS' | 'NO_DATA_ROWS' | 'TOO_MANY_ROWS';

export type TableValidation =
  | { ok: false; error_code: TableErrorCode; message: string }
  | {
      ok: true;
      /** Non-empty data rows seen. */
      total: number;
      valid: CentralPriceInputRow[];
      rejected: RejectedRow[];
    };

function text(value: string | null | undefined): string {
  return (value ?? '').trim();
}

function checkLength(
  field: string,
  value: string,
  max: number,
  required: boolean,
): string | undefined {
  if (required && value === '') return `${field} is required`;
  if (value.length > max) return `${field} exceeds ${max} characters`;
  return undefined;
}

/** Validate one record against the ADR-061 column rules. Does not check for duplicates. */
export function validateCentralPriceRecord(record: CentralPriceRecordInput): RecordValidation {
  const code = text(record.code);
  const description = text(record.description);
  const unit = text(record.unit);
  const category = text(record.category);
  const price = text(record.central_price);
  const currency = text(record.currency_code) || DEFAULT_CURRENCY;

  const lengthError =
    checkLength('code', code, CODE_MAX, true) ??
    checkLength('description', description, DESCRIPTION_MAX, true) ??
    checkLength('unit', unit, UNIT_MAX, true) ??
    checkLength('category', category, CATEGORY_MAX, false);
  if (lengthError) return { ok: false, reason: lengthError };

  if (price === '') return { ok: false, reason: 'central_price is required' };
  if (!PRICE_RE.test(price)) {
    return {
      ok: false,
      reason:
        'central_price must be a non-negative decimal with at most 15 integer digits and 4 decimal places',
    };
  }
  if (!CURRENCY_RE.test(currency)) {
    return { ok: false, reason: 'currency_code must be a 3-letter ISO 4217 code' };
  }

  return {
    ok: true,
    row: {
      code,
      description,
      category: category === '' ? null : category,
      unit,
      central_price: new Decimal(price).toFixed(4),
      currency_code: currency,
    },
  };
}

/**
 * Validate a list of records, rejecting a code seen earlier in the same list. The first occurrence
 * wins, and the rejection names its row: two prices for one code in one period is a mistake in the
 * source, and silently keeping the last one would publish whichever happened to be lower in the file.
 *
 * `rowNumbers[i]` is what a rejection reports for `records[i]`.
 */
export function validateCentralPriceRecords(
  records: CentralPriceRecordInput[],
  rowNumbers: number[],
): { valid: CentralPriceInputRow[]; rejected: RejectedRow[] } {
  const valid: CentralPriceInputRow[] = [];
  const rejected: RejectedRow[] = [];
  const firstRowByCode = new Map<string, number>();

  records.forEach((record, i) => {
    const row = rowNumbers[i]!;
    const result = validateCentralPriceRecord(record);
    if (!result.ok) {
      rejected.push({ row, reason: result.reason });
      return;
    }
    const first = firstRowByCode.get(result.row.code);
    if (first !== undefined) {
      rejected.push({ row, reason: `duplicate code "${result.row.code}" (first on row ${first})` });
      return;
    }
    firstRowByCode.set(result.row.code, row);
    valid.push(result.row);
  });

  return { valid, rejected };
}

function isBlankRow(cells: ReadonlyArray<string | null>): boolean {
  return cells.every((c) => text(c) === '');
}

/**
 * Validate a whole table read from a file: row 1 is the header, every later non-blank row is data.
 * Blank rows are skipped and not counted — spreadsheets carry them at the end and between sections.
 * Columns not named in TEMPLATE_COLUMNS are ignored, so a sheet with a notes column still imports.
 */
export function validateCentralPriceTable(
  table: ReadonlyArray<ReadonlyArray<string | null>>,
): TableValidation {
  if (table.length === 0 || isBlankRow(table[0]!)) {
    return {
      ok: false,
      error_code: 'EMPTY_FILE',
      message: 'The file is empty — row 1 must be the header.',
    };
  }

  const header = table[0]!.map((c) => text(c).toLowerCase());
  const missing = REQUIRED_COLUMNS.filter((col) => !header.includes(col));
  if (missing.length > 0) {
    return {
      ok: false,
      error_code: 'MISSING_COLUMNS',
      message: `The header row is missing required columns: ${missing.join(', ')}.`,
    };
  }
  // First occurrence of a column name wins, the same rule as duplicate codes.
  const indexOf = (col: string): number => header.indexOf(col);

  const records: CentralPriceRecordInput[] = [];
  const rowNumbers: number[] = [];
  table.slice(1).forEach((cells, i) => {
    if (isBlankRow(cells)) return;
    const record: CentralPriceRecordInput = {};
    for (const col of TEMPLATE_COLUMNS) {
      const at = indexOf(col);
      if (at >= 0) record[col] = cells[at] ?? null;
    }
    records.push(record);
    rowNumbers.push(i + 2); // +1 for the header, +1 because spreadsheet rows count from 1
  });

  if (records.length === 0) {
    return {
      ok: false,
      error_code: 'NO_DATA_ROWS',
      message: 'The file has a header but no data rows.',
    };
  }
  if (records.length > MAX_DATA_ROWS) {
    return {
      ok: false,
      error_code: 'TOO_MANY_ROWS',
      message: `The file has ${records.length} data rows; at most ${MAX_DATA_ROWS} may be imported at once.`,
    };
  }

  const { valid, rejected } = validateCentralPriceRecords(records, rowNumbers);
  return { ok: true, total: records.length, valid, rejected };
}

/** How the register shows a row — see CentralPriceStatus. */
export function centralPriceStatus(
  isActive: boolean,
  publishedAt: Date | null,
): 'ACTIVE' | 'PENDING' | 'INACTIVE' {
  if (!isActive) return 'INACTIVE';
  return publishedAt === null ? 'PENDING' : 'ACTIVE';
}

/** Sources a sync kind writes. Kept beside the validation so the two stay one decision. */
export const SOURCE_FOR_KIND: Readonly<Record<'FILE_IMPORT' | 'GOV_API', CentralPriceSource>> = {
  FILE_IMPORT: 'MANUAL_IMPORT',
  GOV_API: 'GOV_API',
};
