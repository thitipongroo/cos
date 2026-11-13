// FinanceConsumer — Phase 7
// Kafka consumer group: finance-consumer-group.
// FinanceService is REQUEST-scoped; use ModuleRef + ContextIdFactory to resolve it
// with a synthetic request context carrying the tenant_id from each event envelope.

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ModuleRef, ContextIdFactory } from '@nestjs/core';
import { KafkaConsumer } from '@cos/kafka';
import { createLogger } from '@cos/logger';
import type { BaseEventEnvelope } from '@cos/types';
import { runInTenantContext } from '../../shared/context/run-in-tenant-context';
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
        await this.withTenantContext(event, async (svc) => {
          await svc.handlePoCreated({
            po_id: event.payload['po_id'] as string,
            project_id: event.payload['project_id'] as string,
            tenant_id: event.tenant_id,
            total_amount: event.payload['total_amount'] as {
              amount: string;
              currency_code: string;
            },
            // Carried since 2026-08-23 so the cost transaction can be attributed to a budget line
            // (TDD OQ-50). Optional in the schema, so an event minted before that decodes as
            // undefined and the transaction is left unattributed, exactly as it was before.
            line_items: event.payload['line_items'] as
              Array<{ boq_item_id?: string | null }> | undefined,
          });
        });
      },
    );

    this.kafka.on<Record<string, unknown>>(
      'procurement.invoice.received.v1',
      async (event: BaseEventEnvelope<Record<string, unknown>>) => {
        logger.info({ event_type: event.event_type, tenant_id: event.tenant_id }, 'event received');
        await this.withTenantContext(event, async (svc) => {
          await svc.handleInvoiceReceived({
            po_id: event.payload['po_id'] as string,
            invoice_id: event.payload['invoice_id'] as string,
            project_id: event.payload['project_id'] as string,
            tenant_id: event.tenant_id,
            amount: event.payload['amount'] as { amount: string; currency_code: string },
          });
        });
      },
    );

    this.kafka.on<Record<string, unknown>>(
      'procurement.po.status_changed.v1',
      async (event: BaseEventEnvelope<Record<string, unknown>>) => {
        logger.info({ event_type: event.event_type, tenant_id: event.tenant_id }, 'event received');
        await this.withTenantContext(event, async (svc) => {
          await svc.handlePoStatusChanged({
            po_id: event.payload['po_id'] as string,
            project_id: event.payload['project_id'] as string,
            tenant_id: event.tenant_id,
            from_status: event.payload['from_status'] as string,
            to_status: event.payload['to_status'] as string,
          });
        });
      },
    );

    this.kafka.on<Record<string, unknown>>(
      'construction.boq.items_published.v1',
      async (event: BaseEventEnvelope<Record<string, unknown>>) => {
        logger.info({ event_type: event.event_type, tenant_id: event.tenant_id }, 'event received');
        await this.withTenantContext(event, async (svc) => {
          await svc.handleBoqItemsPublished({
            version_id: event.payload['version_id'] as string,
            project_id: event.payload['project_id'] as string,
            tenant_id: event.tenant_id,
            items: event.payload['items'] as BoqSnapshotItem[],
          });
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

  /**
   * Run one event's handler inside the tenant context it belongs to.
   *
   * THE SYNTHETIC REQUEST IS NOT ENOUGH ON ITS OWN. It gives the REQUEST-scoped FinanceService its
   * `tenantId`/`userId`, but the row-level tenant scoping lives a layer below, in
   * TenantPrismaService — a SINGLETON that reads CLS (see the note at the top of that file: it
   * deliberately replaced a `Scope.REQUEST` + `@Inject(REQUEST)` design). ClsModule is mounted as
   * HTTP middleware, so a Kafka callback runs with no CLS store at all and every query raised
   * `UnauthorizedException: Tenant context missing from request` — meaning the budget aggregation
   * master:2938-2940 describes could not complete a single event. The consumer's own unit spec mocks
   * Kafka and the service, so it never reached a database to find out.
   *
   * runInTenantContext enters CLS as the other consumers do and, since D50 (2026-11-13), routes to the
   * tenant's dedicated database and refuses an inactive tenant (the handler throws, the consumer retries
   * and then sends the event to the DLQ). Until then this had its own `cls.run` with no
   * CLS_DEDICATED_DB_URL, so an enterprise tenant's rows went to the shared database.
   */
  private async withTenantContext(
    event: BaseEventEnvelope<Record<string, unknown>>,
    handle: (svc: FinanceService) => Promise<void>,
  ): Promise<void> {
    await runInTenantContext({ tenantId: event.tenant_id, userId: event.actor_id }, async () => {
      const contextId = ContextIdFactory.create();
      // The REQUEST-scoped service reads its own tenantId/userId off this synthetic request.
      // actor_id is what master:2910 wants recorded as `recorded_by` on the cost transaction.
      this.moduleRef.registerRequestByContextId(
        { tenantId: event.tenant_id, userId: event.actor_id } as never,
        contextId,
      );
      const svc = await this.moduleRef.resolve(FinanceService, contextId, { strict: false });
      await handle(svc);
    });
  }
}
