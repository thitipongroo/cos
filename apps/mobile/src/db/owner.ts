// The user whose offline work this device is acting for right now (fix/mobile-queue-per-user).
//
// A phone on a site is shared. The outbox (sync_queue) and the pending photos (local_photos) used to
// record no owner, so after user A signed out and user B signed in, A's unsent reports, attendance and
// photos were pushed with B's token: the server recorded B as their author and, B being in another
// tenant, wrote them into B's tenant. Each row now carries its owner, and the queues send only the
// signed-in user's; another user's wait on the device for that user to sign in again (product owner,
// 2026-11-20).
//
// Held here, in src/db, as a plain module value: src/db must not import src/store. The wiring that
// follows authStore lives in sync/deviceOwner.ts.

let currentOwner: string | null = null;

/**
 * The owner given, at migration, to rows that existed before owners were recorded — and only to them. The first
 * user to sign in after the update takes exactly these (claim*); a row written later with no owner (a request
 * that failed after its user signed out) is never claimed by anyone, so it can never go out as another user.
 */
export const LEGACY_OWNER = '__legacy__';

/** The signed-in user, or null when nobody is — then the queues send nothing. */
export function getOwner(): string | null {
  return currentOwner;
}

export function setOwner(userId: string | null): void {
  currentOwner = userId;
}

/**
 * Resolves once the signed-in user has been applied to the device (sync/deviceOwner.ts): their legacy rows
 * claimed and, for a different user, the previous user's caches cleared and the delta cursor reset. A sync cycle,
 * and a cache refresh, wait for it so they cannot write for the new user into caches about to be cleared or pull
 * on the previous user's cursor.
 */
let ownerSettled: () => Promise<void> = () => Promise.resolve();

export function setOwnerSettled(settled: () => Promise<void>): void {
  ownerSettled = settled;
}

export function whenOwnerSettled(): Promise<void> {
  return ownerSettled();
}
