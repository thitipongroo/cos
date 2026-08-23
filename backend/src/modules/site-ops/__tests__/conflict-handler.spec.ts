// Unit tests — ConflictHandler (Phase 6)
// Covers all three conflict resolution strategies per spec §Phase 6.
// QM-1: mutation testing required for conflict resolution logic.

import {
  resolveReportConflict,
  resolveIssueConflict,
  resolveChecklistConflict,
  resolveAnnotationConflict,
  clampClientTimestamp,
  CLOCK_SKEW_TOLERANCE_MS,
} from '../conflict-handler';

const OLDER_TS = '2026-06-04T08:00:00.000Z';
const NEWER_TS = '2026-06-04T09:00:00.000Z';

// ── site_reports: LAST_WRITE_WINS ─────────────────────────────────────────

describe('resolveReportConflict — LAST_WRITE_WINS', () => {
  it('ACCEPTED when no prior modification (no last_known_modified_at)', () => {
    const client = { summary: 'client summary' };
    const server = { summary: 'server summary', modified_at: OLDER_TS, version: 1 };
    const result = resolveReportConflict(client, server, NEWER_TS);
    expect(result.conflict_status).toBe('ACCEPTED');
    expect(result.resolved_payload['summary']).toBe('client summary');
  });

  it('ACCEPTED when client is newer and no server-side change since last sync', () => {
    const client = { summary: 'updated', last_known_modified_at: OLDER_TS };
    const server = { summary: 'original', modified_at: OLDER_TS, version: 1 };
    const result = resolveReportConflict(client, server, NEWER_TS);
    expect(result.conflict_status).toBe('ACCEPTED');
  });

  it('CONFLICT_FLAGGED when server was modified after client last synced', () => {
    const client = { summary: 'client version', last_known_modified_at: OLDER_TS };
    const server = { summary: 'server version', modified_at: NEWER_TS, version: 2 };
    // Client is also newer — client wins but flagged
    const result = resolveReportConflict(client, server, NEWER_TS);
    expect(result.conflict_status).toBe('CONFLICT_FLAGGED');
  });

  it('CONFLICT_FLAGGED and server payload returned when server is newer than client', () => {
    const client = { summary: 'stale client', last_known_modified_at: OLDER_TS };
    const server = { summary: 'newer server', modified_at: NEWER_TS, version: 3 };
    // Client submitted at older timestamp
    const result = resolveReportConflict(client, server, OLDER_TS);
    expect(result.conflict_status).toBe('CONFLICT_FLAGGED');
    expect(result.resolved_payload['summary']).toBe('newer server');
  });

  it('returns server_version from server row', () => {
    const client = { summary: 'x' };
    const server = { summary: 'y', modified_at: OLDER_TS, version: 7 };
    const result = resolveReportConflict(client, server, NEWER_TS);
    expect(result.server_version).toBe(7);
  });

  it('defaults server_version to 1 when version is missing from server row', () => {
    const client = { summary: 'x' };
    const server = { summary: 'y', modified_at: OLDER_TS };
    const result = resolveReportConflict(client, server, NEWER_TS);
    expect(result.server_version).toBe(1);
  });

  it('defaults server_version to 1 when server is newer but has no version (covers line 50 ?? branch)', () => {
    // server is NEWER than client — reaches second return block
    const client = { summary: 'stale', last_known_modified_at: OLDER_TS };
    const server = { summary: 'fresh', modified_at: NEWER_TS }; // no version
    const result = resolveReportConflict(client, server, OLDER_TS);
    expect(result.conflict_status).toBe('CONFLICT_FLAGGED');
    expect(result.server_version).toBe(1); // ?? 1 right side
  });

  // should_persist drives the actual DB write in SiteOpsService.syncSiteReports. It is NOT the same
  // question as conflict_status: a client-wins overwrite is CONFLICT_FLAGGED *and* must be written.
  it('should_persist is true when the client payload wins (ACCEPTED)', () => {
    const client = { summary: 'client summary' };
    const server = { summary: 'server summary', modified_at: OLDER_TS, version: 1 };
    expect(resolveReportConflict(client, server, NEWER_TS).should_persist).toBe(true);
  });

  it('should_persist is true when the client wins but the write is flagged for review', () => {
    const client = { summary: 'client version', last_known_modified_at: OLDER_TS };
    const server = { summary: 'server version', modified_at: NEWER_TS, version: 2 };
    const result = resolveReportConflict(client, server, NEWER_TS);
    expect(result.conflict_status).toBe('CONFLICT_FLAGGED');
    expect(result.should_persist).toBe(true);
  });

  it('should_persist is false when the server row wins — writing it back would be a no-op', () => {
    const client = { summary: 'stale client', last_known_modified_at: OLDER_TS };
    const server = { summary: 'newer server', modified_at: NEWER_TS, version: 3 };
    const result = resolveReportConflict(client, server, OLDER_TS);
    expect(result.resolved_payload).toBe(server);
    expect(result.should_persist).toBe(false);
  });
});

