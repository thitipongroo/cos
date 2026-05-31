// Project Repository — Phase 3
// All DB access via TenantPrismaService (SET LOCAL search_path per request).
// Uses $queryRaw (parameterized tagged template) — never raw string interpolation.
// Callbacks are `async` so TypeScript unwraps PrismaPromise<T> → T, giving
// TenantPrismaService.run<T>() clean type inference under Node16 resolution.

import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { TenantPrismaService } from '../tenant/prisma/tenant-prisma.service';
import type { CreateProjectDto } from './dto/create-project.dto';
import type { UpdateProjectDto } from './dto/update-project.dto';
import type { ProjectStatus } from './project.state-machine';
import type { CosRole } from '@cos/types';

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

function encodeCursor(projectId: string, createdAt: Date): string {
  return Buffer.from(`${projectId}:${createdAt.toISOString()}`).toString('base64');
}

function decodeCursor(cursor: string): { projectId: string; createdAt: string } | null {
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
    const colonIdx = decoded.indexOf(':');
    if (colonIdx === -1) return null;
    const projectId = decoded.slice(0, colonIdx);
    const createdAt = decoded.slice(colonIdx + 1);
    if (!projectId || !createdAt) return null;
    return { projectId, createdAt };
  } catch /* istanbul ignore next */ {
    return null;
  }
}

@Injectable({ scope: Scope.REQUEST })
export class ProjectRepository {
  private readonly tenantId: string;

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    @Inject(REQUEST) request: Request & { tenantId?: string },
  ) {
    this.tenantId = request.tenantId ?? '';
  }

  async create(dto: CreateProjectDto, createdBy: string): Promise<ProjectRow> {
    const rows = await this.tenantPrisma.run(
      async (tx) =>
        await tx.$queryRaw<ProjectRow[]>`
        INSERT INTO projects (
          tenant_id, project_code, project_name, project_type,
          budget_amount, budget_currency, start_date, end_date, created_by
        ) VALUES (
          ${this.tenantId}::uuid, ${dto.project_code}, ${dto.project_name},
          ${dto.project_type}::"ProjectType",
          ${dto.budget_amount ?? null}::decimal,
          ${dto.budget_currency ?? null},
          ${dto.start_date ?? null}::date,
          ${dto.end_date ?? null}::date,
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
        SELECT * FROM projects
        WHERE project_id = ${projectId}::uuid
          AND tenant_id  = ${this.tenantId}::uuid
      `,
    );
    return rows[0] ?? null;
  }

  async list(
    opts: ListProjectsOptions,
  ): Promise<{ items: ProjectRow[]; nextCursor: string | null }> {
    const limit = Math.min(opts.limit, 100);
    const parsed = opts.cursor ? decodeCursor(opts.cursor) : null;

    const items = await this.tenantPrisma.run(async (tx): Promise<ProjectRow[]> => {
      if (opts.status && opts.type && parsed) {
        return await tx.$queryRaw<ProjectRow[]>`
          SELECT * FROM projects
          WHERE tenant_id = ${this.tenantId}::uuid
            AND status = ${opts.status}::"ProjectStatus"
            AND project_type = ${opts.type}::"ProjectType"
            AND (created_at, project_id) < (${parsed.createdAt}::timestamptz, ${parsed.projectId}::uuid)
          ORDER BY created_at DESC, project_id DESC
          LIMIT ${limit + 1}
        `;
      }
      if (opts.status && parsed) {
        return await tx.$queryRaw<ProjectRow[]>`
          SELECT * FROM projects
          WHERE tenant_id = ${this.tenantId}::uuid
            AND status = ${opts.status}::"ProjectStatus"
            AND (created_at, project_id) < (${parsed.createdAt}::timestamptz, ${parsed.projectId}::uuid)
          ORDER BY created_at DESC, project_id DESC
          LIMIT ${limit + 1}
        `;
      }
      if (opts.type && parsed) {
        return await tx.$queryRaw<ProjectRow[]>`
          SELECT * FROM projects
          WHERE tenant_id = ${this.tenantId}::uuid
            AND project_type = ${opts.type}::"ProjectType"
            AND (created_at, project_id) < (${parsed.createdAt}::timestamptz, ${parsed.projectId}::uuid)
          ORDER BY created_at DESC, project_id DESC
          LIMIT ${limit + 1}
        `;
      }
      if (opts.status && opts.type) {
        return await tx.$queryRaw<ProjectRow[]>`
          SELECT * FROM projects
          WHERE tenant_id = ${this.tenantId}::uuid
            AND status = ${opts.status}::"ProjectStatus"
            AND project_type = ${opts.type}::"ProjectType"
          ORDER BY created_at DESC, project_id DESC
          LIMIT ${limit + 1}
        `;
      }
      if (opts.status) {
        return await tx.$queryRaw<ProjectRow[]>`
          SELECT * FROM projects
          WHERE tenant_id = ${this.tenantId}::uuid
            AND status = ${opts.status}::"ProjectStatus"
          ORDER BY created_at DESC, project_id DESC
          LIMIT ${limit + 1}
        `;
      }
      if (opts.type) {
        return await tx.$queryRaw<ProjectRow[]>`
          SELECT * FROM projects
          WHERE tenant_id = ${this.tenantId}::uuid
            AND project_type = ${opts.type}::"ProjectType"
          ORDER BY created_at DESC, project_id DESC
          LIMIT ${limit + 1}
        `;
      }
      if (parsed) {
        return await tx.$queryRaw<ProjectRow[]>`
          SELECT * FROM projects
          WHERE tenant_id = ${this.tenantId}::uuid
            AND (created_at, project_id) < (${parsed.createdAt}::timestamptz, ${parsed.projectId}::uuid)
          ORDER BY created_at DESC, project_id DESC
          LIMIT ${limit + 1}
        `;
      }
      return await tx.$queryRaw<ProjectRow[]>`
        SELECT * FROM projects
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

  async update(projectId: string, dto: UpdateProjectDto): Promise<ProjectRow> {
    const rows = await this.tenantPrisma.run(
      async (tx) =>
        await tx.$queryRaw<ProjectRow[]>`
        UPDATE projects SET
          project_name    = COALESCE(${dto.project_name ?? null}, project_name),
          budget_amount   = COALESCE(${dto.budget_amount ?? null}::decimal, budget_amount),
          budget_currency = COALESCE(${dto.budget_currency ?? null}, budget_currency),
          start_date      = COALESCE(${dto.start_date ?? null}::date, start_date),
          end_date        = COALESCE(${dto.end_date ?? null}::date, end_date),
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
        UPDATE projects SET
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
        INSERT INTO project_members (project_id, tenant_id, user_id, role, assigned_by)
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
        DELETE FROM project_members
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
        SELECT * FROM project_members
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
        SELECT * FROM project_documents
        WHERE project_id = ${projectId}::uuid
          AND tenant_id  = ${this.tenantId}::uuid
        ORDER BY uploaded_at DESC
      `,
    );
  }
}
