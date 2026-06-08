// ConflictHandler — three resolution strategies from Phase 6 spec §17.1
// Client-side reaction to server sync responses.

export type ConflictStrategy = 'LAST_WRITE_WINS' | 'FIELD_LEVEL_MERGE' | 'SERVER_WINS';
export type ServerSyncStatus = 'ACCEPTED' | 'CONFLICT_FLAGGED' | 'CONFLICT_REJECTED';
export type LocalSyncStatus = 'PENDING' | 'SYNCED' | 'CONFLICT';

// Per Phase 6 spec §17.1 — entity → resolution strategy
const ENTITY_STRATEGIES: Record<string, ConflictStrategy> = {
  local_site_reports: 'LAST_WRITE_WINS',
  local_issues: 'FIELD_LEVEL_MERGE',
  safety_checklists: 'SERVER_WINS',
};

export interface ConflictResolution {
  localSyncStatus: LocalSyncStatus;
  payload: unknown;
  userMessage: string | null;
}

export class ConflictHandler {
  resolveStrategy(entityType: string): ConflictStrategy {
    return ENTITY_STRATEGIES[entityType] ?? 'SERVER_WINS';
  }

  apply(
    serverStatus: ServerSyncStatus,
    localPayload: unknown,
    serverPayload: unknown,
  ): ConflictResolution {
    switch (serverStatus) {
      case 'ACCEPTED':
        return { localSyncStatus: 'SYNCED', payload: localPayload, userMessage: null };

      case 'CONFLICT_FLAGGED':
        return {
          localSyncStatus: 'CONFLICT',
          payload: localPayload,
          userMessage: 'A conflict was detected. Please review the item.',
        };

      case 'CONFLICT_REJECTED':
        return {
          localSyncStatus: 'SYNCED',
          payload: serverPayload,
          userMessage: 'Your change was overridden by the server version.',
        };
    }
  }
}
