// TasksDelayConsumer — the second consumer of construction.delay.detected.v1.
//
// §Phase 6 completion gate 6 states as FACT that this event "auto-sets task.status = BLOCKED", and
// tasks.service already reads that status: a BLOCKED task pushes 'delay' onto the blocking list and
// cannot be completed. Everything around the behaviour existed except the behaviour — no code
// performed the transition, and no code published the event either. The producer landed in the AI
// gateway in Phase 23 (see services/ai-gateway/reports/delay_event.py); this is the half that makes
// the event observable in the product rather than only in the Knowledge Graph.
//
// TasksService is REQUEST-scoped, so it is resolved per event through ModuleRef with a synthetic
// request carrying the event's tenant_id — the same pattern RisksConsumer and FinanceConsumer use.

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ModuleRef, ContextIdFactory } from '@nestjs/core';
import { KafkaConsumer } from '@cos/kafka';
import { createLogger } from '@cos/logger';
import type { BaseEventEnvelope } from '@cos/types';
import { TasksService } from './tasks.service';

const logger = createLogger('tasks-delay-consumer');

const EVENT_TYPE = 'construction.delay.detected.v1';

/**
 * Statuses a delay may move to BLOCKED.
 *
 * A COMPLETED or CANCELLED task is deliberately left alone. The forecast that produced the event
 * describes a schedule risk, and applying it blindly would let a late or replayed message un-finish
 * work that is already done — the event carries no ordering guarantee against the completion. A task
 * already BLOCKED needs no second write.
 */
const BLOCKABLE_STATUSES = new Set(['NOT_STARTED', 'IN_PROGRESS']);

@Injectable()
export class TasksDelayConsumer implements OnModuleInit, OnModuleDestroy {
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
      groupId: 'tasks-delay.shared',
      eventTypes: [EVENT_TYPE],
      fromBeginning: false,
    });
    logger.info({ eventTypes: [EVENT_TYPE] }, 'TasksDelayConsumer started');
  }

  async onModuleDestroy(): Promise<void> {
    await this.kafka
      .disconnect()
      .catch((err: unknown) => logger.error({ err }, 'TasksDelayConsumer disconnect error'));
  }

  async handle(event: BaseEventEnvelope<Record<string, unknown>>): Promise<void> {
    const taskId = event.payload['task_id'];
    // task_id is nullable in the schema: a project-level forecast names no task, and there is
    // nothing to block. The Knowledge Graph still records it.
    if (typeof taskId !== 'string' || !taskId) {
      logger.debug(
        { tenant_id: event.tenant_id },
        'delay event carries no task_id; nothing to block',
      );
      return;
    }

    const svc = await this.resolveSvc(event.tenant_id);

    let current: { status: string };
    try {
      current = (await svc.getTask(taskId)) as unknown as { status: string };
    } catch {
      logger.info({ tenant_id: event.tenant_id, task_id: taskId }, 'delay event: task not found');
      return;
    }

    if (!BLOCKABLE_STATUSES.has(current.status)) {
      logger.info(
        { tenant_id: event.tenant_id, task_id: taskId, status: current.status },
        'delay event: task not in a blockable status, leaving it alone',
      );
      return;
    }

    await svc.updateTask(taskId, { status: 'BLOCKED' } as never);
    logger.info(
      {
        tenant_id: event.tenant_id,
        task_id: taskId,
        delay_days: event.payload['delay_days'],
        severity: event.payload['severity'],
      },
      'delay event: task set to BLOCKED',
    );
  }

  /** Resolve a per-event TasksService instance with the event's tenant context. */
  private async resolveSvc(tenantId: string): Promise<TasksService> {
    const contextId = ContextIdFactory.create();
    this.moduleRef.registerRequestByContextId({ tenantId } as never, contextId);
    return this.moduleRef.resolve(TasksService, contextId, { strict: false });
  }
}
