// TrialLifecycleService — the daily job of §7.10 (ADR-109): transitions, their events, and the notices.

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
    $disconnect: jest.fn(),
  })),
}));

jest.mock('@cos/kafka', () => ({
  OutboxPublisher: { write: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('@temporalio/client', () => ({
  Connection: { connect: jest.fn() },
  Client: jest.fn(),
  WorkflowNotFoundError: class extends Error {},
}));

import { readFileSync } from 'fs';
import type { PrismaClient } from '@prisma/client';
import { OutboxPublisher } from '@cos/kafka';
import {
  DELETION_DUE_EVENT,
  dueNotice,
  formatNoticeDate,
  TRIAL_EXPIRED_EVENT,
  TRIAL_LIFECYCLE_JOB,
  TRIAL_LIFECYCLE_LEASE_SECONDS,
  TRIAL_NOTICE_ROLES,
  TrialLifecycleService,
} from '../trial-lifecycle.service';
import { TRIAL_NOTICE_EVENT_TYPES } from '../../notification/public/event-types';

type Mocked = jest.Mocked<PrismaClient>;

const TENANT = '11111111-1111-4111-8111-111111111111';
const ENDS = new Date('2026-12-01T00:00:00Z');

const sqlOf = (call: unknown[]): string => (call[0] as TemplateStringsArray).join('?');

function row(overrides: Record<string, unknown> = {}) {
  return {
    tenant_id: TENANT,
    tenant_code: 'somchai_build',
    tenant_name: 'Somchai Build',
    plan_type: 'STARTER',
    subscription_status: 'TRIAL',
    trial_ends_at: ENDS,
    timezone: 'Asia/Bangkok',
    elapsed_days: 0,
    ended: false,
    deletion_due: false,
    ...overrides,
  };
}

describe('dueNotice — the §7.10 schedule', () => {
  it.each([
    ['TRIAL', 0, 'DAY_0'],
    ['TRIAL', 6, 'DAY_0'],
    ['TRIAL', 7, 'DAY_7'],
    ['TRIAL', 20, 'DAY_7'],
    ['TRIAL', 21, 'DAY_21'],
    ['TRIAL', 27, 'DAY_21'],
    ['TRIAL', 28, 'DAY_28'],
    ['TRIAL', 29, 'DAY_28'],
    ['EXPIRED', 30, 'DAY_30'],
    ['EXPIRED', 52, 'DAY_30'],
    ['EXPIRED', 53, 'DAY_53'],
    ['PENDING_DELETION', 60, 'DAY_60_ADMIN'],
  ] as const)('%s on day %i → %s', (status, day, notice) => {
    expect(dueNotice(status, day)).toBe(notice);
  });

  it('is null before day 0 (a clock skew of a few seconds)', () => {
    expect(dueNotice('TRIAL', -1)).toBeNull();
  });
});

describe('formatNoticeDate', () => {
  it('prints the Buddhist-era Thai date and the English date in the tenant zone', () => {
    // 2026-11-30T20:00Z is already 1 December in Bangkok (UTC+7).
    const { th, en } = formatNoticeDate(new Date('2026-11-30T20:00:00Z'), 'Asia/Bangkok');
    expect(th).toBe('1 ธันวาคม 2569');
    expect(en).toBe('1 December 2026');
  });
});

describe('TrialLifecycleService', () => {
  let service: TrialLifecycleService;
  let prisma: Mocked;
  let flags: { isEnabled: jest.Mock };
  let notifications: { notifyTenantRoles: jest.Mock; notifySystemAdmins: jest.Mock };
  let locks: { runExclusively: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    flags = { isEnabled: jest.fn().mockReturnValue(true) };
    notifications = {
      notifyTenantRoles: jest.fn().mockResolvedValue(2),
      notifySystemAdmins: jest.fn().mockResolvedValue(undefined),
    };
    locks = { runExclusively: jest.fn((_n: string, _s: number, fn: () => unknown) => fn()) };
    service = new TrialLifecycleService(locks as never, flags as never, notifications as never);
    prisma = (service as unknown as { prisma: Mocked }).prisma;
    (prisma.$transaction as jest.Mock).mockImplementation((fn: (tx: Mocked) => unknown) =>
      fn(prisma),
    );
    // Default: every UPDATE moves one row, every notice INSERT is new, every DELETE removes one.
    (prisma.$executeRaw as jest.Mock).mockResolvedValue(1);
  });

  const statements = () => (prisma.$executeRaw as jest.Mock).mock.calls.map(sqlOf);

  it('disconnects its client on shutdown (Rule 39)', async () => {
    await service.onModuleDestroy();
    expect(prisma.$disconnect).toHaveBeenCalledTimes(1);
  });

  it('runs the sweep on one replica under the job lease', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
    await service.runDaily();
    expect(locks.runExclusively).toHaveBeenCalledWith(
      TRIAL_LIFECYCLE_JOB,
      TRIAL_LIFECYCLE_LEASE_SECONDS,
      expect.any(Function),
    );
  });

  it('reads only active, non-ACTIVE tenants, with elapsed days from the database clock', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
    await expect(service.sweep()).resolves.toEqual({
      expired: 0,
      deletionDue: 0,
      notices: 0,
      failed: 0,
    });
    const sql = sqlOf((prisma.$queryRaw as jest.Mock).mock.calls[0]!);
    expect(sql).toContain("subscription_status IN ('TRIAL', 'EXPIRED', 'PENDING_DELETION')");
    expect(sql).toContain('is_active = true');
    expect(sql).toContain('now() - trial_started_at');
  });

  it('skips a tenant the flag is off for — no status change, no notice', async () => {
    flags.isEnabled.mockReturnValue(false);
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([row({ ended: true, elapsed_days: 30 })]);
    await service.sweep();
    expect(flags.isEnabled).toHaveBeenCalledWith('s1.tenant.trial-lifecycle', { tenantId: TENANT });
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(notifications.notifyTenantRoles).not.toHaveBeenCalled();
  });

  it('sends the day-0 welcome to TENANT_ADMIN + EXECUTIVE with formatted dates', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([row()]);
    await expect(service.sweep()).resolves.toMatchObject({ notices: 1 });

    expect(statements()[0]).toContain('INSERT INTO platform.tenant_trial_notices');
    expect((prisma.$executeRaw as jest.Mock).mock.calls[0]!.slice(1)).toEqual([TENANT, 'DAY_0']);
    expect(notifications.notifyTenantRoles).toHaveBeenCalledWith(
      TENANT,
      TRIAL_NOTICE_ROLES,
      TRIAL_NOTICE_EVENT_TYPES.DAY_0,
      {
        tenant_name: 'Somchai Build',
        tenant_code: 'somchai_build',
        plan_name: 'Starter',
        trial_ends_on_th: '1 ธันวาคม 2569',
        trial_ends_on_en: '1 December 2026',
        deletion_on_th: '31 ธันวาคม 2569',
        deletion_on_en: '31 December 2026',
      },
    );
    expect(TRIAL_NOTICE_ROLES).toEqual(['TENANT_ADMIN', 'EXECUTIVE']);
  });

  it('falls back to the raw plan code for a plan with no display name', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([row({ plan_type: 'FUTURE' })]);
    await service.sweep();
    expect(notifications.notifyTenantRoles.mock.calls[0]![3]).toMatchObject({
      plan_name: 'FUTURE',
    });
  });

  it('sends nothing when the notice was already recorded (rerun, second replica)', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([row({ elapsed_days: 7 })]);
    (prisma.$executeRaw as jest.Mock).mockResolvedValueOnce(0);
    await expect(service.sweep()).resolves.toMatchObject({ notices: 0 });
    expect(notifications.notifyTenantRoles).not.toHaveBeenCalled();
  });

  it('un-records a notice that reached nobody, so tomorrow retries it', async () => {
    notifications.notifyTenantRoles.mockResolvedValue(0);
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([row()]);
    await expect(service.sweep()).resolves.toMatchObject({ notices: 0, failed: 0 });
    expect(statements()[1]).toContain('DELETE FROM platform.tenant_trial_notices');
    expect((prisma.$executeRaw as jest.Mock).mock.calls[1]!.slice(1)).toEqual([TENANT, 'DAY_0']);
  });

  it('un-records a notice whose send threw, and counts the tenant failed without stopping', async () => {
    notifications.notifyTenantRoles
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce(1);
    const other = '22222222-2222-4222-8222-222222222222';
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([row(), row({ tenant_id: other })]);
    await expect(service.sweep()).resolves.toMatchObject({ notices: 1, failed: 1 });
    expect(statements()[1]).toContain('DELETE FROM platform.tenant_trial_notices');
  });

  it('logs a non-Error rejection too', async () => {
    notifications.notifyTenantRoles.mockRejectedValueOnce('boom');
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([row()]);
    await expect(service.sweep()).resolves.toMatchObject({ failed: 1 });
  });

  it('expires an ended trial with its event in the same transaction, then sends day 30', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([row({ ended: true, elapsed_days: 30 })]);
    await expect(service.sweep()).resolves.toMatchObject({ expired: 1, notices: 1 });

    const update = (prisma.$executeRaw as jest.Mock).mock.calls[0]!;
    expect(sqlOf(update)).toContain('SET subscription_status = ?');
    expect(sqlOf(update)).toContain('AND subscription_status = ?');
    expect(update.slice(1)).toEqual(['EXPIRED', TENANT, 'TRIAL']);
    expect(OutboxPublisher.write).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        event_type: TRIAL_EXPIRED_EVENT,
        tenant_id: 'platform',
        actor_id: 'system',
        payload: {
          tenant_id: TENANT,
          tenant_code: 'somchai_build',
          plan_type: 'STARTER',
          trial_ends_at: ENDS.toISOString(),
        },
      }),
    );
    expect(notifications.notifyTenantRoles.mock.calls[0]![2]).toBe(TRIAL_NOTICE_EVENT_TYPES.DAY_30);
  });

  it('moves EXPIRED to PENDING_DELETION and tells every SYSTEM_ADMIN', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([
      row({ subscription_status: 'EXPIRED', ended: true, deletion_due: true, elapsed_days: 60 }),
    ]);
    await expect(service.sweep()).resolves.toMatchObject({ deletionDue: 1, notices: 1 });
    expect((prisma.$executeRaw as jest.Mock).mock.calls[0]!.slice(1)).toEqual([
      'PENDING_DELETION',
      TENANT,
      'EXPIRED',
    ]);
    expect(OutboxPublisher.write).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ event_type: DELETION_DUE_EVENT }),
    );
    expect(notifications.notifySystemAdmins).toHaveBeenCalledWith(
      TRIAL_NOTICE_EVENT_TYPES.DAY_60_ADMIN,
      expect.objectContaining({ tenant_code: 'somchai_build' }),
    );
    expect(notifications.notifyTenantRoles).not.toHaveBeenCalled();
  });

  it('takes both steps in one run for a trial the job never saw while it was off', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([
      row({ ended: true, deletion_due: true, elapsed_days: 75 }),
    ]);
    await expect(service.sweep()).resolves.toMatchObject({ expired: 1, deletionDue: 1 });
    expect(OutboxPublisher.write).toHaveBeenCalledTimes(2);
  });

  it('announces nothing and sends nothing when a SYSTEM_ADMIN converted it meanwhile', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([row({ ended: true, elapsed_days: 30 })]);
    (prisma.$executeRaw as jest.Mock).mockResolvedValueOnce(0); // the UPDATE matched nothing
    await expect(service.sweep()).resolves.toMatchObject({ expired: 0, notices: 0 });
    expect(OutboxPublisher.write).not.toHaveBeenCalled();
    expect(notifications.notifyTenantRoles).not.toHaveBeenCalled();
  });

  it('stops at EXPIRED when the second transition finds the row moved', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([
      row({ ended: true, deletion_due: true, elapsed_days: 60 }),
    ]);
    (prisma.$executeRaw as jest.Mock).mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    await expect(service.sweep()).resolves.toMatchObject({
      expired: 1,
      deletionDue: 0,
      notices: 0,
    });
  });
});

describe('job events match their committed .avsc payloads', () => {
  it.each([TRIAL_EXPIRED_EVENT, DELETION_DUE_EVENT])('%s', (eventType) => {
    const schema = JSON.parse(
      readFileSync(
        `${__dirname}/../../../../../packages/@cos/kafka/src/avro/${eventType}.avsc`,
        'utf8',
      ),
    ) as { fields: Array<{ name: string; type: { fields?: Array<{ name: string }> } }> };
    const fields = schema.fields.find((f) => f.name === 'payload')!.type.fields!.map((f) => f.name);
    expect(fields.sort()).toEqual(['plan_type', 'tenant_code', 'tenant_id', 'trial_ends_at']);
  });
});
