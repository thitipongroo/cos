import { resolutionTarget } from '../resolutionTargets';

describe('resolutionTarget', () => {
  // Each mapping holds only because the queue key IS the local key: every offline create generates a
  // client UUID, writes it into the local row's server-id column and enqueues under the same value
  // (ADR-051 / G-M11). If a screen ever enqueues under something else, its rows stop reconciling —
  // which is exactly what incidents.tsx did, enqueuing under the PROJECT id.
  it.each([
    ['issue', 'local_issues', 'issueId'],
    ['site_report', 'local_site_reports', 'reportId'],
    ['task', 'local_tasks', 'taskId'],
    ['safety', 'local_incidents', 'incidentId'],
  ])('maps %s to its local row', (entityType, table, keyColumn) => {
    expect(resolutionTarget(entityType)).toEqual({ table, keyColumn });
  });

  it('has no target for entity types with no local row', () => {
    // Skipped rather than guessed at: `material` enqueues under the parent report's id and writes no
    // local consumption row; `inspection` has no local table; `photo_annotation` is reconciled by its
    // own ADR-056 path, which needs the server's version number and not just a status.
    expect(resolutionTarget('material')).toBeNull();
    expect(resolutionTarget('inspection')).toBeNull();
    expect(resolutionTarget('photo_annotation')).toBeNull();
  });

  it('has no target for an unknown entity type', () => {
    expect(resolutionTarget('something_new')).toBeNull();
  });

  it('does not resolve inherited Object properties as targets', () => {
    // A plain-object lookup walks the prototype chain; the server hit exactly this class of bug on
    // its own entity registry (`?entity_types=constructor`).
    expect(resolutionTarget('constructor')).toBeNull();
    expect(resolutionTarget('toString')).toBeNull();
  });
});
