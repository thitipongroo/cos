// Leader election for @Cron jobs. What matters is the DECISIONS this service makes, so the Prisma
// client is a fake and the assertions are about who gets to run and what SQL settles it.

jest.mock('@cos/logger', () => {
  const debug = jest.fn();
  const warn = jest.fn();
  const error = jest.fn();
  return {
    createLogger: () => ({ info: jest.fn(), debug, warn, error }),
    __log: { debug, warn, error },
  };
});
const { __log: log } = jest.requireMock('@cos/logger');

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn().mockResolvedValue(1),
    $disconnect: jest.fn().mockResolvedValue(undefined),
  })),
  Prisma: {},
}));

import { ScheduledJobLockService } from '../scheduled-job-lock.service';

type Fake = { $queryRaw: jest.Mock; $executeRaw: jest.Mock; $disconnect: jest.Mock };

function make(): { svc: ScheduledJobLockService; db: Fake } {
  const svc = new ScheduledJobLockService();
  return { svc, db: (svc as unknown as { prisma: Fake }).prisma };
}

/** Flatten a Prisma tagged-template call into inspectable SQL text. */
function sqlOf(mock: jest.Mock, nth = 0): string {
  return ((mock.mock.calls[nth]?.[0] ?? []) as string[]).join(' ? ').replace(/\s+/g, ' ');
}

beforeEach(() => jest.clearAllMocks());

describe('ScheduledJobLockService.runExclusively', () => {
  it('runs the job and reports its result when the lease is acquired', async () => {
    const { svc, db } = make();
    db.$queryRaw.mockResolvedValue([{ job_name: 'job-a' }]);

    await expect(svc.runExclusively('job-a', 60, async () => 'done')).resolves.toBe('done');
  });

  // The whole point: on the two replicas that lose, the job body must not run at all.
  it('does not invoke the job, and returns null, when another replica holds the lease', async () => {
    const { svc, db } = make();
    db.$queryRaw.mockResolvedValue([]); // ON CONFLICT … WHERE locked_until < now() matched nothing
    const fn = jest.fn();

    await expect(svc.runExclusively('job-a', 60, fn)).resolves.toBeNull();
    expect(fn).not.toHaveBeenCalled();
    // Losing is the normal case two times out of three — it must not look like a problem in the logs.
    expect(log.debug).toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('releases the lease after a successful run so the next tick is free', async () => {
    const { svc, db } = make();
    db.$queryRaw.mockResolvedValue([{ job_name: 'job-a' }]);

    await svc.runExclusively('job-a', 60, async () => undefined);

    expect(sqlOf(db.$executeRaw)).toContain('SET locked_until = now()');
  });

  // A failed run must not hold the lease for the rest of its term — the retry IS the next tick, and
  // it should be free to happen on any replica.
  it('releases the lease when the job throws, and propagates the error', async () => {
    const { svc, db } = make();
    db.$queryRaw.mockResolvedValue([{ job_name: 'job-a' }]);

    await expect(
      svc.runExclusively('job-a', 60, async () => {
        throw new Error('sweep failed');
      }),
    ).rejects.toThrow('sweep failed');

    expect(db.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('acquires with ONE statement that only takes over an EXPIRED lease', async () => {
    const { svc, db } = make();
    db.$queryRaw.mockResolvedValue([{ job_name: 'job-a' }]);

    await svc.runExclusively('job-a', 60, async () => undefined);

    const sql = sqlOf(db.$queryRaw);
    // INSERT … ON CONFLICT DO UPDATE, not SELECT-then-UPDATE: the read-then-write version is the race
    // this service exists to remove, and three replicas would all read "expired" and all proceed.
    expect(sql).toContain('INSERT INTO platform.scheduled_job_locks');
    expect(sql).toContain('ON CONFLICT (job_name) DO UPDATE');
    expect(sql).toContain('WHERE platform.scheduled_job_locks.locked_until < now()');
    expect(sql).toContain('RETURNING job_name');
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
  });

  // Releasing must be scoped to the holder: if this replica overran its lease and another took over,
  // clearing the lock would cut the new holder's run short.
  it('only releases a lease it still holds', async () => {
    const { svc, db } = make();
    db.$queryRaw.mockResolvedValue([{ job_name: 'job-a' }]);

    await svc.runExclusively('job-a', 60, async () => undefined);

    expect(sqlOf(db.$executeRaw)).toContain('AND holder = ?');
  });

  // Fail CLOSED. With the lock table unreachable we cannot know whether another replica is already
  // running; duplicate sends are worse than a skipped tick.
  it('skips the job when the lock table is unreachable', async () => {
    const { svc, db } = make();
    db.$queryRaw.mockRejectedValue(new Error('connection refused'));
    const fn = jest.fn();

    await expect(svc.runExclusively('job-a', 60, fn)).resolves.toBeNull();
    expect(fn).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalled();
  });

  // The lease expires on its own, so a failed release costs at most one tick — it must never replace
  // the job's own outcome with a database error.
  it('does not fail the run when the release itself fails', async () => {
    const { svc, db } = make();
    db.$queryRaw.mockResolvedValue([{ job_name: 'job-a' }]);
    db.$executeRaw.mockRejectedValue(new Error('connection lost'));

    await expect(svc.runExclusively('job-a', 60, async () => 'done')).resolves.toBe('done');
    expect(log.warn).toHaveBeenCalled();
  });

  it('disconnects Prisma on shutdown', async () => {
    const { svc, db } = make();
    await svc.onModuleDestroy();
    expect(db.$disconnect).toHaveBeenCalledTimes(1);
  });
});
