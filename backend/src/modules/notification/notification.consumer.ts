// NotificationConsumer — Phase 20
// Kafka consumer group: notification-consumer-group
// Subscribes to 8 event topics and routes to NotificationService.

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { KafkaConsumer } from '@cos/shared';
import { createLogger } from '@cos/logger';
import { NotificationService } from './notification.service';
import type { BaseEventEnvelope } from '@cos/types';

const logger = createLogger('notification-consumer');

// Canonical event types (CloudEvents `type`) this service consumes. Subscribed per-tenant
// via RegExp under the `notification.shared` group; tenant_id header validated by KafkaConsumer.
const SUBSCRIBED_EVENT_TYPES = [
  'site.inspection.failed.v1',
  'site.issue.created.v1',
  'site.issue.escalated.v1',
  'site.conflict.flagged.v1',
  'procurement.po.status_changed.v1',
  'procurement.po.approval_requested.v1',
  'finance.variance.alert.v1',
  'site.report.created.v1',
  'procurement.invoice.received.v1',
  'file.document.quarantined.v1',
];

@Injectable()
export class NotificationConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly kafka = new KafkaConsumer();

  constructor(private readonly svc: NotificationService) {}

  async onModuleInit(): Promise<void> {
    // Register handlers for each subscribed event type
    for (const eventType of SUBSCRIBED_EVENT_TYPES) {
      this.kafka.on<Record<string, unknown>>(
        eventType,
        async (event: BaseEventEnvelope<Record<string, unknown>>) => {
          logger.info(
            { event_type: event.event_type, tenant_id: event.tenant_id },
            'event received',
          );
          await this.svc.handleEvent({
            event_type: event.event_type,
            tenant_id: event.tenant_id,
            actor_id: event.actor_id,
            payload: event.payload,
          });
        },
      );
    }

    await this.kafka.connect({
      groupId: 'notification.shared',
      eventTypes: SUBSCRIBED_EVENT_TYPES,
      fromBeginning: false,
    });

    logger.info({ eventTypes: SUBSCRIBED_EVENT_TYPES }, 'NotificationConsumer started');
  }

  async onModuleDestroy(): Promise<void> {
    await this.kafka
      .disconnect()
      .catch((err) => logger.error({ err }, 'NotificationConsumer disconnect error'));
  }
}
