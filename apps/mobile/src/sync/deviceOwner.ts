// deviceOwner — keeps the device's offline state tied to the user who is signed in (fix/mobile-queue-per-user).
//
// A site phone is shared. Before this, user B signing in after user A got A's unsent outbox pushed under B's
// token (the server recorded B as the author, and wrote into B's tenant), and A's cached reports, photos,
// attendance and incidents on B's screens. Product owner, 2026-11-20:
//   - queued work is kept per user: each item and pending photo carries its owner, and only the signed-in
//     user's are sent — another user's wait on the device for that user (db/owner.ts, db/sync-queue.ts,
//     db/photoRepo.ts);
//   - the read caches are cleared when a DIFFERENT user signs in, and the delta cursor with them, so the new
//     user's first pull is a full one. The same user signing back in keeps everything.
//
// Its dependencies are arguments, as in queueObserver.ts: src/db must not import src/store, and the behaviour
// is unit-testable without a database or a React host.

export interface DeviceOwnerDeps {
  /** authStore: call back with the user id on every change; returns its own unsubscribe. */
  subscribe: (cb: (userId: string | null) => void) => () => void;
  getUserId: () => string | null;
  /** db/owner setOwner. */
  setOwner: (userId: string | null) => void;
  /** Rows queued, and photos taken, before owners were recorded go to the first user to sign in. */
  claimUnowned: (userId: string) => Promise<void>;
  /** The last user signed in on this device (SecureStore), and setting it. */
  readLastUser: () => Promise<string | null>;
  writeLastUser: (userId: string) => Promise<void>;
  /** Clear the read caches — never the outbox or pending photos — and forget the delta cursor. */
  clearCaches: () => Promise<void>;
  /** The owner changed: the per-user queue count must be recomputed. */
  onOwnerChanged: () => void;
}

/** The read caches cleared for a new user: what delta sync fills, plus the project and checklist caches. */
export const OTHER_READ_CACHES = ['local_projects', 'local_safety_checklists'] as const;

/**
 * Apply the signed-in user now, and on every change, until the returned function is called. Returns a
 * promise-aware unsubscribe; `settled()` resolves once the latest change has been applied (tests, and the
 * sync cycle, can wait for it).
 */
export function startDeviceOwner(deps: DeviceOwnerDeps): {
  stop: () => void;
  settled: () => Promise<void>;
} {
  let last: string | null | undefined;
  let chain: Promise<void> = Promise.resolve();

  const apply = async (userId: string | null): Promise<void> => {
    if (!userId) return;
    await deps.claimUnowned(userId);
    const previous = await deps.readLastUser();
    // A different user — or no record at all (the first sign-in after the update, when the cache may still hold
    // whoever used the device before): clear. The same user signing back in keeps the cache.
    if (previous !== userId) {
      await deps.clearCaches();
      await deps.writeLastUser(userId);
    }
  };

  const onChange = (userId: string | null): void => {
    if (userId === last) return;
    last = userId;
    // At once, so a cycle started now sends this user's work only; the rest below waits its turn.
    deps.setOwner(userId);
    deps.onOwnerChanged();
    // Serialised: a sign-out and a sign-in in quick succession apply in order.
    chain = chain
      .then(() => apply(userId))
      .catch(() => {
        /* best-effort: a failed clear leaves the old cache, never the old owner's queue in play */
      });
  };

  onChange(deps.getUserId());
  const unsubscribe = deps.subscribe(onChange);
  return { stop: unsubscribe, settled: () => chain };
}

/** What a different user's sign-in clears — the pieces, injected so the list is testable (deviceOwner.spec). */
export interface ClearForNewUserDeps {
  clearTable: (table: string) => Promise<void>;
  /** The tables delta sync fills (runDeltaSync.deltaCacheTables). */
  deltaTables: readonly string[];
  clearLastSyncAt: () => Promise<void>;
  /** The previous user's active project (projectStore.clear) and unresolved conflicts (offlineStore). */
  clearProject: () => Promise<void>;
  clearConflicts: () => void;
}

/**
 * The read caches — what delta sync fills, the project and checklist caches — never the outbox or pending
 * photos; the delta cursor, so the next pull is a full one; and the previous user's selection.
 */
export function makeClearCaches(deps: ClearForNewUserDeps): () => Promise<void> {
  return async () => {
    for (const table of [...deps.deltaTables, ...OTHER_READ_CACHES]) await deps.clearTable(table);
    await deps.clearLastSyncAt();
    await deps.clearProject();
    deps.clearConflicts();
  };
}

/**
 * What any change of signed-in user does at once: recount the per-user queue badge, and drop the tenant (the
 * signed-in user's, held in memory) so the next user's own fetch cannot be overwritten by a later clear.
 */
export function makeOnOwnerChanged(deps: {
  recount: () => void;
  clearTenant: () => void;
}): () => void {
  return () => {
    deps.recount();
    deps.clearTenant();
  };
}
