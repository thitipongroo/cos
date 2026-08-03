// Master Data Repository
// All DB access via TenantPrismaService (SET LOCAL app.current_tenant_id per request — ADR-008).
// Uses $queryRaw (parameterized tagged template) — never raw string interpolation.

import { Injectable, Scope } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/prisma/tenant-prisma.service';
import { applyCap, capLimit } from '../../shared/pagination/list-cap';
import type { CreateMaterialDto } from './dto/create-material.dto';
import type { UpdateMaterialDto } from './dto/update-material.dto';
import type { CreateWorkCategoryDto } from './dto/create-work-category.dto';
import type { UpdateWorkCategoryDto } from './dto/update-work-category.dto';
import type { CreateIssueCategoryDto } from './dto/create-issue-category.dto';
import type { CreateCostCategoryDto } from './dto/create-cost-category.dto';

// ── Row types ──────────────────────────────────────────────────────────────

export interface MaterialRow {
  material_id: string;
  tenant_id: string;
  name: string;
  category: string;
  unit: string;
  is_active: boolean;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface WorkCategoryRow {
  work_category_id: string;
  tenant_id: string;
  name: string;
  code: string;
  phase: string | null;
  is_active: boolean;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface IssueCategoryRow {
  issue_category_id: string;
  tenant_id: string;
  name: string;
  severity_default: string;
  is_active: boolean;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface CostCategoryRow {
  cost_category_id: string;
  tenant_id: string;
  name: string;
  type: string;
  is_active: boolean;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

// ── Repository ─────────────────────────────────────────────────────────────

@Injectable({ scope: Scope.REQUEST })
export class MasterDataRepository {
  constructor(private readonly db: TenantPrismaService) {}

  // ── Materials ────────────────────────────────────────────────────────────

  async listMaterials(): Promise<MaterialRow[]> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<MaterialRow[]>`
        SELECT material_id, tenant_id, name, category, unit, is_active, created_by, created_at, updated_at
        FROM procurement.materials
        WHERE is_active = true
        ORDER BY name
        LIMIT ${capLimit()}
      `,
    );
    return applyCap(rows, 'master-data.materials');
  }

  async createMaterial(dto: CreateMaterialDto, createdBy: string): Promise<MaterialRow> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<MaterialRow[]>`
        INSERT INTO procurement.materials (tenant_id, name, category, unit, created_by)
        VALUES (
          current_setting('app.current_tenant_id')::uuid,
          ${dto.name},
          ${dto.category}::"MaterialCategory",
          ${dto.unit}::"MaterialUnit",
          ${createdBy}::uuid
        )
        RETURNING material_id, tenant_id, name, category, unit, is_active, created_by, created_at, updated_at
      `,
    );
    return rows[0]!;
  }

  async updateMaterial(id: string, dto: UpdateMaterialDto): Promise<MaterialRow | null> {
    const sets: string[] = [];
    const values: unknown[] = [];

    if (dto.name !== undefined) {
      sets.push(`name = $${sets.length + 2}`);
      values.push(dto.name);
    }
    if (dto.category !== undefined) {
      sets.push(`category = $${sets.length + 2}::"MaterialCategory"`);
      values.push(dto.category);
    }
    if (dto.unit !== undefined) {
      sets.push(`unit = $${sets.length + 2}::"MaterialUnit"`);
      values.push(dto.unit);
    }
    if (dto.is_active !== undefined) {
      sets.push(`is_active = $${sets.length + 2}`);
      values.push(dto.is_active);
    }

    if (sets.length === 0) return this.getMaterialById(id);

    sets.push(`updated_at = now()`);
    const sql = `
      UPDATE procurement.materials
      SET ${sets.join(', ')}
      WHERE material_id = $1::uuid
      RETURNING material_id, tenant_id, name, category, unit, is_active, created_by, created_at, updated_at
    `;
    const rows = await this.db.run((tx) => tx.$queryRawUnsafe<MaterialRow[]>(sql, id, ...values));
    return rows[0] ?? null;
  }

