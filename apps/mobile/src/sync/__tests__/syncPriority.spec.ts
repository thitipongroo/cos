import { SYNC_PRIORITY_ORDER, syncPriorityRank, syncPriorityCaseSql } from '../syncPriority';

describe('§17.6 sync priority order', () => {
  it('ranks entity types in the spec order (safety first, equipment last)', () => {
    expect(SYNC_PRIORITY_ORDER).toEqual([
      'safety',
      'attendance',
      'inspection',
      'task',
      'site_report',
      'material',
      'equipment',
    ]);
  });

  describe('syncPriorityRank', () => {
    it('returns the index for a ranked entity type', () => {
      expect(syncPriorityRank('safety')).toBe(0);
      expect(syncPriorityRank('attendance')).toBe(1);
      expect(syncPriorityRank('material')).toBe(5);
      expect(syncPriorityRank('equipment')).toBe(6);
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
          "WHEN 'task' THEN 3 WHEN 'site_report' THEN 4 WHEN 'material' THEN 5 " +
          "WHEN 'equipment' THEN 6 ELSE 7 END",
      );
    });

    it('accepts a custom column name', () => {
      expect(syncPriorityCaseSql('t.entity_type')).toContain('CASE t.entity_type WHEN');
    });
  });
});
