// OutboxPollerService — the delivery half of the outbox.
//
// The scheduling loop is driven directly through poll() rather than by advancing timers: what matters
// is the DECISIONS (claim, publish, mark, back off, give up), and a test that waits on real 500ms
// intervals would be slow and flaky without testing any of them.

jest.mock('@cos/logger', () => {
  const warn = jest.fn();
  const error = jest.fn();
  return {
    createLogger: () => ({ info: jest.fn(), debug: jest.fn(), warn, error }),
    __log: { warn, error },
  };
});
const { __log: log } = jest.requireMock('@cos/logger');

const producerMock = {
  connect: jest.fn().mockResolvedValue(undefined),
  publish: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
};
jest.mock('@cos/kafka', () => ({
  KafkaProducer: jest.fn().mockImplementation(() => producerMock),
}));

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $queryRaw: jest.fn().mockResolvedValue([]),
    $executeRaw: jest.fn().mockResolvedValue(1),
    $disconnect: jest.fn().mockResolvedValue(undefined),
  })),
  Prisma: {},
}));

import {
  OutboxPollerService,
  IDLE_INTERVAL_MS,
  ERROR_INTERVAL_MS,
  BATCH_SIZE,
  MAX_ATTEMPTS,
} from '../outbox-poller.service';

type Fake = { $queryRaw: jest.Mock; $executeRaw: jest.Mock; $disconnect: jest.Mock };

function make(): { svc: OutboxPollerService; db: Fake } {
  const svc = new OutboxPollerService();
  return { svc, db: (svc as unknown as { prisma: Fake }).prisma };
}

function row(
  over: Partial<{ id: string; event_type: string; payload: unknown; attempts: number }> = {},
) {
  const id = over.id ?? 'aaaaaaaa-0000-0000-0000-000000000001';
  return {
    id,
    event_type: over.event_type ?? 'construction.project.created.v1',
    payload: over.payload ?? { event_id: id, event_type: 'construction.project.created.v1' },
    attempts: over.attempts ?? 1,
  };
}

function sqlOf(mock: jest.Mock, nth = 0): string {
  return ((mock.mock.calls[nth]?.[0] ?? []) as string[]).join(' ? ').replace(/\s+/g, ' ');
}

beforeEach(() => {
  jest.clearAllMocks();
  producerMock.connect.mockResolvedValue(undefined);
  producerMock.publish.mockResolvedValue(undefined);
});

describe('OutboxPollerService.poll — claiming', () => {
  it('connects once and reuses the producer across polls', async () => {
    const { svc } = make();

    await svc.poll();
    await svc.poll();

    expect(producerMock.connect).toHaveBeenCalledTimes(1);
  });

  // Every replica polls, so the claim has to be a single statement that hands DISJOINT rows to
  // concurrent callers. SELECT-then-UPDATE would give all three the same rows and publish everything
  // three times — the exact failure the leader-elected @Cron jobs avoid a different way.
  it('claims with one UPDATE … FOR UPDATE SKIP LOCKED, not a read followed by a write', async () => {
    const { svc, db } = make();
    await svc.poll();

    const sql = sqlOf(db.$queryRaw);
    expect(sql).toContain('UPDATE platform.outbox_events');
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toContain('published = false');
    expect(sql).toContain('next_attempt_at <= now()');
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
  });

  // Counted at claim time on purpose: a poller killed mid-publish never reaches a failure handler, so
  // an attempt counter that only counted clean failures would never retire a row that kills the process.
  it('increments attempts and pushes next_attempt_at out as part of claiming', async () => {
    const { svc, db } = make();
    await svc.poll();

    const sql = sqlOf(db.$queryRaw);
    expect(sql).toContain('attempts = attempts + 1');
    expect(sql).toContain('next_attempt_at = now() +');
  });

  it('excludes rows that have exhausted their attempts, so a poison event stops taking a slot', async () => {
    const { svc, db } = make();
    await svc.poll();
    expect(sqlOf(db.$queryRaw)).toContain('attempts < ?');
    expect(db.$queryRaw.mock.calls[0]).toContain(MAX_ATTEMPTS);
  });
});

