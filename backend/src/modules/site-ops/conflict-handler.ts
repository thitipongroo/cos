// ConflictHandler — Phase 6
// Implements exactly the three strategies from spec §Phase 6 Offline Conflict Resolution Strategy.
// Called by SiteOpsService.syncSiteReports() and SiteOpsService.syncIssues().
// Strategy selection is entity-scoped — NEVER invent additional strategies (QM-9).

export type ConflictStatus = 'ACCEPTED' | 'CONFLICT_FLAGGED' | 'CONFLICT_REJECTED';

export interface SyncRequest {
  entity_type: string;
  entity_id: string;
  client_version: number;
  payload: Record<string, unknown>;
  client_submitted_at: string; // ISO 8601 UTC
}

export interface SyncResult {
  resolved_payload: Record<string, unknown>;
  conflict_status: ConflictStatus;
  server_version: number;
}

// ── site_reports: LAST_WRITE_WINS on client_submitted_at ──────────────────
export function resolveReportConflict(
  clientPayload: Record<string, unknown>,
  serverRow: Record<string, unknown>,
  clientSubmittedAt: string,
): SyncResult {
  const clientTs = new Date(clientSubmittedAt).getTime();
  const serverModifiedAt = serverRow['modified_at'] as string | Date | undefined;
  const serverTs = serverModifiedAt ? new Date(serverModifiedAt).getTime() : 0;

  // Detect conflict: server was modified after the client's last known sync
  const lastKnownModifiedAt = clientPayload['last_known_modified_at'] as string | undefined;
  const lastKnownTs = lastKnownModifiedAt ? new Date(lastKnownModifiedAt).getTime() : 0;
  const hasConflict = serverTs > lastKnownTs && lastKnownTs > 0;

  if (!hasConflict || clientTs >= serverTs) {
    // Client wins (or no prior conflict)
    return {
      resolved_payload: { ...clientPayload, modified_at: new Date().toISOString() },
      conflict_status: hasConflict ? 'CONFLICT_FLAGGED' : 'ACCEPTED',
      server_version: (serverRow['version'] as number | undefined) ?? 1,
    };
  }

  // Server version is newer — client payload is older; flag for manual review
  return {
    resolved_payload: serverRow,
    conflict_status: 'CONFLICT_FLAGGED',
    server_version: (serverRow['version'] as number | undefined) ?? 1,
  };
}

// ── issues: FIELD_LEVEL_MERGE ─────────────────────────────────────────────
// description      — last writer wins (client_submitted_at)
// resolution_note  — last writer wins (client_submitted_at)
// status           — server wins (authoritative)
// photos           — union (additive; handled separately via file service)
export function resolveIssueConflict(
  clientPayload: Record<string, unknown>,
  serverRow: Record<string, unknown>,
  clientSubmittedAt: string,
): SyncResult {
  const clientTs = new Date(clientSubmittedAt).getTime();
  const serverModifiedAt = serverRow['modified_at'] as string | Date | undefined;
  const serverTs = serverModifiedAt ? new Date(serverModifiedAt).getTime() : 0;

  // Server status is always authoritative
  const resolvedStatus = serverRow['status'];

  // Detect status conflict: server changed status while client was offline
  const clientStatus = clientPayload['status'];
  const statusChangedServerSide = resolvedStatus !== clientStatus;

  // Text fields: last writer wins
  const resolvedDescription =
    clientTs >= serverTs ? clientPayload['description'] : serverRow['description'];
  const resolvedResolutionNote =
    clientTs >= serverTs ? clientPayload['resolution_note'] : serverRow['resolution_note'];

  const resolvedPayload: Record<string, unknown> = {
    ...serverRow,
    description: resolvedDescription,
    resolution_note: resolvedResolutionNote,
    status: resolvedStatus,
    modified_at: new Date().toISOString(),
  };

  const conflictStatus: ConflictStatus = statusChangedServerSide ? 'CONFLICT_FLAGGED' : 'ACCEPTED';

  return {
    resolved_payload: resolvedPayload,
    conflict_status: conflictStatus,
    server_version: (serverRow['version'] as number | undefined) ?? 1,
  };
}

// ── safety_checklists: SERVER_WINS ────────────────────────────────────────
// Safety data is always authoritative on server — client version is rejected unconditionally.
export function resolveChecklistConflict(serverRow: Record<string, unknown>): SyncResult {
  return {
    resolved_payload: serverRow,
    conflict_status: 'CONFLICT_REJECTED',
    server_version: (serverRow['version'] as number | undefined) ?? 1,
  };
}

// ── photo_annotation: CONFLICT_FLAGGED — no auto-resolution (ADR-056; §17.5) ─────────────────────
// An annotation stays editable after sync, so two people can mark up the same photo offline. Merging
// strokes would blend two readings of one defect; last-write-wins would discard one. Detection is by
// `version`: the client sends the base version it read. If the server row is unchanged since
// (versions match), the write is applied and the version bumped. If the server moved on, the write is
// flagged for SITE_ENGINEER review — the server row is kept and the client's strokes are NOT merged.
// A first-ever annotation (no server row) is a clean ACCEPTED write, not a conflict.
export function resolveAnnotationConflict(
  clientPayload: Record<string, unknown>,
  serverRow: Record<string, unknown> | null,
): SyncResult {
  // No existing annotation → the client is the first writer. Accept at version 1.
  if (!serverRow) {
    return {
      resolved_payload: { ...clientPayload, version: 1, modified_at: new Date().toISOString() },
      conflict_status: 'ACCEPTED',
      server_version: 1,
    };
  }

  const serverVersion = (serverRow['version'] as number | undefined) ?? 1;
  const clientBaseVersion = (clientPayload['version'] as number | undefined) ?? 0;

  // The client edited from a stale base — someone else saved in between. Flag, do not merge.
  if (clientBaseVersion !== serverVersion) {
    return {
      resolved_payload: serverRow,
      conflict_status: 'CONFLICT_FLAGGED',
      server_version: serverVersion,
    };
  }

  // Clean fast-forward: bump the version and take the client's strokes.
  const nextVersion = serverVersion + 1;
  return {
    resolved_payload: {
      ...serverRow,
      strokes: clientPayload['strokes'],
      version: nextVersion,
      modified_at: new Date().toISOString(),
    },
    conflict_status: 'ACCEPTED',
    server_version: nextVersion,
  };
}
