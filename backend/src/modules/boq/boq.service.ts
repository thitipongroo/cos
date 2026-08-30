// BOQ Service — Phase 4
// Business logic: versioning, calculation, approval.
// Financial precision: decimal.js ROUND_HALF_UP throughout (spec §FINANCIAL PRECISION SPEC).
// Emits typed Kafka events through the Phase 8 OUTBOX (QM-8): every event is written to
// platform.outbox_events inside the same transaction as its business write (§35.13 ESC-13).

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
import { toBoqCsv } from './boq-csv.util';
import { buildOutboxEvent } from '../../shared/outbox/outbox.types';
import type { OutboxEventInput } from '../../shared/outbox/outbox.types';
import { EventOutboxService } from '../../shared/events/event-outbox.service';
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
  private get tenantId(): string {
    return (this.request as { tenantId?: string }).tenantId ?? '';
  }
  private get userId(): string {
    return (this.request as { userId?: string }).userId ?? '';
  }
  private readonly correlationId: string;

  constructor(
    private readonly repo: BoqRepository,
    @Inject(REQUEST)
    private readonly request: Request & {
      tenantId?: string;
      user?: { user_id?: string; role?: string };
    },
    private readonly outbox: EventOutboxService,
  ) {
    this.correlationId = randomUUID();
  }

  // ── Version Operations ────────────────────────────────────────────────────

  async createVersion(project_id: string, dto: CreateBoqVersionDto): Promise<BoqVersionRow> {
    // The DRAFT check and the version_number allocation must happen together, under one lock: run
    // as separate queries they were a check-then-act race in which two concurrent creates could both
    // see "no DRAFT" and both claim the same version number. claimNextVersion() does both inside a
    // single per-project transaction and returns null when a DRAFT already exists.
    //
    // The outbox builder goes in with it (§35.13 ESC-13): the events are written from the INSERTed
    // row, inside that same transaction, so version_id is the real generated id and a rollback
    // emits nothing. A first version emits two events, hence an array.
    const claimed = await this.repo.claimNextVersion(
      {
        project_id,
        version_name: dto.version_name ?? null,
        currency_code: dto.currency_code,
        created_by: this.userId,
      },
      (row) => {
        const events: OutboxEventInput[] = [
          buildOutboxEvent({
            eventType: 'construction.boq.version_created.v1',
            tenantId: this.tenantId,
            actorId: this.userId,
            correlationId: this.correlationId,
            payload: {
              boq_version_id: row.version_id,
              project_id,
              version_number: row.version_number,
              total_estimated: {
                amount: row.total_estimated_amount,
                currency_code: row.total_estimated_currency,
              },
              created_by: this.userId,
            },
          }),
        ];
        if (row.version_number === 1) {
          events.push(
            buildOutboxEvent({
              eventType: 'construction.boq.created.v1',
              tenantId: this.tenantId,
              actorId: this.userId,
              correlationId: this.correlationId,
              payload: {
                project_id,
                version_id: row.version_id,
                version_number: row.version_number,
              },
            }),
          );
        }
        return events;
      },
    );
    if (!claimed) {
      const existingDraft = await this.repo.findDraftVersion(project_id);
      throw new ConflictException(
        `Project ${project_id} already has a DRAFT BOQ version (${existingDraft?.version_id ?? 'unknown'}). Approve or delete it first.`,
      );
    }
    const { version, version_number: newVersionNumber } = claimed;

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

    // Outbox (§35.13 ESC-13) — the event joins the supersede+approve transaction.
    await this.repo.approveVersion(
      {
        version_id,
        approved_by: this.userId,
        new_total: finalTotal,
      },
      buildOutboxEvent({
        eventType: 'construction.boq.version_approved.v1',
        tenantId: this.tenantId,
        actorId: this.userId,
        correlationId: this.correlationId,
        payload: {
          version_id,
          project_id,
          version_number: version.version_number,
          total_estimated_amount: finalTotal,
          total_estimated_currency: version.total_estimated_currency,
          approved_by: this.userId,
        },
      }),
    );

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

    // construction.boq.version_approved.v1 is NOT published here: approveVersion() above already
    // wrote it into the supersede+approve transaction, so publishing again would emit the event
    // twice — once durably, once transactionally.
    //
    // items_published is different. It needs the line set, which is read after the approval commits,
    // so it cannot join that transaction; it goes through the durable outbox instead. Downstream
    // materialisation (finance contract-document generation, ADR-058 CT-2c-2) snapshots per version,
    // which is the natural grain because a contract is generated against an approved BOQ.
    const items = await this.repo.findItemsByVersion(version_id);
    await this.publishEvent('construction.boq.items_published.v1', {
      version_id,
      project_id,
      version_number: version.version_number,
      total_estimated_amount: finalTotal,
      total_estimated_currency: version.total_estimated_currency,
      items: items.map((i) => ({
        item_code: i.item_code,
        description: i.description,
        unit: i.unit,
        quantity: i.quantity,
        unit_cost: i.unit_cost,
        estimated_total: i.estimated_total,
      })),
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

    await this.recalculateFromCategory(dto.category_id, version_id, 1);
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

    await this.recalculateFromCategory(existing.category_id, existing.version_id, 1);
    return updated;
  }

  async deleteItem(item_id: string): Promise<void> {
    const existing = await this.repo.findItemById(item_id);
    if (!existing) throw new NotFoundException(`BOQ item ${item_id} not found`);
    await this.assertDraftVersion(existing.version_id);

    await this.repo.deleteItem(item_id);
    await this.recalculateFromCategory(existing.category_id, existing.version_id, 1);
  }

  // ── Export ────────────────────────────────────────────────────────────────

  // Export is keyed by version_id alone (flat route /boq/versions/:versionId/export — no project in
  // the path). Tenant isolation is enforced by RLS/the repo; the project_id cross-check that
  // getVersionDetail applies for the nested project routes does not apply here.
  private async fetchVersionForExport(
    version_id: string,
  ): Promise<{ version: BoqVersionRow; categories: BoqCategoryRow[]; items: BoqItemRow[] }> {
    const version = await this.repo.findVersionById(version_id);
    if (!version) {
      throw new NotFoundException(`BOQ version ${version_id} not found`);
    }
    const categories = await this.repo.findCategoriesByVersion(version_id);
    const items = await this.repo.findItemsByVersion(version_id);
    return { version, categories, items };
  }

  async exportVersion(
    version_id: string,
  ): Promise<{ version: BoqVersionRow; categories: BoqCategoryRow[]; items: BoqItemRow[] }> {
    return this.fetchVersionForExport(version_id);
  }

  async exportVersionCsv(version_id: string): Promise<string> {
    const { version, categories, items } = await this.fetchVersionForExport(version_id);
    return toBoqCsv(version, categories, items);
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
  private async recalculateFromCategory(
    category_id: string,
    version_id: string,
    changed_count: number,
  ): Promise<string> {
    const allItems = await this.repo.findItemsByVersion(version_id);
    const categoryItems = allItems.filter((i) => i.category_id === category_id);
    const categorySubtotal = sumDecimals(categoryItems.map((i) => new Decimal(i.estimated_total)));
    await this.repo.updateCategorySubtotal(category_id, categorySubtotal.toFixed(4));
    return this.recalculateAndRecordUpdate(version_id, changed_count);
  }

  /**
   * Recalculate all category subtotals and version total.
   * Returns the new version total as a decimal string.
   */
  private async recalculateVersionTotal(version_id: string): Promise<string> {
    const allItems = await this.repo.findItemsByVersion(version_id);
    const categories = await this.repo.findCategoriesByVersion(version_id);

    // Update every category subtotal in one statement. This was a loop issuing one UPDATE per
    // category, each in its own transaction, so a large BOQ re-cost meant dozens of sequential round
    // trips — and a mid-loop failure left the version half-recalculated with no total written.
    const subtotals = categories.map((cat) => ({
      category_id: cat.category_id,
      subtotal: sumDecimals(
        allItems
          .filter((i) => i.category_id === cat.category_id)
          .map((i) => new Decimal(i.estimated_total)),
      ),
    }));

    await this.repo.updateCategorySubtotals(
      subtotals.map((s) => ({ category_id: s.category_id, subtotal: s.subtotal.toFixed(4) })),
    );

    // Version total = SUM of EVERY category's subtotal, not just the root ones.
    //
    // This used to filter `categories` down to `!parent_category_id` and sum the items hanging
    // directly off those roots, which is what the Phase 4 command says literally ("version
    // total_estimated = SUM(category.subtotal) for all root categories") and which silently drops
    // the value of every item in a sub-category. A BOQ with root "Structural" and child "Concrete"
    // holding 5,000,000 THB reported a total of 0 — and that total is what
    // construction.boq.version_approved.v1 publishes and what Finance generates contracts against.
    //
    // Summing every category cannot double-count: boq_items.category_id is a single FK, so an item
    // belongs to exactly one category and appears in exactly one subtotal. Category subtotals keep
    // their existing meaning (own items only, not rolled up into the parent) — nothing renders them
    // hierarchically today, so widening the version total is the whole fix.
    //
    // Product-owner decision 2026-08-22 (TDD OQ-23).
    const versionTotal = sumDecimals(subtotals.map((s) => s.subtotal));

    const totalStr = versionTotal.toFixed(4);
    await this.repo.updateVersionTotal(version_id, totalStr);
    return totalStr;
  }

  /**
   * Recalculate and, in the SAME transaction as the closing version-total UPDATE, write the
   * `construction.boq.updated.v1` outbox row (§35.13 ESC-13). Used by the item add/update/delete
   * paths, which previously recalculated and then fire-and-forget published.
   */
  private async recalculateAndRecordUpdate(
    version_id: string,
    changed_count: number,
  ): Promise<string> {
    const allItems = await this.repo.findItemsByVersion(version_id);
    const categories = await this.repo.findCategoriesByVersion(version_id);

    // One statement, like recalculateVersionTotal above. This was the same per-category loop, so a
    // re-cost issued one transaction per category and a mid-loop failure left the version half
    // recalculated — with the version total, and therefore the outbox event, never written at all.
    const subtotals = categories.map((cat) => ({
      category_id: cat.category_id,
      subtotal: sumDecimals(
        allItems
          .filter((i) => i.category_id === cat.category_id)
          .map((i) => new Decimal(i.estimated_total)),
      ),
    }));

    await this.repo.updateCategorySubtotals(
      subtotals.map((sub) => ({
        category_id: sub.category_id,
        subtotal: sub.subtotal.toFixed(4),
      })),
    );

    // EVERY category, not just the root ones — the same OQ-23 correction recalculateVersionTotal
    // carries, and for the same reason: an item in a sub-category was worth nothing to the version
    // total. This path is the one a re-cost takes, so the bug survived here after being fixed there,
    // which is worse than either — the same BOQ reported two different totals depending on which
    // edit triggered the recalculation. boq_items.category_id is a single FK, so summing all
    // categories cannot double-count.
    const versionTotal = sumDecimals(subtotals.map((sub) => sub.subtotal));

    const totalStr = versionTotal.toFixed(4);
    const version = await this.repo.findVersionById(version_id);

    await this.repo.updateVersionTotal(
      version_id,
      totalStr,
      buildOutboxEvent({
        eventType: 'construction.boq.updated.v1',
        tenantId: this.tenantId,
        actorId: this.userId,
        correlationId: this.correlationId,
        payload: {
          version_id,
          // project_id comes from the version row. Corrected 2026-08-23 (§35.13 ESC-18): all three
          // call sites previously passed `version_id` into this slot, so every emitted
          // construction.boq.updated.v1 carried a version id where the contract requires a project id.
          project_id: version?.project_id ?? '',
          changed_items_count: changed_count,
          new_total_estimated_amount: totalStr,
          new_total_estimated_currency: version?.total_estimated_currency ?? 'THB',
        },
      }),
    );

    return totalStr;
  }

  /** Queue a domain event. Durable and off the request path — see EventOutboxService. */
  private async publishEvent<T>(eventType: string, payload: T): Promise<void> {
    await this.outbox.publish({
      event_type: eventType,
      event_version: '1.0',
      tenant_id: this.tenantId,
      actor_id: this.userId,
      occurred_at: new Date().toISOString(),
      correlation_id: this.correlationId,
      payload,
    });
  }
}