describe('OutboxPollerService.poll — delivery', () => {
  it('publishes the stored envelope unchanged, preserving its event_id', async () => {
    const { svc, db } = make();
    const envelope = { event_id: 'evt-1', event_type: 'x.y.v1', payload: {} };
    db.$queryRaw.mockResolvedValueOnce([row({ payload: envelope })]);

    await svc.poll();

    // Unchanged is the point: KafkaConsumer dedupes on event_id, so a retry must present the SAME id.
    expect(producerMock.publish).toHaveBeenCalledWith(envelope);
  });

  it('marks the row published only after Kafka accepted it', async () => {
    const { svc, db } = make();
    db.$queryRaw.mockResolvedValueOnce([row()]);

    await svc.poll();

    const sql = sqlOf(db.$executeRaw);
    expect(sql).toContain('SET published = true');
    expect(producerMock.publish.mock.invocationCallOrder[0]).toBeLessThan(
      db.$executeRaw.mock.invocationCallOrder[0]!,
    );
  });

  it('leaves a failed row unpublished so it is retried, and records why', async () => {
    const { svc, db } = make();
    db.$queryRaw.mockResolvedValueOnce([row({ attempts: 2 })]);
    producerMock.publish.mockRejectedValueOnce(new Error('broker unavailable'));

    await svc.poll();

    const sql = sqlOf(db.$executeRaw);
    expect(sql).toContain('SET last_error = ?');
    expect(sql).not.toContain('published = true');
    expect(db.$executeRaw.mock.calls[0]).toContain('broker unavailable');
    expect(log.warn).toHaveBeenCalled();
  });

  // Nothing will retry a row at the attempt ceiling, so this line is the only notice anyone gets.
  it('logs a dead letter at ERROR once the attempt ceiling is reached', async () => {
    const { svc, db } = make();
    db.$queryRaw.mockResolvedValueOnce([row({ attempts: MAX_ATTEMPTS })]);
    producerMock.publish.mockRejectedValueOnce(new Error('no schema registered'));

    await svc.poll();

    expect(log.error).toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  });

  // Prisma normally rejects with an Error, but a driver adapter can surface a raw value; the failure
  // handler must still record something rather than throw inside the catch.
  it('records a non-Error rejection as its string form', async () => {
    const { svc, db } = make();
    db.$queryRaw.mockResolvedValueOnce([row()]);
    producerMock.publish.mockRejectedValueOnce('connection reset by peer');

    await svc.poll();

    expect(db.$executeRaw.mock.calls[0]).toContain('connection reset by peer');
  });

  it('keeps going after one row fails, rather than abandoning the batch', async () => {
    const { svc, db } = make();
    db.$queryRaw.mockResolvedValueOnce([row({ id: 'a' }), row({ id: 'b' })]);
    producerMock.publish.mockRejectedValueOnce(new Error('transient'));

    await svc.poll();

    expect(producerMock.publish).toHaveBeenCalledTimes(2);
  });

  it('does not fail the delivery when recording the error itself fails', async () => {
    const { svc, db } = make();
    db.$queryRaw.mockResolvedValueOnce([row()]);
    producerMock.publish.mockRejectedValueOnce(new Error('transient'));
    db.$executeRaw.mockRejectedValueOnce(new Error('database went away too'));

    await expect(svc.poll()).resolves.toBe(IDLE_INTERVAL_MS);
  });
});

