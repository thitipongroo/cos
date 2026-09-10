import { ALL, countByStatus } from '../countByStatus';

describe('countByStatus', () => {
  it('counts the whole list under ALL', () => {
    expect(countByStatus([{ status: 'NEW' }, { status: 'WON' }])[ALL]).toBe(2);
  });

  it('counts each status separately', () => {
    const by = countByStatus([{ status: 'NEW' }, { status: 'NEW' }, { status: 'WON' }]);

    expect(by).toEqual({ ALL: 3, NEW: 2, WON: 1 });
  });

  // A status the caller draws no chip for still gets counted. It costs nothing, and the alternative
  // — filtering to a known set — means a status added server-side silently counts as zero here.
  it('counts a status nobody asked about', () => {
    expect(countByStatus([{ status: 'ARCHIVED' }])['ARCHIVED']).toBe(1);
  });

  it('gives an empty list a zero total and nothing else', () => {
    expect(countByStatus([])).toEqual({ ALL: 0 });
  });
});
