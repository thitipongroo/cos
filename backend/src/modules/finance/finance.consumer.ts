// FinanceConsumer — Phase 7
// Kafka consumer group: finance-consumer-group.
// FinanceService is REQUEST-scoped; use ModuleRef + ContextIdFactory to resolve it
// with a synthetic request context carrying the tenant_id from each event envelope.

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ModuleRef, ContextIdFactory } from '@nestjs/core';
import { ClsServiceManager } from 'nestjs-cls';
import { KafkaConsumer } from '@cos/kafka';
import { createLogger } from '@cos/logger';
import type { BaseEventEnvelope } from '@cos/types';
import { CLS_TENANT_ID, CLS_USER_ID } from '../../shared/context/cls-context';
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
   * `cls.run` + `cls.set` is the pattern the other non-HTTP entry point already uses (see
   * data-export.activities.ts, a Temporal activity). Like that one, this does not set
   * CLS_DEDICATED_DB_URL: only the HTTP path knows it, from the JWT. Enterprise tenants on a
   * dedicated database therefore still resolve to the shared client here — a pre-existing gap in
   * every non-HTTP path, not one this handler introduces, and not one to settle silently.
   */
  private async withTenantContext(
    event: BaseEventEnvelope<Record<string, unknown>>,
    handle: (svc: FinanceService) => Promise<void>,
  ): Promise<void> {
    const cls = ClsServiceManager.getClsService();
    await cls.run(async () => {
      cls.set(CLS_TENANT_ID, event.tenant_id);
      cls.set(CLS_USER_ID, event.actor_id);
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
