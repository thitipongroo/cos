import { canAwardQuotations } from '../quotationAward';

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
