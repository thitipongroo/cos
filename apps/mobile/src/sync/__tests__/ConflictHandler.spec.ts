import { ConflictHandler } from '../ConflictHandler';

describe('ConflictHandler', () => {
  let handler: ConflictHandler;

  beforeEach(() => {
    handler = new ConflictHandler();
  });

  const local = { title: 'local version' };
  const server = { title: 'server version' };

  // The strategy map (LAST_WRITE_WINS / FIELD_LEVEL_MERGE / SERVER_WINS) and its `resolveStrategy`
  // reader were removed on 2026-08-19: nothing called them, and the server owns strategy selection
  // (backend conflict-handler.ts, QM-9 — "NEVER invent additional strategies"). What the device does
  // with the verdict is what is asserted here instead.

  describe('apply', () => {
    it('ACCEPTED → SYNCED, adopts the server payload, no message', () => {
      const result = handler.apply('ACCEPTED', local, server);
      expect(result.localSyncStatus).toBe('SYNCED');
      expect(result.payload).toBe(server);
      expect(result.userMessageKey).toBeNull();
    });

    it('ACCEPTED with no server payload keeps the local one', () => {
      // `site_report` is the real case: its service returns a conflict_status and no row, and what
      // the server stored IS what the client sent.
      const result = handler.apply('ACCEPTED', local, null);
      expect(result.localSyncStatus).toBe('SYNCED');
      expect(result.payload).toBe(local);
    });

    it('ACCEPTED adopts an EMPTY server payload rather than falling back to local', () => {
      // Guards the `?? localPayload` choice over a truthiness check: `{}` from a service that does
      // return rows is an answer, not an absence.
      const empty = {};
      expect(handler.apply('ACCEPTED', local, empty).payload).toBe(empty);
    });

    it('CONFLICT_FLAGGED → CONFLICT, adopts the server payload, message key', () => {
      const result = handler.apply('CONFLICT_FLAGGED', local, server);
      expect(result.localSyncStatus).toBe('CONFLICT');
      expect(result.payload).toBe(server);
      expect(result.userMessageKey).toBe('sync.conflict.flagged');
    });

    it('CONFLICT_FLAGGED with no server payload keeps the local one', () => {
      expect(handler.apply('CONFLICT_FLAGGED', local, null).payload).toBe(local);
    });

    it('CONFLICT_REJECTED → SYNCED, server payload, message key', () => {
      const result = handler.apply('CONFLICT_REJECTED', local, server);
      expect(result.localSyncStatus).toBe('SYNCED');
      expect(result.payload).toBe(server);
      expect(result.userMessageKey).toBe('sync.conflict.rejected');
    });

    it('CONFLICT_REJECTED with no server payload keeps the local one', () => {
      expect(handler.apply('CONFLICT_REJECTED', local, null).payload).toBe(local);
    });

    it('never returns a finished sentence — only translation keys', () => {
      // The messages were hardcoded English until 2026-08-19, in an app whose tenants are Thai.
      for (const status of ['ACCEPTED', 'CONFLICT_FLAGGED', 'CONFLICT_REJECTED'] as const) {
        const key = handler.apply(status, local, server).userMessageKey;
        if (key !== null) expect(key).toMatch(/^[a-z]+(\.[a-zA-Z]+)+$/);
      }
    });
  });
});
