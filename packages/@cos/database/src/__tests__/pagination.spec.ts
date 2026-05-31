import { buildCursorPage } from '../pagination';

const items = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `id-${i}`, name: `item-${i}` }));

describe('buildCursorPage', () => {
  it('returns all items when count <= take', () => {
    const result = buildCursorPage(items(5), { take: 20 });
    expect(result.data).toHaveLength(5);
    expect(result.meta.hasNextPage).toBe(false);
    expect(result.meta.hasPreviousPage).toBe(false);
  });

  it('trims to take and sets hasNextPage when count > take', () => {
    const result = buildCursorPage(items(21), { take: 20 });
    expect(result.data).toHaveLength(20);
    expect(result.meta.hasNextPage).toBe(true);
  });

  it('uses default take of 20 when not specified', () => {
    const result = buildCursorPage(items(25), {});
    expect(result.data).toHaveLength(20);
    expect(result.meta.hasNextPage).toBe(true);
  });

  it('sets hasPreviousPage true when cursor provided', () => {
    const result = buildCursorPage(items(5), { cursor: 'id-0' });
    expect(result.meta.hasPreviousPage).toBe(true);
  });

  it('sets start and end cursor from data', () => {
    const result = buildCursorPage(items(3), {});
    expect(result.meta.startCursor).toBe('id-0');
    expect(result.meta.endCursor).toBe('id-2');
  });

  it('handles empty items array', () => {
    const result = buildCursorPage([], {});
    expect(result.data).toHaveLength(0);
    expect(result.meta.startCursor).toBeNull();
    expect(result.meta.endCursor).toBeNull();
    expect(result.meta.hasNextPage).toBe(false);
  });

  it('includes totalCount when provided', () => {
    const result = buildCursorPage(items(5), { take: 20 }, 100);
    expect(result.meta.totalCount).toBe(100);
  });
});
