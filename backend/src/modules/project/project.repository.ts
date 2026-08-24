// Project Repository — Phase 3
// All DB access via TenantPrismaService (SET LOCAL app.current_tenant_id per request — ADR-008).
// Uses $queryRaw (parameterized tagged template) — never raw string interpolation.
// Callbacks are `async` so TypeScript unwraps PrismaPromise<T> → T, giving
// TenantPrismaService.run<T>() clean type inference under Node16 resolution.

import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { OutboxPublisher } from '@cos/kafka';
import { TenantPrismaService } from '../tenant/prisma/tenant-prisma.service';
import type { OutboxEventInput } from '../../shared/outbox/outbox.types';
import { clsTenantId } from '../../shared/context/cls-context';
import type { CreateProjectDto } from './dto/create-project.dto';
import type { UpdateProjectDto } from './dto/update-project.dto';
import type { ProjectStatus } from './project.state-machine';
import type { CosRole } from '@cos/types';
import { decodeCursor, encodeCursor } from '../../shared/pagination/cursor';

export interface ProjectRow {
  project_id: string;
  tenant_id: string;
  project_code: string;
  project_name: string;
  project_type: string;
  status: ProjectStatus;
  budget_amount: string | null;
  budget_currency: string | null;
  start_date: string | null;
  end_date: string | null;
  estimated_completion_date: string | null;
  work_hours_start: string | null; // TIME (HH:MM[:SS]) — standard daily working window (ADR-072)
  work_hours_end: string | null;
  on_hold_reason: string | null;
  on_hold_at: Date | null;
  cancellation_reason: string | null;
  cancelled_at: Date | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * A row of `listByMember` — a project plus the two fields the mobile project pickers draw beside its
 * name. Both are LEFT JOIN LATERAL columns, so a project missing either still appears in the list.
 */
export interface MemberProjectRow extends ProjectRow {
  /** The project's first building, or null where none is modelled (PO decision 2026-08-11). */
  building_name: string | null;
  /**
   * BOQ-value-weighted completion 0..100, or NULL when nothing is measurable (§32.12).
   *
   * NULL means "not computable", never zero — a project with no BOQ-linked task must render a
   * placeholder, not a 0% bar that reads as "no work done".
   */
  progress_percent: number | null;
}

export interface ProjectMemberRow {
  membership_id: string;
  project_id: string;
  tenant_id: string;
  user_id: string;
  role: string;
  assigned_at: Date;
  assigned_by: string;
}

export interface ProjectDocumentRow {
  document_id: string;
  project_id: string;
  tenant_id: string;
  file_id: string | null;
  document_type: string | null;
  uploaded_by: string;
  uploaded_at: Date;
}

export interface ListProjectsOptions {
  status?: string;
  type?: string;
  cursor?: string; // encoded: base64(project_id:created_at)
  limit: number;
}

@Injectable({ scope: Scope.REQUEST })
export class ProjectRepository {
  // CLS fallback is load-bearing, not cosmetic: under Fastify the REQUEST injected into a
  // Scope.REQUEST provider is not guaranteed to be the object the auth layer decorated. The auth
  // guards publish tenant_id into CLS (the same source TenantPrismaService reads for RLS), so this
  // resolves even when the request copy does not carry it.
  private get tenantId(): string {
    return (this.request as { tenantId?: string }).tenantId ?? clsTenantId();
  }

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    @Inject(REQUEST) private readonly request: Request & { tenantId?: string },
  ) {}

  /**
   * Insert a project. When `buildOutboxEvent` is supplied the outbox row is written inside the SAME
   * transaction as the business row (Phase 8 Outbox Pattern) — a rollback therefore emits no event.
   * `TenantPrismaService.run` already wraps the callback in `prisma.$transaction`.
   *
   * The parameter is a **builder**, not a pre-built envelope: `project_id`, `created_at` and the
   * other server-generated columns only exist after the INSERT returns, so the event payload must
   * be derived from the inserted row — otherwise the relayed event would carry ids that match no row.
   */
  async create(
    dto: CreateProjectDto,
    createdBy: string,
    buildOutboxEvent?: (row: ProjectRow) => OutboxEventInput,
  ): Promise<ProjectRow> {
    const rows = await this.tenantPrisma.run(async (tx) => {
      const inserted = await tx.$queryRaw<ProjectRow[]>`
        INSERT INTO projects.projects (
          tenant_id, project_code, project_name, project_type,
          budget_amount, budget_currency, start_date, end_date,
          work_hours_start, work_hours_end, created_by
        ) VALUES (
          ${this.tenantId}::uuid, ${dto.project_code}, ${dto.project_name},
          ${dto.project_type}::"ProjectType",
          ${dto.budget_amount ?? null}::decimal,
          ${dto.budget_currency ?? null},
          ${dto.start_date ?? null}::date,
          ${dto.end_date ?? null}::date,
          ${dto.work_hours_start ?? null}::time,
          ${dto.work_hours_end ?? null}::time,
          ${createdBy}::uuid
        )
        RETURNING *
      `;
      if (buildOutboxEvent && inserted[0]) {
        await OutboxPublisher.write(tx, buildOutboxEvent(inserted[0]));
      }
      return inserted;
    });
    return rows[0]!;
  }

