// Reads an uploaded central price file into a table of text cells (ADR-061 §Ingestion: "CSV/Excel").
//
// LIBRARIES (recorded in ADR-061's 2026-09-15 amendment). CSV through `csv-parse` (sync API); .xlsx
// through `read-excel-file/node`. The npm `xlsx` (SheetJS) package is not used: its npm releases carry
// unpatched advisories. `exceljs` was evaluated and not chosen: its last release is 4.4.0 (2024-12), and
// it pulls `uuid` < 11.1.1, which `npm audit` flags (GHSA-w5hq-g745-h8pq). Both chosen packages audited
// clean on 2026-09-15.
//
// WHAT IS ACCEPTED. The file NAME decides the reader and the BYTES must agree: an .xlsx is a ZIP, so it
// must start with the ZIP local-file signature, and a .csv must not. A mismatch is refused rather than
// guessed at — renaming report.xlsx to report.csv would otherwise feed ZIP bytes to the CSV parser and
// reject every "row" with a reason that points nowhere near the real problem. Legacy .xls (BIFF) is not
// supported by the reader and is refused the same way.
//
// ENCODING. CSV must be UTF-8 (a BOM is allowed and dropped). Thai text exported from older Excel as
// Windows-874 / TIS-620 is refused with a reason that says so — decoding it as UTF-8 would store
// mojibake descriptions that look like data. .xlsx carries its own encoding, so this does not apply.
//
// WHAT IS NOT BOUNDED HERE. An .xlsx is decompressed in memory, and the upload cap (MAX_IMPORT_FILE_BYTES)
// bounds the compressed size only. A deliberately crafted workbook could expand far beyond it; the route
// is SYSTEM_ADMIN-only, which is the control relied on. Recorded as an open risk in ADR-061.

import { extname } from 'node:path';
import { parse as parseCsv } from 'csv-parse/sync';

// read-excel-file declares `"type": "module"` and ships its CommonJS build at node/index.cjs. Under this
// package's Node16 resolution an `import` of its ESM-typed declarations fails to compile (TS1479), so it
// is required — typed to the ONE function used, as app-attest.adapter.ts does for cbor-x.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- ESM-typed package in a CJS build
const { readSheet } = require('read-excel-file/node') as {
  readSheet: (
    input: Buffer,
    options: { parseNumber: (value: string) => string },
  ) => Promise<unknown[][]>;
};

export type CentralPriceFileKind = 'csv' | 'xlsx';

/** A cell as the validator sees it: trimmed later, null when the source cell was empty. */
export type Cell = string | null;

export type FileReadErrorCode = 'CSV_NOT_UTF8' | 'FILE_UNREADABLE';

/** The file was the right kind but its content could not be read. */
export class CentralPriceFileError extends Error {
  constructor(
    readonly code: FileReadErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CentralPriceFileError';
  }
}

const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

function isZip(bytes: Buffer): boolean {
  return bytes.subarray(0, ZIP_SIGNATURE.length).equals(ZIP_SIGNATURE);
}

/** The reader for this file, or null when its name and its content do not agree on a supported kind. */
export function detectFileKind(filename: string, bytes: Buffer): CentralPriceFileKind | null {
  const ext = extname(filename).toLowerCase();
  if (ext === '.xlsx') return isZip(bytes) ? 'xlsx' : null;
  if (ext === '.csv') return isZip(bytes) ? null : 'csv';
  return null;
}

function readCsv(bytes: Buffer): Cell[][] {
  let content: string;
  try {
    // fatal: an invalid byte sequence throws instead of becoming U+FFFD. The default ignoreBOM: false
    // strips a leading BOM, which Excel writes on "CSV UTF-8".
    content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new CentralPriceFileError(
      'CSV_NOT_UTF8',
      'The CSV file is not UTF-8. Save it as "CSV UTF-8" and upload it again.',
    );
  }
  try {
    // relax_column_count: a short or long row is a ROW problem the validator reports with its row number,
    // not a reason to refuse the whole file.
    return parseCsv(content, { relax_column_count: true }).map((cells) =>
      cells.map((c) => (c === '' ? null : c)),
    );
  } catch (err: unknown) {
    const code = (err as { code?: string }).code ?? 'CSV_PARSE_ERROR';
    throw new CentralPriceFileError(
      'FILE_UNREADABLE',
      `The CSV file could not be parsed (${code}).`,
    );
  }
}

function cellText(value: unknown): Cell {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

async function readXlsx(bytes: Buffer): Promise<Cell[][]> {
  try {
    // First sheet. parseNumber keeps every number as the string the workbook stored — see
    // central-price-rows.ts on money.
    const data = await readSheet(bytes, { parseNumber: (s: string) => s });
    return data.map((row) => row.map(cellText));
  } catch {
    throw new CentralPriceFileError(
      'FILE_UNREADABLE',
      'The .xlsx file could not be read. Open it in Excel, save it as .xlsx, and upload it again.',
    );
  }
}

/** Read the file into rows of cells. Throws CentralPriceFileError when the content is unreadable. */
export async function readCentralPriceTable(
  kind: CentralPriceFileKind,
  bytes: Buffer,
): Promise<Cell[][]> {
  return kind === 'csv' ? readCsv(bytes) : readXlsx(bytes);
}
