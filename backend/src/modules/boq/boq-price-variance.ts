// BOQ-vs-central-price variance report — pure, no I/O (ADR-061 §API:
// `GET /api/v1/boq/projects/{id}/price-variance`).
//
// Per line: the stored snapshot (reference_price, price_variance = unit_cost − reference_price), plus the
// line-level money the per-unit figures imply — reference_total = ROUND(quantity × reference_price, 4)
// HALF_UP, the same rule as estimated_total, and variance_total = estimated_total − reference_total.
//
// Totals compare like with like. `reference_total` and `variance_total` sum only the LINKED lines, and
// `referenced_estimated_total` is the estimate of those same lines — so variance_total =
// referenced_estimated_total − reference_total holds exactly. `estimated_total` is every line, linked or
// not, for context. Money is decimal.js throughout and leaves as four-decimal strings (§32.5).

import { Decimal, calculateLineTotal, sumDecimals } from '@cos/financial';
import type { BoqItemRow, BoqVersionRow } from './boq.repository';

export interface PriceVarianceItem {
  item_id: string;
  item_code: string | null;
  description: string;
  unit: string;
  quantity: string;
  unit_cost: string;
  estimated_total: string;
  currency_code: string;
  central_price_id: string | null;
  reference_price: string | null;
  price_variance: string | null;
  reference_total: string | null;
  variance_total: string | null;
}

export interface PriceVarianceReport {
  project_id: string;
  version_id: string;
  version_number: number;
  version_status: BoqVersionRow['status'];
  currency_code: string;
  items: PriceVarianceItem[];
  totals: {
    items: number;
    items_with_reference: number;
    estimated_total: string;
    referenced_estimated_total: string;
    reference_total: string;
    variance_total: string;
  };
}

const money = (value: string | Decimal): string => new Decimal(value).toFixed(4);

export function buildPriceVarianceReport(
  projectId: string,
  version: BoqVersionRow,
  rows: BoqItemRow[],
): PriceVarianceReport {
  const linked: Array<{ estimated: Decimal; reference: Decimal }> = [];

  const items = rows.map((row): PriceVarianceItem => {
    const estimated = new Decimal(row.estimated_total);
    let referenceTotal: Decimal | null = null;
    if (row.central_price_id !== null && row.reference_price !== null) {
      referenceTotal = calculateLineTotal(
        new Decimal(row.quantity),
        new Decimal(row.reference_price),
      );
      linked.push({ estimated, reference: referenceTotal });
    }
    return {
      item_id: row.item_id,
      item_code: row.item_code,
      description: row.description,
      unit: row.unit,
      quantity: money(row.quantity),
      unit_cost: money(row.unit_cost),
      estimated_total: money(estimated),
      currency_code: row.currency_code,
      central_price_id: referenceTotal ? row.central_price_id : null,
      reference_price: referenceTotal ? money(row.reference_price!) : null,
      price_variance:
        referenceTotal && row.price_variance !== null ? money(row.price_variance) : null,
      reference_total: referenceTotal ? money(referenceTotal) : null,
      variance_total: referenceTotal ? money(estimated.minus(referenceTotal)) : null,
    };
  });

  const referencedEstimated = sumDecimals(linked.map((l) => l.estimated));
  const referenceTotal = sumDecimals(linked.map((l) => l.reference));

  return {
    project_id: projectId,
    version_id: version.version_id,
    version_number: version.version_number,
    version_status: version.status,
    currency_code: version.total_estimated_currency,
    items,
    totals: {
      items: rows.length,
      items_with_reference: linked.length,
      estimated_total: money(sumDecimals(rows.map((r) => new Decimal(r.estimated_total)))),
      referenced_estimated_total: money(referencedEstimated),
      reference_total: money(referenceTotal),
      variance_total: money(referencedEstimated.minus(referenceTotal)),
    },
  };
}
