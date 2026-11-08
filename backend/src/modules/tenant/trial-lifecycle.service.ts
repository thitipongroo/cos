// Trial lifecycle — the daily job of spec §7.10 (ADR-109).
//
// Once a day it moves every free trial forward and sends the notice the trial is due:
//
//   TRIAL            → EXPIRED           when trial_ends_at has passed        platform.tenant.trial_expired.v1
//   EXPIRED          → PENDING_DELETION  30 days after trial_ends_at          platform.tenant.deletion_due.v1
//
// and the notices of §7.10 to TENANT_ADMIN + EXECUTIVE (day 0, 7, 21, 28, 30, 53) and to every SYSTEM_ADMIN (day 60).
// Conversion is not here: a SYSTEM_ADMIN does it (TenantService.convertTenant). Deletion is not here either: it is
// manual (docs/runbooks/trial-tenant-deletion.md).
//
// EXACTLY ONE TRANSITION PER STATE CHANGE. Each UPDATE names the status it moves FROM, so a tenant converted by a
// SYSTEM_ADMIN between the read and the write is simply not matched, and the event is written to the outbox in the
// UPDATE's own transaction — no event without the change, no change without the event.
//
// AT MOST ONE OF EACH NOTICE. The notice row in platform.tenant_trial_notices is inserted BEFORE sending, ON CONFLICT
// DO NOTHING, so a rerun or a second replica sends nothing twice. Only the CURRENT stage's notice is sent: a tenant
// first seen on day 25 (the flag was off, the job was down) gets the day-21 notice, not days 0, 7 and 21 at once.
// A notice that reached nobody (the tenant has no TENANT_ADMIN / EXECUTIVE yet) or failed before sending is
// un-recorded so tomorrow's run tries again.
//
// The job is behind s1.tenant.trial-lifecycle (QM-15), evaluated per tenant so it can be rolled out tenant by
// tenant. It runs on one replica at a time (ScheduledJobLockService, ADR-095) at 02:00 UTC — 09:00 in Bangkok, so
// the notices arrive in the working day.

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { OutboxPublisher } from '@cos/kafka';
import { createLogger } from '@cos/logger';
import { createPrismaClient } from '../../shared/prisma/create-prisma-client';
import { buildOutboxEvent } from '../../shared/outbox/outbox.types';
import { FeatureFlagService } from '../../shared/feature-flags/feature-flag.service';
import { ScheduledJobLockService } from '../../shared/scheduling/scheduled-job-lock.service';
import { TRIAL_LIFECYCLE_FLAG } from '../../shared/interceptors/trial-read-only.interceptor';
import { NotificationService } from '../notification/notification.service';
import { TRIAL_NOTICE_EVENT_TYPES, type TrialNotice } from '../notification/public/event-types';
import { READ_ONLY_DAYS, TRIAL_DAYS, type SubscriptionStatus } from './public/plan-limits';
import { PLATFORM_EVENT_TENANT } from './tenant.service';

const logger = createLogger('trial-lifecycle');

/** @Cron name and the lease key in platform.scheduled_job_locks — the same string on purpose. */
export const TRIAL_LIFECYCLE_JOB = 'trial-lifecycle';

/** Fifty minutes against a daily schedule: never overtaken mid-run, and a killed replica costs one day at most. */
export const TRIAL_LIFECYCLE_LEASE_SECONDS = 3000;

/** Re-exported: the read-only month is part of the plan terms, declared beside TRIAL_DAYS. */
export { READ_ONLY_DAYS };

export const TRIAL_EXPIRED_EVENT = 'platform.tenant.trial_expired.v1';
export const DELETION_DUE_EVENT = 'platform.tenant.deletion_due.v1';

/** §7.10: who is told about their own trial. */
export const TRIAL_NOTICE_ROLES = ['TENANT_ADMIN', 'EXECUTIVE'];

/** Notices while the trial runs, by the day of the trial they are due on (§7.10 Notifications). */
const TRIAL_STAGE_NOTICES: ReadonlyArray<[day: number, notice: TrialNotice]> = [
  [28, 'DAY_28'],
  [21, 'DAY_21'],
  [7, 'DAY_7'],
  [0, 'DAY_0'],
];

