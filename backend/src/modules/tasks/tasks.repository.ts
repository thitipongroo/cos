// Tasks Repository — Phase 6 (Tasks + completion gates)
// All DB access via TenantPrismaService (SET LOCAL app.current_tenant_id per request — ADR-008).

import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { TenantPrismaService } from '../tenant/prisma/tenant-prisma.service';

export type TaskStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED' | 'CANCELLED';

export interface TaskRow {
  task_id: string;
  tenant_id: string;
  project_id: string;
  task_name: string;
  work_type: string;
  status: TaskStatus;
  floor_id: string | null;
  room_id: string | null;
  boq_item_id: string | null;
  assigned_to: string | null;
  planned_start: Date | null;
  planned_end: Date | null;
  actual_start: Date | null;
  progress_percent: number;
  qc_status: 'NONE' | 'QC_HOLD' | 'QC_PASSED';
  created_at: Date;
}

@Injectable({ scope: Scope.REQUEST })
export class TasksRepository {
  private readonly tenantId: string;

  constructor(
    private readonly db: TenantPrismaService,
    @Inject(REQUEST) request: Request & { tenantId?: string },
  ) {
    this.tenantId = request.tenantId ?? '';
  }

  async createTask(params: {
    project_id: string;
    task_name: string;
    work_type?: string;
    boq_item_id?: string | null;
    floor_id?: string | null;
    room_id?: string | null;
    assigned_to?: string | null;
    planned_start?: string | null;
    planned_end?: string | null;
  }): Promise<TaskRow> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<TaskRow[]>`
        INSERT INTO projects.tasks
          (tenant_id, project_id, task_name, work_type, boq_item_id, floor_id, room_id,
           assigned_to, planned_start, planned_end)
        VALUES
          (${this.tenantId}::uuid, ${params.project_id}::uuid, ${params.task_name},
           ${params.work_type ?? 'construction'}, ${params.boq_item_id ?? null}::uuid,
           ${params.floor_id ?? null}::uuid, ${params.room_id ?? null}::uuid,
           ${params.assigned_to ?? null}::uuid,
           ${params.planned_start ?? null}::date, ${params.planned_end ?? null}::date)
        RETURNING *
      `,
    );
    return rows[0]!;
  }

  async findTasksByProject(params: {
    project_id: string;
    assigned_to?: string;
    status?: string;
    page: number;
    limit: number;
  }): Promise<{ rows: TaskRow[]; total: number }> {
    const offset = (params.page - 1) * params.limit;
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<TaskRow[]>`
        SELECT * FROM projects.tasks
        WHERE tenant_id = ${this.tenantId}::uuid
          AND project_id = ${params.project_id}::uuid
          AND (${params.assigned_to ?? null}::uuid IS NULL OR assigned_to = ${params.assigned_to ?? null}::uuid)
          AND (${params.status ?? null} IS NULL OR status = ${params.status ?? null})
        ORDER BY created_at DESC
        LIMIT ${params.limit} OFFSET ${offset}
      `,
    );
    const countRows = await this.db.run(
      (tx) =>
        tx.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*)::bigint AS count FROM projects.tasks
        WHERE tenant_id = ${this.tenantId}::uuid
          AND project_id = ${params.project_id}::uuid
          AND (${params.assigned_to ?? null}::uuid IS NULL OR assigned_to = ${params.assigned_to ?? null}::uuid)
          AND (${params.status ?? null} IS NULL OR status = ${params.status ?? null})
      `,
    );
    return { rows, total: Number(countRows[0]?.count ?? 0) };
  }

  async findTaskById(taskId: string): Promise<TaskRow | null> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<TaskRow[]>`
        SELECT * FROM projects.tasks
        WHERE task_id = ${taskId}::uuid AND tenant_id = ${this.tenantId}::uuid
      `,
    );
    return rows[0] ?? null;
  }

  async updateTask(params: {
    task_id: string;
    status?: string | null;
    progress_percent?: number | null;
    assigned_to?: string | null;
  }): Promise<TaskRow> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<TaskRow[]>`
        UPDATE projects.tasks SET
          status = COALESCE(${params.status ?? null}, status),
          progress_percent = COALESCE(${params.progress_percent ?? null}, progress_percent),
          assigned_to = COALESCE(${params.assigned_to ?? null}::uuid, assigned_to),
          actual_start = CASE
            WHEN ${params.status ?? null} = 'IN_PROGRESS' AND actual_start IS NULL THEN now()::date
            ELSE actual_start END
        WHERE task_id = ${params.task_id}::uuid AND tenant_id = ${this.tenantId}::uuid
        RETURNING *
      `,
    );
    return rows[0]!;
  }

  // ── Completion-gate queries (master Phase 6) ────────────────────────────────

  /** Gate 1: linked inspections with a failing status. */
  async countBlockingInspections(taskId: string): Promise<number> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*)::bigint AS count FROM site_ops.inspections
        WHERE tenant_id = ${this.tenantId}::uuid
          AND task_id = ${taskId}::uuid
          AND status IN ('FAILED', 'REQUIRES_REINSPECTION')
      `,
    );
    return Number(rows[0]?.count ?? 0);
  }

  /** Gate 2: open blocking issues (defect / rework / punch). */
  async countBlockingIssues(taskId: string): Promise<number> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*)::bigint AS count FROM site_ops.issues
        WHERE tenant_id = ${this.tenantId}::uuid
          AND task_id = ${taskId}::uuid
          AND issue_type IN ('DEFECT', 'REWORK', 'PUNCH')
          AND status = 'OPEN'
      `,
    );
    return Number(rows[0]?.count ?? 0);
  }

  /** Gate 3: predecessor tasks not yet COMPLETED. Predecessors are tasks whose BOQ item sits
   *  in the parent BOQ category of this task's BOQ item (ADR-026 — BOQ hierarchy is category-level). */
  async countIncompletePredecessors(taskId: string): Promise<number> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*)::bigint AS count FROM projects.tasks pt
        WHERE pt.tenant_id = ${this.tenantId}::uuid
          AND pt.status <> 'COMPLETED'
          AND pt.boq_item_id IN (
            SELECT pred.item_id FROM boq.boq_items pred
            WHERE pred.category_id = (
              SELECT child_cat.parent_category_id
              FROM projects.tasks t
              JOIN boq.boq_items ci ON ci.item_id = t.boq_item_id
              JOIN boq.boq_categories child_cat ON child_cat.category_id = ci.category_id
              WHERE t.task_id = ${taskId}::uuid AND t.tenant_id = ${this.tenantId}::uuid
            )
          )
      `,
    );
    return Number(rows[0]?.count ?? 0);
  }

  /** Gate 4: linked permits in a blocking state (expired / revoked). */
  async countBlockingPermits(taskId: string): Promise<number> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*)::bigint AS count FROM site_ops.permits
        WHERE tenant_id = ${this.tenantId}::uuid
          AND linked_task_id = ${taskId}::uuid
          AND status IN ('EXPIRED', 'REVOKED')
      `,
    );
    return Number(rows[0]?.count ?? 0);
  }

  /** Gate 5: open HIGH/CRITICAL safety incidents linked to the task. */
  async countBlockingIncidents(taskId: string): Promise<number> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*)::bigint AS count FROM site_ops.incidents
        WHERE tenant_id = ${this.tenantId}::uuid
          AND task_id = ${taskId}::uuid
          AND status = 'OPEN'
          AND severity IN ('HIGH', 'CRITICAL')
      `,
    );
    return Number(rows[0]?.count ?? 0);
  }

  /** Gate 7: the task's BOQ item was ordered (a PO line item exists) but the PO has no delivery
   *  record yet. `deliveries` has no status column, so an existing delivery row = partial/complete
   *  delivery (ADR-027). A task with no BOQ item / no PO line is not material-gated. */
  async countUndeliveredMaterials(taskId: string): Promise<number> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*)::bigint AS count FROM procurement.po_line_items li
        WHERE li.tenant_id = ${this.tenantId}::uuid
          AND li.boq_item_id = (
            SELECT boq_item_id FROM projects.tasks
            WHERE task_id = ${taskId}::uuid AND tenant_id = ${this.tenantId}::uuid
          )
          AND NOT EXISTS (
            SELECT 1 FROM procurement.deliveries d
            WHERE d.po_id = li.po_id AND d.tenant_id = ${this.tenantId}::uuid
          )
      `,
    );
    return Number(rows[0]?.count ?? 0);
  }

  /** Warnings 8–9: budget vs actual for the task's BOQ category (budget is tracked at
   *  budget-line / category level — ADR-027). Returns null when no budget line is linked. */
  async getTaskBudgetRatio(taskId: string): Promise<{ allocated: string; actual: string } | null> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<{ allocated: string; actual: string }[]>`
        SELECT
          bl.allocated_amount::text AS allocated,
          COALESCE((
            SELECT SUM(ct.amount) FROM finance.cost_transactions ct
            WHERE ct.tenant_id = ${this.tenantId}::uuid AND ct.budget_line_id = bl.line_id
          ), 0)::text AS actual
        FROM projects.tasks t
        JOIN boq.boq_items bi ON bi.item_id = t.boq_item_id
        JOIN finance.budget_lines bl
          ON bl.boq_category_id = bi.category_id AND bl.tenant_id = ${this.tenantId}::uuid
        WHERE t.task_id = ${taskId}::uuid AND t.tenant_id = ${this.tenantId}::uuid
        LIMIT 1
      `,
    );
    return rows[0] ?? null;
  }
}
