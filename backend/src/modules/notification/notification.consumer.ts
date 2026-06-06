// NotificationConsumer — Phase 20
// Kafka consumer group: notification-consumer-group
// Subscribes to 6 event topics and routes to NotificationService.

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { KafkaConsumer } from '@cos/shared';
import { createLogger } from '@cos/logger';
import { NotificationService } from './notification.service';
import type { BaseEventEnvelope } from '@cos/types';

const logger = createLogger('notification-consumer');

const SUBSCRIBED_TOPICS = [
  'site.inspection.failed',
  'site.issue.created',
  'procurement.purchase_order.status_changed',
  'finance.variance.alert',
  'site.report.created',
  'procurement.vendor_invoice.received',
];

@Injectable()
export class NotificationConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly kafka = new KafkaConsumer();

  constructor(private readonly svc: NotificationService) {}

  async onModuleInit(): Promise<void> {
    // Register handlers for each subscribed event type
    for (const topic of SUBSCRIBED_TOPICS) {
      const eventType = `${topic}.v1`;
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
      groupId: 'notification-consumer-group',
      topics: SUBSCRIBED_TOPICS,
      fromBeginning: false,
    });

    logger.info({ topics: SUBSCRIBED_TOPICS }, 'NotificationConsumer started');
  }

  async onModuleDestroy(): Promise<void> {
    await this.kafka
      .disconnect()
      .catch((err) => logger.error({ err }, 'NotificationConsumer disconnect error'));
  }
}