  async findById(projectId: string): Promise<ProjectRow | null> {
    const rows = await this.tenantPrisma.run(
      async (tx) =>
        await tx.$queryRaw<ProjectRow[]>`
        SELECT * FROM projects.projects
        WHERE project_id = ${projectId}::uuid
          AND tenant_id  = ${this.tenantId}::uuid
      `,
    );
    return rows[0] ?? null;
  }

  /**
   * Fetch many projects by id in one round trip.
   *
   * Used to hydrate OpenSearch hits, which previously looped findById() — one full
   * BEGIN/SET LOCAL/SELECT/COMMIT per hit. Rows come back in whatever order Postgres chooses; the
   * caller is responsible for restoring search-relevance order.
   */
  async findByIds(projectIds: string[]): Promise<ProjectRow[]> {
    if (projectIds.length === 0) return [];
    return this.tenantPrisma.run(
      async (tx) =>
        await tx.$queryRaw<ProjectRow[]>`
        SELECT * FROM projects.projects
        WHERE project_id = ANY(${projectIds}::uuid[])
          AND tenant_id  = ${this.tenantId}::uuid
      `,
    );
  }

  async list(
    opts: ListProjectsOptions,
  ): Promise<{ items: ProjectRow[]; nextCursor: string | null }> {
    const limit = Math.min(opts.limit, 100);
    const parsed = opts.cursor ? decodeCursor(opts.cursor) : null;

    const items = await this.tenantPrisma.run(async (tx): Promise<ProjectRow[]> => {
      if (opts.status && opts.type && parsed) {
        return await tx.$queryRaw<ProjectRow[]>`
          SELECT * FROM projects.projects
          WHERE tenant_id = ${this.tenantId}::uuid
            AND status = ${opts.status}::"ProjectStatus"
            AND project_type = ${opts.type}::"ProjectType"
            AND (created_at, project_id) < (${parsed.createdAt}::timestamptz, ${parsed.id}::uuid)
          ORDER BY created_at DESC, project_id DESC
          LIMIT ${limit + 1}
        `;
      }
      if (opts.status && parsed) {
        return await tx.$queryRaw<ProjectRow[]>`
          SELECT * FROM projects.projects
          WHERE tenant_id = ${this.tenantId}::uuid
            AND status = ${opts.status}::"ProjectStatus"
            AND (created_at, project_id) < (${parsed.createdAt}::timestamptz, ${parsed.id}::uuid)
          ORDER BY created_at DESC, project_id DESC
          LIMIT ${limit + 1}
        `;
      }
      if (opts.type && parsed) {
        return await tx.$queryRaw<ProjectRow[]>`
          SELECT * FROM projects.projects
          WHERE tenant_id = ${this.tenantId}::uuid
            AND project_type = ${opts.type}::"ProjectType"
            AND (created_at, project_id) < (${parsed.createdAt}::timestamptz, ${parsed.id}::uuid)
          ORDER BY created_at DESC, project_id DESC
          LIMIT ${limit + 1}
        `;
      }
      if (opts.status && opts.type) {
        return await tx.$queryRaw<ProjectRow[]>`
          SELECT * FROM projects.projects
          WHERE tenant_id = ${this.tenantId}::uuid
            AND status = ${opts.status}::"ProjectStatus"
            AND project_type = ${opts.type}::"ProjectType"
          ORDER BY created_at DESC, project_id DESC
          LIMIT ${limit + 1}
        `;
      }
      if (opts.status) {
        return await tx.$queryRaw<ProjectRow[]>`
          SELECT * FROM projects.projects
          WHERE tenant_id = ${this.tenantId}::uuid
            AND status = ${opts.status}::"ProjectStatus"
          ORDER BY created_at DESC, project_id DESC
          LIMIT ${limit + 1}
        `;
      }
      if (opts.type) {
        return await tx.$queryRaw<ProjectRow[]>`
          SELECT * FROM projects.projects
          WHERE tenant_id = ${this.tenantId}::uuid
            AND project_type = ${opts.type}::"ProjectType"
          ORDER BY created_at DESC, project_id DESC
          LIMIT ${limit + 1}
        `;
      }
      if (parsed) {
        return await tx.$queryRaw<ProjectRow[]>`
          SELECT * FROM projects.projects
          WHERE tenant_id = ${this.tenantId}::uuid
            AND (created_at, project_id) < (${parsed.createdAt}::timestamptz, ${parsed.id}::uuid)
          ORDER BY created_at DESC, project_id DESC
          LIMIT ${limit + 1}
        `;
      }
      return await tx.$queryRaw<ProjectRow[]>`
        SELECT * FROM projects.projects
        WHERE tenant_id = ${this.tenantId}::uuid
        ORDER BY created_at DESC, project_id DESC
        LIMIT ${limit + 1}
      `;
    });

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    const nextCursor =
      hasMore && page.length > 0
        ? encodeCursor(page[page.length - 1]!.project_id, page[page.length - 1]!.created_at)
        : null;

    return { items: page, nextCursor };
  }

