// Project Repository — Phase 3
// All DB access via TenantPrismaService (SET LOCAL app.current_tenant_id per request — ADR-008).
// Uses $queryRaw (parameterized tagged template) — never raw string interpolation.
// Callbacks are `async` so TypeScript unwraps PrismaPromise<T> → T, giving
// TenantPrismaService.run<T>() clean type inference under Node16 resolution.

import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { TenantPrismaService } from '../tenant/prisma/tenant-prisma.service';
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

  async create(dto: CreateProjectDto, createdBy: string): Promise<ProjectRow> {
    const rows = await this.tenantPrisma.run(
      async (tx) =>
        await tx.$queryRaw<ProjectRow[]>`
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
      `,
    );
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
  async listByMember(userId: string): Promise<ProjectRow[]> {
    return this.tenantPrisma.run(
      async (tx): Promise<ProjectRow[]> =>
        await tx.$queryRaw<ProjectRow[]>`
          SELECT p.* FROM projects.projects p
          JOIN projects.project_members m
            ON m.project_id = p.project_id AND m.tenant_id = p.tenant_id
          WHERE p.tenant_id = ${this.tenantId}::uuid
            AND m.user_id = ${userId}::uuid
          ORDER BY p.created_at DESC, p.project_id DESC
          LIMIT 100
        `,
    );
  }

  async update(projectId: string, dto: UpdateProjectDto): Promise<ProjectRow> {
    const rows = await this.tenantPrisma.run(
      async (tx) =>
        await tx.$queryRaw<ProjectRow[]>`
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
      `,
    );
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
  ): Promise<ProjectRow> {
    const rows = await this.tenantPrisma.run(
      async (tx) =>
        await tx.$queryRaw<ProjectRow[]>`
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
      `,
    );
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
