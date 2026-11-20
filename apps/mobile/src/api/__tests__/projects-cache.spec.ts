// refreshProjectsCache waits for the device to be handed to the signed-in user (fix/mobile-queue-per-user): a
// different user's sign-in clears local_projects, and rows written before that clear would be wiped with the
// previous user's.

const mockGet = jest.fn();
jest.mock('../client', () => ({ get: (...a: unknown[]) => mockGet(...a) }));
const mockDelete = jest.fn().mockResolvedValue(undefined);
const mockInsertValues = jest.fn().mockResolvedValue(undefined);
jest.mock('../../db/database', () => ({
  db: {
    delete: () => mockDelete(),
    insert: () => ({ values: (v: unknown) => mockInsertValues(v) }),
  },
  newLocalId: () => 'local-id',
}));
jest.mock('../../db/schema', () => ({ localProjects: {} }));

import { refreshProjectsCache } from '../projects';
import { setOwnerSettled } from '../../db/owner';

it('fetches and writes only after the device owner has settled', async () => {
  let settle: (() => void) | undefined;
  setOwnerSettled(() => new Promise<void>((resolve) => (settle = resolve)));
  mockGet.mockResolvedValue({
    items: [{ project_id: 'p-1', project_code: 'P1', project_name: 'One', status: 'ACTIVE' }],
  });

  const pending = refreshProjectsCache();
  await Promise.resolve();
  await Promise.resolve();
  expect(mockGet).not.toHaveBeenCalled();
  expect(mockDelete).not.toHaveBeenCalled();

  settle!();
  await pending;
  expect(mockGet).toHaveBeenCalledWith('/projects');
  expect(mockInsertValues).toHaveBeenCalledTimes(1);
  setOwnerSettled(() => Promise.resolve());
});
