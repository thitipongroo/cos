// BOQ Repository — Phase 4
// All DB access via TenantPrismaService (SET LOCAL app.current_tenant_id per request — ADR-008).
// Uses $queryRaw (parameterized tagged template) — never raw string interpolation.
// Financial fields stored as DECIMAL(19,4); returned as string by Prisma for precision.

import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { TenantPrismaService } from '../tenant/prisma/tenant-prisma.service';

export interface BoqVersionRow {
  version_id: string;
  project_id: string;
  tenant_id: string;
  version_number: number;
  version_name: string | null;
  status: 'DRAFT' | 'APPROVED' | 'SUPERSEDED';
  total_estimated_amount: string;
  total_estimated_currency: string;
  approved_by: string | null;
  approved_at: Date | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface BoqCategoryRow {
  category_id: string;
  version_id: string;
  tenant_id: string;
  parent_category_id: string | null;
  category_code: string;
  category_name: string;
  sort_order: number;
  subtotal_amount: string;
}

export interface BoqItemRow {
  item_id: string;
  category_id: string;
  version_id: string;
  tenant_id: string;
  item_code: string | null;
  description: string;
  unit: string;
  quantity: string;
  unit_cost: string;
  estimated_total: string;
  currency_code: string;
  sort_order: number;
  carbon_factor_kg_co2e: string | null;
  carbon_total_kg_co2e: string | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable({ scope: Scope.REQUEST })
export class BoqRepository {
  private get tenantId(): string {
    return (this.request as { tenantId?: string }).tenantId ?? '';
  }

  constructor(
    private readonly db: TenantPrismaService,
    @Inject(REQUEST) private readonly request: Request & { tenantId?: string },
  ) {}

  // ── Versions ──────────────────────────────────────────────────────────────

  async createVersion(params: {
    project_id: string;
    version_number: number;
    version_name: string | null;
    currency_code: string;
    created_by: string;
  }): Promise<BoqVersionRow> {
    const rows = await this.db.run(async (prisma) => {
      return prisma.$queryRaw<BoqVersionRow[]>`
        INSERT INTO boq.boq_versions (
          project_id, tenant_id, version_number, version_name,
          total_estimated_currency, created_by
        )
        VALUES (
          ${params.project_id}::uuid, ${this.tenantId}::uuid,
          ${params.version_number}, ${params.version_name},
          ${params.currency_code}, ${params.created_by}::uuid
        )
        RETURNING *
      `;
    });
    return rows[0]!;
  }

  async findVersionsByProject(project_id: string): Promise<BoqVersionRow[]> {
    return this.db.run(async (prisma) => {
      return prisma.$queryRaw<BoqVersionRow[]>`
        SELECT * FROM boq.boq_versions
        WHERE project_id = ${project_id}::uuid
          AND tenant_id  = ${this.tenantId}::uuid
        ORDER BY version_number ASC
      `;
    });
  }

  async findVersionById(version_id: string): Promise<BoqVersionRow | null> {
    const rows = await this.db.run(async (prisma) => {
      return prisma.$queryRaw<BoqVersionRow[]>`
        SELECT * FROM boq.boq_versions
        WHERE version_id = ${version_id}::uuid
          AND tenant_id  = ${this.tenantId}::uuid
      `;
    });
    return rows[0] ?? null;
  }

  async findDraftVersion(project_id: string): Promise<BoqVersionRow | null> {
    const rows = await this.db.run(async (prisma) => {
      return prisma.$queryRaw<BoqVersionRow[]>`
        SELECT * FROM boq.boq_versions
        WHERE project_id = ${project_id}::uuid
          AND tenant_id  = ${this.tenantId}::uuid
          AND status     = 'DRAFT'
        LIMIT 1
      `;
    });
    return rows[0] ?? null;
  }

  async findLatestApprovedVersion(project_id: string): Promise<BoqVersionRow | null> {
    const rows = await this.db.run(async (prisma) => {
      return prisma.$queryRaw<BoqVersionRow[]>`
        SELECT * FROM boq.boq_versions
        WHERE project_id = ${project_id}::uuid
          AND tenant_id  = ${this.tenantId}::uuid
          AND status     = 'APPROVED'
        ORDER BY version_number DESC
        LIMIT 1
      `;
    });
    return rows[0] ?? null;
  }

  async findMaxVersionNumber(project_id: string): Promise<number> {
    const rows = await this.db.run(async (prisma) => {
      return prisma.$queryRaw<[{ max: number | null }]>`
        SELECT MAX(version_number) AS max FROM boq.boq_versions
        WHERE project_id = ${project_id}::uuid
          AND tenant_id  = ${this.tenantId}::uuid
      `;
    });
    return rows[0]?.max ?? 0;
  }

