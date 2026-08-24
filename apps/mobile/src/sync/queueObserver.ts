// queueObserver — the wire between the outbox table and the badge that reports it.
//
// `<SyncPill />` reads `syncStore.pendingCount`. Nothing ever wrote it, so the pill said "synced" to
// every user, forever, including one holding a device with a shift's worth of unsent reports on it.
// That was not a cosmetic defect: <OfflineBanner /> was DELETED on 2026-08-06 specifically because
// this count was believed to be live ("every write made offline enqueues, pendingCount rises, and
// the pill already says cloud-upload with the count"), so removing it left the app with no honest
// offline indication at all.
//
// Kept as its own module, taking its dependencies as arguments, for two reasons: src/db must not
// import src/store, and this way the behaviour is unit-testable without a database or a React host.

export interface QueueObserverDeps {
  /** db/sync-queue `subscribeQueueChanged` — returns its own unsubscribe. */
  subscribe: (cb: () => void) => () => void;
  /** db/sync-queue `countPending`. */
  countPending: () => number;
  /** syncStore `setPendingCount`. */
  setPendingCount: (count: number) => void;
}

/**
 * Publish the outbox depth now, and again on every change, until the returned function is called.
 *
 * The immediate first read matters as much as the subscription: at launch the queue may already hold
 * items from a previous session that no write will touch, and without it the pill would keep saying
 * "synced" until the user happened to make a change.
 */
export function startQueueObserver(deps: QueueObserverDeps): () => void {
  const publish = (): void => {
    deps.setPendingCount(deps.countPending());
  };
  publish();
  return deps.subscribe(publish);
}
