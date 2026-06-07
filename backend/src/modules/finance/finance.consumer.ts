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

const logger = createLogger('finance-consumer');

const SUBSCRIBED_TOPICS = [
  'procurement.po.created',
  'procurement.invoice.received',
  'procurement.po.status_changed',
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

    await this.kafka.connect({
      groupId: 'finance-consumer-group',
      topics: SUBSCRIBED_TOPICS,
      fromBeginning: false,
    });

    logger.info({ topics: SUBSCRIBED_TOPICS }, 'FinanceConsumer started');
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