  async approveVersion(params: {
    version_id: string;
    approved_by: string;
    new_total: string;
  }): Promise<void> {
    await this.db.run(async (prisma) => {
      // Supersede previous APPROVED version
      await prisma.$executeRaw`
        UPDATE boq.boq_versions
        SET status = 'SUPERSEDED', updated_at = now()
        WHERE project_id = (
          SELECT project_id FROM boq.boq_versions WHERE version_id = ${params.version_id}::uuid
        )
          AND tenant_id = ${this.tenantId}::uuid
          AND status    = 'APPROVED'
      `;
      // Approve the target version
      await prisma.$executeRaw`
        UPDATE boq.boq_versions
        SET status                   = 'APPROVED',
            approved_by              = ${params.approved_by}::uuid,
            approved_at              = now(),
            total_estimated_amount   = ${params.new_total}::decimal,
            updated_at               = now()
        WHERE version_id = ${params.version_id}::uuid
          AND tenant_id  = ${this.tenantId}::uuid
      `;
    });
  }

  async updateVersionTotal(version_id: string, total: string): Promise<void> {
    await this.db.run(async (prisma) => {
      await prisma.$executeRaw`
        UPDATE boq.boq_versions
        SET total_estimated_amount = ${total}::decimal, updated_at = now()
        WHERE version_id = ${version_id}::uuid
          AND tenant_id  = ${this.tenantId}::uuid
      `;
    });
  }

  // ── Categories ────────────────────────────────────────────────────────────

  async addCategory(params: {
    version_id: string;
    parent_category_id: string | null;
    category_code: string;
    category_name: string;
    sort_order: number;
  }): Promise<BoqCategoryRow> {
    const rows = await this.db.run(async (prisma) => {
      return prisma.$queryRaw<BoqCategoryRow[]>`
        INSERT INTO boq.boq_categories (
          version_id, tenant_id, parent_category_id,
          category_code, category_name, sort_order
        )
        VALUES (
          ${params.version_id}::uuid, ${this.tenantId}::uuid,
          ${params.parent_category_id ? `${params.parent_category_id}::uuid` : null},
          ${params.category_code}, ${params.category_name}, ${params.sort_order}
        )
        RETURNING *
      `;
    });
    return rows[0]!;
  }

  async findCategoriesByVersion(version_id: string): Promise<BoqCategoryRow[]> {
    return this.db.run(async (prisma) => {
      return prisma.$queryRaw<BoqCategoryRow[]>`
        SELECT * FROM boq.boq_categories
        WHERE version_id = ${version_id}::uuid
          AND tenant_id  = ${this.tenantId}::uuid
        ORDER BY sort_order ASC, category_code ASC
      `;
    });
  }

  async updateCategorySubtotal(category_id: string, subtotal: string): Promise<void> {
    await this.db.run(async (prisma) => {
      await prisma.$executeRaw`
        UPDATE boq.boq_categories
        SET subtotal_amount = ${subtotal}::decimal
        WHERE category_id = ${category_id}::uuid
          AND tenant_id   = ${this.tenantId}::uuid
      `;
    });
  }

  // ── Items ─────────────────────────────────────────────────────────────────

  async addItem(params: {
    category_id: string;
    version_id: string;
    item_code: string | null;
    description: string;
    unit: string;
    quantity: string;
    unit_cost: string;
    estimated_total: string;
    currency_code: string;
    sort_order: number;
  }): Promise<BoqItemRow> {
    const rows = await this.db.run(async (prisma) => {
      return prisma.$queryRaw<BoqItemRow[]>`
        INSERT INTO boq.boq_items (
          category_id, version_id, tenant_id,
          item_code, description, unit,
          quantity, unit_cost, estimated_total, currency_code, sort_order
        )
        VALUES (
          ${params.category_id}::uuid, ${params.version_id}::uuid, ${this.tenantId}::uuid,
          ${params.item_code}, ${params.description}, ${params.unit},
          ${params.quantity}::decimal, ${params.unit_cost}::decimal,
          ${params.estimated_total}::decimal, ${params.currency_code}, ${params.sort_order}
        )
        RETURNING *
      `;
    });
    return rows[0]!;
  }

  async updateItem(params: {
    item_id: string;
    description?: string;
    unit?: string;
    quantity?: string;
    unit_cost?: string;
    estimated_total?: string;
    sort_order?: number;
  }): Promise<BoqItemRow> {
    const rows = await this.db.run(async (prisma) => {
      return prisma.$queryRaw<BoqItemRow[]>`
        UPDATE boq.boq_items
        SET
          description     = COALESCE(${params.description ?? null}, description),
          unit            = COALESCE(${params.unit ?? null}, unit),
          quantity        = COALESCE(${params.quantity ? `${params.quantity}::decimal` : null}::decimal, quantity),
          unit_cost       = COALESCE(${params.unit_cost ? `${params.unit_cost}::decimal` : null}::decimal, unit_cost),
          estimated_total = COALESCE(${params.estimated_total ? `${params.estimated_total}::decimal` : null}::decimal, estimated_total),
          sort_order      = COALESCE(${params.sort_order ?? null}, sort_order),
          updated_at      = now()
        WHERE item_id   = ${params.item_id}::uuid
          AND tenant_id = ${this.tenantId}::uuid
        RETURNING *
      `;
    });
    return rows[0]!;
  }