  /**
   * The projects the given user is a member of (projects.project_members). Scopes the SITE_ENGINEER
   * home's project picker to that engineer's own projects rather than the whole tenant. A user belongs
   * to only a handful of projects, so this is unpaginated — capped at 100 as a guard.
   */
  /**
   * The projects a user is a member of, each carrying ONE building name.
   *
   * The building is here because the Site Worker's project picker draws it under the project name
   * (mockup 05_site_worker/01_home/00_sw_project_selection, PO decision 2026-08-11: the drawing's
   * "Zone C - North Wing" line is the building, since no zone field exists on a project or a
   * membership). Adding it to this query rather than to a new endpoint keeps the picker at one round
   * trip instead of one per project.
   *
   * LEFT JOIN LATERAL, so a project with no building still appears — with `building_name` NULL. A
   * site the office has not modelled yet is still a site someone works on.
   *
   * AND ONE PROGRESS FIGURE PER PROJECT, for the same reason and by the same means (PO decision
   * 2026-08-12: "1d. เพิ่ม field progress"). Both project-selection drawings put a completion bar on
   * every card — 03_site_engineer/01_home/00_project_selection and its Site Worker twin — and the
   * picker had no way to draw one: the figure lived only in `GET /projects/:id/progress`, so a list
   * of N sites meant N extra requests on open, and that endpoint is deliberately not cached offline
   * and throws on a plane. A second LATERAL costs this one query nothing like that.
   *
   * THE FORMULA IS §32.12's, NOT A SECOND DEFINITION OF PROGRESS: Σ(progress_percent × BOQ value) ÷
   * Σ(BOQ value) over every BOQ-linked, non-cancelled task — character for character the numerator
   * and denominator `findProgressSums` feeds into `deriveProgress().percentComplete`. Two places
   * computing "how far along is this project" must not be able to disagree.
   *
   * NULLIF keeps the null semantics of that metric intact: no BOQ-linked task → NULL, never 0. The
   * mobile card renders a dash for NULL, because "not measurable" and "nothing done" are different
   * facts and a 0% bar states the wrong one.
   */
  async listByMember(userId: string): Promise<MemberProjectRow[]> {
    return this.tenantPrisma.run(
      async (tx): Promise<MemberProjectRow[]> =>
        await tx.$queryRaw<MemberProjectRow[]>`
          SELECT p.*, b.building_name, g.progress_percent
          FROM projects.projects p
          JOIN projects.project_members m
            ON m.project_id = p.project_id AND m.tenant_id = p.tenant_id
          LEFT JOIN LATERAL (
            SELECT bb.building_name
            FROM projects.buildings bb
            WHERE bb.project_id = p.project_id AND bb.tenant_id = p.tenant_id
            ORDER BY bb.created_at, bb.building_id
            LIMIT 1
          ) b ON TRUE
          LEFT JOIN LATERAL (
            SELECT
              SUM(t.progress_percent * i.estimated_total)::float8
                / NULLIF(SUM(i.estimated_total)::float8, 0) AS progress_percent
            FROM projects.tasks t
            JOIN boq.boq_items i
              ON i.item_id = t.boq_item_id AND i.tenant_id = t.tenant_id
            WHERE t.tenant_id = p.tenant_id
              AND t.project_id = p.project_id
              AND t.status <> 'CANCELLED'
          ) g ON TRUE
          WHERE p.tenant_id = ${this.tenantId}::uuid
            AND m.user_id = ${userId}::uuid
          ORDER BY p.created_at DESC, p.project_id DESC
          LIMIT 100
        `,
    );
  }