describe('OutboxPollerService.poll — pacing', () => {
  // Every other case in this describe compares poll()'s return to the IMPORTED IDLE_INTERVAL_MS,
  // which is the constant measured against itself: set it to 5000 and they all stay green while the
  // poller silently drops from 2 Hz to 0.2 Hz. master:3158 states the number, so pin the number.
  it('idles for the 500ms master:3158 states, not merely "whatever the constant says"', () => {
    expect(IDLE_INTERVAL_MS).toBe(500);
  });

  it('idles when there was nothing to do', async () => {
    const { svc } = make();
    await expect(svc.poll()).resolves.toBe(IDLE_INTERVAL_MS);
  });

  it('comes straight back for the next batch while a backlog is draining', async () => {
    const { svc, db } = make();
    db.$queryRaw.mockResolvedValueOnce(
      Array.from({ length: BATCH_SIZE }, (_, i) => row({ id: `id-${i}` })),
    );

    await expect(svc.poll()).resolves.toBe(0);
  });

  it('idles again once a partial batch shows the backlog is gone', async () => {
    const { svc, db } = make();
    db.$queryRaw.mockResolvedValueOnce([row()]);
    await expect(svc.poll()).resolves.toBe(IDLE_INTERVAL_MS);
  });

  // Without the back-off, a broker outage is a 2 Hz retry loop against a dead broker from every
  // replica, for the whole outage.
  it('backs off when the broker is unreachable, and reconnects on the next cycle', async () => {
    const { svc } = make();
    producerMock.connect.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(svc.poll()).resolves.toBe(ERROR_INTERVAL_MS);
    expect(log.error).toHaveBeenCalled();

    await svc.poll();
    expect(producerMock.connect).toHaveBeenCalledTimes(2);
  });

  // Claiming spends an attempt from each row's budget, and a row out of budget is a dead letter. If
  // the poller claimed before checking it could reach the broker, a half-hour outage would retire
  // every queued event as undeliverable — with nothing wrong with any of them.
  it('claims nothing while the broker is unreachable, so an outage costs no retry budget', async () => {
    const { svc, db } = make();
    producerMock.connect.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await svc.poll();

    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it('backs off when the claim statement fails', async () => {
    const { svc, db } = make();
    db.$queryRaw.mockRejectedValueOnce(new Error('connection terminated'));

    await expect(svc.poll()).resolves.toBe(ERROR_INTERVAL_MS);
  });
});

describe('OutboxPollerService lifecycle', () => {
  it('starts polling on application bootstrap', async () => {
    const { svc } = make();
    svc.onApplicationBootstrap();
    expect((svc as unknown as { running: boolean }).running).toBe(true);
    await svc.onModuleDestroy();
  });

  // The loop is self-rescheduling: each poll decides how long until the next one. If the callback did
  // not re-arm the timer, the poller would deliver exactly one batch per process and then go quiet —
  // a failure nothing else here would catch, because a single poll() still looks perfect.
  it('re-arms itself after each poll, using the delay that poll returned', async () => {
    jest.useFakeTimers();
    try {
      const { svc, db } = make();
      svc.onApplicationBootstrap();

      await jest.advanceTimersByTimeAsync(IDLE_INTERVAL_MS);
      expect(db.$queryRaw).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(IDLE_INTERVAL_MS);
      expect(db.$queryRaw).toHaveBeenCalledTimes(2);

      (svc as unknown as { running: boolean }).running = false;
    } finally {
      jest.useRealTimers();
    }
  });

  // A timer that keeps the event loop alive turns "the app finished" into "the app hangs" — in a Jest
  // worker and in a process whose boot failed alike.
  it('does not hold the process open with its timer', () => {
    const { svc } = make();
    svc.onApplicationBootstrap();
    const timer = (svc as unknown as { timer: { hasRef?: () => boolean } }).timer;
    expect(timer.hasRef?.()).toBe(false);
  });

  // Shutdown clears `running`, and the poll already in flight then re-arms the timer on its way out.
  // Without the guard in schedule() that re-arm would resurrect a loop the process is trying to end.
  it('does not re-arm the timer once shutdown has cleared the running flag', async () => {
    jest.useFakeTimers();
    try {
      const { svc, db } = make();
      svc.onApplicationBootstrap();
      (svc as unknown as { running: boolean }).running = false;

      await jest.advanceTimersByTimeAsync(IDLE_INTERVAL_MS * 4);

      // The already-armed timer fires once; nothing schedules another.
      expect(db.$queryRaw).toHaveBeenCalledTimes(1);
      expect((svc as unknown as { timer: unknown }).timer).not.toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('stops the loop, closes the producer and disconnects on shutdown', async () => {
    const { svc, db } = make();
    svc.onApplicationBootstrap();
    await svc.poll(); // establishes the Kafka connection

    await svc.onModuleDestroy();

    expect((svc as unknown as { running: boolean }).running).toBe(false);
    expect(producerMock.disconnect).toHaveBeenCalledTimes(1);
    expect(db.$disconnect).toHaveBeenCalledTimes(1);
  });

  it('shuts down cleanly when it never managed to connect', async () => {
    const { svc } = make();
    svc.onApplicationBootstrap();

    await svc.onModuleDestroy();

    expect(producerMock.disconnect).not.toHaveBeenCalled();
  });

  // The three paths below all end in the same place: SIGTERM must not leave the process alive
  // waiting on a rejected promise. Kubernetes escalates to SIGKILL when it does, and a hard kill
  // during a poll abandons claimed rows for the full reservation window.

  it('still releases the database when the in-flight poll rejected', async () => {
    // The poll chain is awaited during shutdown. An unhandled rejection there would skip
    // $disconnect entirely and take the shutdown down with it.
    const { svc, db } = make();
    svc.onApplicationBootstrap();
    (svc as unknown as { inFlight: Promise<void> }).inFlight = Promise.reject(
      new Error('poll blew up'),
    );

    await expect(svc.onModuleDestroy()).resolves.toBeUndefined();

    expect(db.$disconnect).toHaveBeenCalledTimes(1);
  });

  it('still releases the database when the producer refuses to disconnect', async () => {
    // A broker that has already gone away rejects the disconnect. That is the NORMAL case during a
    // cluster-wide restart, not an exceptional one.
    const { svc, db } = make();
    svc.onApplicationBootstrap();
    await svc.poll(); // establishes the Kafka connection
    producerMock.disconnect.mockRejectedValueOnce(new Error('broker gone'));

    await expect(svc.onModuleDestroy()).resolves.toBeUndefined();

    expect(db.$disconnect).toHaveBeenCalledTimes(1);
  });

  it('is safe to call twice', async () => {
    // Nest can invoke the hook again on a second shutdown signal. The second pass finds no timer to
    // clear, and clearing a null one would throw.
    const { svc, db } = make();
    svc.onApplicationBootstrap();

    await svc.onModuleDestroy();
    await expect(svc.onModuleDestroy()).resolves.toBeUndefined();

    expect(db.$disconnect).toHaveBeenCalledTimes(2);
  });
});
