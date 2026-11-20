import { canAwardQuotation, canAwardQuotations } from '../quotationAward';

describe('canAwardQuotations (plan CQ)', () => {
  it('offers Award on an EVALUATED RFQ', () => {
    expect(canAwardQuotations(false, 'EVALUATED')).toBe(true);
  });

  it.each(['DRAFT', 'PUBLISHED', 'CLOSED', 'AWARDED', 'CANCELLED', undefined])(
    'offers none when the RFQ is %s',
    (status) => {
      expect(canAwardQuotations(false, status)).toBe(false);
    },
  );

  it('offers none to a read-only user, even at EVALUATED', () => {
    expect(canAwardQuotations(true, 'EVALUATED')).toBe(false);
  });
});

// Plan DI (product owner 2026-11-21): no Award on a deactivated vendor's row — the server refuses it (404).
describe('canAwardQuotation (plan DI)', () => {
  it("offers none on a deactivated vendor's row", () => {
    expect(canAwardQuotation(false, 'EVALUATED', { vendor_active: false })).toBe(false);
  });

  it("offers it on an active vendor's row, and when the API says nothing (an older one)", () => {
    expect(canAwardQuotation(false, 'EVALUATED', { vendor_active: true })).toBe(true);
    expect(canAwardQuotation(false, 'EVALUATED', {})).toBe(true);
  });

  it('still follows the RFQ status and read-only', () => {
    expect(canAwardQuotation(false, 'CLOSED', { vendor_active: true })).toBe(false);
    expect(canAwardQuotation(true, 'EVALUATED', { vendor_active: true })).toBe(false);
  });
});
