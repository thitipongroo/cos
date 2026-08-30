// buildOutboxEvent — envelope construction for the Phase 8 Outbox Pattern.
// The envelope must match the BASE EVENT ENVELOPE in 00_master §CROSS-SERVICE EVENT CONTRACT SPEC.

import { buildOutboxEvent } from '../outbox.types';

describe('buildOutboxEvent', () => {
  const base = {
    eventType: 'construction.project.created.v1',
    tenantId: 'tenant-1',
    actorId: 'user-1',
    correlationId: 'corr-1',
    payload: { project_id: 'p-1' },
  };

  it('builds the full envelope with defaults applied', () => {
    const before = Date.now();
    const evt = buildOutboxEvent(base);

    expect(evt).toMatchObject({
      event_type: 'construction.project.created.v1',
      event_version: '1.0',
      tenant_id: 'tenant-1',
      actor_id: 'user-1',
      correlation_id: 'corr-1',
      payload: { project_id: 'p-1' },
    });
    // occurred_at defaults to now, ISO 8601 UTC
    expect(evt.occurred_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(new Date(evt.occurred_at).getTime()).toBeGreaterThanOrEqual(before);
    // event_id is left unset — OutboxPublisher.write generates it
    expect(evt.event_id).toBeUndefined();
  });

  it('honours an explicit event_version and occurred_at', () => {
    const evt = buildOutboxEvent({
      ...base,
      eventVersion: '1.4',
      occurredAt: '2026-08-22T00:00:00.000Z',
    });

    expect(evt.event_version).toBe('1.4');
    expect(evt.occurred_at).toBe('2026-08-22T00:00:00.000Z');
  });
});
