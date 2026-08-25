// Master Data Service — Priority 0 Section D
// TENANT_ADMIN manages master data (materials, work categories, issue categories, cost categories).
// All roles can read master data (needed by field workers for dropdown selection).

import { Injectable, Scope, Inject, NotFoundException, ConflictException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { createLogger } from '@cos/logger';
import { clsUserId } from '../../shared/context/cls-context';
import { MasterDataRepository } from './master-data.repository';
import type {
  MaterialRow,
  WorkCategoryRow,
  IssueCategoryRow,
  CostCategoryRow,
} from './master-data.repository';
import type { CreateMaterialDto } from './dto/create-material.dto';
import type { UpdateMaterialDto } from './dto/update-material.dto';
import type { CreateWorkCategoryDto } from './dto/create-work-category.dto';
import type { UpdateWorkCategoryDto } from './dto/update-work-category.dto';
import type { CreateIssueCategoryDto } from './dto/create-issue-category.dto';
import type { CreateCostCategoryDto } from './dto/create-cost-category.dto';

interface IncomingRequest {
  userId?: string;
}

const logger = createLogger('master-data-service');

@Injectable({ scope: Scope.REQUEST })
export class MasterDataService {
  // Resolve user_id lazily via req.userId (TenantContextInterceptor) with a CLS fallback: under
  // @nestjs/platform-fastify req.userId does not reliably reach a Scope.REQUEST provider's injected
  // REQUEST, so fall back to CLS (set by JwtAuthGuard). The old `user.user_id` was always undefined
  // here → '' written into uuid columns → Postgres 22P02. (Matches workforce.)
  private get userId(): string {
    return (this.request as IncomingRequest).userId || clsUserId();
  }

  constructor(
    private readonly repo: MasterDataRepository,
    @Inject(REQUEST) private readonly request: IncomingRequest,
  ) {}

  // ── Materials ─────────────────────────────────────────────────────────────

  async listMaterials(): Promise<MaterialRow[]> {
    return this.repo.listMaterials();
  }

  async createMaterial(dto: CreateMaterialDto): Promise<MaterialRow> {
    try {
      const row = await this.repo.createMaterial(dto, this.userId);
      logger.info({ material_id: row.material_id, name: row.name }, 'material.created');
      return row;
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(`Material name '${dto.name}' already exists in this tenant`);
      }
      throw err;
    }
  }

  async updateMaterial(id: string, dto: UpdateMaterialDto): Promise<MaterialRow> {
    try {
      const row = await this.repo.updateMaterial(id, dto);
      if (!row) throw new NotFoundException(`Material ${id} not found`);
      logger.info({ material_id: id }, 'material.updated');
      return row;
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(`Material name '${dto.name}' already exists in this tenant`);
      }
      throw err;
    }
  }

  async deleteMaterial(id: string): Promise<void> {
    const deleted = await this.repo.deleteMaterial(id);
    if (!deleted) throw new NotFoundException(`Material ${id} not found or already inactive`);
    logger.info({ material_id: id }, 'material.deleted');
  }

  // ── Work Categories ───────────────────────────────────────────────────────

  async listWorkCategories(): Promise<WorkCategoryRow[]> {
    return this.repo.listWorkCategories();
  }

  async createWorkCategory(dto: CreateWorkCategoryDto): Promise<WorkCategoryRow> {
    try {
      const row = await this.repo.createWorkCategory(dto, this.userId);
      logger.info(
        { work_category_id: row.work_category_id, code: row.code },
        'work_category.created',
      );
      return row;
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          `Work category code '${dto.code}' already exists in this tenant`,
        );
      }
      throw err;
    }
  }

  async updateWorkCategory(id: string, dto: UpdateWorkCategoryDto): Promise<WorkCategoryRow> {
    const row = await this.repo.updateWorkCategory(id, dto);
    if (!row) throw new NotFoundException(`Work category ${id} not found`);
    logger.info({ work_category_id: id }, 'work_category.updated');
    return row;
  }

  // ── Issue Categories ──────────────────────────────────────────────────────

  async listIssueCategories(): Promise<IssueCategoryRow[]> {
    return this.repo.listIssueCategories();
  }

  async createIssueCategory(dto: CreateIssueCategoryDto): Promise<IssueCategoryRow> {
    try {
      const row = await this.repo.createIssueCategory(dto, this.userId);
      logger.info(
        { issue_category_id: row.issue_category_id, name: row.name },
        'issue_category.created',
      );
      return row;
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(`Issue category '${dto.name}' already exists in this tenant`);
      }
      throw err;
    }
  }

  // ── Cost Categories ───────────────────────────────────────────────────────

  async listCostCategories(): Promise<CostCategoryRow[]> {
    return this.repo.listCostCategories();
  }

  async createCostCategory(dto: CreateCostCategoryDto): Promise<CostCategoryRow> {
    try {
      const row = await this.repo.createCostCategory(dto, this.userId);
      logger.info(
        { cost_category_id: row.cost_category_id, name: row.name },
        'cost_category.created',
      );
      return row;
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(`Cost category '${dto.name}' already exists in this tenant`);
      }
      throw err;
    }
  }
}

/**
 * PostgreSQL unique_violation (SQLSTATE 23505).
 *
 * Checked in three places because the SQLSTATE sits somewhere different depending on how the query
 * ran. This repository issues every write through `tx.$queryRaw`, and Prisma 7 on a driver adapter
 * reports a failed raw query as PrismaClientKnownRequestError with `code: 'P2010'`, burying the
 * driver's own code at `meta.driverAdapterError.cause.originalCode`:
 *   {"code":"P2010","meta":{"driverAdapterError":{"cause":{"originalCode":"23505",
 *    "kind":"UniqueConstraintViolation", ...}}}}
 * VERIFIED against a live error, not inferred.
 *
 * The previous version tested only the top-level `code`, which a raw query never carries — so every
 * catch site below was dead and a duplicate name answered 500 instead of 409. The unit tests did not
 * notice because they fabricated `err.code = '23505'`, a shape this path cannot produce.
 */
function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as {
    code?: unknown;
    meta?: {
      code?: unknown;
      driverAdapterError?: { cause?: { originalCode?: unknown; kind?: unknown } };
    };
  };
  const cause = e.meta?.driverAdapterError?.cause;
  return (
    e.code === '23505' ||
    e.meta?.code === '23505' ||
    cause?.originalCode === '23505' ||
    cause?.kind === 'UniqueConstraintViolation'
  );
}