  async deleteItem(item_id: string): Promise<void> {
    await this.db.run(async (prisma) => {
      await prisma.$executeRaw`
        DELETE FROM boq.boq_items
        WHERE item_id   = ${item_id}::uuid
          AND tenant_id = ${this.tenantId}::uuid
      `;
    });
  }

  async findItemsByVersion(version_id: string): Promise<BoqItemRow[]> {
    return this.db.run(async (prisma) => {
      return prisma.$queryRaw<BoqItemRow[]>`
        SELECT * FROM boq.boq_items
        WHERE version_id = ${version_id}::uuid
          AND tenant_id  = ${this.tenantId}::uuid
        ORDER BY sort_order ASC
      `;
    });
  }

  async findItemById(item_id: string): Promise<BoqItemRow | null> {
    const rows = await this.db.run(async (prisma) => {
      return prisma.$queryRaw<BoqItemRow[]>`
        SELECT * FROM boq.boq_items
        WHERE item_id   = ${item_id}::uuid
          AND tenant_id = ${this.tenantId}::uuid
      `;
    });
    return rows[0] ?? null;
  }

  async findItemsByCategoryIds(category_ids: string[]): Promise<BoqItemRow[]> {
    if (category_ids.length === 0) return [];
    return this.db.run(async (prisma) => {
      return prisma.$queryRaw<BoqItemRow[]>`
        SELECT * FROM boq.boq_items
        WHERE category_id = ANY(${category_ids}::uuid[])
          AND tenant_id   = ${this.tenantId}::uuid
      `;
    });
  }

  /** Copy all categories and items from source version to target version. */
  async copyVersionContents(from_version_id: string, to_version_id: string): Promise<void> {
    await this.db.run(async (prisma) => {
      // Copy root categories first (parent_category_id IS NULL)
      await prisma.$executeRaw`
        INSERT INTO boq.boq_categories (
          version_id, tenant_id, parent_category_id,
          category_code, category_name, sort_order, subtotal_amount
        )
        SELECT ${to_version_id}::uuid, tenant_id, NULL,
               category_code, category_name, sort_order, subtotal_amount
        FROM boq.boq_categories
        WHERE version_id          = ${from_version_id}::uuid
          AND tenant_id           = ${this.tenantId}::uuid
          AND parent_category_id IS NULL
      `;
      // Copy child categories (simple 1-level hierarchy copy)
      await prisma.$executeRaw`
        INSERT INTO boq.boq_categories (
          version_id, tenant_id, parent_category_id,
          category_code, category_name, sort_order, subtotal_amount
        )
        SELECT ${to_version_id}::uuid, child.tenant_id,
               new_parent.category_id,
               child.category_code, child.category_name,
               child.sort_order, child.subtotal_amount
        FROM boq.boq_categories child
        JOIN boq.boq_categories old_parent
          ON child.parent_category_id = old_parent.category_id
        JOIN boq.boq_categories new_parent
          ON new_parent.version_id  = ${to_version_id}::uuid
         AND new_parent.category_code = old_parent.category_code
        WHERE child.version_id = ${from_version_id}::uuid
          AND child.tenant_id  = ${this.tenantId}::uuid
          AND child.parent_category_id IS NOT NULL
      `;
      // Copy items
      await prisma.$executeRaw`
        INSERT INTO boq.boq_items (
          category_id, version_id, tenant_id,
          item_code, description, unit,
          quantity, unit_cost, estimated_total, currency_code,
          sort_order, carbon_factor_kg_co2e, carbon_total_kg_co2e
        )
        SELECT new_cat.category_id, ${to_version_id}::uuid, i.tenant_id,
               i.item_code, i.description, i.unit,
               i.quantity, i.unit_cost, i.estimated_total, i.currency_code,
               i.sort_order, i.carbon_factor_kg_co2e, i.carbon_total_kg_co2e
        FROM boq.boq_items i
        JOIN boq.boq_categories old_cat ON i.category_id = old_cat.category_id
        JOIN boq.boq_categories new_cat
          ON new_cat.version_id   = ${to_version_id}::uuid
         AND new_cat.category_code = old_cat.category_code
        WHERE i.version_id = ${from_version_id}::uuid
          AND i.tenant_id  = ${this.tenantId}::uuid
      `;
    });
  }
}
