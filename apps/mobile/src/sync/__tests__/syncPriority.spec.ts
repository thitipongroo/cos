import { SYNC_PUSHABLE_ENTITY_TYPES } from '@cos/types';
import { SYNC_PRIORITY_ORDER, syncPriorityRank, syncPriorityCaseSql } from '../syncPriority';

describe('§17.6 sync priority order', () => {
  it('ranks entity types in the spec order (safety first, equipment last)', () => {
    expect(SYNC_PRIORITY_ORDER).toEqual([
      'safety',
      'attendance',
      'inspection',
      'issue',
      'task',
      'site_report',
      'material',
      'delivery',
      'purchase-request',
      'photo_annotation',
      'equipment',
    ]);
  });

  // The literal above is a snapshot of what the list IS. This is what §17.6 REQUIRES, and the two
  // are not the same thing: the spec names eight types, the implementation carries eleven. The four
  // extras (issue, delivery, purchase-request, photo_annotation) were added by later amendments and
  // are free to sit anywhere; the eight are not.
  //
  // Why both cases are needed: a future change that adds a twelfth type edits the literal, and a
  // one-line literal edit gives no signal about which neighbours were load-bearing. Someone moving
  // `material` above `inspection` while rewriting that array would update it to match and see green.
  // Expressed as a relative order, the spec constraint survives every edit to the list.
  it('keeps the eight §17.6 types in the order the spec fixes, whatever else is added', () => {
    const SPEC_17_6 = [
      'safety', // 1. Safety incidents
      'attendance', // 2. Workforce attendance
      'inspection', // 3. Inspection results
      'task', // 4. Task progress updates
      'site_report', // 5. Site report drafts
      'material', // 6. Material consumption logs
      'equipment', // 7. Equipment usage logs
      // 8. Photo/media uploads are NOT a queue entity — binaries go last through PhotoUploadQueue
      //    after the queue drains (see runPushSync). `photo_annotation` is a JSON mutation, a
      //    different thing, so it is deliberately absent from this list.
    ];
    const ranks = SPEC_17_6.map((t) => SYNC_PRIORITY_ORDER.indexOf(t as never));
    expect(ranks).not.toContain(-1);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  describe('syncPriorityRank', () => {
    it('returns the index for a ranked entity type', () => {
      expect(syncPriorityRank('safety')).toBe(0);
      expect(syncPriorityRank('attendance')).toBe(1);
      expect(syncPriorityRank('material')).toBe(6);
      expect(syncPriorityRank('equipment')).toBe(10);
    });

    it('returns length (sorts last) for an unranked entity type', () => {
      expect(syncPriorityRank('payment')).toBe(SYNC_PRIORITY_ORDER.length);
      expect(syncPriorityRank('conflict')).toBe(SYNC_PRIORITY_ORDER.length);
    });
  });

  describe('syncPriorityCaseSql', () => {
    it('builds a CASE mapping each type to its rank with a default ELSE', () => {
      const sql = syncPriorityCaseSql();
      expect(sql).toBe(
        "CASE entity_type WHEN 'safety' THEN 0 WHEN 'attendance' THEN 1 WHEN 'inspection' THEN 2 " +
          "WHEN 'issue' THEN 3 WHEN 'task' THEN 4 WHEN 'site_report' THEN 5 " +
          "WHEN 'material' THEN 6 WHEN 'delivery' THEN 7 WHEN 'purchase-request' THEN 8 " +
          "WHEN 'photo_annotation' THEN 9 WHEN 'equipment' THEN 10 ELSE 11 END",
      );
    });

    it('accepts a custom column name', () => {
      expect(syncPriorityCaseSql('t.entity_type')).toContain('CASE t.entity_type WHEN');
    });
  });

  // The invariant that keeps this list honest as the offline set grows: anything the outbox can hold
  // must have a rank, or it silently sorts into the unranked tail behind everything else. That is how
  // `issue` and `photo_annotation` came to flush after equipment usage logs.
  it('ranks every entity type the outbox can hold', () => {
    for (const type of SYNC_PUSHABLE_ENTITY_TYPES) {
      expect(syncPriorityRank(type)).toBeLessThan(SYNC_PRIORITY_ORDER.length);
    }
  });
});

// Absorbed from tests/spec-derived/phase-10-mobile/01-sync-engine.spec.ts (2026-08-25), which
// imported this module and so was a unit test living outside the app.
describe('what the queue deliberately does NOT carry', () => {
  it('has no photo/media entry at all (master:3568 item 8)', () => {
    // "photo/media (deferred last)" — they are the largest payload by far and go through
    // PhotoUploadQueue instead. A 'photo' entry here would put megabytes ahead of a safety incident
    // on a site connection that just came back.
    expect(SYNC_PRIORITY_ORDER).not.toContain('photo');
    expect(SYNC_PRIORITY_ORDER).not.toContain('media');
  });
});
