// The offline-sync contract shared by the API and the mobile client.
//
// WHY THIS LIVES IN @cos/types AND NOT IN EITHER SIDE. The mobile client has to know which entity
// types `/sync/push` can replay: a mutation queued under any other name is a row the server answers
// 400 to, forever. It used to know by way of a hand-maintained copy in `api/client.ts`, which is the
// same arrangement that let the two drift apart in the first place — the client happily queued
// `purchase-request`, `delivery`, `conflict` and `tenant-settings`, none of which the server's switch
// had a case for, and told the user their work was "saved, will sync" on the way to a silent discard.
//
// One declaration, imported by both, plus a backend test asserting `SyncService.push()` handles
// exactly these and nothing else. A new offline entity is then a compile-time and test-time event on
// both sides rather than something a reviewer has to notice.

/**
 * Entity types `POST /sync/push` accepts — the case list of `SyncService.push()`.
 *
 * Membership here means only "the server can replay a queued mutation of this type". It is NOT the
 * §17.4 offline scope: an entity can be pushable while a screen still chooses to write online-only
 * (`post()` / `patch()` rather than `mutate()`), which is how one-shot state transitions stay
 * one-shot.
 */
export const SYNC_PUSHABLE_ENTITY_TYPES = [
  'task',
  'site_report',
  'issue',
  'attendance',
  'safety',
  'material',
  'inspection',
  'photo_annotation',
  // Added 2026-08-19 (§17.4 amendment). Both are records CAPTURED ON SITE, which is exactly where
  // there is no signal: a delivery is signed for at the gate, and a purchase request is raised the
  // moment someone notices the material has run out. Neither is a financial commitment — the
  // purchase ORDER that §17.4 keeps online-required is a separate, later, approved document.
  'delivery',
  'purchase-request',
] as const;

export type SyncPushableEntityType = (typeof SYNC_PUSHABLE_ENTITY_TYPES)[number];

/** Whether `/sync/push` can replay a queued mutation of this type. */
export function isSyncPushable(entityType: string): entityType is SyncPushableEntityType {
  return (SYNC_PUSHABLE_ENTITY_TYPES as readonly string[]).includes(entityType);
}
