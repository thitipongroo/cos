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

// RFC 4180: wrap a field in double quotes when it contains a comma, double-quote, CR or LF;
// escape embedded double-quotes by doubling them. null/undefined → empty field.
function escapeCsv(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
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
