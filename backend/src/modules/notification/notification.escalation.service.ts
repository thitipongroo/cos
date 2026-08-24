// Notification Escalation Sweep — Phase 20 §19.3.
// An immediate notification that stays unacknowledged (read_at IS NULL) past its timeout is escalated
// to a higher role, exactly once (escalated_at marker). Runs every 5 minutes as a cross-tenant system
// job on the shared DB (covers SMB/mid-market; enterprise dedicated-DB sweeps are a Stage-2 follow-up).

import { Injectable } from '@nestjs/common';
import { ScheduledJobLockService } from '../../shared/scheduling/scheduled-job-lock.service';
import { Cron } from '@nestjs/schedule';
import { createLogger } from '@cos/logger';
import { NotificationRepository, type EscalationCandidate } from './notification.repository';
import { NotificationService } from './notification.service';

const logger = createLogger('notification-escalation');

interface EscalationRule {
  eventType: string;
  timeoutSeconds: number;
  escalateToRoles: string[];
  label: string;
}

// §19.3 escalation matrix — timeouts + targets are exact spec values.
export const ESCALATION_RULES: readonly EscalationRule[] = [
  {
    eventType: 'safety.incident.created.v1',
    timeoutSeconds: 30 * 60, // 30 minutes
    escalateToRoles: ['PROJECT_MANAGER'],
    label: 'Safety incident',
  },
  {
    eventType: 'finance.variance.alert.v1',
    timeoutSeconds: 2 * 60 * 60, // 2 hours
    escalateToRoles: ['EXECUTIVE'],
    label: 'Budget alert',
  },
  {
    eventType: 'ai.risk_prediction.generated.v1',
    timeoutSeconds: 24 * 60 * 60, // 24 hours
    escalateToRoles: ['PROJECT_MANAGER'],
    label: 'AI risk prediction',
  },
];

/** @Cron name and the lease key in platform.scheduled_job_locks — the same string on purpose. */
export const ESCALATION_JOB = 'notification-escalation';

/**
 * Lease length. Four minutes against a five-minute schedule: long enough that a sweep is never
 * overtaken while it is still sending, short enough that a replica killed mid-sweep costs at most one
 * skipped tick rather than blocking escalations until someone notices.
 */
export const ESCALATION_LEASE_SECONDS = 240;

@Injectable()
export class NotificationEscalationService {
  constructor(
    private readonly repo: NotificationRepository,
    private readonly svc: NotificationService,
    private readonly locks: ScheduledJobLockService,
  ) {}

  /**
   * ONE replica sweeps, not all three.
   *
   * @nestjs/schedule registers this timer in every process, and prod runs three replicas
   * (values-prod.yaml), so this fired three times every five minutes. The sweep is not idempotent
   * across processes: `escalated_at` is written only AFTER svc.escalate() has already sent, so all
   * three replicas read the same unescalated rows and all three sent. Every unacknowledged incident
   * escalated in triplicate — to the site manager's phone.
   *
   * The lease makes the winner the only sweeper; see ScheduledJobLockService.
   */
  @Cron('*/5 * * * *', { name: ESCALATION_JOB })
  async runEscalationSweep(): Promise<void> {
    await this.locks.runExclusively(ESCALATION_JOB, ESCALATION_LEASE_SECONDS, () => this.sweep());
  }

  /** The sweep itself. Split from the @Cron entry point so the scheduling decision and the work are
   *  separately readable — and separately testable. */
  async sweep(): Promise<void> {
    for (const rule of ESCALATION_RULES) {
      const candidates = await this.repo.findEscalationCandidates(
        rule.eventType,
        rule.timeoutSeconds,
      );
      for (const candidate of candidates) {
        await this.escalateOne(candidate, rule);
      }
    }
  }

  private async escalateOne(candidate: EscalationCandidate, rule: EscalationRule): Promise<void> {
    const subject = `Escalation: ${rule.label} unacknowledged`;
    const body =
      `${rule.label} has not been acknowledged within the required window and is being escalated. ` +
      `Original: ${candidate.subject ?? candidate.body}`;
    try {
      await this.svc.escalate(candidate.tenant_id, rule.escalateToRoles, subject, body);
      await this.repo.markEscalated(candidate.notification_id);
      logger.info(
        { notification_id: candidate.notification_id, event_type: rule.eventType },
        'notification.escalated',
      );
    } catch (err) {
      /* istanbul ignore next -- String(err) fallback is defensive */
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn(
        { notification_id: candidate.notification_id, error: errMsg },
        'notification.escalation.failed',
      );
    }
  }
}
