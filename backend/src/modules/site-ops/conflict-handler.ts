// ConflictHandler — Phase 6
// Implements exactly the three strategies from spec §Phase 6 Offline Conflict Resolution Strategy.
// Called by SiteOpsService.syncSiteReports() and SiteOpsService.syncIssues().
// Strategy selection is entity-scoped — NEVER invent additional strategies (QM-9).
//
// CLOCK SKEW (TDD OQ-28, 2026-08-23). LAST_WRITE_WINS orders edits by `client_submitted_at`, which
// is whatever the handset's clock said. No specification bounded it, so a device running fast won
// every merge until someone corrected it — and a phone that has been offline on a site for a week is
// exactly the device whose clock has drifted. Nothing in the codebase validated the value.
//
// `clampClientTimestamp` now caps it at the server's clock. See its comment for why capping is the
// whole fix and why the past is deliberately left alone.

export type ConflictStatus = 'ACCEPTED' | 'CONFLICT_FLAGGED' | 'CONFLICT_REJECTED';

/**
 * How far ahead of the server a client's timestamp may be before it is capped.
 *
 * Five minutes, the same window `PlatformWebhookService.REPLAY_WINDOW_MS` allows a signed webhook —
 * one number for "ordinary clock skew plus delivery latency" rather than two that drift apart. Wide
 * enough that an honest handset is never clamped, narrow enough that a device days fast cannot
 * outrank an edit made after it.
 */
export const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

export interface ClampedTimestamp {
  /** Epoch millis to order by. */
  ts: number;
  /** True when the client's own value was not usable as given. */
  clamped: boolean;
}

/**
 * The client's submission time, capped at the server's.
 *
 * FORWARD ONLY. A timestamp in the past is left exactly as it is: a report written on Tuesday and
 * synced on Friday genuinely happened on Tuesday, and rewriting it to Friday would make a stale
 * offline edit beat a deliberate correction someone made on the server in between. That is the case
 * offline-first exists to get right.
 *
 * Ahead of the server is different. A client cannot have written something later than the moment it
 * reached the server, so anything beyond the tolerance is capped at `now`. That still lets the
 * client win against rows modified before this sync — which is what LAST_WRITE_WINS means — while
 * taking away its ability to win against rows modified after it.
 *
 * An unparseable value is ordered as the OLDEST possible (0), so the server row wins. `NaN` would
 * have made every comparison false and produced the same outcome by accident; doing it deliberately
 * means the `clamped` flag is set and a caller can see it happened.
 */
export function clampClientTimestamp(
  clientSubmittedAt: string,
  now = Date.now(),
): ClampedTimestamp {
  const parsed = new Date(clientSubmittedAt).getTime();
  if (Number.isNaN(parsed)) return { ts: 0, clamped: true };
  if (parsed > now + CLOCK_SKEW_TOLERANCE_MS) return { ts: now, clamped: true };
  return { ts: parsed, clamped: false };
}

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
  /**
   * Whether `resolved_payload` still has to be written back to the server row.
   *
   * `conflict_status` alone cannot answer this: a report whose client payload wins is
   * CONFLICT_FLAGGED (it needs human review) yet must still be persisted, while a checklist is
   * CONFLICT_REJECTED and must not be. Callers that skipped the write entirely — the site-report
   * sync path did — silently dropped accepted offline edits, so the decision is made here, next to
   * the strategy that produced it, rather than re-derived at each call site (QM-9).
   *
   * False whenever `resolved_payload` IS the untouched server row: writing it back would be a no-op
   * that still bumps `modified_at`, resurfacing the row in every client's next delta page.
   */
  should_persist: boolean;

  /**
   * The client's `client_submitted_at` was capped or rejected as unusable (OQ-28).
   *
   * Not a conflict on its own — the merge still resolved — but a device whose clock is out by more
   * than five minutes will keep producing them, and the fix is on the device. Surfaced so the caller
   * can log it rather than have it disappear inside the comparison.
   */
  clock_skew_clamped: boolean;
}

// ── site_reports: LAST_WRITE_WINS on client_submitted_at ──────────────────
export function resolveReportConflict(
  clientPayload: Record<string, unknown>,
  serverRow: Record<string, unknown>,
  clientSubmittedAt: string,
): SyncResult {
  const { ts: clientTs, clamped } = clampClientTimestamp(clientSubmittedAt);
  const serverModifiedAt = serverRow['modified_at'] as string | Date | undefined;
  const serverTs = serverModifiedAt ? new Date(serverModifiedAt).getTime() : 0;

  // Detect conflict: server was modified after the client's last known sync
  const lastKnownModifiedAt = clientPayload['last_known_modified_at'] as string | undefined;
  const lastKnownTs = lastKnownModifiedAt ? new Date(lastKnownModifiedAt).getTime() : 0;
  const hasConflict = serverTs > lastKnownTs && lastKnownTs > 0;

  if (!hasConflict || clientTs >= serverTs) {
    // Client wins (or no prior conflict) — the client's fields become the new server state. Still
    // persisted when flagged: the flag asks a human to review the overwrite, it does not undo it.
    return {
      resolved_payload: { ...clientPayload, modified_at: new Date().toISOString() },
      conflict_status: hasConflict ? 'CONFLICT_FLAGGED' : 'ACCEPTED',
      server_version: (serverRow['version'] as number | undefined) ?? 1,
      should_persist: true,
      clock_skew_clamped: clamped,
    };
  }

  // Server version is newer — client payload is older; flag for manual review and keep the server row.
  return {
    resolved_payload: serverRow,
    conflict_status: 'CONFLICT_FLAGGED',
    server_version: (serverRow['version'] as number | undefined) ?? 1,
    should_persist: false,
    clock_skew_clamped: clamped,
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
  const { ts: clientTs, clamped } = clampClientTimestamp(clientSubmittedAt);
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
    // A field-level merge is never the untouched server row — the merged result is always written.
    should_persist: true,
    clock_skew_clamped: clamped,
  };
}

// ── safety_checklists: SERVER_WINS ────────────────────────────────────────
// Safety data is always authoritative on server — client version is rejected unconditionally.
export function resolveChecklistConflict(serverRow: Record<string, unknown>): SyncResult {
  return {
    resolved_payload: serverRow,
    conflict_status: 'CONFLICT_REJECTED',
    server_version: (serverRow['version'] as number | undefined) ?? 1,
    // Unconditional rejection — the client version is discarded, the server row stands.
    should_persist: false,
    // SERVER_WINS never consults a timestamp, so no clamp can have applied.
    clock_skew_clamped: false,
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
      should_persist: true,
      // Ordered by `version`, not by a clock — nothing here reads client_submitted_at (OQ-28).
      clock_skew_clamped: false,
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
      should_persist: false,
      clock_skew_clamped: false,
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
    should_persist: true,
    clock_skew_clamped: false,
  };
}
