// Detects expired permits and raises safety.violation.detected.v1 (§17.2-adjacent; §20.2, TDD OQ-35).
//
// TWO PROBLEMS, ONE SWEEP
// -----------------------
// 1. NOTHING EVER SET A PERMIT TO 'EXPIRED'. The status column allows PENDING | ACTIVE | EXPIRED |
//    REVOKED, and `EXPIRED` appeared only in code that READS it:
//      - safety.repository.ts getComplianceSummary → `expired_permits` count
//      - tasks.repository.ts countBlockingPermits  → task completion gate #4
//    `approvePermit` writes ACTIVE and `rejectPermit` writes REVOKED; no path writes EXPIRED. So a
//    permit whose `valid_until` had passed stayed ACTIVE forever, gate #4 never blocked a task on an
//    expired permit, and `/safety/compliance` reported `expired_permits: 0` regardless. Found
//    2026-08-22 while building the violation producer.
//
// 2. `SafetyViolationDetected` was named in `19-notification-architecture` §19.6 as one of two
//    notifications that "cannot be disabled", and in `16-enterprise-event-flow` §16 under Safety —
//    and existed nowhere else. No producer, no consumer, no entry in §32.4's catalogue. So §19.6's
//    critical set had an unknown size (TDD OQ-35).
//
// Product-owner decision 2026-08-22: build the event, with two producers — this one (permits) and
// the failed-checklist path in SiteOpsService.
//
// WHY THE SWEEP ALSO WRITES THE STATUS
// ------------------------------------
// Emitting "violation: permit expired" while leaving the row ACTIVE would make the event contradict
// the record it describes, and gate #4 would still let the task complete. Detection and transition
// are the same fact, so they happen together, in one statement — the UPDATE's RETURNING is what the
// event is built from, which also makes the emit exactly-once per permit without a second read.

import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createLogger } from '@cos/logger';
import { EventOutboxService } from '../../shared/events/event-outbox.service';
import { ScheduledJobLockService } from '../../shared/scheduling/scheduled-job-lock.service';
import { createPrismaClient } from '../../shared/prisma/create-prisma-client';

const logger = createLogger('permit-expiry');

/** @Cron name and the lease key in platform.scheduled_job_locks — the same string on purpose. */
export const PERMIT_EXPIRY_JOB = 'permit-expiry-sweep';

/**
 * Lease length. Fifty minutes against an hourly schedule, for the same reason the escalation sweep
 * uses four against five: long enough that a sweep is never overtaken mid-run, short enough that a
 * replica killed mid-sweep costs one skipped tick rather than stalling expiry until someone notices.
 */
export const PERMIT_EXPIRY_LEASE_SECONDS = 3000;

interface ExpiredPermitRow {
  permit_id: string;
  tenant_id: string;
  project_id: string;
  permit_type: string;
  permit_number: string;
  valid_until: Date | string | null;
  linked_task_id: string | null;
}

@Injectable()
export class PermitExpiryService {
  // The privileged connection, like every other cross-tenant sweep: this job runs on a schedule with
  // no request and therefore no tenant context, so it cannot go through TenantPrismaService. Tenant
  // scoping comes from the row's own tenant_id, carried into each event.
  private readonly prisma = createPrismaClient();

  constructor(
    private readonly outbox: EventOutboxService,
    private readonly locks: ScheduledJobLockService,
  ) {}

  /**
   * Hourly, not daily: a permit that lapsed at midnight should not authorise work until the next
   * midnight. Hourly bounds the window in which a task can complete against a permit that has
   * actually expired to under an hour, without making the sweep hot.
   */
  @Cron('7 * * * *', { name: PERMIT_EXPIRY_JOB })
  async runExpirySweep(): Promise<void> {
    await this.locks.runExclusively(PERMIT_EXPIRY_JOB, PERMIT_EXPIRY_LEASE_SECONDS, () =>
      this.sweep(),
    );
  }

  async sweep(): Promise<number> {
    // One statement: transition and capture together. A permit can only leave ACTIVE once, so
    // RETURNING gives exactly the set that changed on this tick — no second read, and no way for two
    // ticks to emit the same violation twice.
    //
    // `valid_until < CURRENT_DATE`, not `<=`: valid_until is a DATE and the permit is valid THROUGH
    // that day. Using `<=` would expire a permit on its last valid morning.
    const expired = await this.prisma.$queryRaw<ExpiredPermitRow[]>`
      UPDATE site_ops.permits
      SET status = 'EXPIRED'
      WHERE status = 'ACTIVE'
        AND valid_until IS NOT NULL
        AND valid_until < CURRENT_DATE
      RETURNING permit_id, tenant_id, project_id, permit_type, permit_number,
                valid_until, linked_task_id
    `;

    for (const permit of expired) {
      await this.outbox.publish({
        event_type: 'safety.violation.detected.v1',
        event_version: '1.0',
        tenant_id: permit.tenant_id,
        // No human triggered this — the permit lapsed on a clock. 'system' matches what the
        // enterprise-provisioning workflow uses for the same reason.
        actor_id: 'system',
        occurred_at: new Date().toISOString(),
        correlation_id: `permit-expiry-${permit.permit_id}`,
        payload: {
          violation_type: 'PERMIT_EXPIRED',
          project_id: permit.project_id,
          permit_id: permit.permit_id,
          permit_number: permit.permit_number,
          permit_type: permit.permit_type,
          linked_task_id: permit.linked_task_id,
          detected_by: 'PERMIT_EXPIRY_SWEEP',
          detail: `Permit ${permit.permit_number} (${permit.permit_type}) expired on ${String(permit.valid_until)}`,
        },
      });
    }

    if (expired.length) {
      logger.warn(
        { count: expired.length, permitIds: expired.map((p) => p.permit_id) },
        'permit_expiry.violations_raised',
      );
    }
    return expired.length;
  }
}
