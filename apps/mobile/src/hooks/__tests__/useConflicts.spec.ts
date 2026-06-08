import type { Conflict } from '../../store/offlineStore';

const mockSelector = jest.fn<Conflict[], [(s: { conflicts: Conflict[] }) => Conflict[]]>();

jest.mock('../../store/offlineStore', () => ({
  useOfflineStore: (selector: (s: { conflicts: Conflict[] }) => Conflict[]) =>
    mockSelector(selector),
}));

import { useConflicts } from '../useConflicts';

describe('useConflicts', () => {
  it('delegates to useOfflineStore and returns conflicts array', () => {
    const conflicts: Conflict[] = [
      {
        itemId: 1,
        entityType: 'local_issues',
        entityId: 'e1',
        localPayload: {},
        serverPayload: {},
      },
    ];
    mockSelector.mockImplementation((sel) => sel({ conflicts }));
    expect(useConflicts()).toEqual(conflicts);
  });

  it('returns empty array when there are no conflicts', () => {
    mockSelector.mockImplementation((sel) => sel({ conflicts: [] }));
    expect(useConflicts()).toEqual([]);
  });
});
