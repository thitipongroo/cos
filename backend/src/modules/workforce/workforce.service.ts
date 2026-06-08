// Workforce Service — Phase 22
// Business logic: worker management, project allocation, attendance, timesheets.
// Emits typed Kafka events via @cos/shared KafkaProducer.

import { Injectable, Scope, Inject, NotFoundException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { randomUUID } from 'crypto';
import { Decimal } from '@cos/financial';
import { KafkaProducer } from '@cos/shared';
import { createLogger } from '@cos/logger';
import { WorkforceRepository } from './workforce.repository';
import type { WorkerRow, AllocationRow, AttendanceRow, TimesheetRow } from './workforce.repository';
import type { CreateWorkerDto } from './dto/create-worker.dto';
import type { AllocateWorkerDto } from './dto/allocate-worker.dto';
import type { RecordAttendanceDto } from './dto/attendance.dto';
import type { SubmitTimesheetDto } from './dto/timesheet.dto';

const logger = createLogger('workforce-service');

@Injectable({ scope: Scope.REQUEST })
export class WorkforceService {
  private readonly kafka: KafkaProducer;

  constructor(
    @Inject(REQUEST) private readonly req: Request,
    private readonly repo: WorkforceRepository,
  ) {
    this.kafka = new KafkaProducer();
  }

  private get tenantId(): string {
    return (this.req as Request & { tenantId: string }).tenantId;
  }

  private get userId(): string {
    return (this.req as Request & { user?: { sub: string } }).user?.sub ?? 'system';
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
    });
    logger.info({ worker_id: worker.worker_id }, 'worker created');
    return worker;
  }

  async listWorkers(): Promise<WorkerRow[]> {
    return this.repo.findAllWorkers();
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

    const log = await this.repo.recordAttendance({
      log_id: randomUUID(),
      recorded_at: new Date().toISOString(),
      worker_id: workerId,
      project_id: dto.project_id,
      tenant_id: this.tenantId,
      check_in_at: dto.check_in_at ?? null,
      check_out_at: dto.check_out_at ?? null,
      hours_worked: hoursWorked,
    });

    const eventType =
      dto.check_in_at && !dto.check_out_at
        ? 'workforce.checkin.created.v1'
        : 'workforce.checkout.created.v1';

    const eventPayload =
      eventType === 'workforce.checkin.created.v1'
        ? { worker_id: workerId, project_id: dto.project_id, checked_in_at: dto.check_in_at }
        : { worker_id: workerId, project_id: dto.project_id, hours_worked: hoursWorked };

    await this.emitEvent(eventType, eventPayload);
    return log;
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
    const ts = await this.repo.approveTimesheet(timesheetId);
    if (!ts) throw new NotFoundException(`Timesheet ${timesheetId} not found`);

    const totalHours = new Decimal(ts.regular_hours)
      .add(new Decimal(ts.overtime_hours))
      .toDecimalPlaces(2);

    await this.emitEvent('workforce.timesheet.approved.v1', {
      worker_id: ts.worker_id,
      project_id: ts.project_id,
      period_date: ts.period_date,
      total_hours: totalHours.toNumber(),
    });

    return ts;
  }

  async getManpowerSummary(projectId: string) {
    return this.repo.getManpowerSummary(projectId);
  }

  private async emitEvent(eventType: string, payload: Record<string, unknown>): Promise<void> {
    try {
      await this.kafka.connect();
      await this.kafka.publish({
        event_type: eventType,
        event_version: '1.0',
        tenant_id: this.tenantId,
        actor_id: this.userId,
        occurred_at: new Date().toISOString(),
        payload,
      });
    } catch (err) {
      logger.error({ err, eventType }, 'Failed to emit Kafka event');
    }
  }
}
