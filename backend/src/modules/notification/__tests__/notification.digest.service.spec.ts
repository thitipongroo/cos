// Unit tests — Notification Digest Scheduler (Phase 20 §19.3).

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import {
  NotificationDigestService,
  localSlot,
  DIGEST_JOB,
  DIGEST_LEASE_SECONDS,
} from '../notification.digest.service';
import { makeLockDouble } from '../../../shared/scheduling/__tests__/lock-double';

const mockRepo = { listActiveTenants: jest.fn() };
const mockSvc = { deliverDigest: jest.fn() };

// Grants by default — see the note in the escalation spec.
function makeService(lock = makeLockDouble()): NotificationDigestService {
  return new NotificationDigestService(mockRepo as never, mockSvc as never, lock.service);
}

beforeEach(() => jest.resetAllMocks());

describe('localSlot', () => {
  it('computes tenant-local hour + weekday', () => {
    // 2026-01-05 is a Monday. 11:00Z = 18:00 Asia/Bangkok (UTC+7).
    const slot = localSlot(new Date('2026-01-05T11:00:00Z'), 'Asia/Bangkok');
    expect(slot).toEqual({ hour: 18, weekday: 1 });
  });
});

describe('runHourly', () => {
  const bkk = { tenant_id: 'tenant-bkk', timezone: 'Asia/Bangkok' };

  it('sends the daily site digest to PMs at local 18:00', async () => {
    mockRepo.listActiveTenants.mockResolvedValue([bkk]);
    mockSvc.deliverDigest.mockResolvedValue(undefined);
    // 2026-01-06 11:00Z (Tuesday) = 18:00 Bangkok → daily only, no weekly.
    await makeService().runHourly(new Date('2026-01-06T11:00:00Z'));

    expect(mockSvc.deliverDigest).toHaveBeenCalledTimes(1);
    expect(mockSvc.deliverDigest).toHaveBeenCalledWith(
      'tenant-bkk',
      ['PROJECT_MANAGER'],
      'Daily site summary',
      expect.any(String),
    );
  });

  it('sends both weekly digests at Monday 08:00 local', async () => {
    mockRepo.listActiveTenants.mockResolvedValue([bkk]);
    mockSvc.deliverDigest.mockResolvedValue(undefined);
    // 2026-01-05 01:00Z (Monday) = 08:00 Bangkok → weekly cost + procurement, no daily.
    await makeService().runHourly(new Date('2026-01-05T01:00:00Z'));

    const subjects = mockSvc.deliverDigest.mock.calls.map((c) => c[2]);
    expect(subjects).toEqual(['Weekly project cost summary', 'Weekly procurement status']);
  });

  it('sends nothing at an off-slot hour', async () => {
    mockRepo.listActiveTenants.mockResolvedValue([bkk]);
    // 2026-01-06 03:00Z = 10:00 Bangkok → neither slot.
    await makeService().runHourly(new Date('2026-01-06T03:00:00Z'));
    expect(mockSvc.deliverDigest).not.toHaveBeenCalled();
  });

  it('defaults now to the current time when called with no argument', async () => {
    mockRepo.listActiveTenants.mockResolvedValue([]); // no tenants → no delivery regardless of time
    await expect(makeService().runHourly()).resolves.toBeUndefined();
    expect(mockSvc.deliverDigest).not.toHaveBeenCalled();
  });

  it('isolates a failing tenant (logs, continues)', async () => {
    mockRepo.listActiveTenants.mockResolvedValue([bkk]);
    mockSvc.deliverDigest.mockRejectedValue(new Error('smtp down'));
    // 18:00 Bangkok → daily fires and throws; runHourly must not reject.
    await expect(
      makeService().runHourly(new Date('2026-01-06T11:00:00Z')),
    ).resolves.toBeUndefined();
  });
});

// Three replicas, one digest. Nothing downstream deduplicates a digest: deliverDigest sends, and no
// per-period record is kept, so without the lease every project manager got the 18:00 site summary
// three times and the Monday 08:00 weekly three times.
describe('NotificationDigestService — single-replica execution', () => {
  it('sends nothing on a replica that does not hold the lease', async () => {
    const lock = makeLockDouble(false);
    await makeService(lock).runHourly(new Date('2026-01-05T11:00:00Z'));

    expect(mockRepo.listActiveTenants).not.toHaveBeenCalled();
    expect(mockSvc.deliverDigest).not.toHaveBeenCalled();
  });

  it('claims the lease under the job name, with a lease shorter than the hourly schedule', async () => {
    mockRepo.listActiveTenants.mockResolvedValue([]);
    const lock = makeLockDouble();
    await makeService(lock).runHourly(new Date('2026-01-05T11:00:00Z'));

    expect(lock.calls).toEqual([{ jobName: DIGEST_JOB, leaseSeconds: DIGEST_LEASE_SECONDS }]);
    expect(DIGEST_LEASE_SECONDS).toBeLessThan(60 * 60);
  });
});
