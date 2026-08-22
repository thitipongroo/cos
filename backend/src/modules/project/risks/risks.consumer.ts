// RisksConsumer (ADR-065 / F4b feed).
// Consumes ai.risk_prediction.generated.v1 (model_type=DELAY_FORECAST) from the AI gateway and turns
// each confident delay forecast into an AI-suggested ProjectRisk for human triage.
//
// RisksService is REQUEST-scoped; resolved per-event via ModuleRef + ContextIdFactory with a synthetic
// request carrying the event's tenant_id (same pattern as FinanceConsumer).

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ModuleRef, ContextIdFactory } from '@nestjs/core';
import { KafkaConsumer } from '@cos/shared';
import { createLogger } from '@cos/logger';
import type { BaseEventEnvelope } from '@cos/types';
import { RisksService } from './risks.service';
import { mapDelayForecast, type DelayForecast } from './ai-risk-mapping';
import { runInTenantContext } from '../../../shared/context/run-in-tenant-context';

const logger = createLogger('risks-consumer');

const EVENT_TYPE = 'ai.risk_prediction.generated.v1';

@Injectable()
export class RisksConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly kafka = new KafkaConsumer();

  constructor(private readonly moduleRef: ModuleRef) {}

  async onModuleInit(): Promise<void> {
    this.kafka.on<Record<string, unknown>>(
      EVENT_TYPE,
      async (event: BaseEventEnvelope<Record<string, unknown>>) => {
        await this.handle(event);
      },
    );
    await this.kafka.connect({
      groupId: 'project-risks.shared',
      eventTypes: [EVENT_TYPE],
      fromBeginning: false,
    });
    logger.info({ eventTypes: [EVENT_TYPE] }, 'RisksConsumer started');
  }

  async onModuleDestroy(): Promise<void> {
    await this.kafka
      .disconnect()
      .catch((err: unknown) => logger.error({ err }, 'RisksConsumer disconnect error'));
  }

  async handle(event: BaseEventEnvelope<Record<string, unknown>>): Promise<void> {
    const payload = event.payload;
    // Only delay forecasts become schedule risks; other model_types (cost, safety) are not ours.
    if (payload['model_type'] !== 'DELAY_FORECAST') return;

    let forecast: DelayForecast;
    try {
      forecast = JSON.parse(payload['prediction'] as string) as DelayForecast;
    } catch {
      logger.warn({ tenant_id: event.tenant_id }, 'risk-prediction: unparseable prediction JSON');
      return;
    }

    const input = mapDelayForecast(forecast, (payload['confidence'] as string) ?? null);
    if (!input) {
      logger.info(
        { level: forecast.delay_risk_level },
        'risk-prediction: unknown delay level, skipping',
      );
      return;
    }

    // CLS, not just the request object: TenantPrismaService reads the tenant from CLS alone, so
    // without this RisksRepository's first db.run() throws "Tenant context missing" (OQ-45).
    await runInTenantContext({ tenantId: event.tenant_id, userId: event.actor_id }, async () => {
      const svc = await this.resolveSvc(event.tenant_id);
      const risk = await svc.createSuggested(payload['project_id'] as string, input);
      if (!risk) {
        logger.info({ tenant_id: event.tenant_id }, 'risk-prediction: project not found, skipped');
      }
    });
  }

  /** Resolve a per-event RisksService instance with the event's tenant context. */
  private async resolveSvc(tenantId: string): Promise<RisksService> {
    const contextId = ContextIdFactory.create();
    this.moduleRef.registerRequestByContextId({ tenantId } as never, contextId);
    return this.moduleRef.resolve(RisksService, contextId, { strict: false });
  }
}
