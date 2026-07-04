import { isRTL } from '../direction';

describe('direction (QM-3 RTL support)', () => {
  it('exposes the I18nManager RTL flag as a boolean', () => {
    expect(typeof isRTL).toBe('boolean');
    expect(isRTL).toBe(false);
  });
});