// ── issues: FIELD_LEVEL_MERGE ─────────────────────────────────────────────

describe('resolveIssueConflict — FIELD_LEVEL_MERGE', () => {
  it('ACCEPTED when status unchanged and client is newer', () => {
    const client = { description: 'updated desc', status: 'OPEN', resolution_note: null };
    const server = {
      description: 'old desc',
      status: 'OPEN',
      resolution_note: null,
      modified_at: OLDER_TS,
      version: 1,
    };
    const result = resolveIssueConflict(client, server, NEWER_TS);
    expect(result.conflict_status).toBe('ACCEPTED');
    expect(result.resolved_payload['description']).toBe('updated desc');
  });

  it('server status always wins', () => {
    const client = { description: 'x', status: 'RESOLVED', resolution_note: null };
    const server = {
      description: 'x',
      status: 'IN_PROGRESS',
      resolution_note: null,
      modified_at: OLDER_TS,
    };
    const result = resolveIssueConflict(client, server, NEWER_TS);
    expect(result.resolved_payload['status']).toBe('IN_PROGRESS');
  });

  it('CONFLICT_FLAGGED when server changed status while client was offline', () => {
    const client = { description: 'update', status: 'OPEN', resolution_note: null };
    const server = {
      description: 'original',
      status: 'RESOLVED',
      resolution_note: 'done',
      modified_at: NEWER_TS,
    };
    const result = resolveIssueConflict(client, server, OLDER_TS);
    expect(result.conflict_status).toBe('CONFLICT_FLAGGED');
  });

  it('description: last writer wins — client newer takes client description', () => {
    const client = { description: 'client desc', status: 'OPEN', resolution_note: null };
    const server = {
      description: 'server desc',
      status: 'OPEN',
      resolution_note: null,
      modified_at: OLDER_TS,
    };
    const result = resolveIssueConflict(client, server, NEWER_TS);
    expect(result.resolved_payload['description']).toBe('client desc');
  });

  it('description: last writer wins — server newer takes server description', () => {
    const client = { description: 'old client', status: 'OPEN', resolution_note: null };
    const server = {
      description: 'new server',
      status: 'OPEN',
      resolution_note: null,
      modified_at: NEWER_TS,
    };
    const result = resolveIssueConflict(client, server, OLDER_TS);
    expect(result.resolved_payload['description']).toBe('new server');
  });

  it('resolution_note: last writer wins — client newer', () => {
    const client = { description: null, status: 'RESOLVED', resolution_note: 'fixed it' };
    const server = {
      description: null,
      status: 'RESOLVED',
      resolution_note: 'old note',
      modified_at: OLDER_TS,
    };
    const result = resolveIssueConflict(client, server, NEWER_TS);
    expect(result.resolved_payload['resolution_note']).toBe('fixed it');
  });

  it('resolved_payload always contains server status', () => {
    const client = { description: 'x', status: 'CLOSED', resolution_note: null };
    const server = {
      description: 'y',
      status: 'OPEN',
      resolution_note: null,
      modified_at: OLDER_TS,
    };
    const result = resolveIssueConflict(client, server, NEWER_TS);
    expect(result.resolved_payload['status']).toBe('OPEN');
  });

  // A field-level merge is never the untouched server row, so the merged result is always written —
  // including when the status change is flagged for review.
  it.each([
    ['unflagged', 'OPEN', 'ACCEPTED'],
    ['flagged', 'RESOLVED', 'CONFLICT_FLAGGED'],
  ])('should_persist is true for a %s merge', (_label, serverStatus, expectedStatus) => {
    const client = { description: 'update', status: 'OPEN', resolution_note: null };
    const server = {
      description: 'original',
      status: serverStatus,
      resolution_note: null,
      modified_at: OLDER_TS,
    };
    const result = resolveIssueConflict(client, server, NEWER_TS);
    expect(result.conflict_status).toBe(expectedStatus);
    expect(result.should_persist).toBe(true);
  });
});

