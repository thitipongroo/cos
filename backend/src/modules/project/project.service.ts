// Project Service — Phase 3
// Business logic: create, read, update, status transitions, membership, documents.
// Emits typed Kafka events through the Phase 8 OUTBOX (QM-8, WORKFLOW ENGINE SPEC): every event is
// written to platform.outbox_events inside the same transaction as its business row and relayed by
// OutboxPollerService. This service never publishes to Kafka directly (§35.13 ESC-13).
// OpenSearch used for full-text project search (QM-6 — kept async, non-blocking).

import {
  Injectable,
  Scope,
  Inject,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { randomUUID } from 'crypto';
import { Client as OpenSearchClient } from '@opensearch-project/opensearch';
import { buildOutboxEvent } from '../../shared/outbox/outbox.types';
import type { OutboxEventInput } from '../../shared/outbox/outbox.types';
import { createLogger } from '@cos/logger';
import type { CosRole } from '@cos/types';
import { ProjectRepository } from './project.repository';
import type { MemberProjectRow, ProjectRow } from './project.repository';
import { validateTransition } from './project.state-machine';
import type { ProjectStatus } from './project.state-machine';
import type { CreateProjectDto } from './dto/create-project.dto';
import type { UpdateProjectDto } from './dto/update-project.dto';
import type { TransitionProjectDto } from './dto/transition-project.dto';
import type { AddMemberDto } from './dto/add-member.dto';
import type { ListProjectsDto } from './dto/list-projects.dto';

const logger = createLogger('project-service');

const OS_INDEX = 'cos_projects';

@Injectable({ scope: Scope.REQUEST })
export class ProjectService {
  private get tenantId(): string {
    return (this.request as { tenantId?: string }).tenantId ?? '';
  }
  private get userId(): string {
    return (this.request as { userId?: string }).userId ?? '';
  }
  private readonly userRole: string;
  private readonly correlationId: string;
  private readonly openSearch: OpenSearchClient;

  constructor(
    private readonly repo: ProjectRepository,
    @Inject(REQUEST)
    private readonly request: Request & {
      tenantId?: string;
      user?: { user_id?: string; role?: string };
    },
  ) {
    this.userRole = request.user?.role ?? '';
    this.correlationId = randomUUID();
    this.openSearch = new OpenSearchClient({
      node: process.env['OPENSEARCH_URL'] ?? 'http://localhost:9200',
    });
  }

  async create(dto: CreateProjectDto): Promise<ProjectRow> {
    logger.info(
      {
        tenantId: this.tenantId,
        project_code: dto.project_code,
        correlation_id: this.correlationId,
      },
      'project.create',
    );

    // Phase 8 Outbox Pattern: the event is written in the SAME transaction as the project row, so a
    // rollback emits nothing and a committed write can never lose its event. The OutboxPoller
    // (shared/outbox/outbox-poller.service.ts) relays it to Kafka. Replaces the previous
    // fire-and-forget publish, which was neither atomic nor retried (§35.13 ESC-13).
    // The builder receives the INSERTed row, so the payload carries the real generated ids.
    const project = await this.repo.create(dto, this.userId, (row) =>
      buildOutboxEvent({
        eventType: 'construction.project.created.v1',
        tenantId: this.tenantId,
        actorId: this.userId,
        correlationId: this.correlationId,
        payload: {
          project_id: row.project_id,
          project_code: row.project_code,
          project_name: row.project_name,
          project_type: row.project_type as
            'RESIDENTIAL' | 'COMMERCIAL' | 'INFRASTRUCTURE' | 'INDUSTRIAL',
          budget: {
            amount: row.budget_amount ?? '0.0000',
            currency_code: row.budget_currency ?? 'THB',
          },
          start_date: row.start_date ?? '',
          end_date: row.end_date ?? '',
          created_by: row.created_by,
        },
      }),
    );

    await this.indexProject(project);

    return project;
  }

  async findById(projectId: string): Promise<ProjectRow> {
    const project = await this.repo.findById(projectId);
    if (!project) {
      throw new NotFoundException({
        error: {
          code: 'COS-PROJ-001',
          message: 'Project not found',
          messageKey: 'project.error.notFound',
          traceId: this.correlationId,
          timestamp: new Date().toISOString(),
        },
      });
    }
    return project;
  }

  async list(dto: ListProjectsDto): Promise<{ items: ProjectRow[]; nextCursor: string | null }> {
    const limit = Math.min(Number(dto.limit) || 20, 100);

    // Full-text search delegates to OpenSearch when q is provided
    if (dto.q) {
      return this.searchProjects(dto.q, dto, limit);
    }

    return this.repo.list({ status: dto.status, type: dto.type, cursor: dto.cursor, limit });
  }

  /**
   * The signed-in user's own projects (projects they are a member of). Scoped by the JWT user_id, so
   * a caller only ever sees their own projects — used by the SITE_ENGINEER home picker.
   */
  async listMine(): Promise<{ items: MemberProjectRow[] }> {
    return { items: await this.repo.listByMember(this.userId) };
  }

  /**
   * A specific user's projects — used by the TENANT_ADMIN user-profile screen. The repository scopes
   * `WHERE tenant_id = <caller's tenant>`, so an admin only ever sees projects inside their own tenant.
   */
  async listForUser(userId: string): Promise<{ items: MemberProjectRow[] }> {
    return { items: await this.repo.listByMember(userId) };
  }

  async update(projectId: string, dto: UpdateProjectDto): Promise<ProjectRow> {
    const existing = await this.findById(projectId);

    if (existing.status === 'CANCELLED' || existing.status === 'COMPLETED') {
      throw new UnprocessableEntityException({
        error: {
          code: 'COS-PROJ-002',
          message: `Cannot update a project in ${existing.status} status`,
          messageKey: 'project.error.notEditable',
          traceId: this.correlationId,
          timestamp: new Date().toISOString(),
        },
      });
    }

    const changedFields: Record<string, unknown> = {};
    for (const key of Object.keys(dto) as (keyof UpdateProjectDto)[]) {
      if (dto[key] !== undefined) changedFields[key] = dto[key];
    }

    // Outbox (§35.13 ESC-13) — written in the same transaction as the UPDATE.
    const updated = await this.repo.update(projectId, dto, (row) =>
      buildOutboxEvent({
        eventType: 'construction.project.updated.v1',
        tenantId: this.tenantId,
        actorId: this.userId,
        correlationId: this.correlationId,
        payload: {
          project_id: row.project_id,
          changed_fields: changedFields,
          updated_by: this.userId,
        },
      }),
    );

    await this.indexProject(updated);

    return updated;
  }

  async transition(projectId: string, dto: TransitionProjectDto): Promise<ProjectRow> {
    const existing = await this.findById(projectId);

    const result = validateTransition({
      currentStatus: existing.status,
      toStatus: dto.to as ProjectStatus,
      actorRole: this.userRole,
      endDate: existing.end_date,
      reason: dto.reason,
    });

    if (!result.allowed) {
      throw new UnprocessableEntityException({
        error: {
          code: 'COS-PROJ-003',
          message: result.reason ?? /* istanbul ignore next */ 'Transition not allowed',
          messageKey: 'project.error.transitionNotAllowed',
          details: { from: existing.status, to: dto.to },
          traceId: this.correlationId,
          timestamp: new Date().toISOString(),
        },
      });
    }

    const now = new Date().toISOString();
    const meta: {
      on_hold_reason?: string;
      on_hold_at?: string;
      cancellation_reason?: string;
      cancelled_at?: string;
    } = {};

    if (dto.to === 'ON_HOLD') {
      meta.on_hold_reason = dto.reason;
      meta.on_hold_at = now;
    }
    if (dto.to === 'CANCELLED') {
      meta.cancellation_reason = dto.reason;
      meta.cancelled_at = now;
    }

    // Outbox (§35.13 ESC-13): both events for this transition are written in the SAME transaction
    // as the status update, so a rollback emits neither and a commit loses neither.
    const updated = await this.repo.updateStatus(
      projectId,
      dto.to as ProjectStatus,
      meta,
      (row) => {
        const events: OutboxEventInput[] = [
          buildOutboxEvent({
            eventType: 'construction.project.status_changed.v1',
            tenantId: this.tenantId,
            actorId: this.userId,
            correlationId: this.correlationId,
            payload: {
              project_id: row.project_id,
              from_status: existing.status,
              to_status: dto.to as ProjectStatus,
              reason: dto.reason ?? null,
            },
          }),
        ];
        // COMPLETED projects are considered archived for downstream consumers
        if (dto.to === 'COMPLETED') {
          events.push(
            buildOutboxEvent({
              eventType: 'construction.project.archived.v1',
              tenantId: this.tenantId,
              actorId: this.userId,
              correlationId: this.correlationId,
              payload: { project_id: row.project_id },
            }),
          );
        }
        return events;
      },
    );

    await this.indexProject(updated);

    logger.info(
      {
        project_id: projectId,
        from: existing.status,
        to: dto.to,
        actor_id: this.userId,
        correlation_id: this.correlationId,
      },
      'project.transition',
    );

    return updated;
  }

  async addMember(projectId: string, dto: AddMemberDto): Promise<void> {
    await this.findById(projectId); // 404 guard
    const existingMembers = await this.repo.listMembers(projectId);
    const alreadyExists = existingMembers.some((m) => m.user_id === dto.user_id);
    if (alreadyExists) {
      // Upsert — update role silently
    }
    await this.repo.addMember(projectId, dto.user_id, dto.role as CosRole, this.userId);
    logger.info(
      { project_id: projectId, user_id: dto.user_id, role: dto.role },
      'project.member.added',
    );
  }

  async removeMember(projectId: string, userId: string): Promise<void> {
    await this.findById(projectId); // 404 guard
    await this.repo.removeMember(projectId, userId);
    logger.info({ project_id: projectId, user_id: userId }, 'project.member.removed');
  }

  async listMembers(projectId: string) {
    await this.findById(projectId); // 404 guard
    return this.repo.listMembers(projectId);
  }

  async listDocuments(projectId: string) {
    await this.findById(projectId); // 404 guard
    return this.repo.listDocuments(projectId);
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private async indexProject(project: ProjectRow): Promise<void> {
    try {
      await this.openSearch.index({
        index: OS_INDEX,
        id: project.project_id,
        body: {
          tenant_id: project.tenant_id,
          project_code: project.project_code,
          project_name: project.project_name,
          project_type: project.project_type,
          status: project.status,
          updated_at: project.updated_at,
        },
      });
    } catch (err) {
      // Non-fatal: search index failure must not block the primary write path
      logger.warn({ project_id: project.project_id, err }, 'opensearch.index.failed');
    }
  }

  private async searchProjects(
    q: string,
    dto: ListProjectsDto,
    limit: number,
  ): Promise<{ items: ProjectRow[]; nextCursor: string | null }> {
    try {
      const must: unknown[] = [
        // §35.13 ESC-32: .keyword, not the bare field. Nothing in the repo creates an index
        // mapping, so OpenSearch maps these strings dynamically as analyzed `text` with a
        // `.keyword` sub-field. A `term` query on the analyzed field never matches a UUID or an
        // enum value, which made every search silently return nothing. All values here are far
        // below the 256-char `ignore_above`, so `.keyword` is always populated.
        { term: { 'tenant_id.keyword': this.tenantId } },
        {
          multi_match: {
            query: q,
            fields: ['project_name^2', 'project_code'],
            type: 'best_fields',
          },
        },
      ];
      if (dto.status) must.push({ term: { 'status.keyword': dto.status } });
      if (dto.type) must.push({ term: { 'project_type.keyword': dto.type } });

      const response = await this.openSearch.search({
        index: OS_INDEX,
        body: { query: { bool: { must } }, size: limit },
      });

      const hits = (response.body.hits?.hits ?? []) as Array<{ _id: string }>;
      const ids = hits.map((h) => h._id);

      if (ids.length === 0) return { items: [], nextCursor: null };

      // Fetch full rows from DB (OpenSearch holds only search fields, not full entity) in ONE query.
      // This used to loop findById(), i.e. a separate tenant transaction per hit.
      const rows = await this.repo.findByIds(ids);
      // Restore OpenSearch relevance order, which the SQL result does not preserve. Ids with no row
      // (deleted since indexing, or filtered out by RLS) simply drop out, as before.
      const byId = new Map(rows.map((r) => [r.project_id, r]));
      const items = ids.map((id) => byId.get(id)).filter((r): r is ProjectRow => r !== undefined);
      return { items, nextCursor: null }; // cursor not supported for search results
    } catch (err) {
      logger.warn({ q, err }, 'opensearch.search.failed — falling back to DB list');
      return this.repo.list({ status: dto.status, type: dto.type, cursor: dto.cursor, limit });
    }
  }
}
