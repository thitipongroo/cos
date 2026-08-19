// Notification Digest Scheduler — Phase 20 §19.3.
// Scheduled summary reports delivered via email (PO decision 2026-07-23):
//   - Daily site summary          — 18:00 tenant-local, to Project Managers
//   - Weekly project cost summary — Monday 08:00 tenant-local, to Finance + Project Managers
//   - Weekly procurement status   — Monday 08:00 tenant-local, to Procurement Officers
//
// A single hourly cron fans out per tenant and fires only those tenants whose LOCAL wall-clock now
// matches a digest slot (tenants span timezones, so one fixed UTC time cannot serve them all).
//
// The rich narrative body is produced by the Phase 12 AI report service (site-summary) + Phase 14
// analytics once the LLM provider is live; until then the digest links recipients to the dashboard.
// The scheduling, per-tenant timezone gating, and email delivery below are fully live.

import { Injectable } from '@nestjs/common';
import { ScheduledJobLockService } from '../../shared/scheduling/scheduled-job-lock.service';
import { Cron } from '@nestjs/schedule';
import { createLogger } from '@cos/logger';
import { NotificationRepository } from './notification.repository';
import { NotificationService } from './notification.service';

const logger = createLogger('notification-digest');

/** Local wall-clock (hour 0–23, weekday 0=Sun..6=Sat) for `now` in an IANA zone. */
export function localSlot(now: Date, tz: string): { hour: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(now);
  /* istanbul ignore next -- Intl always yields hour+weekday for these options; fallbacks are defensive */
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  /* istanbul ignore next -- defensive */
  const wdName = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wdName);
  return { hour, weekday };
}

/** @Cron name and the lease key in platform.scheduled_job_locks — the same string on purpose. */
export const DIGEST_JOB = 'notification-digest';

/**
 * Lease length. Thirty minutes against an hourly schedule: the run walks every active tenant and
 * sends per-role, so it is the longest of the scheduled jobs, and half the interval still leaves the
 * next hour free to proceed if the holder is killed mid-run.
 */
export const DIGEST_LEASE_SECONDS = 1800;

@Injectable()
export class NotificationDigestService {
  constructor(
    private readonly repo: NotificationRepository,
    private readonly svc: NotificationService,
    private readonly locks: ScheduledJobLockService,
  ) {}

  /**
   * ONE replica sends the digest, not all three.
   *
   * @nestjs/schedule registers this timer per process and prod runs three replicas
   * (values-prod.yaml), so at 18:00 tenant-local every project manager received the daily site
   * summary three times, and the Monday-morning weekly three times again. Nothing downstream
   * deduplicates: deliverDigest sends, and there is no per-period record to check against.
   */
  @Cron('0 * * * *', { name: DIGEST_JOB })
  async runHourly(now: Date = new Date()): Promise<void> {
    await this.locks.runExclusively(DIGEST_JOB, DIGEST_LEASE_SECONDS, () => this.sendDue(now));
  }

  /** The hour's actual work. Split from the @Cron entry point so tests can drive a specific `now`
   *  without also asserting on the lease. */
  async sendDue(now: Date): Promise<void> {
    const tenants = await this.repo.listActiveTenants();
    for (const tenant of tenants) {
      const { hour, weekday } = localSlot(now, tenant.timezone);
      try {
        if (hour === 18) await this.sendDailySite(tenant.tenant_id);
        if (weekday === 1 && hour === 8) await this.sendWeekly(tenant.tenant_id);
      } catch (err) {
        /* istanbul ignore next -- String(err) fallback is defensive */
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.warn({ tenant_id: tenant.tenant_id, error: errMsg }, 'notification.digest.failed');
      }
    }
  }

  private async sendDailySite(tenantId: string): Promise<void> {
    await this.svc.deliverDigest(
      tenantId,
      ['PROJECT_MANAGER'],
      'Daily site summary',
      'Your daily site summary is ready. Open the dashboard for the full report.',
    );
    logger.info({ tenant_id: tenantId, digest: 'daily-site' }, 'notification.digest.sent');
  }

  private async sendWeekly(tenantId: string): Promise<void> {
    await this.svc.deliverDigest(
      tenantId,
      ['FINANCE', 'PROJECT_MANAGER'],
      'Weekly project cost summary',
      'Your weekly project cost summary is ready. Open the dashboard for the full report.',
    );
    await this.svc.deliverDigest(
      tenantId,
      ['PROCUREMENT_OFFICER'],
      'Weekly procurement status',
      'Your weekly procurement status summary is ready. Open the dashboard for the full report.',
    );
    logger.info({ tenant_id: tenantId, digest: 'weekly' }, 'notification.digest.sent');
  }
}
