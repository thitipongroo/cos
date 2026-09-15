// Unit tests — BOQ vs central price variance report (ADR-061). Pure; decimal.js throughout.

import { buildPriceVarianceReport } from '../boq-price-variance';
import type { BoqItemRow, BoqVersionRow } from '../boq.repository';

const version = {
  version_id: 'v-1',
  version_number: 3,
  status: 'DRAFT',
  total_estimated_currency: 'THB',
} as BoqVersionRow;

function row(overrides: Partial<BoqItemRow>): BoqItemRow {
  return {
    item_id: 'i',
    category_id: 'c',
    version_id: 'v-1',
    tenant_id: 't',
    item_code: 'STR-001',
    description: 'Concrete',
    unit: 'm3',
    quantity: '3.0000',
    unit_cost: '0.1000',
    estimated_total: '0.3000',
    currency_code: 'THB',
    sort_order: 0,
    carbon_factor_kg_co2e: null,
    carbon_total_kg_co2e: null,
    central_price_id: null,
    reference_price: null,
    price_variance: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('buildPriceVarianceReport', () => {
  it('reports linked lines with line-level reference and variance totals, in exact decimals', () => {
    // 3 × 0.1 is 0.30000000000000004 in float; the report must say 0.3000.
    const linked = row({
      item_id: 'linked',
      central_price_id: 'cp-1',
      reference_price: '0.0333',
      price_variance: '0.0667',
    });
    const report = buildPriceVarianceReport('p-1', version, [linked]);

    expect(report).toMatchObject({
      project_id: 'p-1',
      version_id: 'v-1',
      version_number: 3,
      version_status: 'DRAFT',
      currency_code: 'THB',
    });
    expect(report.items[0]).toEqual(
      expect.objectContaining({
        item_id: 'linked',
        central_price_id: 'cp-1',
        reference_price: '0.0333',
        price_variance: '0.0667',
        estimated_total: '0.3000',
        reference_total: '0.0999',
        variance_total: '0.2001',
      }),
    );
    expect(report.totals).toEqual({
      items: 1,
      items_with_reference: 1,
      estimated_total: '0.3000',
      referenced_estimated_total: '0.3000',
      reference_total: '0.0999',
      variance_total: '0.2001',
    });
  });

  it('rounds reference_total HALF_UP to 4 places, like estimated_total', () => {
    const r = row({
      quantity: '1.5000',
      unit_cost: '10.0000',
      estimated_total: '15.0000',
      central_price_id: 'cp',
      reference_price: '0.00003', // 1.5 × 0.00003 = 0.000045 → 0.0000 at 4 places, HALF_UP
      price_variance: '9.9999',
    });
    expect(buildPriceVarianceReport('p', version, [r]).items[0]!.reference_total).toBe('0.0000');
  });

  it('keeps unlinked lines out of the reference totals but in estimated_total', () => {
    const linked = row({
      item_id: 'a',
      quantity: '2.0000',
      unit_cost: '120.0000',
      estimated_total: '240.0000',
      central_price_id: 'cp',
      reference_price: '100.0000',
      price_variance: '20.0000',
    });
    const unlinked = row({ item_id: 'b', estimated_total: '1000.0000', item_code: null });
    const report = buildPriceVarianceReport('p', version, [linked, unlinked]);

    expect(report.items[1]).toEqual(
      expect.objectContaining({
        item_id: 'b',
        central_price_id: null,
        reference_price: null,
        price_variance: null,
        reference_total: null,
        variance_total: null,
      }),
    );
    expect(report.totals).toEqual({
      items: 2,
      items_with_reference: 1,
      estimated_total: '1240.0000',
      referenced_estimated_total: '240.0000',
      reference_total: '200.0000',
      variance_total: '40.0000',
    });
  });

  it('treats a link without a snapshot value as unlinked, and a missing variance as null', () => {
    const noSnapshot = row({ central_price_id: 'cp', reference_price: null });
    const noVariance = row({
      central_price_id: 'cp',
      reference_price: '0.1000',
      price_variance: null,
    });
    const report = buildPriceVarianceReport('p', version, [noSnapshot, noVariance]);
    expect(report.items[0]!.reference_total).toBeNull();
    expect(report.items[1]!.reference_total).toBe('0.3000');
    expect(report.items[1]!.price_variance).toBeNull();
    expect(report.totals.items_with_reference).toBe(1);
  });

  it('reports an empty version with zero totals', () => {
    expect(buildPriceVarianceReport('p', version, []).totals).toEqual({
      items: 0,
      items_with_reference: 0,
      estimated_total: '0.0000',
      referenced_estimated_total: '0.0000',
      reference_total: '0.0000',
      variance_total: '0.0000',
    });
  });
});
