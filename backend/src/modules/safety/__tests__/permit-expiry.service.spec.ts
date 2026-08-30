// Tests for PermitExpiryService (TDD OQ-35, and the permit-status defect it uncovered).
//
// Two things were wrong before this service existed:
//
// 1. NOTHING EVER SET A PERMIT TO 'EXPIRED'. `approvePermit` writes ACTIVE, `rejectPermit` writes
//    REVOKED, and no path wrote EXPIRED — while two places READ it: `/safety/compliance`'s
//    `expired_permits` count and task completion gate #4 (`countBlockingPermits`). A permit past its
//    `valid_until` stayed ACTIVE forever, so the count was always 0 and the gate never blocked.
//
// 2. `safety.compliance.failed.v1` had no producer at all (OQ-35).
//
// The sweep fixes both in one statement, which is the property the first test pins: the transition
// and the event describe the same rows, so an event can never claim an expiry the table does not
// show.

import { PermitExpiryService, PERMIT_EXPIRY_JOB } from '../permit-expiry.service';

const mockQueryRaw = jest.fn();
jest.mock('../../../shared/prisma/create-prisma-client', () => ({
  createPrismaClient: () => ({ $queryRaw: (...a: unknown[]) => mockQueryRaw(...a) }),
}));

describe('PermitExpiryService', () => {
  const outbox = { publish: jest.fn().mockResolvedValue('evt-1') };
  const locks = {
    // Run the callback directly: leader election is ScheduledJobLockService's own tested concern.
    runExclusively: jest.fn(async (_job: string, _ttl: number, fn: () => Promise<unknown>) => fn()),
  };
  let svc: PermitExpiryService;

  const permit = {
    permit_id: 'p-1',
    tenant_id: 't-1',
    project_id: 'proj-1',
    permit_type: 'WORK_PERMIT',
    permit_number: 'WP-0001',
    valid_until: '2026-08-20',
    linked_task_id: 'task-1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    svc = new PermitExpiryService(outbox as never, locks as never);
  });

  it('transitions ACTIVE → EXPIRED and emits from the SAME statement', async () => {
    mockQueryRaw.mockResolvedValue([permit]);

    const count = await svc.sweep();

    expect(count).toBe(1);
    // One statement: an UPDATE ... RETURNING, not a SELECT then an UPDATE. Two statements could
    // emit for a row another replica had already transitioned.
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    const sql = (mockQueryRaw.mock.calls[0]![0] as string[]).join('?');
    expect(sql).toContain('UPDATE site_ops.permits');
    expect(sql).toContain("SET status = 'EXPIRED'");
    expect(sql).toContain("WHERE status = 'ACTIVE'");
    expect(sql).toContain('RETURNING');
  });

  it('expires on valid_until < CURRENT_DATE, never <=', async () => {
    // valid_until is a DATE and the permit is valid THROUGH that day. `<=` would expire a permit on
    // the morning of its last valid day and block work that is properly authorised.
    mockQueryRaw.mockResolvedValue([]);
    await svc.sweep();

    const sql = (mockQueryRaw.mock.calls[0]![0] as string[]).join('?');
    expect(sql).toContain('valid_until < CURRENT_DATE');
    expect(sql).not.toContain('valid_until <= CURRENT_DATE');
  });

  it('emits safety.compliance.failed.v1 with failure_type PERMIT_EXPIRED', async () => {
    mockQueryRaw.mockResolvedValue([permit]);

    await svc.sweep();

    expect(outbox.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'safety.compliance.failed.v1',
        tenant_id: 't-1',
        // No human triggered a lapse on a clock.
        actor_id: 'system',
        payload: expect.objectContaining({
          failure_type: 'PERMIT_EXPIRED',
          project_id: 'proj-1',
          permit_id: 'p-1',
          permit_number: 'WP-0001',
          linked_task_id: 'task-1',
          detected_by: 'PERMIT_EXPIRY_SWEEP',
        }),
      }),
    );
  });

  it('emits once per permit, for every permit in the batch', async () => {
    mockQueryRaw.mockResolvedValue([
      permit,
      { ...permit, permit_id: 'p-2', permit_number: 'WP-2' },
    ]);

    const count = await svc.sweep();

    expect(count).toBe(2);
    expect(outbox.publish).toHaveBeenCalledTimes(2);
  });

  it('emits nothing when no permit lapsed', async () => {
    mockQueryRaw.mockResolvedValue([]);

    expect(await svc.sweep()).toBe(0);
    expect(outbox.publish).not.toHaveBeenCalled();
  });

  it('takes the job lease so only one replica sweeps', async () => {
    // Without it, `replicaCount: 3` means three replicas each UPDATE-RETURNING the same rows. The
    // UPDATE's `status = 'ACTIVE'` predicate makes only one win, but taking the lease keeps the
    // other two off the table entirely — the same reasoning as the notification sweeps (ADR-095).
    mockQueryRaw.mockResolvedValue([]);
    await svc.runExpirySweep();

    expect(locks.runExclusively).toHaveBeenCalledWith(
      PERMIT_EXPIRY_JOB,
      expect.any(Number),
      expect.any(Function),
    );
  });
});
