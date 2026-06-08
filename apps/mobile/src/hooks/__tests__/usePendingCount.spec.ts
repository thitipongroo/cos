const mockSelector = jest.fn<number, [(s: { pendingCount: number }) => number]>();

jest.mock('../../store/syncStore', () => ({
  useSyncStore: (selector: (s: { pendingCount: number }) => number) => mockSelector(selector),
}));

import { usePendingCount } from '../usePendingCount';

describe('usePendingCount', () => {
  it('delegates to useSyncStore and returns pendingCount', () => {
    mockSelector.mockImplementation((sel) => sel({ pendingCount: 5 }));
    expect(usePendingCount()).toBe(5);
  });

  it('returns 0 when there are no pending items', () => {
    mockSelector.mockImplementation((sel) => sel({ pendingCount: 0 }));
    expect(usePendingCount()).toBe(0);
  });
});