  async getMaterialById(id: string): Promise<MaterialRow | null> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<MaterialRow[]>`
        SELECT material_id, tenant_id, name, category, unit, is_active, created_by, created_at, updated_at
        FROM procurement.materials
        WHERE material_id = ${id}::uuid
      `,
    );
    return rows[0] ?? null;
  }

  async deleteMaterial(id: string): Promise<boolean> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<Array<{ material_id: string }>>`
        UPDATE procurement.materials
        SET is_active = false, updated_at = now()
        WHERE material_id = ${id}::uuid AND is_active = true
        RETURNING material_id
      `,
    );
    return rows.length > 0;
  }

  // ── Work Categories ──────────────────────────────────────────────────────

  async listWorkCategories(): Promise<WorkCategoryRow[]> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<WorkCategoryRow[]>`
        SELECT work_category_id, tenant_id, name, code, phase, is_active, created_by, created_at, updated_at
        FROM site_ops.work_categories
        WHERE is_active = true
        ORDER BY name
        LIMIT ${capLimit()}
      `,
    );
    return applyCap(rows, 'master-data.work_categories');
  }

  async createWorkCategory(
    dto: CreateWorkCategoryDto,
    createdBy: string,
  ): Promise<WorkCategoryRow> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<WorkCategoryRow[]>`
        INSERT INTO site_ops.work_categories (tenant_id, name, code, phase, created_by)
        VALUES (
          current_setting('app.current_tenant_id')::uuid,
          ${dto.name},
          ${dto.code},
          ${dto.phase ?? null},
          ${createdBy}::uuid
        )
        RETURNING work_category_id, tenant_id, name, code, phase, is_active, created_by, created_at, updated_at
      `,
    );
    return rows[0]!;
  }

  async updateWorkCategory(
    id: string,
    dto: UpdateWorkCategoryDto,
  ): Promise<WorkCategoryRow | null> {
    const sets: string[] = [];
    const values: unknown[] = [];

    if (dto.name !== undefined) {
      sets.push(`name = $${sets.length + 2}`);
      values.push(dto.name);
    }
    if (dto.phase !== undefined) {
      sets.push(`phase = $${sets.length + 2}`);
      values.push(dto.phase);
    }
    if (dto.is_active !== undefined) {
      sets.push(`is_active = $${sets.length + 2}`);
      values.push(dto.is_active);
    }

    if (sets.length === 0) return this.getWorkCategoryById(id);

    sets.push(`updated_at = now()`);
    const sql = `
      UPDATE site_ops.work_categories
      SET ${sets.join(', ')}
      WHERE work_category_id = $1::uuid
      RETURNING work_category_id, tenant_id, name, code, phase, is_active, created_by, created_at, updated_at
    `;
    const rows = await this.db.run((tx) =>
      tx.$queryRawUnsafe<WorkCategoryRow[]>(sql, id, ...values),
    );
    return rows[0] ?? null;
  }

  async getWorkCategoryById(id: string): Promise<WorkCategoryRow | null> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<WorkCategoryRow[]>`
        SELECT work_category_id, tenant_id, name, code, phase, is_active, created_by, created_at, updated_at
        FROM site_ops.work_categories
        WHERE work_category_id = ${id}::uuid
      `,
    );
    return rows[0] ?? null;
  }

  // ── Issue Categories ─────────────────────────────────────────────────────

  async listIssueCategories(): Promise<IssueCategoryRow[]> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<IssueCategoryRow[]>`
        SELECT issue_category_id, tenant_id, name, severity_default, is_active, created_by, created_at, updated_at
        FROM site_ops.issue_categories
        WHERE is_active = true
        ORDER BY name
        LIMIT ${capLimit()}
      `,
    );
    return applyCap(rows, 'master-data.issue_categories');
  }

  async createIssueCategory(
    dto: CreateIssueCategoryDto,
    createdBy: string,
  ): Promise<IssueCategoryRow> {
    const severity = dto.severity_default ?? 'MEDIUM';
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<IssueCategoryRow[]>`
        INSERT INTO site_ops.issue_categories (tenant_id, name, severity_default, created_by)
        VALUES (
          current_setting('app.current_tenant_id')::uuid,
          ${dto.name},
          ${severity}::"IssueSeverityDefault",
          ${createdBy}::uuid
        )
        RETURNING issue_category_id, tenant_id, name, severity_default, is_active, created_by, created_at, updated_at
      `,
    );
    return rows[0]!;
  }

  // ── Cost Categories ──────────────────────────────────────────────────────

  async listCostCategories(): Promise<CostCategoryRow[]> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<CostCategoryRow[]>`
        SELECT cost_category_id, tenant_id, name, type, is_active, created_by, created_at, updated_at
        FROM finance.cost_categories
        WHERE is_active = true
        ORDER BY name
        LIMIT ${capLimit()}
      `,
    );
    return applyCap(rows, 'master-data.cost_categories');
  }

  async createCostCategory(
    dto: CreateCostCategoryDto,
    createdBy: string,
  ): Promise<CostCategoryRow> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<CostCategoryRow[]>`
        INSERT INTO finance.cost_categories (tenant_id, name, type, created_by)
        VALUES (
          current_setting('app.current_tenant_id')::uuid,
          ${dto.name},
          ${dto.type}::"CostCategoryType",
          ${createdBy}::uuid
        )
        RETURNING cost_category_id, tenant_id, name, type, is_active, created_by, created_at, updated_at
      `,
    );
    return rows[0]!;
  }
}
