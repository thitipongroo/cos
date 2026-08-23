/**
 * Phase 10 — the offline sync engine (master:3646-3724).
 *
 * Everything here is about what happens to a mutation captured with no signal. That work exists
 * only on the device until it syncs, so each rule below is the difference between a record reaching
 * the platform and a record quietly ceasing to exist.
 */
import { read } from '../helpers';
// syncPriority is a pure module — a frozen array plus two functions, no Expo imports — so the
// order can be exercised directly rather than asserted as source text.
import { SYNC_PRIORITY_ORDER, syncPriorityRank } from '../../../apps/mobile/src/sync/syncPriority';

const MOBILE = 'apps/mobile/src';
const syncManager = read(`${MOBILE}/sync/SyncManager.ts`);
const queue = read(`${MOBILE}/db/sync-queue.ts`);

describe('Phase 10 · the local sync_queue (master:3647-3657)', () => {
  it.each([
    'entity_type',
    'entity_id',
    'operation',
    'payload',
    'status',
    'retry_count',
    'client_submitted_at',
    'last_attempt_at',
    'error_message',
  ])('has the %s column master declares', (column) => {
    expect(queue).toContain(column);
  });

  it('a queued item starts PENDING (master:3653)', () => {
    expect(queue).toMatch(/'PENDING'/);
  });

  it('stores the entity type exactly as the caller gave it', () => {
    // No translation on the way in. That matters for the exhaustion policy below, which matches on
    // this value: whatever the caller passes is what §17.2 has to recognise.
    expect(queue).toMatch(/INSERT INTO sync_queue[\s\S]*?entityType/);
  });
});

describe('Phase 10 · retry budget (master:3684)', () => {
  it('exhausts after 5 attempts, not 3', () => {
    // Five, spelled in the spec. The photo queue's limit is three (master:3724) — two different
    // numbers for two different queues, so a shared constant would be wrong.
    expect(syncManager).toMatch(/MAX_RETRIES = 5/);
  });
});

describe('Phase 10 · sync priority on reconnect (master:3568)', () => {
  it('safety incidents flush first', () => {
    expect(SYNC_PRIORITY_ORDER[0]).toBe('safety');
  });

  it.each([
    ['safety', 'attendance'],
    ['attendance', 'inspection'],
    ['task', 'site_report'],
    ['site_report', 'material'],
  ])('%s outranks %s', (first, second) => {
    expect(syncPriorityRank(first)).toBeLessThan(syncPriorityRank(second));
  });

  it('ranks every type the app can actually enqueue', () => {
    // A type missing from the order falls into the unranked tail and flushes behind everything —
    // which is how site defects once queued behind material tallies.
    for (const type of ['issue', 'photo_annotation', 'delivery', 'purchase-request']) {
      expect(syncPriorityRank(type)).toBeLessThan(SYNC_PRIORITY_ORDER.length);
    }
  });

  it('photo/media are not in this queue at all (master:3568 item 8)', () => {
    // "photo/media (deferred last)" — they are the largest payload and go through PhotoUploadQueue.
    expect(SYNC_PRIORITY_ORDER).not.toContain('photo');
  });
});

describe('Phase 10 · data size limits (master:3569)', () => {
  it('local DB is capped at 500 MB', () => {
    expect(read(`${MOBILE}/sync/localDbLimit.ts`)).toMatch(/500 \* 1024 \* 1024/);
  });

  it('the drawing cache is capped at 200 MB with LRU eviction', () => {
    const lru = read(`${MOBILE}/sync/drawingCacheLru.ts`);
    expect(lru).toMatch(/200 \* 1024 \* 1024/);
    expect(lru).toMatch(/LRU|lru/);
  });

  it('the photo queue is capped at 100 and warns at 80', () => {
    // The warning is the point: a queue that only refuses at the cap tells the user their work is
    // being dropped at the moment it is already too late to do anything about it.
    const limit = read(`${MOBILE}/sync/photoQueueLimit.ts`);
    expect(limit).toMatch(/MAX_PHOTO_QUEUE = 100/);
    expect(limit).toMatch(/PHOTO_QUEUE_WARN = 80/);
  });
});

describe('Phase 10 · background sync (master:3714-3718)', () => {
  const task = read(`${MOBILE}/sync/BackgroundSyncTask.ts`);

  it('runs no more often than every 15 minutes', () => {
    expect(task).toMatch(/15 \* 60/);
  });

  it('skips when the battery is below 15%', () => {
    // A sync engine that flattens a phone by lunchtime gets turned off, and then nothing syncs.
    expect(task).toMatch(/MIN_BATTERY_LEVEL = 0\.15/);
  });
});