// ── safety_checklists: SERVER_WINS ────────────────────────────────────────

describe('resolveReportConflict — branch: no modified_at in serverRow (covers ?? 0)', () => {
  it('ACCEPTED when serverRow has no modified_at (serverTs = 0)', () => {
    // serverModifiedAt is undefined → serverTs = 0 → no conflict
    const client = { summary: 'client summary' };
    const server = { summary: 'server summary' }; // no modified_at
    const result = resolveReportConflict(client, server, NEWER_TS);
    expect(result.conflict_status).toBe('ACCEPTED');
    expect(result.server_version).toBe(1); // ?? 1 fallback (no version)
  });
});

describe('resolveIssueConflict — branch: server newer than client (server description wins)', () => {
  it('uses server description when server is newer', () => {
    const client = { description: 'client desc', status: 'OPEN' };
    // server has NEWER modified_at than client_submitted_at
    const server = {
      description: 'server desc',
      status: 'OPEN',
      modified_at: NEWER_TS,
      version: 3,
    };
    const result = resolveIssueConflict(client, server, OLDER_TS); // client is OLDER
    expect(result.resolved_payload['description']).toBe('server desc');
    expect(result.server_version).toBe(3); // ?? 1 true branch — version IS defined
  });

  it('no modified_at in serverRow — serverTs = 0, client wins description', () => {
    const client = { description: 'client desc', status: 'OPEN' };
    const server = { description: 'server desc', status: 'OPEN' }; // no modified_at
    const result = resolveIssueConflict(client, server, OLDER_TS);
    // serverTs = 0, clientTs > 0, so clientTs >= serverTs → client wins
    expect(result.resolved_payload['description']).toBe('client desc');
    expect(result.server_version).toBe(1); // ?? 1 fallback
  });
});

describe('resolveChecklistConflict — SERVER_WINS', () => {
  it('always returns CONFLICT_REJECTED', () => {
    const server = { checklist_name: 'Safety A', items: [], version: 4 };
    const result = resolveChecklistConflict(server);
    expect(result.conflict_status).toBe('CONFLICT_REJECTED');
  });

  it('always returns server payload unchanged', () => {
    const server = {
      checklist_name: 'Safety B',
      items: [{ item_id: '1', description: 'wear helmet' }],
      version: 2,
    };
    const result = resolveChecklistConflict(server);
    expect(result.resolved_payload).toEqual(server);
  });

  it('server_version from server row', () => {
    const server = { version: 9 };
    const result = resolveChecklistConflict(server);
    expect(result.server_version).toBe(9);
  });

  it('defaults server_version to 1 when version missing (covers line 104 ?? branch)', () => {
    const server = { checklist_name: 'Safety C', items: [] }; // no version
    const result = resolveChecklistConflict(server);
    expect(result.server_version).toBe(1);
  });

  it('never persists — safety data is server-authoritative', () => {
    expect(resolveChecklistConflict({ version: 1 }).should_persist).toBe(false);
  });
});