/** Plan names as the price list prints them. */
const PLAN_NAME: Record<string, string> = {
  LITE: 'Lite',
  STARTER: 'Starter',
  PROFESSIONAL: 'Professional',
  ENTERPRISE: 'Enterprise',
};

interface TrialTenantRow {
  tenant_id: string;
  tenant_code: string;
  tenant_name: string;
  plan_type: string;
  subscription_status: Exclude<SubscriptionStatus, 'ACTIVE'>;
  trial_ends_at: Date;
  timezone: string;
  /** Whole days since trial_started_at, by the database clock. */
  elapsed_days: number;
  ended: boolean;
  deletion_due: boolean;
}

export interface TrialSweepResult {
  expired: number;
  deletionDue: number;
  notices: number;
  failed: number;
}

/**
 * The notice a trial is due today, or null. Only the current stage: earlier notices it missed are not sent late.
 * Exported for the tests — it is the whole of the schedule.
 */
export function dueNotice(
  status: Exclude<SubscriptionStatus, 'ACTIVE'>,
  elapsedDays: number,
): TrialNotice | null {
  if (status === 'PENDING_DELETION') return 'DAY_60_ADMIN';
  if (status === 'EXPIRED') return elapsedDays >= TRIAL_DAYS + 23 ? 'DAY_53' : 'DAY_30';
  return TRIAL_STAGE_NOTICES.find(([day]) => elapsedDays >= day)?.[1] ?? null;
}

/** A date as a Thai reader expects it (Buddhist era) and as an English one does, in the tenant's timezone. */
export function formatNoticeDate(date: Date, timeZone: string): { th: string; en: string } {
  return {
    th: new Intl.DateTimeFormat('th-TH', { dateStyle: 'long', timeZone }).format(date),
    en: new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone }).format(date),
  };
}

@Injectable()
export class TrialLifecycleService implements OnModuleDestroy {
  // The privileged connection, like every cross-tenant sweep: no request, so no tenant context.
  private readonly prisma = createPrismaClient();

  constructor(
    private readonly locks: ScheduledJobLockService,
    private readonly flags: FeatureFlagService,
    private readonly notifications: NotificationService,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }

  @Cron('0 2 * * *', { timeZone: 'UTC', name: TRIAL_LIFECYCLE_JOB })
  async runDaily(): Promise<void> {
    await this.locks.runExclusively(TRIAL_LIFECYCLE_JOB, TRIAL_LIFECYCLE_LEASE_SECONDS, () =>
      this.sweep(),
    );
  }

  async sweep(): Promise<TrialSweepResult> {
    const rows = await this.prisma.$queryRaw<TrialTenantRow[]>`
      SELECT tenant_id, tenant_code, tenant_name, plan_type::text AS plan_type, subscription_status,
             trial_ends_at, timezone,
             floor(extract(epoch FROM now() - trial_started_at) / 86400)::int AS elapsed_days,
             trial_ends_at <= now()                                            AS ended,
             trial_ends_at + make_interval(days => ${READ_ONLY_DAYS}::int) <= now() AS deletion_due
        FROM platform.tenants
       WHERE subscription_status IN ('TRIAL', 'EXPIRED', 'PENDING_DELETION')
         AND is_active = true
       ORDER BY trial_ends_at
    `;

    const result: TrialSweepResult = { expired: 0, deletionDue: 0, notices: 0, failed: 0 };
    for (const row of rows) {
      if (!this.flags.isEnabled(TRIAL_LIFECYCLE_FLAG, { tenantId: row.tenant_id })) continue;
      // One tenant's failure must not hold back every tenant after it; tomorrow's run retries it.
      try {
        await this.advance(row, result);
      } catch (err) {
        result.failed += 1;
        logger.error(
          { tenantId: row.tenant_id, err: err instanceof Error ? err.message : String(err) },
          'trial_lifecycle.tenant_failed',
        );
      }
    }
    logger.info({ candidates: rows.length, ...result }, 'trial_lifecycle.swept');
    return result;
  }

