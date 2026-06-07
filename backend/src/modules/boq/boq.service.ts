// BOQ Service — Phase 4
// Business logic: versioning, calculation, approval.
// Financial precision: decimal.js ROUND_HALF_UP throughout (spec §FINANCIAL PRECISION SPEC).
// Emits typed Kafka events via @cos/shared KafkaProducer (QM-8).

import {
  Injectable,
  Scope,
  Inject,
  NotFoundException,
  UnprocessableEntityException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { randomUUID } from 'crypto';
import { Decimal, calculateLineTotal, sumDecimals } from '@cos/financial';
import { KafkaProducer } from '@cos/shared';
import { createLogger } from '@cos/logger';
import { BoqRepository } from './boq.repository';
import type { BoqVersionRow, BoqCategoryRow, BoqItemRow } from './boq.repository';
import type { CreateBoqVersionDto } from './dto/create-boq-version.dto';
import type { AddBoqCategoryDto } from './dto/add-boq-category.dto';
import type { AddBoqItemDto } from './dto/add-boq-item.dto';
import type { UpdateBoqItemDto } from './dto/update-boq-item.dto';

const logger = createLogger('boq-service');

@Injectable({ scope: Scope.REQUEST })
export class BoqService {
  private readonly tenantId: string;
  private readonly userId: string;
  private readonly correlationId: string;
  private readonly kafka: KafkaProducer;

  constructor(
    private readonly repo: BoqRepository,
    @Inject(REQUEST)
    request: Request & {
      tenantId?: string;
      user?: { user_id?: string; role?: string };
    },
  ) {
    this.tenantId = request.tenantId ?? '';
    this.userId = request.user?.user_id ?? '';
    this.correlationId = randomUUID();
    this.kafka = new KafkaProducer();
  }

  // ── Version Operations ────────────────────────────────────────────────────

  async createVersion(project_id: string, dto: CreateBoqVersionDto): Promise<BoqVersionRow> {
    // Enforce: only one DRAFT per project
    const existingDraft = await this.repo.findDraftVersion(project_id);
    if (existingDraft) {
      throw new ConflictException(
        `Project ${project_id} already has a DRAFT BOQ version (${existingDraft.version_id}). Approve or delete it first.`,
      );
    }

    const maxVersion = await this.repo.findMaxVersionNumber(project_id);
    const newVersionNumber = maxVersion + 1;

    const version = await this.repo.createVersion({
      project_id,
      version_number: newVersionNumber,
      version_name: dto.version_name ?? null,
      currency_code: dto.currency_code,
      created_by: this.userId,
    });

    // If copying from latest approved version
    if (newVersionNumber > 1) {
      const latestApproved = await this.repo.findLatestApprovedVersion(project_id);
      if (latestApproved) {
        await this.repo.copyVersionContents(latestApproved.version_id, version.version_id);
        // Recalculate totals after copy
        await this.recalculateVersionTotal(version.version_id);
      }
    }

    logger.info(
      {
        project_id,
        version_id: version.version_id,
        version_number: version.version_number,
        correlation_id: this.correlationId,
        tenant_id: this.tenantId,
      },
      'boq.version.created',
    );

    await this.publishEvent('construction.boq.version_created.v1', {
      boq_version_id: version.version_id,
      project_id,
      version_number: version.version_number,
      total_estimated: {
        amount: version.total_estimated_amount,
        currency_code: version.total_estimated_currency,
      },
      created_by: this.userId,
    });

    if (newVersionNumber === 1) {
      await this.publishEvent('construction.boq.created.v1', {
        project_id,
        version_id: version.version_id,
        version_number: version.version_number,
      });
    }

    return version;
  }

  async listVersions(project_id: string): Promise<BoqVersionRow[]> {
    return this.repo.findVersionsByProject(project_id);
  }

  async getVersionDetail(
    project_id: string,
    version_id: string,
  ): Promise<{ version: BoqVersionRow; categories: BoqCategoryRow[]; items: BoqItemRow[] }> {
    const version = await this.repo.findVersionById(version_id);
    if (!version || version.project_id !== project_id) {
      throw new NotFoundException(`BOQ version ${version_id} not found for project ${project_id}`);
    }
    const categories = await this.repo.findCategoriesByVersion(version_id);
    const items = await this.repo.findItemsByVersion(version_id);
    return { version, categories, items };
  }

  async approveVersion(project_id: string, version_id: string): Promise<BoqVersionRow> {
    const version = await this.repo.findVersionById(version_id);
    if (!version || version.project_id !== project_id) {
      throw new NotFoundException(`BOQ version ${version_id} not found`);
    }
    if (version.status !== 'DRAFT') {
      throw new UnprocessableEntityException(
        `Only DRAFT versions can be approved. Current status: ${version.status}`,
      );
    }

    // Recalculate final total before approving
    const finalTotal = await this.recalculateVersionTotal(version_id);

    await this.repo.approveVersion({
      version_id,
      approved_by: this.userId,
      new_total: finalTotal,
    });

    const approved = await this.repo.findVersionById(version_id);

    logger.info(
      {
        version_id,
        project_id,
        total: finalTotal,
        actor_id: this.userId,
        tenant_id: this.tenantId,
        correlation_id: this.correlationId,
      },
      'boq.version.approved',
    );

    await this.publishEvent('construction.boq.version_approved.v1', {
      version_id,
      project_id,
      version_number: version.version_number,
      total_estimated_amount: finalTotal,
      total_estimated_currency: version.total_estimated_currency,
      approved_by: this.userId,
    });

    return approved!;
  }

  // ── Category Operations ───────────────────────────────────────────────────

  async addCategory(version_id: string, dto: AddBoqCategoryDto): Promise<BoqCategoryRow> {
    await this.assertDraftVersion(version_id);
    return this.repo.addCategory({
      version_id,
      parent_category_id: dto.parent_category_id ?? null,
      category_code: dto.category_code,
      category_name: dto.category_name,
      sort_order: dto.sort_order ?? 0,
    });
  }

  // ── Item Operations ───────────────────────────────────────────────────────

  async addItem(version_id: string, dto: AddBoqItemDto): Promise<BoqItemRow> {
    await this.assertDraftVersion(version_id);

    const qty = new Decimal(dto.quantity);
    const cost = new Decimal(dto.unit_cost);
    const estimatedTotal = calculateLineTotal(qty, cost);

    const item = await this.repo.addItem({
      category_id: dto.category_id,
      version_id,
      item_code: dto.item_code ?? null,
      description: dto.description,
      unit: dto.unit,
      quantity: qty.toFixed(4),
      unit_cost: cost.toFixed(4),
      estimated_total: estimatedTotal.toFixed(4),
      currency_code: dto.currency_code,
      sort_order: dto.sort_order ?? 0,
    });

    const newTotal = await this.recalculateFromCategory(dto.category_id, version_id);
    await this.publishItemsUpdated(version_id, version_id, 1, newTotal);
    return item;
  }

  async updateItem(item_id: string, dto: UpdateBoqItemDto): Promise<BoqItemRow> {
    const existing = await this.repo.findItemById(item_id);
    if (!existing) throw new NotFoundException(`BOQ item ${item_id} not found`);
    await this.assertDraftVersion(existing.version_id);

    const qty =
      dto.quantity !== undefined ? new Decimal(dto.quantity) : new Decimal(existing.quantity);
    const cost =
      dto.unit_cost !== undefined ? new Decimal(dto.unit_cost) : new Decimal(existing.unit_cost);
    const estimatedTotal = calculateLineTotal(qty, cost);

    const updated = await this.repo.updateItem({
      item_id,
      description: dto.description,
      unit: dto.unit,
      quantity: qty.toFixed(4),
      unit_cost: cost.toFixed(4),
      estimated_total: estimatedTotal.toFixed(4),
      sort_order: dto.sort_order,
    });

    const newTotal = await this.recalculateFromCategory(existing.category_id, existing.version_id);
    await this.publishItemsUpdated(existing.version_id, existing.version_id, 1, newTotal);
    return updated;
  }

  async deleteItem(item_id: string): Promise<void> {
    const existing = await this.repo.findItemById(item_id);
    if (!existing) throw new NotFoundException(`BOQ item ${item_id} not found`);
    await this.assertDraftVersion(existing.version_id);

    await this.repo.deleteItem(item_id);
    const newTotal = await this.recalculateFromCategory(existing.category_id, existing.version_id);
    await this.publishItemsUpdated(existing.version_id, existing.version_id, 1, newTotal);
  }

  // ── Export ────────────────────────────────────────────────────────────────

  async exportVersion(
    project_id: string,
    version_id: string,
  ): Promise<{ version: BoqVersionRow; categories: BoqCategoryRow[]; items: BoqItemRow[] }> {
    return this.getVersionDetail(project_id, version_id);
  }

  // ── Private Helpers ───────────────────────────────────────────────────────

  private async assertDraftVersion(version_id: string): Promise<BoqVersionRow> {
    const version = await this.repo.findVersionById(version_id);
    if (!version) throw new NotFoundException(`BOQ version ${version_id} not found`);
    if (version.status !== 'DRAFT') {
      throw new ForbiddenException(
        `BOQ version ${version_id} is ${version.status} — only DRAFT versions can be modified`,
      );
    }
    return version;
  }

  /**
   * Recalculate category subtotal and version total from a changed category.
   * Returns the new version total as a decimal string.
   */
  private async recalculateFromCategory(category_id: string, version_id: string): Promise<string> {
    const allItems = await this.repo.findItemsByVersion(version_id);
    const categoryItems = allItems.filter((i) => i.category_id === category_id);
    const categorySubtotal = sumDecimals(categoryItems.map((i) => new Decimal(i.estimated_total)));
    await this.repo.updateCategorySubtotal(category_id, categorySubtotal.toFixed(4));
    return this.recalculateVersionTotal(version_id);
  }

  /**
   * Recalculate all category subtotals and version total.
   * Returns the new version total as a decimal string.
   */
  private async recalculateVersionTotal(version_id: string): Promise<string> {
    const allItems = await this.repo.findItemsByVersion(version_id);
    const categories = await this.repo.findCategoriesByVersion(version_id);

    // Update each category subtotal
    for (const cat of categories) {
      const items = allItems.filter((i) => i.category_id === cat.category_id);
      const subtotal = sumDecimals(items.map((i) => new Decimal(i.estimated_total)));
      await this.repo.updateCategorySubtotal(cat.category_id, subtotal.toFixed(4));
    }

    // Sum root-category subtotals for version total
    const rootCategories = categories.filter((c) => !c.parent_category_id);
    const versionTotal = sumDecimals(
      rootCategories.map((c) => {
        const items = allItems.filter((i) => i.category_id === c.category_id);
        return sumDecimals(items.map((i) => new Decimal(i.estimated_total)));
      }),
    );

    const totalStr = versionTotal.toFixed(4);
    await this.repo.updateVersionTotal(version_id, totalStr);
    return totalStr;
  }

  private async publishItemsUpdated(
    version_id: string,
    project_id: string,
    changed_count: number,
    new_total: string,
  ): Promise<void> {
    const version = await this.repo.findVersionById(version_id);
    await this.publishEvent('construction.boq.updated.v1', {
      version_id,
      project_id,
      changed_items_count: changed_count,
      new_total_estimated_amount: new_total,
      new_total_estimated_currency: version?.total_estimated_currency ?? 'THB',
    });
  }

  private async publishEvent<T>(eventType: string, payload: T): Promise<void> {
    try {
      await this.kafka.connect();
      await this.kafka.publish({
        event_type: eventType,
        event_version: '1.0',
        tenant_id: this.tenantId,
        actor_id: this.userId,
        occurred_at: new Date().toISOString(),
        correlation_id: this.correlationId,
        payload,
      });
    } catch (err) {
      logger.error(
        { event_type: eventType, err, correlation_id: this.correlationId },
        'kafka.publish.failed',
      );
    }
  }
}
