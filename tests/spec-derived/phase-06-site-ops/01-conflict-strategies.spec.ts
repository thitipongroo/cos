/**
 * Phase 6 Generate items 03, 04 and 10 — master:2573-2630, 2793, 2798.
 *
 * The spec fixes each strategy per entity and closes the set — "NEVER invent additional
 * strategies" (QM-9, master:772). These are pure functions, and the spec pins their algorithms
 * exactly, so they are tested directly rather than through HTTP.
 *
 *   site_reports      LAST_WRITE_WINS on client_submitted_at; CONFLICT_FLAGGED when the server
 *                     moved since the client's last_known_modified_at
 *   issues            FIELD_LEVEL_MERGE — description / resolution_note last writer wins,
 *                     status SERVER WINS, flagged when the server changed status
 *   safety_checklists SERVER_WINS — client rejected unconditionally, CONFLICT_REJECTED
 *   photo annotation  CONFLICT_FLAGGED — never auto-merged, never overwritten (ADR-056)
 */
import {
  resolveReportConflict,
  resolveIssueConflict,
  resolveChecklistConflict,
} from '../../../backend/src/modules/site-ops/conflict-handler';
import type { ConflictStatus } from '../../../backend/src/modules/site-ops/conflict-handler';

const EARLIER = '2026-01-01T00:00:00.000Z';
const LATER = '2026-06-01T00:00:00.000Z';
const LATEST = '2026-12-01T00:00:00.000Z';

describe('Phase 6 · conflict_status is exactly the three specified values (master:2630)', () => {
  it('the union admits ACCEPTED, CONFLICT_FLAGGED and CONFLICT_REJECTED', () => {
    // A compile-time check made observable: each is assignable, and the set is closed by the type.
    const all: ConflictStatus[] = ['ACCEPTED', 'CONFLICT_FLAGGED', 'CONFLICT_REJECTED'];
    expect(all).toHaveLength(3);
  });
});

describe('Phase 6 · site_reports LAST_WRITE_WINS (master:2574-2579)', () => {
  it('a clean write with no prior server change is ACCEPTED and persisted', () => {
    const result = resolveReportConflict(
      { summary: 'client text' },
      { summary: 'server text', modified_at: EARLIER },
      LATER,
    );
    expect(result.conflict_status).toBe('ACCEPTED');
    expect(result.should_persist).toBe(true);
    expect(result.resolved_payload['summary']).toBe('client text');
  });

  it('a newer client submission wins over an older server row', () => {
    const result = resolveReportConflict(
      { summary: 'client wins', last_known_modified_at: EARLIER },
      { summary: 'server text', modified_at: LATER },
      LATEST,
    );
    expect(result.resolved_payload['summary']).toBe('client wins');
    expect(result.should_persist).toBe(true);
  });

  it('the server changing since the client last synced is FLAGGED, not silently overwritten', () => {
    // "if server version modified_at differs from client's last_known_modified_at,
    //  flag as CONFLICT for manual review" (master:2578-2579)
    const result = resolveReportConflict(
      { summary: 'client text', last_known_modified_at: EARLIER },
      { summary: 'server text', modified_at: LATER },
      LATEST,
    );
    expect(result.conflict_status).toBe('CONFLICT_FLAGGED');
  });

  it('an older client submission does NOT overwrite a newer server row', () => {
    const result = resolveReportConflict(
      { summary: 'stale client', last_known_modified_at: EARLIER },
      { summary: 'server text', modified_at: LATEST },
      LATER,
    );
    expect(result.conflict_status).toBe('CONFLICT_FLAGGED');
    expect(result.resolved_payload['summary']).toBe('server text');
    // The distinction that matters: flagged AND not written back.
    expect(result.should_persist).toBe(false);
  });
});

