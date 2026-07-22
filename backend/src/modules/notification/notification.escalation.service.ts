// Notification Escalation Sweep — Phase 20 §19.3.
// An immediate notification that stays unacknowledged (read_at IS NULL) past its timeout is escalated
// to a higher role, exactly once (escalated_at marker). Runs every 5 minutes as a cross-tenant system
// job on the shared DB (covers SMB/mid-market; enterprise dedicated-DB sweeps are a Stage-2 follow-up).

import { Injectable } from '@nestjs/common';
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

@Injectable()
export class NotificationEscalationService {
  constructor(
    private readonly repo: NotificationRepository,
    private readonly svc: NotificationService,
  ) {}

  @Cron('*/5 * * * *', { name: 'notification-escalation' })
  async runEscalationSweep(): Promise<void> {
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
