// Workforce Repository — Phase 22
// All DB access via TenantPrismaService (ADR-008).

import { Injectable, Scope } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/prisma/tenant-prisma.service';

export interface WorkerRow {
  worker_id: string;
  tenant_id: string;
  employee_code: string;
  full_name: string;
  trade_type: string;
  employment_type: string;
  contact_phone: string | null;
  user_id: string | null;
  is_active: boolean;
  created_at: Date;
}

export interface AllocationRow {
  allocation_id: string;
  project_id: string;
  worker_id: string;
  tenant_id: string;
  role_on_project: string | null;
  start_date: Date;
  end_date: Date | null;
  daily_rate: string | null;
  currency_code: string | null;
}

export interface AttendanceRow {
  log_id: string;
  recorded_at: Date;
  worker_id: string;
  project_id: string;
  tenant_id: string;
  check_in_at: Date | null;
  check_out_at: Date | null;
  hours_worked: string | null;
}

export interface TimesheetRow {
  timesheet_id: string;
  period_date: Date;
  worker_id: string;
  project_id: string;
  tenant_id: string;
  regular_hours: string;
  overtime_hours: string;
  status: string;
}

@Injectable({ scope: Scope.REQUEST })
export class WorkforceRepository {
  constructor(private readonly db: TenantPrismaService) {}

  async createWorker(params: {
    worker_id: string;
    tenant_id: string;
    employee_code: string;
    full_name: string;
    trade_type: string;
    employment_type: string;
    contact_phone: string | null;
    user_id: string | null;
  }): Promise<WorkerRow> {
    const rows = await this.db.run(
      (tx) => tx.$queryRaw<WorkerRow[]>`
      INSERT INTO workforce.workers (
        worker_id, tenant_id, employee_code, full_name, trade_type, employment_type,
        contact_phone, user_id
      ) VALUES (
        ${params.worker_id}::uuid, ${params.tenant_id}::uuid,
        ${params.employee_code}, ${params.full_name}, ${params.trade_type},
        ${params.employment_type}::workforce.employment_type_enum,
        ${params.contact_phone}, ${params.user_id}::uuid
      )
      RETURNING *
    `,
    );
    return rows[0];
  }

  async findWorkerByUserId(userId: string): Promise<WorkerRow | null> {
    const rows = await this.db.run(
      (tx) => tx.$queryRaw<WorkerRow[]>`
      SELECT * FROM workforce.workers
      WHERE user_id = ${userId}::uuid AND is_active = true
      LIMIT 1
    `,
    );
    return rows[0] ?? null;
  }

  async findAllWorkers(): Promise<WorkerRow[]> {
    return this.db.run(
      (tx) => tx.$queryRaw<WorkerRow[]>`
      SELECT * FROM workforce.workers WHERE is_active = true ORDER BY full_name
    `,
    );
  }

  async findWorkerById(id: string): Promise<WorkerRow | null> {
    const rows = await this.db.run(
      (tx) => tx.$queryRaw<WorkerRow[]>`
      SELECT * FROM workforce.workers WHERE worker_id = ${id}::uuid LIMIT 1
    `,
    );
    return rows[0] ?? null;
  }

  async allocateWorker(params: {
    allocation_id: string;
    project_id: string;
    worker_id: string;
    tenant_id: string;
    role_on_project: string | null;
    start_date: string;
    end_date: string | null;
    daily_rate: number | null;
    currency_code: string | null;
  }): Promise<AllocationRow> {
    const rows = await this.db.run(
      (tx) => tx.$queryRaw<AllocationRow[]>`
      INSERT INTO workforce.project_workforce (
        allocation_id, project_id, worker_id, tenant_id,
        role_on_project, start_date, end_date, daily_rate, currency_code
      ) VALUES (
        ${params.allocation_id}::uuid, ${params.project_id}::uuid,
        ${params.worker_id}::uuid, ${params.tenant_id}::uuid,
        ${params.role_on_project}, ${params.start_date}::date,
        ${params.end_date}::date, ${params.daily_rate}::decimal(19,4),
        ${params.currency_code}
      )
      RETURNING *
    `,
    );
    return rows[0];
  }

