// The vocabularies are duplicated by necessity — TypeScript unions, class-validator @IsIn, and the
// CHECK constraints in migration 20260810000001 are three separate enforcement points. These tests
// pin the runtime lists so a drift shows up here rather than as a 500 at INSERT time.

import {
  VENDOR_CATEGORIES,
  VENDOR_VERIFICATION_STATUSES,
  isVendorCategory,
} from '../vendor-classification';

describe('vendor classification vocabularies', () => {
  it('matches the CHECK constraint on procurement.vendors.category', () => {
    expect([...VENDOR_CATEGORIES]).toEqual(['MATERIALS', 'LOGISTICS', 'SERVICES', 'EQUIPMENT']);
  });

  it('matches the CHECK constraint on procurement.vendors.verification_status', () => {
    expect([...VENDOR_VERIFICATION_STATUSES]).toEqual(['PENDING', 'VERIFIED', 'REJECTED']);
  });

  it('keeps verification separate from the tax vocabulary', () => {
    // finance.wht_rules.service_type holds 'services' / 'rent' / 'royalties'. If someone ever merges
    // the two, this fails before a re-filed vendor can move a withholding-tax rate.
    expect(VENDOR_CATEGORIES as readonly string[]).not.toContain('rent');
    expect(VENDOR_CATEGORIES as readonly string[]).not.toContain('goods');
  });
});

describe('isVendorCategory', () => {
  it.each(VENDOR_CATEGORIES)('accepts %s', (name) => {
    expect(isVendorCategory(name)).toBe(true);
  });

  it('rejects a near-miss rather than narrowing it', () => {
    // Singular, lower-case and a status are the three shapes a client actually gets wrong.
    expect(isVendorCategory('MATERIAL')).toBe(false);
    expect(isVendorCategory('materials')).toBe(false);
    expect(isVendorCategory('VERIFIED')).toBe(false);
    expect(isVendorCategory('')).toBe(false);
  });
});