describe('Phase 10 · the photo upload queue (master:3720-3724)', () => {
  const photos = read(`${MOBILE}/sync/PhotoUploadQueue.ts`);

  it('uploads one at a time', () => {
    expect(photos).toMatch(/one at a time/i);
  });

  it('retries three times, then fails the photo', () => {
    expect(photos).toMatch(/MAX_RETRIES = 3/);
  });

  it('uploads to the File Service endpoint (master:3723)', () => {
    expect(photos).toMatch(/'\/api\/v1\/files\/upload'/);
  });
});

describe('Phase 10 · client-side conflict handling (master:3701-3706)', () => {
  const handler = read(`${MOBILE}/sync/ConflictHandler.ts`);

  it.each(['ACCEPTED', 'CONFLICT_FLAGGED', 'CONFLICT_REJECTED'])('handles %s', (status) => {
    expect(handler).toContain(`case '${status}'`);
  });
});

describe('Phase 10 · offline write scope (§17.4)', () => {
  it('a type the server cannot replay is never queued', () => {
    // The client refuses rather than promising a replay that cannot happen — otherwise the UI says
    // "saved, will sync" on the way to a silent discard.
    expect(read(`${MOBILE}/api/client.ts`)).toMatch(
      /if \(!PUSHABLE_ENTITY_TYPES\.has\(entityType\)\)[\s\S]{0,200}throw err/,
    );
  });
});

/**
 * §17.2 retry exhaustion — the policy master:3685-3696 spells out entity by entity.
 *
 * This is what happens to a record that has failed to sync five times. For a safety incident the
 * spec requires it to be published to `platform.sync.exhausted`, put on the tenant-admin review
 * queue, and alerted to the PM and the Safety Officer. For a task update it requires the user to be
 * told. Getting this wrong is not a degraded experience — it is an incident recorded on site that
 * nobody ever learns was lost.
 */
describe('Phase 10 · retry exhaustion is dispatched on the type the queue actually holds', () => {
  /** The values production code passes to enqueue() — see the call sites named in each test. */
  const ENQUEUED_TYPES = [
    'safety', // (app)/incidents.tsx
    'material', // (app)/reports.tsx
    'issue', // (app)/issues.tsx
    'site_report', // (app)/report.tsx
    'photo_annotation', // sync/enqueueAnnotation.ts
    'task', // api/client.ts mutate(), gated on SYNC_PUSHABLE_ENTITY_TYPES
  ];

  it('every enqueued type is one the exhaustion policy recognises', () => {
    // handleExhaustion tests `item.entity_type` against three sets. A type in none of them falls
    // through the final `else` — "Unknown entity types: no action" — and five failed attempts end in
    // silence.
    const policyBlock = syncManager.slice(0, syncManager.indexOf('export class'));
    const unhandled = ENQUEUED_TYPES.filter((t) => !policyBlock.includes(`'${t}'`));
    expect(unhandled).toEqual([]);
  });

  it('a safety incident that exhausts its retries is escalated (master:3686-3688)', () => {
    // "publish to platform.sync.exhausted → tenant admin review queue; push alert to PM and Safety
    // Officer; preserve on device". The dispatch is by entity type, so the type the incidents screen
    // enqueues has to be the type the notify set contains.
    const notifySet = syncManager.slice(
      syncManager.indexOf('EXHAUSTED_NOTIFY_TYPES'),
      syncManager.indexOf('DISCARD_NOTIFY_TYPES'),
    );
    expect(notifySet).toContain("'safety'");
  });

  it('a task update that exhausts its retries tells the user (master:3694)', () => {
    const discardSet = syncManager.slice(
      syncManager.indexOf('DISCARD_NOTIFY_TYPES'),
      syncManager.indexOf('SILENT_DISCARD_TYPES'),
    );
    expect(discardSet).toContain("'task'");
  });

  it('a site report draft that exhausts its retries tells the user (master:3695)', () => {
    const discardSet = syncManager.slice(
      syncManager.indexOf('DISCARD_NOTIFY_TYPES'),
      syncManager.indexOf('SILENT_DISCARD_TYPES'),
    );
    expect(discardSet).toContain("'site_report'");
  });
});