  async getProjectWorkforce(projectId: string): Promise<AllocationRow[]> {
    return this.db.run(
      (tx) => tx.$queryRaw<AllocationRow[]>`
      SELECT * FROM workforce.project_workforce
      WHERE project_id = ${projectId}::uuid
      ORDER BY start_date DESC
    `,
    );
  }

  async recordAttendance(params: {
    log_id: string;
    recorded_at: string;
    worker_id: string;
    project_id: string;
    tenant_id: string;
    check_in_at: string | null;
    check_out_at: string | null;
    hours_worked: number | null;
    latitude?: number | null;
    longitude?: number | null;
  }): Promise<AttendanceRow> {
    const rows = await this.db.run(
      (tx) => tx.$queryRaw<AttendanceRow[]>`
      INSERT INTO workforce_telemetry.attendance_logs (
        log_id, recorded_at, worker_id, project_id, tenant_id,
        check_in_at, check_out_at, hours_worked, latitude, longitude
      ) VALUES (
        ${params.log_id}::uuid, ${params.recorded_at}::timestamptz,
        ${params.worker_id}::uuid, ${params.project_id}::uuid,
        ${params.tenant_id}::uuid,
        ${params.check_in_at}::timestamptz, ${params.check_out_at}::timestamptz,
        ${params.hours_worked}::decimal(5,2),
        ${params.latitude ?? null}::numeric, ${params.longitude ?? null}::numeric
      )
      RETURNING *
    `,
    );
    return rows[0];
  }

  async getAttendanceHistory(workerId: string, from: string, to: string): Promise<AttendanceRow[]> {
    return this.db.run(
      (tx) => tx.$queryRaw<AttendanceRow[]>`
      SELECT * FROM workforce_telemetry.attendance_logs
      WHERE worker_id = ${workerId}::uuid
        AND recorded_at BETWEEN ${from}::timestamptz AND ${to}::timestamptz
      ORDER BY recorded_at DESC
    `,
    );
  }

  async submitTimesheet(params: {
    timesheet_id: string;
    period_date: string;
    worker_id: string;
    project_id: string;
    tenant_id: string;
    regular_hours: number;
    overtime_hours: number;
  }): Promise<TimesheetRow> {
    const rows = await this.db.run(
      (tx) => tx.$queryRaw<TimesheetRow[]>`
      INSERT INTO workforce_telemetry.timesheets (
        timesheet_id, period_date, worker_id, project_id, tenant_id,
        regular_hours, overtime_hours, status
      ) VALUES (
        ${params.timesheet_id}::uuid, ${params.period_date}::date,
        ${params.worker_id}::uuid, ${params.project_id}::uuid,
        ${params.tenant_id}::uuid,
        ${params.regular_hours}::decimal(6,2), ${params.overtime_hours}::decimal(6,2),
        'SUBMITTED'::workforce_telemetry.timesheet_status_enum
      )
      RETURNING *
    `,
    );
    return rows[0];
  }

  async approveTimesheet(timesheetId: string): Promise<TimesheetRow> {
    const rows = await this.db.run(
      (tx) => tx.$queryRaw<TimesheetRow[]>`
      UPDATE workforce_telemetry.timesheets
      SET status = 'APPROVED'::workforce_telemetry.timesheet_status_enum
      WHERE timesheet_id = ${timesheetId}::uuid
      RETURNING *
    `,
    );
    return rows[0];
  }

  async getManpowerSummary(
    projectId: string,
  ): Promise<{ date: Date; total_workers: number; total_hours: string }[]> {
    return this.db.run(
      (tx) => tx.$queryRaw`
      SELECT
        time_bucket('1 day', recorded_at) AS date,
        COUNT(DISTINCT worker_id)::int AS total_workers,
        SUM(hours_worked)::text AS total_hours
      FROM workforce_telemetry.attendance_logs
      WHERE project_id = ${projectId}::uuid
        AND check_out_at IS NOT NULL
      GROUP BY 1
      ORDER BY 1 DESC
    `,
    );
  }
}
