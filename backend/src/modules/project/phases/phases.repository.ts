// Project Phases Repository — Phase 3 amendment (ADR-070).
// All DB access via TenantPrismaService (SET LOCAL app.current_tenant_id per request — ADR-008).
// Parameterized $queryRaw / $executeRaw only — never raw string interpolation (QM-4).

import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { TenantPrismaService } from '../../tenant/prisma/tenant-prisma.service';
import type { CreatePhaseDto } from './dto/create-phase.dto';
import type { UpdatePhaseDto } from './dto/update-phase.dto';
import { projectExistsInTenant } from '../shared/parent-existence';

export type PhaseStatusValue = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

export interface PhaseRow {
  phase_id: string;
  project_id: string;
  tenant_id: string;
  seq: number;
  name: string;
  status: PhaseStatusValue;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

@Injectable({ scope: Scope.REQUEST })
export class PhasesRepository {
  private get tenantId(): string {
    return (this.request as { tenantId?: string }).tenantId ?? '';
  }

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    @Inject(REQUEST) private readonly request: Request & { tenantId?: string },
  ) {}

  // Parent existence check (tenant-scoped) — a phase must belong to a project in this tenant.
  async projectExists(projectId: string): Promise<boolean> {
    return projectExistsInTenant(this.tenantPrisma, projectId, this.tenantId);
  }

  async create(projectId: string, dto: CreatePhaseDto, createdBy: string): Promise<PhaseRow> {
    const rows = await this.tenantPrisma.run(
      async (tx) =>
        await tx.$queryRaw<PhaseRow[]>`
        INSERT INTO projects.project_phases (
          project_id, tenant_id, seq, name, status,
          planned_start, planned_end, actual_start, actual_end, created_by
        ) VALUES (
          ${projectId}::uuid, ${this.tenantId}::uuid, ${dto.seq}::int, ${dto.name},
          ${dto.status ?? 'NOT_STARTED'},
          ${dto.planned_start ?? null}::date, ${dto.planned_end ?? null}::date,
          ${dto.actual_start ?? null}::date, ${dto.actual_end ?? null}::date,
          ${createdBy}::uuid
        )
        RETURNING *
      `,
    );
    return rows[0]!;
  }

  async findById(phaseId: string): Promise<PhaseRow | null> {
    const rows = await this.tenantPrisma.run(
      async (tx) =>
        await tx.$queryRaw<PhaseRow[]>`
        SELECT * FROM projects.project_phases
        WHERE phase_id = ${phaseId}::uuid AND tenant_id = ${this.tenantId}::uuid
      `,
    );
    return rows[0] ?? null;
  }

  // Ordered by seq — the derivation order the dashboard's "current phase" depends on (ADR-070).
  // Phases per project are bounded, so this returns the whole ordered list (no pagination).
  async listByProject(projectId: string): Promise<PhaseRow[]> {
    return this.tenantPrisma.run(
      async (tx) =>
        await tx.$queryRaw<PhaseRow[]>`
        SELECT * FROM projects.project_phases
        WHERE project_id = ${projectId}::uuid AND tenant_id = ${this.tenantId}::uuid
        ORDER BY seq ASC
      `,
    );
  }

  async update(phaseId: string, dto: UpdatePhaseDto): Promise<PhaseRow> {
    const rows = await this.tenantPrisma.run(
      async (tx) =>
        await tx.$queryRaw<PhaseRow[]>`
        UPDATE projects.project_phases SET
          seq           = COALESCE(${dto.seq ?? null}::int, seq),
          name          = COALESCE(${dto.name ?? null}, name),
          status        = COALESCE(${dto.status ?? null}, status),
          planned_start = COALESCE(${dto.planned_start ?? null}::date, planned_start),
          planned_end   = COALESCE(${dto.planned_end ?? null}::date, planned_end),
          actual_start  = COALESCE(${dto.actual_start ?? null}::date, actual_start),
          actual_end    = COALESCE(${dto.actual_end ?? null}::date, actual_end),
          updated_at    = now()
        WHERE phase_id = ${phaseId}::uuid AND tenant_id = ${this.tenantId}::uuid
        RETURNING *
      `,
    );
    return rows[0]!;
  }
}
