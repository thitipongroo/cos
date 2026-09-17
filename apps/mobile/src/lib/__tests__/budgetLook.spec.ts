import { categoryLook } from '../budgetLook';

describe('categoryLook', () => {
  it('is muted when there is no spend to compare', () => {
    expect(categoryLook(null)).toBe('muted');
  });

  it('is warning only past the allocation, not at it', () => {
    expect(categoryLook(1.05)).toBe('warning');
    expect(categoryLook(1)).toBe('primary');
  });

  it('turns primary at half the allocation and stays muted below it', () => {
    expect(categoryLook(0.93)).toBe('primary');
    expect(categoryLook(0.5)).toBe('primary');
    expect(categoryLook(0.49)).toBe('muted');
    expect(categoryLook(0.21)).toBe('muted');
  });
});
