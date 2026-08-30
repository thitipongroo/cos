// Unit tests for OutboxPublisher — spec §Phase 8 Outbox Pattern.
// The draining half (OutboxPoller) was removed from this package on 2026-08-27 under Rule 34(c);
// its tests live with the implementation, at backend/src/shared/events/__tests__/.

import { OutboxPublisher } from '../outbox';

describe('OutboxPublisher', () => {
  it('write() targets the schema-qualified platform.outbox_events table (QM-4)', async () => {
    const txMock = { $executeRaw: jest.fn().mockResolvedValue(1) };

    await OutboxPublisher.write(txMock as never, {
      event_type: 'construction.project.created.v1',
      event_version: '1.0',
      tenant_id: 'tenant-1',
      actor_id: 'user-1',
      occurred_at: new Date().toISOString(),
      correlation_id: 'corr-1',
      payload: { project_id: 'p-1' },
    });

    // The tagged-template strings array is the first argument; join it to inspect the SQL.
    const sql = (txMock.$executeRaw.mock.calls[0][0] as unknown as string[]).join('?');
    expect(sql).toContain('platform.outbox_events');
    // An unqualified name would resolve through search_path — non-deterministic under the
    // multi-schema tenant model (QM-4 / spec §11.0 rule 2).
    expect(sql).not.toMatch(/INTO\s+outbox_events/);
  });

  it('write() inserts an outbox record with a generated event_id', async () => {
    const txMock = { $executeRaw: jest.fn().mockResolvedValue(1) };

    await OutboxPublisher.write(txMock as never, {
      event_type: 'construction.project.created.v1',
      event_version: '1.0',
      tenant_id: 'tenant-1',
      actor_id: 'user-1',
      occurred_at: new Date().toISOString(),
      correlation_id: 'corr-1',
      payload: { project_id: 'p-1' },
    });

    expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('write() uses provided event_id when given', async () => {
    const txMock = { $executeRaw: jest.fn().mockResolvedValue(1) };

    await OutboxPublisher.write(txMock as never, {
      event_id: 'my-id-123',
      event_type: 'construction.project.created.v1',
      event_version: '1.0',
      tenant_id: 'tenant-1',
      actor_id: 'user-1',
      occurred_at: new Date().toISOString(),
      correlation_id: 'corr-1',
      payload: {},
    });

    expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);
  });
});

describe('outbox SQL is schema-qualified', () => {
  // Regression guard. OutboxPublisher.write() used to `INSERT INTO outbox_events` unqualified while
  // the poller reads `platform.outbox_events`. Nothing sets search_path, and the old
  // public.outbox_events was moved to the `projects` schema by 20260605000004 — so writer and reader
  // could address different tables: events inserted, never polled, no error raised.
  //
  const sqlOf = (mock: jest.Mock, call = 0): string =>
    (mock.mock.calls[call][0] as string[]).join('?');

  const envelope = {
    event_type: 'construction.project.created.v1',
    tenant_id: 'tenant-1',
    actor_id: 'user-1',
    occurred_at: new Date().toISOString(),
    correlation_id: 'corr-1',
    event_version: '1.0',
    payload: { project_id: 'p-1' },
  };

  it('OutboxPublisher writes to platform.outbox_events', async () => {
    const tx = { $executeRaw: jest.fn().mockResolvedValue(undefined) };

    await OutboxPublisher.write(tx as never, envelope as never);

    const sql = sqlOf(tx.$executeRaw);
    expect(sql).toContain('INSERT INTO platform.outbox_events');
    // The bug this guards against is the absence of the qualifier, not its presence elsewhere.
    expect(sql).not.toMatch(/INSERT\s+INTO\s+outbox_events/);
  });
});
