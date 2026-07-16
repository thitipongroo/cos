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

/** Raw shape of the §32.12 aggregate query. */
interface ProgressSumsRow {
  weight_total: number;
  earned_total: number;
  sched_weight_total: number;
  sched_earned_total: number;
  sched_planned_total: number;
}

/** A schedulable-subset task row for the §32.12 Earned Schedule day-variance. */
export interface SchedulableTaskRow {
  progress: number;
  planned_start: Date;
  planned_end: Date;
  weight: number;
}

/** BOQ-value-weighted sums behind the §32.12 progress metric. Percentages are derived in the service. */
export interface ProgressSums {
  /** Σ(estimated_total) over BOQ-linked, non-cancelled tasks. 0 means "nothing to measure". */
  weightTotal: number;
  /** Σ(progress_percent × estimated_total) over the same set. */
  earnedTotal: number;
  /** Σ(estimated_total) over the schedulable subset (both planned dates present). */
  schedWeightTotal: number;
  /** Σ(progress_percent × estimated_total) over the schedulable subset. */
  schedEarnedTotal: number;
  /** Σ(planned% × estimated_total) over the schedulable subset. */
  schedPlannedTotal: number;
}

@Injectable({ scope: Scope.REQUEST })
export class TasksRepository {
  private get tenantId(): string {
    return (this.request as { tenantId?: string }).tenantId ?? '';
  }

  constructor(
    private readonly db: TenantPrismaService,
    @Inject(REQUEST) private readonly request: Request & { tenantId?: string },
  ) {}

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
    // The `::text` / `::uuid` casts on the optional filters are load-bearing, not decoration: Prisma
    // sends parameters untyped, and Postgres cannot infer a type for a bare `$1 IS NULL`, so it
    // rejects the whole statement with 42P18 ("could not determine data type of parameter"). Without
    // the cast on `status` this endpoint returned 500 for every request, filtered or not.
    const offset = (params.page - 1) * params.limit;
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<TaskRow[]>`
        SELECT * FROM projects.tasks
        WHERE tenant_id = ${this.tenantId}::uuid
          AND project_id = ${params.project_id}::uuid
          AND (${params.assigned_to ?? null}::uuid IS NULL OR assigned_to = ${params.assigned_to ?? null}::uuid)
          AND (${params.status ?? null}::text IS NULL OR status = ${params.status ?? null}::text)
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
          AND (${params.status ?? null}::text IS NULL OR status = ${params.status ?? null}::text)
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

  /**
   * BOQ-value-weighted progress sums for a project (§32.12).
   *
   * Returns sums, not percentages — the arithmetic (and its null semantics) lives in the service so
   * it is unit-testable without a database. Aggregating in SQL is not an optimisation here but a
   * requirement: `listTasks` is capped at 100 rows/page, so a client or service that paged the whole
   * task list to add it up would be both slow on site and wrong past page 1.
   *
   * `weight`/`earned` span every BOQ-linked, non-cancelled task. `sched_*` re-sum the schedulable
   * subset (both planned dates present), because SPI must divide like by like — see §32.12.
   * DECIMAL columns come back as strings under Prisma; ::float8 keeps these as JS numbers. They are
   * ratio weights, never displayed as money, so §32.5 financial precision does not apply.
   */
  async findProgressSums(project_id: string): Promise<ProgressSums> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<[ProgressSumsRow]>`
        WITH scoped AS (
          SELECT
            t.progress_percent,
            t.planned_start,
            t.planned_end,
            i.estimated_total::float8 AS weight
          FROM projects.tasks t
          JOIN boq.boq_items i
            ON i.item_id = t.boq_item_id
           AND i.tenant_id = t.tenant_id
          WHERE t.tenant_id = ${this.tenantId}::uuid
            AND t.project_id = ${project_id}::uuid
            AND t.status <> 'CANCELLED'
        ),
        dated AS (
          SELECT
            progress_percent,
            weight,
            -- Planned completion of this task as of now, clamped to 0..100. A zero- or
            -- negative-length span is a milestone: 0 before its end, 100 from its end onwards.
            CASE
              WHEN planned_end <= planned_start THEN
                CASE WHEN now()::date >= planned_end THEN 100.0 ELSE 0.0 END
              ELSE LEAST(100.0, GREATEST(0.0,
                (now()::date - planned_start)::float8
                  / NULLIF((planned_end - planned_start)::float8, 0) * 100.0))
            END AS planned_pct
          FROM scoped
          WHERE planned_start IS NOT NULL AND planned_end IS NOT NULL
        )
        SELECT
          COALESCE((SELECT SUM(weight) FROM scoped), 0)::float8                        AS weight_total,
          COALESCE((SELECT SUM(progress_percent * weight) FROM scoped), 0)::float8     AS earned_total,
          COALESCE((SELECT SUM(weight) FROM dated), 0)::float8                         AS sched_weight_total,
          COALESCE((SELECT SUM(progress_percent * weight) FROM dated), 0)::float8      AS sched_earned_total,
          COALESCE((SELECT SUM(planned_pct * weight) FROM dated), 0)::float8           AS sched_planned_total
      `,
    );
    const r = rows[0];
    return {
      weightTotal: Number(r?.weight_total ?? 0),
      earnedTotal: Number(r?.earned_total ?? 0),
      schedWeightTotal: Number(r?.sched_weight_total ?? 0),
      schedEarnedTotal: Number(r?.sched_earned_total ?? 0),
      schedPlannedTotal: Number(r?.sched_planned_total ?? 0),
    };
  }

  /**
   * The schedulable-subset task rows behind the Earned Schedule day-variance (§32.12): BOQ-linked,
   * not cancelled, both planned dates present. Weight + progress + the two dates per task — the
   * time-phased PV curve and the ES date are found in the service, where they are unit-testable.
   *
   * Dates come back as `Date`; the service reads them by day. `estimated_total` is a ratio weight
   * (never money here), so ::float8 to a JS number is fine.
   */
  async findSchedulableTasks(project_id: string): Promise<SchedulableTaskRow[]> {
    return this.db.run(
      (tx) =>
        tx.$queryRaw<SchedulableTaskRow[]>`
        SELECT
          t.progress_percent AS progress,
          t.planned_start    AS planned_start,
          t.planned_end      AS planned_end,
          i.estimated_total::float8 AS weight
        FROM projects.tasks t
        JOIN boq.boq_items i
          ON i.item_id = t.boq_item_id
         AND i.tenant_id = t.tenant_id
        WHERE t.tenant_id = ${this.tenantId}::uuid
          AND t.project_id = ${project_id}::uuid
          AND t.status <> 'CANCELLED'
          AND t.planned_start IS NOT NULL
          AND t.planned_end IS NOT NULL
      `,
    );
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
