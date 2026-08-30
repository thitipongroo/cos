// Workforce Service — Phase 22
// Business logic: worker management, project allocation, attendance, timesheets.
// Emits typed events through the Phase 8 OUTBOX (§35.13 ESC-13) — written inside the
// business transaction by the repository, relayed to Kafka by OutboxPollerService.

import { Injectable, Scope, Inject, NotFoundException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { randomUUID } from 'crypto';
import { Decimal } from '@cos/financial';
import { createLogger } from '@cos/logger';
import { buildOutboxEvent } from '../../shared/outbox/outbox.types';
import { clsTenantId, clsUserId } from '../../shared/context/cls-context';
import { WorkforceRepository } from './workforce.repository';
import type {
  WorkerRow,
  AllocationRow,
  AttendanceRow,
  DirectoryRow,
  TimesheetRow,
} from './workforce.repository';
import type { CreateWorkerDto } from './dto/create-worker.dto';
import type { AllocateWorkerDto } from './dto/allocate-worker.dto';
import type { RecordAttendanceDto } from './dto/attendance.dto';
import type { SubmitTimesheetDto } from './dto/timesheet.dto';

const logger = createLogger('workforce-service');

@Injectable({ scope: Scope.REQUEST })
export class WorkforceService {
  constructor(
    @Inject(REQUEST) private readonly req: Request,
    private readonly repo: WorkforceRepository,
  ) {}

  // ADR-031 context sources. Corrected 2026-08-22 (docs/architecture/test-design/escalation-register.md §35.13 ESC-16): both getters
  // previously read the Passport projection (`req.user?.sub`), which nothing in this codebase ever
  // sets — JwtAuthGuard publishes `userId` (from `user_id`) into CLS, and TenantContextInterceptor
  // projects `req.userId`/`req.tenantId`. `user?.sub` therefore always fell through to the literal
  // 'system'. Read in a getter (not the constructor) so CLS is active at call time.
  private get tenantId(): string {
    return (this.req as Request & { tenantId?: string }).tenantId ?? clsTenantId();
  }

  private get userId(): string {
    // req.userId — the PLATFORM user UUID (TenantContextInterceptor / TenantMiddleware) — with a CLS
    // fallback, the pattern workforce.controller's /me route already documents: under the Fastify
    // adapter req.userId may be absent, and JwtAuthGuard publishes the same value to CLS.
    //
    // This used to read req.user?.sub. Two things were wrong: `sub` is the KEYCLOAK id
    // (platform.users.keycloak_user_id per jwt.payload.ts), not the platform user_id; and Passport's
    // req.user does not reliably reach a Scope.REQUEST provider under Fastify — JwtAuthGuard says so
    // in its own header. So it fell through to the literal 'system' and every workforce event was
    // attributed to nobody. Nothing crashed, which is why it went unnoticed: actor_id lands in the
    // outbox payload JSON, not in a UUID column.
    const req = this.req as Request & { userId?: string };
    return req.userId ?? clsUserId();
  }

  async createWorker(dto: CreateWorkerDto): Promise<WorkerRow> {
    const worker = await this.repo.createWorker({
      worker_id: randomUUID(),
      tenant_id: this.tenantId,
      employee_code: dto.employee_code,
      full_name: dto.full_name,
      trade_type: dto.trade_type,
      employment_type: dto.employment_type,
      contact_phone: dto.contact_phone ?? null,
      user_id: dto.user_id ?? null,
    });
    logger.info({ worker_id: worker.worker_id }, 'worker created');
    return worker;
  }

  async listWorkers(): Promise<WorkerRow[]> {
    return this.repo.findAllWorkers();
  }

  /** Resolve the worker linked to the authenticated user (for self check-in). */
  async getMyWorker(userId: string): Promise<WorkerRow> {
    const worker = await this.repo.findWorkerByUserId(userId);
    if (!worker) {
      throw new NotFoundException('No worker profile linked to this user');
    }
    return worker;
  }

  async getWorker(id: string): Promise<WorkerRow> {
    const worker = await this.repo.findWorkerById(id);
    if (!worker) throw new NotFoundException(`Worker ${id} not found`);
    return worker;
  }

  async allocateToProject(projectId: string, dto: AllocateWorkerDto): Promise<AllocationRow> {
    await this.getWorker(dto.worker_id);
    return this.repo.allocateWorker({
      allocation_id: randomUUID(),
      project_id: projectId,
      worker_id: dto.worker_id,
      tenant_id: this.tenantId,
      role_on_project: dto.role_on_project ?? null,
      start_date: dto.start_date,
      end_date: dto.end_date ?? null,
      daily_rate: dto.daily_rate ?? null,
      currency_code: dto.currency_code ?? null,
    });
  }

  async getProjectWorkforce(projectId: string): Promise<AllocationRow[]> {
    return this.repo.getProjectWorkforce(projectId);
  }

  /** The project crew as a contact list, with today’s on-site state (mockup 04_directory). */
  async getProjectDirectory(projectId: string): Promise<DirectoryRow[]> {
    return this.repo.getProjectDirectory(projectId);
  }

  async recordAttendance(workerId: string, dto: RecordAttendanceDto): Promise<AttendanceRow> {
    await this.getWorker(workerId);

    const hoursWorked =
      dto.hours_worked ??
      (dto.check_in_at && dto.check_out_at
        ? new Decimal(
            (new Date(dto.check_out_at).getTime() - new Date(dto.check_in_at).getTime()) /
              3_600_000,
          )
            .toDecimalPlaces(2)
            .toNumber()
        : null);

    // Generated up front: the event rides the INSERT, so the payload needs the row's id before the
    // row exists. It is the same value that goes into log_id below.
    const logId = randomUUID();

    const eventType =
      dto.check_in_at && !dto.check_out_at
        ? 'workforce.checkin.created.v1'
        : 'workforce.checkout.created.v1';

    // The check-in payload is §32.4 row 9, NOT the master:5338 shorthand. checkin_id, checkin_at and
    // method are required with no default in workforce.checkin.created.v1.avsc, so the shorthand
    // ({ worker_id, project_id, checked_in_at }) could not Avro-encode at all: every check-in event
    // failed at the outbox poller instead of reaching Kafka. Nothing surfaced it, and the cost was
    // downstream — analytics-worker subscribes to this event to build site_activity_daily's
    // manpower_total, so the PM dashboard's manpower has been reading zero.
    const eventPayload =
      eventType === 'workforce.checkin.created.v1'
        ? {
            checkin_id: logId,
            worker_id: workerId,
            project_id: dto.project_id,
            checkin_at: dto.check_in_at,
            method: dto.method ?? 'MANUAL',
            location:
              dto.latitude != null && dto.longitude != null
                ? { lat: dto.latitude, lng: dto.longitude }
                : null,
          }
        : { worker_id: workerId, project_id: dto.project_id, hours_worked: hoursWorked };

    // The event rides the attendance INSERT, so a rolled-back check-in emits nothing.
    return this.repo.recordAttendance(
      {
        log_id: logId,
        recorded_at: new Date().toISOString(),
        worker_id: workerId,
        project_id: dto.project_id,
        tenant_id: this.tenantId,
        check_in_at: dto.check_in_at ?? null,
        check_out_at: dto.check_out_at ?? null,
        hours_worked: hoursWorked,
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
      },
      this.outboxEvent(eventType, eventPayload),
    );
  }

  async getAttendanceHistory(workerId: string, from: string, to: string): Promise<AttendanceRow[]> {
    await this.getWorker(workerId);
    return this.repo.getAttendanceHistory(workerId, from, to);
  }

  async submitTimesheet(dto: SubmitTimesheetDto): Promise<TimesheetRow> {
    await this.getWorker(dto.worker_id);
    return this.repo.submitTimesheet({
      timesheet_id: randomUUID(),
      period_date: dto.period_date,
      worker_id: dto.worker_id,
      project_id: dto.project_id,
      tenant_id: this.tenantId,
      regular_hours: dto.regular_hours ?? 0,
      overtime_hours: dto.overtime_hours ?? 0,
    });
  }

  async approveTimesheet(timesheetId: string): Promise<TimesheetRow> {
    // Builder over the UPDATEd row: the approved hours are only known from the row, and the
    // repository skips the builder when the UPDATE matched nothing (§35.13 ESC-13).
    const ts = await this.repo.approveTimesheet(timesheetId, (row) =>
      this.outboxEvent('workforce.timesheet.approved.v1', {
        worker_id: row.worker_id,
        project_id: row.project_id,
        period_date: row.period_date,
        total_hours: new Decimal(row.regular_hours)
          .add(new Decimal(row.overtime_hours))
          .toDecimalPlaces(2)
          .toNumber(),
      }),
    );
    if (!ts) throw new NotFoundException(`Timesheet ${timesheetId} not found`);

    return ts;
  }

  async getManpowerSummary(projectId: string) {
    return this.repo.getManpowerSummary(projectId);
  }

  /**
   * Builds the outbox envelope handed to the repository write that anchors it (§35.13 ESC-13).
   * Replaces the previous `emitEvent`, which published directly to Kafka and swallowed the
   * failure — losing the event whenever the broker was unreachable.
   */
  private outboxEvent(eventType: string, payload: Record<string, unknown>) {
    return buildOutboxEvent({
      eventType,
      tenantId: this.tenantId,
      actorId: this.userId,
      correlationId: randomUUID(),
      payload,
    });
  }
}
