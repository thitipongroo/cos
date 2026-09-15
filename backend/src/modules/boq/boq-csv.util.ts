// BOQ CSV export serializer — Phase 4 (2026-07-05).
// Produces a flat one-row-per-line-item CSV (RFC 4180) with category context + carbon fields.
// Column set (PO decision 2026-07-05): full 12 columns including the nullable carbon fields.

import type { BoqVersionRow, BoqCategoryRow, BoqItemRow } from './boq.repository';
// RFC 4180 + CSV-injection escaping (CWE-1236). Lived in this file until 2026-09-15; moved unchanged to
// shared/csv when the audit-log export became its second caller.
import { escapeCsv } from '../../shared/csv/escape-csv';

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

// `description`, `item_code`, `unit` and the category columns are free text a tenant user types through
// the BOQ API; escapeCsv neutralises formula-triggering cells as well as quoting (see its comment).

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