// ── photo_annotation: CONFLICT_FLAGGED (ADR-056; §17.5) ──────────────────────────────────────────
describe('resolveAnnotationConflict', () => {
  const strokes = [{ tool: 'pen', points: [0.1, 0.2, 0.3, 0.4] }];

  it('accepts the first annotation at version 1 when none exists yet', () => {
    const result = resolveAnnotationConflict({ file_id: 'f1', strokes, version: 0 }, null);

    expect(result.conflict_status).toBe('ACCEPTED');
    expect(result.server_version).toBe(1);
    expect((result.resolved_payload as { version: number }).version).toBe(1);
    expect((result.resolved_payload as { strokes: unknown }).strokes).toBe(strokes);
    expect((result.resolved_payload as { modified_at?: string }).modified_at).toBeDefined();
  });

  it('fast-forwards and bumps the version when the client edited the current version', () => {
    const server = { file_id: 'f1', strokes: [{ tool: 'arrow' }], version: 3 };
    const result = resolveAnnotationConflict({ file_id: 'f1', strokes, version: 3 }, server);

    expect(result.conflict_status).toBe('ACCEPTED');
    expect(result.server_version).toBe(4);
    expect((result.resolved_payload as { version: number }).version).toBe(4);
    expect((result.resolved_payload as { strokes: unknown }).strokes).toBe(strokes);
  });

  it('flags for review when the client edited a stale version (someone else saved in between)', () => {
    const server = { file_id: 'f1', strokes: [{ tool: 'text' }], version: 5 };
    const result = resolveAnnotationConflict({ file_id: 'f1', strokes, version: 3 }, server);

    expect(result.conflict_status).toBe('CONFLICT_FLAGGED');
    expect(result.server_version).toBe(5);
    // The server row is kept untouched — the client's strokes are NOT merged in.
    expect(result.resolved_payload).toBe(server);
    expect(result.should_persist).toBe(false);
  });

  it('should_persist tracks ACCEPTED for both the first write and a clean fast-forward', () => {
    expect(
      resolveAnnotationConflict({ file_id: 'f1', strokes, version: 0 }, null).should_persist,
    ).toBe(true);
    expect(
      resolveAnnotationConflict(
        { file_id: 'f1', strokes, version: 3 },
        { file_id: 'f1', strokes: [], version: 3 },
      ).should_persist,
    ).toBe(true);
  });

  it('defaults the server version to 1 when the server row omits version', () => {
    const server = { file_id: 'f1', strokes: [] }; // no version → treated as 1
    // client base 0 ≠ server 1 → flagged
    const result = resolveAnnotationConflict({ file_id: 'f1', strokes, version: 0 }, server);

    expect(result.conflict_status).toBe('CONFLICT_FLAGGED');
    expect(result.server_version).toBe(1);
  });

  it('defaults the client base version to 0 when the payload omits version', () => {
    const server = { file_id: 'f1', strokes: [], version: 1 };
    // client base defaults to 0 ≠ server 1 → flagged
    const result = resolveAnnotationConflict({ file_id: 'f1', strokes }, server);

    expect(result.conflict_status).toBe('CONFLICT_FLAGGED');
    expect(result.server_version).toBe(1);
  });
});

// ── Clock skew (TDD OQ-28) ────────────────────────────────────────────────
//
// LAST_WRITE_WINS ordered edits by `client_submitted_at` with nothing bounding it, so a handset
// running fast won every merge until someone noticed and corrected the clock. A phone that has been
// offline on a site for a week is exactly the device whose clock has drifted.

