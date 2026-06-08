import { ConflictHandler } from '../ConflictHandler';

describe('ConflictHandler', () => {
  let handler: ConflictHandler;

  beforeEach(() => {
    handler = new ConflictHandler();
  });

  // ── resolveStrategy ──────────────────────────────────────────────────────

  describe('resolveStrategy', () => {
    it('returns LAST_WRITE_WINS for local_site_reports', () => {
      expect(handler.resolveStrategy('local_site_reports')).toBe('LAST_WRITE_WINS');
    });

    it('returns FIELD_LEVEL_MERGE for local_issues', () => {
      expect(handler.resolveStrategy('local_issues')).toBe('FIELD_LEVEL_MERGE');
    });

    it('returns SERVER_WINS for safety_checklists', () => {
      expect(handler.resolveStrategy('safety_checklists')).toBe('SERVER_WINS');
    });

    it('returns SERVER_WINS as default for unknown entity types', () => {
      expect(handler.resolveStrategy('some_unknown_entity')).toBe('SERVER_WINS');
    });
  });

  // ── apply ────────────────────────────────────────────────────────────────

  describe('apply', () => {
    const local = { title: 'local version' };
    const server = { title: 'server version' };

    it('ACCEPTED → SYNCED status, local payload, no user message', () => {
      const result = handler.apply('ACCEPTED', local, server);
      expect(result.localSyncStatus).toBe('SYNCED');
      expect(result.payload).toBe(local);
      expect(result.userMessage).toBeNull();
    });

    it('CONFLICT_FLAGGED → CONFLICT status, local payload, user message', () => {
      const result = handler.apply('CONFLICT_FLAGGED', local, server);
      expect(result.localSyncStatus).toBe('CONFLICT');
      expect(result.payload).toBe(local);
      expect(result.userMessage).toBeTruthy();
    });

    it('CONFLICT_REJECTED → SYNCED status, server payload, user message', () => {
      const result = handler.apply('CONFLICT_REJECTED', local, server);
      expect(result.localSyncStatus).toBe('SYNCED');
      expect(result.payload).toBe(server);
      expect(result.userMessage).toBeTruthy();
    });
  });
});
