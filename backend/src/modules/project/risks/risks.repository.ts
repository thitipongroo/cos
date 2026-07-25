// Project Risk Repository — ADR-065 (risk register). All DB access via TenantPrismaService
// (SET LOCAL app.current_tenant_id per request — ADR-008). Parameterized $queryRaw only (QM-4).

import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { TenantPrismaService } from '../../tenant/prisma/tenant-prisma.service';
import type { CreateRiskDto } from './dto/create-risk.dto';
import type { UpdateRiskDto } from './dto/update-risk.dto';
import { projectExistsInTenant } from '../shared/parent-existence';

export type RiskCategoryValue =
  'SAFETY' | 'FINANCIAL' | 'SCHEDULE' | 'TECHNICAL' | 'EXTERNAL' | 'OTHER';
export type RiskStatusValue = 'OPEN' | 'MITIGATING' | 'CLOSED' | 'ACCEPTED';
export type RiskSourceValue = 'MANUAL' | 'AI_SUGGESTED';

export interface RiskRow {
  risk_id: string;
  project_id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  category: RiskCategoryValue;
  likelihood: number;
  impact: number;
  risk_score: number; // GENERATED likelihood * impact
  mitigation: string | null;
  owner: string | null;
  status: RiskStatusValue;
  source: RiskSourceValue;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface ListRisksFilter {
  status?: string;
  category?: string;
}

@Injectable({ scope: Scope.REQUEST })
export class RisksRepository {
  private get tenantId(): string {
    return (this.request as { tenantId?: string }).tenantId ?? '';
  }

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    @Inject(REQUEST) private readonly request: Request & { tenantId?: string },
  ) {}

  // Parent existence check (tenant-scoped) — a risk must belong to a project in this tenant.
  async projectExists(projectId: string): Promise<boolean> {
    return projectExistsInTenant(this.tenantPrisma, projectId, this.tenantId);
  }

  // `source` defaults to MANUAL (the API path); the AI feed passes 'AI_SUGGESTED' (ADR-065).
  async create(
    projectId: string,
    dto: CreateRiskDto,
    createdBy: string,
    source: RiskSourceValue = 'MANUAL',
  ): Promise<RiskRow> {
    const rows = await this.tenantPrisma.run(
      async (tx) =>
        await tx.$queryRaw<RiskRow[]>`
        INSERT INTO projects.project_risk (
          project_id, tenant_id, title, description, category,
          likelihood, impact, mitigation, owner, source, created_by
        ) VALUES (
          ${projectId}::uuid, ${this.tenantId}::uuid, ${dto.title}, ${dto.description ?? null},
          ${dto.category}, ${dto.likelihood}::smallint, ${dto.impact}::smallint,
          ${dto.mitigation ?? null}, ${dto.owner ?? null}::uuid, ${source}, ${createdBy}::uuid
        )
        RETURNING *
      `,
    );
    return rows[0]!;
  }

  async findById(riskId: string): Promise<RiskRow | null> {
    const rows = await this.tenantPrisma.run(
      async (tx) =>
        await tx.$queryRaw<RiskRow[]>`
        SELECT * FROM projects.project_risk
        WHERE risk_id = ${riskId}::uuid AND tenant_id = ${this.tenantId}::uuid
      `,
    );
    return rows[0] ?? null;
  }

  // Highest-risk first (risk_score DESC) then newest — the order the register/heat map reads.
  // Bounded per project, so the whole filtered set is returned (no pagination).
  async list(projectId: string, filter: ListRisksFilter): Promise<RiskRow[]> {
    return this.tenantPrisma.run(async (tx): Promise<RiskRow[]> => {
      if (filter.status && filter.category) {
        return await tx.$queryRaw<RiskRow[]>`
          SELECT * FROM projects.project_risk
          WHERE tenant_id = ${this.tenantId}::uuid AND project_id = ${projectId}::uuid
            AND status = ${filter.status} AND category = ${filter.category}
          ORDER BY risk_score DESC, created_at DESC
        `;
      }
      if (filter.status) {
        return await tx.$queryRaw<RiskRow[]>`
          SELECT * FROM projects.project_risk
          WHERE tenant_id = ${this.tenantId}::uuid AND project_id = ${projectId}::uuid
            AND status = ${filter.status}
          ORDER BY risk_score DESC, created_at DESC
        `;
      }
      if (filter.category) {
        return await tx.$queryRaw<RiskRow[]>`
          SELECT * FROM projects.project_risk
          WHERE tenant_id = ${this.tenantId}::uuid AND project_id = ${projectId}::uuid
            AND category = ${filter.category}
          ORDER BY risk_score DESC, created_at DESC
        `;
      }
      return await tx.$queryRaw<RiskRow[]>`
        SELECT * FROM projects.project_risk
        WHERE tenant_id = ${this.tenantId}::uuid AND project_id = ${projectId}::uuid
        ORDER BY risk_score DESC, created_at DESC
      `;
    });
  }

  async update(riskId: string, dto: UpdateRiskDto): Promise<RiskRow> {
    const rows = await this.tenantPrisma.run(
      async (tx) =>
        await tx.$queryRaw<RiskRow[]>`
        UPDATE projects.project_risk SET
          title       = COALESCE(${dto.title ?? null}, title),
          description = COALESCE(${dto.description ?? null}, description),
          category    = COALESCE(${dto.category ?? null}, category),
          likelihood  = COALESCE(${dto.likelihood ?? null}::smallint, likelihood),
          impact      = COALESCE(${dto.impact ?? null}::smallint, impact),
          mitigation  = COALESCE(${dto.mitigation ?? null}, mitigation),
          owner       = COALESCE(${dto.owner ?? null}::uuid, owner),
          updated_at  = now()
        WHERE risk_id = ${riskId}::uuid AND tenant_id = ${this.tenantId}::uuid
        RETURNING *
      `,
    );
    return rows[0]!;
  }

  async updateStatus(riskId: string, status: string): Promise<RiskRow> {
    const rows = await this.tenantPrisma.run(
      async (tx) =>
        await tx.$queryRaw<RiskRow[]>`
        UPDATE projects.project_risk SET status = ${status}, updated_at = now()
        WHERE risk_id = ${riskId}::uuid AND tenant_id = ${this.tenantId}::uuid
        RETURNING *
      `,
    );
    return rows[0]!;
  }
}