describe('clampClientTimestamp', () => {
  const NOW = Date.parse('2026-06-04T09:00:00.000Z');

  it('leaves an honest timestamp exactly as it is', () => {
    const t = '2026-06-04T08:59:00.000Z';
    expect(clampClientTimestamp(t, NOW)).toEqual({ ts: Date.parse(t), clamped: false });
  });

  it('leaves the PAST alone, however old', () => {
    // A report written on Tuesday and synced on Friday genuinely happened on Tuesday. Rewriting it
    // to "now" would let a stale offline edit beat a correction made on the server in between —
    // the exact case offline-first exists to get right.
    const lastWeek = '2026-05-28T06:00:00.000Z';
    expect(clampClientTimestamp(lastWeek, NOW)).toEqual({
      ts: Date.parse(lastWeek),
      clamped: false,
    });
  });

  it('accepts a small lead without clamping — real devices are never exactly right', () => {
    const slightlyAhead = new Date(NOW + CLOCK_SKEW_TOLERANCE_MS - 1000).toISOString();
    expect(clampClientTimestamp(slightlyAhead, NOW).clamped).toBe(false);
  });

  it('caps a timestamp beyond the tolerance at the server clock', () => {
    const threeDaysFast = new Date(NOW + 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(clampClientTimestamp(threeDaysFast, NOW)).toEqual({ ts: NOW, clamped: true });
  });

  it('orders an unparseable timestamp as the oldest possible, and says so', () => {
    // NaN would have made every comparison false and reached the same outcome by accident. Doing it
    // deliberately is what lets a caller SEE that it happened.
    expect(clampClientTimestamp('not-a-timestamp', NOW)).toEqual({ ts: 0, clamped: true });
  });
});

describe('LAST_WRITE_WINS with a fast clock', () => {
  it('a device days fast no longer beats a server edit made after it', () => {
    const serverEditedAfter = new Date(Date.now() + 60_000).toISOString();
    const client = { summary: 'from the fast phone', last_known_modified_at: OLDER_TS };
    const server = { summary: 'server truth', modified_at: serverEditedAfter, version: 3 };
    const threeDaysFast = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

    const result = resolveReportConflict(client, server, threeDaysFast);

    // Clamped to the server's now, which is BEFORE the server's own edit — so the server row wins.
    expect(result.resolved_payload['summary']).toBe('server truth');
    expect(result.should_persist).toBe(false);
    expect(result.clock_skew_clamped).toBe(true);
  });

  it('still lets an honest client win against an older server row', () => {
    // The clamp must not break the ordinary case: capping at "now" leaves the client later than a
    // row modified before this sync, which is what LAST_WRITE_WINS means.
    const client = { summary: 'client summary', last_known_modified_at: OLDER_TS };
    const server = { summary: 'server summary', modified_at: OLDER_TS, version: 1 };

    const result = resolveReportConflict(client, server, new Date().toISOString());

    expect(result.resolved_payload['summary']).toBe('client summary');
    expect(result.clock_skew_clamped).toBe(false);
  });

  it('applies to the issue merge too — text fields follow the same clock', () => {
    const serverEditedAfter = new Date(Date.now() + 60_000).toISOString();
    const client = { description: 'from the fast phone', status: 'OPEN' };
    const server = { description: 'server truth', status: 'OPEN', modified_at: serverEditedAfter };
    const threeDaysFast = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

    const result = resolveIssueConflict(client, server, threeDaysFast);

    expect(result.resolved_payload['description']).toBe('server truth');
    expect(result.clock_skew_clamped).toBe(true);
  });
});

describe('strategies that do not read a clock', () => {
  it('SERVER_WINS and the annotation merge never report a clamp', () => {
    expect(resolveChecklistConflict({ version: 2 }).clock_skew_clamped).toBe(false);
    expect(resolveAnnotationConflict({ strokes: [] }, null).clock_skew_clamped).toBe(false);
  });
});
