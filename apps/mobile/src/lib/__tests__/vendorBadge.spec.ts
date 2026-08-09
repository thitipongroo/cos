import { vendorBadge } from '../vendorBadge';

describe('vendorBadge', () => {
  it('promotes a verified grade-A vendor to TOP RATED', () => {
    expect(vendorBadge('VERIFIED', 'A')).toBe('TOP_RATED');
  });

  it('keeps a verified vendor on VERIFIED at every lower grade', () => {
    for (const grade of ['B', 'C', 'D', 'F'] as const) {
      expect(vendorBadge('VERIFIED', grade)).toBe('VERIFIED');
    }
  });

  it('keeps a verified vendor on VERIFIED when it has no score yet', () => {
    // A brand-new vendor has no deliveries, disputes or quotations to score, so the endpoint returns
    // a null grade. That is not grade A.
    expect(vendorBadge('VERIFIED', null)).toBe('VERIFIED');
  });

  it('does NOT let a grade-A score mask an unfinished document check', () => {
    // The whole point of keeping the two facts apart: scoring well is not being verified.
    expect(vendorBadge('PENDING', 'A')).toBe('UNDER_REVIEW');
    expect(vendorBadge(null, 'A')).toBeNull();
  });

  it('never masks a rejection', () => {
    expect(vendorBadge('REJECTED', 'A')).toBe('REJECTED');
    expect(vendorBadge('REJECTED', null)).toBe('REJECTED');
  });

  it('shows nothing for a vendor nobody has reviewed', () => {
    expect(vendorBadge(null, null)).toBeNull();
    expect(vendorBadge(null, 'C')).toBeNull();
  });
});
