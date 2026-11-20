// deviceOwner — a shared phone acts for the signed-in user only (fix/mobile-queue-per-user).

import {
  startDeviceOwner,
  makeClearCaches,
  makeOnOwnerChanged,
  type DeviceOwnerDeps,
} from '../deviceOwner';

function harness(initialUser: string | null, lastUser: string | null) {
  let listener: ((userId: string | null) => void) | undefined;
  let stored = lastUser;
  const calls: string[] = [];
  const deps: DeviceOwnerDeps = {
    subscribe: (cb) => {
      listener = cb;
      return () => (listener = undefined);
    },
    getUserId: () => initialUser,
    setOwner: jest.fn((id) => calls.push(`owner:${id}`)),
    claimUnowned: jest.fn(async (id) => {
      calls.push(`claim:${id}`);
    }),
    readLastUser: jest.fn(async () => stored),
    writeLastUser: jest.fn(async (id) => {
      stored = id;
      calls.push(`last:${id}`);
    }),
    clearCaches: jest.fn(async () => {
      calls.push('clear');
    }),
    onOwnerChanged: jest.fn(() => calls.push('recount')),
  };
  const owner = startDeviceOwner(deps);
  return { deps, owner, calls, emit: (id: string | null) => listener?.(id), stored: () => stored };
}

describe('deviceOwner', () => {
  it('the same user signing back in keeps the caches', async () => {
    const h = harness('user-a', 'user-a');
    await h.owner.settled();
    expect(h.calls).toEqual(['owner:user-a', 'recount', 'claim:user-a']);
    expect(h.deps.clearCaches).not.toHaveBeenCalled();
  });

  it('a different user signing in clears the read caches, then is remembered', async () => {
    const h = harness('user-b', 'user-a');
    await h.owner.settled();
    expect(h.calls).toEqual(['owner:user-b', 'recount', 'claim:user-b', 'clear', 'last:user-b']);
  });

  // /doubt on this branch: with no record the cache may still hold whoever used the device before the update
  // (they may have signed out first), so the first sign-in after it clears, once.
  it('the first sign-in with no record of the last user clears, then is remembered', async () => {
    const h = harness('user-a', null);
    await h.owner.settled();
    expect(h.calls).toEqual(['owner:user-a', 'recount', 'claim:user-a', 'clear', 'last:user-a']);
  });

  it('sign out, then another user in: the owner follows at once, and that user gets fresh caches', async () => {
    const h = harness('user-a', 'user-a');
    await h.owner.settled();
    h.calls.length = 0;

    h.emit(null);
    expect(h.calls).toEqual(['owner:null', 'recount']); // at once — nothing of A's is sent while signed out
    h.emit('user-b');
    expect(h.calls).toEqual(['owner:null', 'recount', 'owner:user-b', 'recount']); // at once, before the async part
    await h.owner.settled();
    expect(h.calls).toEqual([
      'owner:null',
      'recount',
      'owner:user-b',
      'recount',
      'claim:user-b',
      'clear',
      'last:user-b',
    ]);
    expect(h.stored()).toBe('user-b');
  });

  it('ignores a repeat of the same user, and stops listening when stopped', async () => {
    const h = harness('user-a', 'user-a');
    await h.owner.settled();
    h.emit('user-a');
    h.owner.stop();
    h.emit('user-b');
    await h.owner.settled();
    expect(h.deps.setOwner).toHaveBeenCalledTimes(1);
  });

  it('a failed clear does not stop the next change from applying', async () => {
    const h = harness('user-b', 'user-a');
    (h.deps.clearCaches as jest.Mock).mockRejectedValueOnce(new Error('disk'));
    await h.owner.settled();
    h.emit('user-c');
    await h.owner.settled();
    expect(h.calls.slice(-3)).toEqual(['claim:user-c', 'clear', 'last:user-c']);
  });
});

describe("makeClearCaches — what a different user's sign-in clears", () => {
  it('the delta tables, the project and checklist caches, the cursor, the project and the conflicts — not the outbox or photos', async () => {
    const order: string[] = [];
    const clear = makeClearCaches({
      clearTable: async (t) => {
        order.push(`table:${t}`);
      },
      deltaTables: ['local_tasks', 'local_site_reports'],
      clearLastSyncAt: async () => {
        order.push('cursor');
      },
      clearProject: async () => {
        order.push('project');
      },
      clearConflicts: () => order.push('conflicts'),
    });
    await clear();
    expect(order).toEqual([
      'table:local_tasks',
      'table:local_site_reports',
      'table:local_projects',
      'table:local_safety_checklists',
      'cursor',
      'project',
      'conflicts',
    ]);
    expect(order.join(' ')).not.toMatch(/local_photos|sync_queue|local_photo_annotations/);
  });
});

describe('makeOnOwnerChanged — at once, on any change of user', () => {
  it('recounts the queue badge and drops the tenant', () => {
    const recount = jest.fn();
    const clearTenant = jest.fn();
    makeOnOwnerChanged({ recount, clearTenant })();
    expect(recount).toHaveBeenCalledTimes(1);
    expect(clearTenant).toHaveBeenCalledTimes(1);
  });
});
