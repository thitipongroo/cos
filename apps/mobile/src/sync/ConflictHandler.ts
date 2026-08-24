// ConflictHandler — how the DEVICE reacts to the verdict /sync/push returns (spec §17.1/§17.5).
//
// THE STRATEGIES LIVE ON THE SERVER, AND ONLY THERE. This file used to carry an ENTITY_STRATEGIES
// map (site_reports → LAST_WRITE_WINS, issues → FIELD_LEVEL_MERGE, checklists → SERVER_WINS) behind
// a `resolveStrategy()` that nothing ever called. It was removed on 2026-08-19 rather than wired up:
// backend/src/modules/site-ops/conflict-handler.ts implements exactly those three strategies and its
// header is explicit that strategy selection is entity-scoped and that additional strategies must
// never be invented (QM-9). A second copy on the device could only ever drift from the first, and
// the drift would be invisible — both sides would look right in isolation.
//
// So the division is: the server decides, the device applies. `/sync/push` answers with a status and,
// for every entity type whose service returns one, the RESOLVED ROW in `server_payload`. This class
// turns that pair into the three things the device needs — what the local row's sync status becomes,
// which payload it should now hold, and what (if anything) to tell the person holding the phone.
//
// `SERVER_PAYLOAD WINS WHENEVER THERE IS ONE`, on every status including ACCEPTED. An accepted push
// still comes back changed: server-assigned ids, server-authoritative timestamps (attendance), a
// clamped progress_percent (task). Keeping the local copy in those cases leaves the device holding a
// row the server does not have. When no payload comes back — `site_report`, whose service returns
// only a conflict_status — the local payload stands, which is correct: it is what the server stored.

export type ServerSyncStatus = 'ACCEPTED' | 'CONFLICT_FLAGGED' | 'CONFLICT_REJECTED';
export type LocalSyncStatus = 'PENDING' | 'SYNCED' | 'CONFLICT';

export interface ConflictResolution {
  /** What the local row's `sync_status` should become. */
  localSyncStatus: LocalSyncStatus;
  /** The row the device should now hold — the server's resolved version when it sent one. */
  payload: unknown;
  /**
   * Copy for the user, as a translation KEY rather than a sentence.
   *
   * It used to be a hardcoded English string. Nothing rendered it (SyncManager's `onUserNotify` had
   * no caller), which is the only reason that never shipped as English text to a Thai-language
   * tenant — see i18n `sync.conflict.*`. Null when there is nothing worth interrupting anyone for.
   */
  userMessageKey: string | null;
}

export class ConflictHandler {
  apply(
    serverStatus: ServerSyncStatus,
    localPayload: unknown,
    serverPayload: unknown,
  ): ConflictResolution {
    // `?? localPayload` and not a truthiness check: `server_payload` is absent (undefined/null) when
    // the service has none to give, but an empty object from a service that DOES return rows is a
    // real answer and must not fall back to the local copy.
    const resolved = serverPayload ?? localPayload;

    switch (serverStatus) {
      case 'ACCEPTED':
        return { localSyncStatus: 'SYNCED', payload: resolved, userMessageKey: null };

      // The server applied its strategy and wants a human to look at the result. The row is NOT left
      // PENDING — it has reached the server, and leaving it pending would make the outbox count
      // never fall — it is marked CONFLICT so conflict-review can surface it.
      case 'CONFLICT_FLAGGED':
        return {
          localSyncStatus: 'CONFLICT',
          payload: resolved,
          userMessageKey: 'sync.conflict.flagged',
        };

      case 'CONFLICT_REJECTED':
        return {
          localSyncStatus: 'SYNCED',
          payload: resolved,
          userMessageKey: 'sync.conflict.rejected',
        };
    }
  }
}
