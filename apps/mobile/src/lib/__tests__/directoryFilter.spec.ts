import { matchesDirectoryQuery, type DirectoryFilterable } from '../directoryFilter';

const anan: DirectoryFilterable = {
  full_name: 'Anan Sombat',
  trade_type: 'Carpenter',
  role_on_project: 'Site Foreman',
};

/** An allocation may leave `role_on_project` unset — the column is nullable. */
const noRole: DirectoryFilterable = {
  full_name: 'Somchai Jaidee',
  trade_type: 'Electrician',
  role_on_project: null,
};

describe('matchesDirectoryQuery', () => {
  it('an empty query is not a filter', () => {
    expect(matchesDirectoryQuery(anan, '')).toBe(true);
    // Whitespace is empty too: a stray space from a soft keyboard must not hide the whole crew.
    expect(matchesDirectoryQuery(anan, '   ')).toBe(true);
  });

  it('matches on name, case-insensitively', () => {
    expect(matchesDirectoryQuery(anan, 'anan')).toBe(true);
    expect(matchesDirectoryQuery(anan, 'SOMBAT')).toBe(true);
  });

  it('matches on the trade the worker was hired under', () => {
    expect(matchesDirectoryQuery(anan, 'carpenter')).toBe(true);
  });

  it('matches on the job held on THIS project', () => {
    // The case that a trade-only search would miss: nobody's `trade_type` is "foreman".
    expect(matchesDirectoryQuery(anan, 'foreman')).toBe(true);
  });

  it('still matches when the allocation names no role', () => {
    expect(matchesDirectoryQuery(noRole, 'electrician')).toBe(true);
    expect(matchesDirectoryQuery(noRole, 'somchai')).toBe(true);
  });

  it('excludes a worker nothing matches', () => {
    expect(matchesDirectoryQuery(anan, 'plumber')).toBe(false);
    expect(matchesDirectoryQuery(noRole, 'foreman')).toBe(false);
  });

  it('does not match across the field boundary', () => {
    // The fields are joined with a space to search them as one string; that must not let a query
    // spanning two fields ("Sombat Carpenter") match nothing real, nor a fieldless run match all.
    expect(matchesDirectoryQuery(anan, 'sombatcarpenter')).toBe(false);
  });
});
