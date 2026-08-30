// BOQ Repository — Phase 4
// All DB access via TenantPrismaService (SET LOCAL app.current_tenant_id per request — ADR-008).
// Uses $queryRaw (parameterized tagged template) — never raw string interpolation.
// Financial fields stored as DECIMAL(19,4); returned as string by Prisma for precision.

import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { OutboxPublisher } from '@cos/kafka';
import { TenantPrismaService } from '../tenant/prisma/tenant-prisma.service';
import type { OutboxEventInput } from '../../shared/outbox/outbox.types';
import { clsTenantId } from '../../shared/context/cls-context';

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
  // CLS fallback is load-bearing, not cosmetic: under Fastify the REQUEST injected into a
  // Scope.REQUEST provider is not guaranteed to be the object the auth layer decorated. The auth
  // guards publish tenant_id into CLS (the same source TenantPrismaService reads for RLS), so this
  // resolves even when the request copy does not carry it.
  private get tenantId(): string {
    return (this.request as { tenantId?: string }).tenantId ?? clsTenantId();
  }

  constructor(
    private readonly db: TenantPrismaService,
    @Inject(REQUEST) private readonly request: Request & { tenantId?: string },
  ) {}

  // ── Versions ──────────────────────────────────────────────────────────────

  /**
   * Claim the next BOQ version for a project: reject an existing DRAFT, allocate version_number and
   * insert — all in ONE transaction, serialised per project.
   *
   * The service used to do this as three separate transactions (findDraftVersion, then
   * findMaxVersionNumber, then createVersion). Two concurrent creates could both pass the
   * "one DRAFT per project" check and both compute the same version_number.
   *
   * pg_advisory_xact_lock serialises the whole read-then-write per project_id and releases on
   * COMMIT/ROLLBACK, so it is safe under PgBouncer transaction mode like the rest of ADR-008. It is
   * used instead of a unique constraint because adding one is a schema change; a
   * UNIQUE (tenant_id, project_id, version_number) index is still worth having as a backstop, and
   * this lock is what makes the application correct without it.
   *
   * Returns null when the project already has a DRAFT — the caller turns that into a 409.
   */
  async claimNextVersion(
    params: {
      project_id: string;
      version_name: string | null;
      currency_code: string;
      created_by: string;
    },
    buildOutboxEvents?: (row: BoqVersionRow) => OutboxEventInput[],
  ): Promise<{ version: BoqVersionRow; version_number: number } | null> {
    return this.db.run(async (prisma) => {
      // hashtextextended (PostgreSQL 11+) gives a stable bigint key for the advisory lock; the key
      // includes the tenant so two tenants never contend on the same lock slot. The ::text casts
      // keep Postgres from having to infer a type for the concatenated parameters.
      await prisma.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtextextended(
            ${this.tenantId}::text || ':' || ${params.project_id}::text || ':boq_version', 0
          )
        )
      `;

      const drafts = await prisma.$queryRaw<Array<{ version_id: string }>>`
        SELECT version_id FROM boq.boq_versions
        WHERE project_id = ${params.project_id}::uuid
          AND tenant_id  = ${this.tenantId}::uuid
          AND status     = 'DRAFT'
        LIMIT 1
      `;
      if (drafts.length > 0) return null;

      const rows = await prisma.$queryRaw<BoqVersionRow[]>`
        INSERT INTO boq.boq_versions (
          project_id, tenant_id, version_number, version_name,
          total_estimated_currency, created_by
        )
        SELECT
          ${params.project_id}::uuid, ${this.tenantId}::uuid,
          COALESCE(MAX(version_number), 0) + 1, ${params.version_name},
          ${params.currency_code}, ${params.created_by}::uuid
        FROM boq.boq_versions
        WHERE project_id = ${params.project_id}::uuid
          AND tenant_id  = ${this.tenantId}::uuid
        RETURNING *
      `;
      const version = rows[0]!;
      // Inside the same transaction as the INSERT and the advisory lock, so a rollback emits
      // nothing and the payload carries the real generated version_id (§35.13 ESC-13).
      if (buildOutboxEvents) {
        for (const event of buildOutboxEvents(version)) {
          await OutboxPublisher.write(prisma, event);
        }
      }
      return { version, version_number: version.version_number };
    });
  }

  async createVersion(
    params: {
      project_id: string;
      version_number: number;
      version_name: string | null;
      currency_code: string;
      created_by: string;
    },
    buildOutboxEvents?: (row: BoqVersionRow) => OutboxEventInput[],
  ): Promise<BoqVersionRow> {
    const rows = await this.db.run(async (prisma) => {
      const inserted = await prisma.$queryRaw<BoqVersionRow[]>`
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
      // Phase 8 Outbox Pattern (§35.13 ESC-13) — builder over the INSERTed row so the payload
      // carries the real generated version_id. A first version emits TWO events, hence an array.
      if (buildOutboxEvents && inserted[0]) {
        for (const evt of buildOutboxEvents(inserted[0])) {
          await OutboxPublisher.write(prisma, evt);
        }
      }
      return inserted;
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

  async approveVersion(
    params: {
      version_id: string;
      approved_by: string;
      new_total: string;
    },
    outboxEvent?: OutboxEventInput,
  ): Promise<void> {
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
      // Outbox write joins the same transaction as both UPDATEs (§35.13 ESC-13). A pre-built
      // envelope is fine here: approveVersion returns void and the ids are all known up front.
      if (outboxEvent) await OutboxPublisher.write(prisma, outboxEvent);
    });
  }

  async updateVersionTotal(
    version_id: string,
    total: string,
    outboxEvent?: OutboxEventInput,
  ): Promise<void> {
    await this.db.run(async (prisma) => {
      await prisma.$executeRaw`
        UPDATE boq.boq_versions
        SET total_estimated_amount = ${total}::decimal, updated_at = now()
        WHERE version_id = ${version_id}::uuid
          AND tenant_id  = ${this.tenantId}::uuid
      `;
      // This UPDATE closes an item add/update/delete recalculation, so it is the transaction the
      // construction.boq.updated.v1 event belongs to (§35.13 ESC-13).
      if (outboxEvent) await OutboxPublisher.write(prisma, outboxEvent);
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

  /**
   * Write every category subtotal for a version in ONE statement.
   *
   * recalculateVersionTotal updated them in a loop — one UPDATE, in one db.run transaction, per
   * category — so re-costing a BOQ with 80 categories issued 80 sequential transactions. Worse than
   * slow: because each committed on its own, a failure partway left some categories carrying new
   * subtotals and the rest the old ones, with the version total never written. A single UPDATE ...
   * FROM (VALUES …) makes the recalculation atomic as well as one round trip.
   */
  async updateCategorySubtotals(
    rows: Array<{ category_id: string; subtotal: string }>,
  ): Promise<void> {
    if (rows.length === 0) return;
    const ids = rows.map((r) => r.category_id);
    const subtotals = rows.map((r) => r.subtotal);
    await this.db.run(async (prisma) => {
      await prisma.$executeRaw`
        UPDATE boq.boq_categories c
           SET subtotal_amount = v.subtotal
          FROM (
            SELECT UNNEST(${ids}::uuid[]) AS category_id,
                   UNNEST(${subtotals}::decimal[]) AS subtotal
          ) AS v
         WHERE c.category_id = v.category_id
           AND c.tenant_id   = ${this.tenantId}::uuid
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
          -- The cast belongs to the SQL, never to the VALUE. This previously wrapped each parameter
          -- in a nested template literal that appended the cast to the STRING, so Postgres received
          -- "20.0000::decimal" as the value and every PATCH died with 22P02
          -- "invalid input syntax for type numeric". insertItem above has always had this right;
          -- only this statement drifted.
          quantity        = COALESCE(${params.quantity ?? null}::decimal, quantity),
          unit_cost       = COALESCE(${params.unit_cost ?? null}::decimal, unit_cost),
          estimated_total = COALESCE(${params.estimated_total ?? null}::decimal, estimated_total),
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

  /**
   * Copy every category and item of `from_version_id` into `to_version_id`.
   *
   * WHAT WAS WRONG (TDD OQ-24)
   * --------------------------
   * The previous implementation was three statements that rebuilt the hierarchy by MATCHING
   * `category_code`, and it was wrong in two independent ways. Both were reproduced against
   * PostgreSQL on a five-category source totalling 500.0000:
   *
   *   Depth. Root categories were copied by one statement and children by the next, so the child
   *   statement could only find parents that already existed in the target — the roots. A category
   *   at depth 3 had no copied parent to join to and was dropped, silently, together with every
   *   item beneath it and every descendant below that. `boq_categories.parent_category_id` is
   *   self-referencing with no depth limit, `addCategory` accepts any `parent_category_id`, and
   *   §13.2 says only "self-ref, nullable — for hierarchy", so nothing anywhere caps a BOQ at two
   *   levels. Anything deeper simply did not survive a new version.
   *
   *   Duplicates. There is no unique constraint on (version_id, category_code) — see the DDL in
   *   20260604000001 — and `addCategory` does not check for one either. Two categories sharing a
   *   code made the join fan out: each child was inserted once per matching parent, each item once
   *   per matching category, and the copy came out with MORE money in it than the version it was
   *   copied from. The reproduction returned 4 categories and 600.0000 where the source had 5 and
   *   500.0000 — a 20% overstatement on a document that priced work.
   *
   * Product-owner decision 2026-08-22: make the copy recursive rather than cap the depth. The
   * hierarchy the schema allows is the hierarchy the copy must preserve.
   *
   * HOW THIS WORKS
   * --------------
   * Categories are matched by IDENTITY, not by code. `id_map` mints one new UUID per source
   * category up front, so a category's new parent is looked up through the same map that produced
   * it — `category_code` never enters the join, which removes the fan-out and the mis-parenting
   * along with it. Because the mapping is a flat old-id → new-id table rather than a walk down the
   * tree, depth is irrelevant: one statement copies four levels or forty, and a cycle in the source
   * data (reachable through an UPDATE, which no constraint prevents) is copied faithfully instead
   * of hanging.
   *
   * It has to be ONE statement. `gen_random_uuid()` is volatile, so a second statement would mint a
   * different set of ids and the items would have nothing to attach to. Both inserts therefore live
   * in the same statement as data-modifying CTEs, which is also what makes them legal: PostgreSQL
   * queues foreign-key checks as after-row triggers and fires them at the END of the statement, so
   * `parent_category_id` pointing at a sibling row of the same INSERT, and `boq_items.category_id`
   * pointing at a category inserted by an earlier CTE, both resolve. Verified end to end as
   * `app_user` under FORCE ROW LEVEL SECURITY with `app.current_tenant_id` set: 5 categories, 5
   * items, 500.0000, depth 4 intact, and invisible to a second tenant.
   */
  async copyVersionContents(from_version_id: string, to_version_id: string): Promise<void> {
    await this.db.run(async (prisma) => {
      await prisma.$executeRaw`
        WITH src AS (
          SELECT category_id, parent_category_id, tenant_id,
                 category_code, category_name, sort_order, subtotal_amount
          FROM boq.boq_categories
          WHERE version_id = ${from_version_id}::uuid
            AND tenant_id  = ${this.tenantId}::uuid
        ), id_map AS (
          SELECT category_id AS old_id, gen_random_uuid() AS new_id FROM src
        ), copied_categories AS (
          INSERT INTO boq.boq_categories (
            category_id, version_id, tenant_id, parent_category_id,
            category_code, category_name, sort_order, subtotal_amount
          )
          SELECT m.new_id, ${to_version_id}::uuid, s.tenant_id, pm.new_id,
                 s.category_code, s.category_name, s.sort_order, s.subtotal_amount
          FROM src s
          JOIN id_map m       ON m.old_id  = s.category_id
          -- LEFT, not INNER: a root category has no parent, and an INNER join would drop it.
          LEFT JOIN id_map pm ON pm.old_id = s.parent_category_id
          RETURNING 1
        )
        INSERT INTO boq.boq_items (
          category_id, version_id, tenant_id,
          item_code, description, unit,
          quantity, unit_cost, estimated_total, currency_code,
          sort_order, carbon_factor_kg_co2e, carbon_total_kg_co2e
        )
        SELECT m.new_id, ${to_version_id}::uuid, i.tenant_id,
               i.item_code, i.description, i.unit,
               i.quantity, i.unit_cost, i.estimated_total, i.currency_code,
               i.sort_order, i.carbon_factor_kg_co2e, i.carbon_total_kg_co2e
        FROM boq.boq_items i
        JOIN id_map m ON m.old_id = i.category_id
        WHERE i.version_id = ${from_version_id}::uuid
          AND i.tenant_id  = ${this.tenantId}::uuid
      `;
    });
  }
}