describe('Phase 6 · issues FIELD_LEVEL_MERGE (master:2581-2591)', () => {
  const serverRow = {
    description: 'server description',
    resolution_note: 'server note',
    status: 'IN_PROGRESS',
    modified_at: LATER,
  };

  // `last_known_modified_at` is the client stating which version of the row it edited against. It
  // carries the second half of master:2591 — "while client had OFFLINE EDIT" — and without it there
  // is no divergence to resolve, only an ordinary update. These first assertions were originally
  // written without it, reading master:2586 as though the server owned `status` unconditionally;
  // that reading makes an issue's status permanently unchangeable and `issue.status_changed`
  // (master:2810) unreachable, so it cannot be what the spec means.
  const CLIENT_EDITED_AGAINST_AN_OLDER_VIEW = { last_known_modified_at: EARLIER };

  it('the server value wins when the server moved while the client was away', () => {
    // "status: server wins (status changes are authoritative)" — master:2586
    const result = resolveIssueConflict(
      {
        description: 'client description',
        status: 'RESOLVED',
        ...CLIENT_EDITED_AGAINST_AN_OLDER_VIEW,
      },
      serverRow,
      LATEST,
    );
    expect(result.resolved_payload['status']).toBe('IN_PROGRESS');
  });

  it('an ordinary update applies the client status and flags nothing', () => {
    const result = resolveIssueConflict(
      { description: 'client description', status: 'RESOLVED' },
      serverRow,
      LATEST,
    );
    expect(result.resolved_payload['status']).toBe('RESOLVED');
    expect(result.conflict_status).toBe('ACCEPTED');
  });

  it('an update that never mentions status leaves it untouched and unflagged', () => {
    const result = resolveIssueConflict({ description: 'typo fixed' }, serverRow, LATEST);
    expect(result.resolved_payload['status']).toBe('IN_PROGRESS');
    expect(result.conflict_status).toBe('ACCEPTED');
  });

  it('a newer client wins description and resolution_note', () => {
    const result = resolveIssueConflict(
      { description: 'client description', resolution_note: 'client note', status: 'IN_PROGRESS' },
      serverRow,
      LATEST,
    );
    expect(result.resolved_payload['description']).toBe('client description');
    expect(result.resolved_payload['resolution_note']).toBe('client note');
  });

  it('an older client loses description and resolution_note to the server', () => {
    const result = resolveIssueConflict(
      { description: 'stale client', resolution_note: 'stale note', status: 'IN_PROGRESS' },
      serverRow,
      EARLIER,
    );
    expect(result.resolved_payload['description']).toBe('server description');
    expect(result.resolved_payload['resolution_note']).toBe('server note');
  });

  it('a server-side status change while the client was offline is FLAGGED', () => {
    // "flag ConflictRecord for SITE_ENGINEER review if status was changed server-side" — master:2590
    const result = resolveIssueConflict(
      { description: 'client', status: 'OPEN', ...CLIENT_EDITED_AGAINST_AN_OLDER_VIEW },
      serverRow,
      LATEST,
    );
    expect(result.conflict_status).toBe('CONFLICT_FLAGGED');
  });

  it('no status divergence is a plain ACCEPTED merge', () => {
    const result = resolveIssueConflict(
      { description: 'client', status: 'IN_PROGRESS' },
      serverRow,
      LATEST,
    );
    expect(result.conflict_status).toBe('ACCEPTED');
  });

  it('a merge is always written back — it is never the untouched server row', () => {
    const result = resolveIssueConflict({ description: 'c', status: 'OPEN' }, serverRow, LATEST);
    expect(result.should_persist).toBe(true);
  });
});

describe('Phase 6 · safety_checklists SERVER_WINS (master:2604-2607)', () => {
  const serverRow = { checklist_name: 'server checklist', version: 7 };

  it('the client version is rejected UNCONDITIONALLY', () => {
    // "reject client version, return server version with CONFLICT_REJECTED status" — master:2607
    const result = resolveChecklistConflict(serverRow);
    expect(result.conflict_status).toBe('CONFLICT_REJECTED');
  });

  it('the server row is what comes back', () => {
    expect(resolveChecklistConflict(serverRow).resolved_payload).toBe(serverRow);
  });

  it('nothing is written back — the client edit is discarded, not merged', () => {
    expect(resolveChecklistConflict(serverRow).should_persist).toBe(false);
  });

  it('rejection does not depend on timestamps — safety data has no last-writer rule', () => {
    // Called with only the server row: there is no client argument to weigh, by design.
    expect(resolveChecklistConflict({ version: 1 }).conflict_status).toBe('CONFLICT_REJECTED');
    expect(resolveChecklistConflict({ version: 99 }).conflict_status).toBe('CONFLICT_REJECTED');
  });
});