  /** Outbox-aware — see `create()` for why the parameter is a builder over the returned row. */
  async update(
    projectId: string,
    dto: UpdateProjectDto,
    buildOutboxEvent?: (row: ProjectRow) => OutboxEventInput,
  ): Promise<ProjectRow> {
    const rows = await this.tenantPrisma.run(async (tx) => {
      const updated = await tx.$queryRaw<ProjectRow[]>`
        UPDATE projects.projects SET
          project_name    = COALESCE(${dto.project_name ?? null}, project_name),
          budget_amount   = COALESCE(${dto.budget_amount ?? null}::decimal, budget_amount),
          budget_currency = COALESCE(${dto.budget_currency ?? null}, budget_currency),
          start_date      = COALESCE(${dto.start_date ?? null}::date, start_date),
          end_date        = COALESCE(${dto.end_date ?? null}::date, end_date),
          estimated_completion_date =
            COALESCE(${dto.estimated_completion_date ?? null}::date, estimated_completion_date),
          work_hours_start = COALESCE(${dto.work_hours_start ?? null}::time, work_hours_start),
          work_hours_end   = COALESCE(${dto.work_hours_end ?? null}::time, work_hours_end),
          updated_at      = now()
        WHERE project_id = ${projectId}::uuid
          AND tenant_id  = ${this.tenantId}::uuid
        RETURNING *
      `;
      if (buildOutboxEvent && updated[0]) {
        await OutboxPublisher.write(tx, buildOutboxEvent(updated[0]));
      }
      return updated;
    });
    return rows[0]!;
  }

  async updateStatus(
    projectId: string,
    toStatus: ProjectStatus,
    meta: {
      on_hold_reason?: string;
      on_hold_at?: string;
      cancellation_reason?: string;
      cancelled_at?: string;
    },
    buildOutboxEvents?: (row: ProjectRow) => OutboxEventInput[],
  ): Promise<ProjectRow> {
    const rows = await this.tenantPrisma.run(async (tx) => {
      const updated = await tx.$queryRaw<ProjectRow[]>`
        UPDATE projects.projects SET
          status              = ${toStatus}::"ProjectStatus",
          on_hold_reason      = COALESCE(${meta.on_hold_reason ?? null}, on_hold_reason),
          on_hold_at          = COALESCE(${meta.on_hold_at ?? null}::timestamptz, on_hold_at),
          cancellation_reason = COALESCE(${meta.cancellation_reason ?? null}, cancellation_reason),
          cancelled_at        = COALESCE(${meta.cancelled_at ?? null}::timestamptz, cancelled_at),
          updated_at          = now()
        WHERE project_id = ${projectId}::uuid
          AND tenant_id  = ${this.tenantId}::uuid
        RETURNING *
      `;
      // A transition can emit TWO events (status_changed, and archived when moving to COMPLETED),
      // so this builder returns an array — all of them share the one transaction.
      if (buildOutboxEvents && updated[0]) {
        for (const evt of buildOutboxEvents(updated[0])) {
          await OutboxPublisher.write(tx, evt);
        }
      }
      return updated;
    });
    return rows[0]!;
  }

  async addMember(
    projectId: string,
    userId: string,
    role: CosRole,
    assignedBy: string,
  ): Promise<ProjectMemberRow> {
    const rows = await this.tenantPrisma.run(
      async (tx) =>
        await tx.$queryRaw<ProjectMemberRow[]>`
        INSERT INTO projects.project_members (project_id, tenant_id, user_id, role, assigned_by)
        VALUES (${projectId}::uuid, ${this.tenantId}::uuid, ${userId}::uuid,
                ${role}::"ProjectMemberRole", ${assignedBy}::uuid)
        ON CONFLICT (project_id, user_id)
        DO UPDATE SET role = EXCLUDED.role, assigned_by = EXCLUDED.assigned_by
        RETURNING *
      `,
    );
    return rows[0]!;
  }

  async removeMember(projectId: string, userId: string): Promise<void> {
    await this.tenantPrisma.run(async (tx) => {
      await tx.$executeRaw`
        DELETE FROM projects.project_members
        WHERE project_id = ${projectId}::uuid
          AND user_id    = ${userId}::uuid
          AND tenant_id  = ${this.tenantId}::uuid
      `;
    });
  }

  async listMembers(projectId: string): Promise<ProjectMemberRow[]> {
    return this.tenantPrisma.run(
      async (tx) =>
        await tx.$queryRaw<ProjectMemberRow[]>`
        SELECT * FROM projects.project_members
        WHERE project_id = ${projectId}::uuid
          AND tenant_id  = ${this.tenantId}::uuid
        ORDER BY assigned_at ASC
      `,
    );
  }

  async listDocuments(projectId: string): Promise<ProjectDocumentRow[]> {
    return this.tenantPrisma.run(
      async (tx) =>
        await tx.$queryRaw<ProjectDocumentRow[]>`
        SELECT * FROM projects.project_documents
        WHERE project_id = ${projectId}::uuid
          AND tenant_id  = ${this.tenantId}::uuid
        ORDER BY uploaded_at DESC
      `,
    );
  }
}
