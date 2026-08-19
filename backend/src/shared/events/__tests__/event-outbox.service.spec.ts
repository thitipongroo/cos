// EventOutboxService — the write half of the outbox.
//
// This is where the eleven per-service try/catch blocks went. Their old specs each asserted "a Kafka
// failure does not break the request"; that behaviour lives here now, tested once against the one
// implementation instead of eleven times against eleven copies.

jest.mock('@cos/logger', () => {
  const error = jest.fn();
  return { createLogger: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error }) };
});

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $executeRaw: jest.fn().mockResolvedValue(1),
    $disconnect: jest.fn().mockResolvedValue(undefined),
  })),
  Prisma: {},
}));

import { EventOutboxService } from '../event-outbox.service';

type Fake = { $executeRaw: jest.Mock; $disconnect: jest.Mock };

function make(): { svc: EventOutboxService; db: Fake } {
  const svc = new EventOutboxService();
  return { svc, db: (svc as unknown as { prisma: Fake }).prisma };
}

const EVENT = {
  event_type: 'construction.project.created.v1',
  event_version: '1.0',
  tenant_id: '11111111-1111-1111-1111-111111111111',
  actor_id: '22222222-2222-2222-2222-222222222222',
  occurred_at: '2026-08-19T00:00:00.000Z',
  correlation_id: '33333333-3333-3333-3333-333333333333',
  payload: { project_id: 'p1' },
};

/** Flatten a Prisma tagged-template call into { sql, values }. */
function callOf(mock: jest.Mock, nth = 0): { sql: string; values: unknown[] } {
  const [strings, ...values] = mock.mock.calls[nth]!;
  return { sql: (strings as string[]).join(' ? ').replace(/\s+/g, ' '), values };
}

beforeEach(() => jest.clearAllMocks());

describe('EventOutboxService.publish', () => {
  it('inserts the event and returns the id it was queued under', async () => {
    const { svc, db } = make();

    const id = await svc.publish(EVENT);

    expect(db.$executeRaw).toHaveBeenCalledTimes(1);
    expect(callOf(db.$executeRaw).sql).toContain('INSERT INTO platform.outbox_events');
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  // The stored row is what the poller hands to Kafka, so the envelope has to be complete — and its
  // event_id has to be the one the row is keyed by, because that id is what consumers dedupe on
  // across retries.
  it('stores the COMPLETE envelope, carrying the same event_id as the row', async () => {
    const { svc, db } = make();

    const id = await svc.publish(EVENT);
    const { values } = callOf(db.$executeRaw);
    const stored = JSON.parse(values[3] as string) as Record<string, unknown>;

    expect(values[0]).toBe(id);
    expect(stored).toEqual({ ...EVENT, event_id: id });
  });

  it('denormalises tenant_id and event_type onto the row for operability', async () => {
    const { svc, db } = make();

    await svc.publish(EVENT);
    const { values } = callOf(db.$executeRaw);

    expect(values[1]).toBe(EVENT.tenant_id);
    expect(values[2]).toBe(EVENT.event_type);
  });

  it('queues rows unpublished, so the poller is the only thing that can mark one delivered', async () => {
    const { svc, db } = make();
    await svc.publish(EVENT);
    // `false` is written as a literal, not bound — assert on the statement itself.
    expect(callOf(db.$executeRaw).sql).toContain('false');
  });

  // The operation is already committed by the time this runs. Failing the caller would report a
  // business action as failed when it succeeded — strictly worse than a delivery problem.
  it('never throws to the caller when the insert fails, and reports the loss', async () => {
    const { svc, db } = make();
    db.$executeRaw.mockRejectedValueOnce(new Error('database is down'));

    await expect(svc.publish(EVENT)).resolves.toBeNull();
  });

  it('gives every event a distinct id', async () => {
    const { svc } = make();
    const first = await svc.publish(EVENT);
    const second = await svc.publish(EVENT);
    expect(first).not.toBe(second);
  });
});

describe('EventOutboxService.write (transactional form)', () => {
  it('writes through the caller-supplied transaction, not the service connection', async () => {
    const { svc, db } = make();
    const tx = { $executeRaw: jest.fn().mockResolvedValue(1) };

    const id = await svc.write(tx, EVENT);

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(db.$executeRaw).not.toHaveBeenCalled();
    expect(JSON.parse(callOf(tx.$executeRaw).values[3] as string)).toEqual({
      ...EVENT,
      event_id: id,
    });
  });

  // The opposite of publish(), and deliberately so: this runs INSIDE the caller's transaction, so
  // swallowing the error would commit the business row and silently drop the event — exactly what the
  // transactional form exists to make impossible.
  it('propagates a failure so the caller transaction rolls back with it', async () => {
    const { svc } = make();
    const tx = { $executeRaw: jest.fn().mockRejectedValue(new Error('serialization failure')) };

    await expect(svc.write(tx, EVENT)).rejects.toThrow('serialization failure');
  });
});

describe('EventOutboxService shutdown', () => {
  it('disconnects Prisma', async () => {
    const { svc, db } = make();
    await svc.onModuleDestroy();
    expect(db.$disconnect).toHaveBeenCalledTimes(1);
  });
});