  private async advance(row: TrialTenantRow, result: TrialSweepResult): Promise<void> {
    let status = row.subscription_status;
    if (status === 'TRIAL' && row.ended) {
      if (!(await this.transition(row, 'TRIAL', 'EXPIRED', TRIAL_EXPIRED_EVENT))) return;
      status = 'EXPIRED';
      result.expired += 1;
    }
    if (status === 'EXPIRED' && row.deletion_due) {
      if (!(await this.transition(row, 'EXPIRED', 'PENDING_DELETION', DELETION_DUE_EVENT))) return;
      status = 'PENDING_DELETION';
      result.deletionDue += 1;
    }
    const notice = dueNotice(status, row.elapsed_days);
    if (notice && (await this.sendNotice(row, notice))) result.notices += 1;
  }

  /** Move one tenant FROM → TO with its event, or do nothing if it is no longer in FROM. */
  private async transition(
    row: TrialTenantRow,
    from: SubscriptionStatus,
    to: SubscriptionStatus,
    eventType: string,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const moved = await tx.$executeRaw`
        UPDATE platform.tenants
           SET subscription_status = ${to}, updated_at = now()
         WHERE tenant_id = ${row.tenant_id}::uuid
           AND subscription_status = ${from}
      `;
      if (moved === 0) return false; // converted (or moved) since the read — nothing to announce
      await OutboxPublisher.write(
        tx,
        buildOutboxEvent({
          eventType,
          tenantId: PLATFORM_EVENT_TENANT,
          // No human did this — the trial ran out on a clock.
          actorId: 'system',
          correlationId: randomUUID(),
          payload: {
            tenant_id: row.tenant_id,
            tenant_code: row.tenant_code,
            plan_type: row.plan_type,
            trial_ends_at: row.trial_ends_at.toISOString(),
          },
        }),
      );
      logger.info({ tenantId: row.tenant_id, from, to }, 'trial_lifecycle.transition');
      return true;
    });
  }

  /** Record, then send. Un-record when nobody could be told, so the next run tries again. */
  private async sendNotice(row: TrialTenantRow, notice: TrialNotice): Promise<boolean> {
    const recorded = await this.prisma.$executeRaw`
      INSERT INTO platform.tenant_trial_notices (tenant_id, notice)
      VALUES (${row.tenant_id}::uuid, ${notice})
      ON CONFLICT (tenant_id, notice) DO NOTHING
    `;
    if (recorded === 0) return false; // sent on an earlier run

    const deletionOn = new Date(row.trial_ends_at.getTime() + READ_ONLY_DAYS * 86_400_000);
    const ends = formatNoticeDate(row.trial_ends_at, row.timezone);
    const deletion = formatNoticeDate(deletionOn, row.timezone);
    const payload = {
      tenant_name: row.tenant_name,
      tenant_code: row.tenant_code,
      plan_name: PLAN_NAME[row.plan_type] ?? row.plan_type,
      trial_ends_on_th: ends.th,
      trial_ends_on_en: ends.en,
      deletion_on_th: deletion.th,
      deletion_on_en: deletion.en,
    };
    const eventType = TRIAL_NOTICE_EVENT_TYPES[notice];

    let reached: number;
    try {
      if (notice === 'DAY_60_ADMIN') {
        await this.notifications.notifySystemAdmins(eventType, payload);
        reached = 1; // the SYSTEM_ADMIN audience always exists on an installation
      } else {
        reached = await this.notifications.notifyTenantRoles(
          row.tenant_id,
          TRIAL_NOTICE_ROLES,
          eventType,
          payload,
        );
      }
    } catch (err) {
      await this.unrecord(row.tenant_id, notice);
      throw err;
    }
    if (reached === 0) {
      await this.unrecord(row.tenant_id, notice);
      logger.warn({ tenantId: row.tenant_id, notice }, 'trial_lifecycle.notice_no_recipients');
      return false;
    }
    logger.info(
      { tenantId: row.tenant_id, notice, recipients: reached },
      'trial_lifecycle.notice_sent',
    );
    return true;
  }

  private async unrecord(tenantId: string, notice: TrialNotice): Promise<void> {
    await this.prisma.$executeRaw`
      DELETE FROM platform.tenant_trial_notices
       WHERE tenant_id = ${tenantId}::uuid AND notice = ${notice}
    `;
  }
}
