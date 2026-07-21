// FinanceConsumer — Phase 7
// Kafka consumer group: finance-consumer-group.
// FinanceService is REQUEST-scoped; use ModuleRef + ContextIdFactory to resolve it
// with a synthetic request context carrying the tenant_id from each event envelope.

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ModuleRef, ContextIdFactory } from '@nestjs/core';
import { KafkaConsumer } from '@cos/shared';
import { createLogger } from '@cos/logger';
import type { BaseEventEnvelope } from '@cos/types';
import { FinanceService } from './finance.service';
import type { BoqSnapshotItem } from './finance.repository';

const logger = createLogger('finance-consumer');

// Canonical event types (CloudEvents `type`) consumed by Finance. Subscribed per-tenant
// via RegExp under the `finance.shared` group; tenant_id header validated by KafkaConsumer.
const SUBSCRIBED_EVENT_TYPES = [
  'procurement.po.created.v1',
  'procurement.invoice.received.v1',
  'procurement.po.status_changed.v1',
  'construction.boq.items_published.v1',
];

@Injectable()
export class FinanceConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly kafka = new KafkaConsumer();

  constructor(private readonly moduleRef: ModuleRef) {}

  async onModuleInit(): Promise<void> {
    this.kafka.on<Record<string, unknown>>(
      'procurement.po.created.v1',
      async (event: BaseEventEnvelope<Record<string, unknown>>) => {
        logger.info({ event_type: event.event_type, tenant_id: event.tenant_id }, 'event received');
        const svc = await this.resolveSvc(event.tenant_id);
        await svc.handlePoCreated({
          po_id: event.payload['po_id'] as string,
          project_id: event.payload['project_id'] as string,
          tenant_id: event.tenant_id,
          total_amount: event.payload['total_amount'] as { amount: string; currency_code: string },
        });
      },
    );

    this.kafka.on<Record<string, unknown>>(
      'procurement.invoice.received.v1',
      async (event: BaseEventEnvelope<Record<string, unknown>>) => {
        logger.info({ event_type: event.event_type, tenant_id: event.tenant_id }, 'event received');
        const svc = await this.resolveSvc(event.tenant_id);
        await svc.handleInvoiceReceived({
          po_id: event.payload['po_id'] as string,
          invoice_id: event.payload['invoice_id'] as string,
          project_id: event.payload['project_id'] as string,
          tenant_id: event.tenant_id,
          amount: event.payload['amount'] as { amount: string; currency_code: string },
        });
      },
    );

    this.kafka.on<Record<string, unknown>>(
      'procurement.po.status_changed.v1',
      async (event: BaseEventEnvelope<Record<string, unknown>>) => {
        logger.info({ event_type: event.event_type, tenant_id: event.tenant_id }, 'event received');
        const svc = await this.resolveSvc(event.tenant_id);
        await svc.handlePoStatusChanged({
          po_id: event.payload['po_id'] as string,
          project_id: event.payload['project_id'] as string,
          tenant_id: event.tenant_id,
          from_status: event.payload['from_status'] as string,
          to_status: event.payload['to_status'] as string,
        });
      },
    );

    this.kafka.on<Record<string, unknown>>(
      'construction.boq.items_published.v1',
      async (event: BaseEventEnvelope<Record<string, unknown>>) => {
        logger.info({ event_type: event.event_type, tenant_id: event.tenant_id }, 'event received');
        const svc = await this.resolveSvc(event.tenant_id);
        await svc.handleBoqItemsPublished({
          version_id: event.payload['version_id'] as string,
          project_id: event.payload['project_id'] as string,
          tenant_id: event.tenant_id,
          items: event.payload['items'] as BoqSnapshotItem[],
        });
      },
    );

    await this.kafka.connect({
      groupId: 'finance.shared',
      eventTypes: SUBSCRIBED_EVENT_TYPES,
      fromBeginning: false,
    });

    logger.info({ eventTypes: SUBSCRIBED_EVENT_TYPES }, 'FinanceConsumer started');
  }

  async onModuleDestroy(): Promise<void> {
    await this.kafka
      .disconnect()
      .catch((err: unknown) => logger.error({ err }, 'FinanceConsumer disconnect error'));
  }

  /** Resolve a per-event FinanceService instance with the event's tenant context. */
  private async resolveSvc(tenantId: string): Promise<FinanceService> {
    const contextId = ContextIdFactory.create();
    // Synthetic request: supplies tenantId for TenantPrismaService / FinanceRepository / FinanceService.
    this.moduleRef.registerRequestByContextId({ tenantId } as never, contextId);
    return this.moduleRef.resolve(FinanceService, contextId, { strict: false });
  }
}
