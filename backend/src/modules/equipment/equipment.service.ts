// Equipment Service — Phase 21
// Business logic: equipment CRUD, assignment lifecycle, maintenance logging, utilization recording.
// Status transitions: AVAILABLE → IN_USE → AVAILABLE | AVAILABLE → MAINTENANCE → AVAILABLE
// Emits typed Kafka events via @cos/shared KafkaProducer (QM-8).

import {
  Injectable,
  Scope,
  Inject,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { randomUUID } from 'crypto';
import { EventOutboxService } from '../../shared/events/event-outbox.service';
import { createLogger } from '@cos/logger';
import { EquipmentRepository } from './equipment.repository';
import type { EquipmentRow, AssignmentRow, MaintenanceRow } from './equipment.repository';
import type { CreateEquipmentDto } from './dto/create-equipment.dto';
import type { AssignEquipmentDto, ReturnEquipmentDto } from './dto/assign-equipment.dto';
import type { LogMaintenanceDto } from './dto/log-maintenance.dto';
import type { RecordUtilizationDto } from './dto/record-utilization.dto';

const logger = createLogger('equipment-service');

/**
 * PostgreSQL unique_violation (SQLSTATE 23505).
 *
 * Checked in two places because Prisma does not surface a raw query's SQLSTATE at the top level: a
 * failing $queryRaw arrives as PrismaClientKnownRequestError with `code: 'P2010'` and the real
 * driver code tucked into `meta.code`. master-data.service checks only the top level because it is
 * not on the Prisma raw path; matching both keeps this correct either way.
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
  // Three shapes, because the SQLSTATE sits in a different place depending on how the query ran.
  // Prisma 7 on a driver adapter reports a failed $queryRaw as P2010 and buries the driver's code
  // at meta.driverAdapterError.cause.originalCode — VERIFIED against the live error, not guessed:
  //   {"code":"P2010","meta":{"driverAdapterError":{"cause":{"originalCode":"23505",
  //    "kind":"UniqueConstraintViolation", ...}}}}
  const cause = e.meta?.driverAdapterError?.cause;
  return (
    e.code === '23505' ||
    e.meta?.code === '23505' ||
    cause?.originalCode === '23505' ||
    cause?.kind === 'UniqueConstraintViolation'
  );
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  AVAILABLE: ['IN_USE', 'MAINTENANCE', 'RETIRED'],
  IN_USE: ['AVAILABLE', 'MAINTENANCE', 'RETIRED'],
  MAINTENANCE: ['AVAILABLE', 'RETIRED'],
  RETIRED: [],
};

@Injectable({ scope: Scope.REQUEST })
export class EquipmentService {
  constructor(
    @Inject(REQUEST) private readonly req: Request,
    private readonly repo: EquipmentRepository,
    private readonly outbox: EventOutboxService,
  ) {}

  private get tenantId(): string {
    return (this.req as Request & { tenantId: string }).tenantId;
  }

  private get userId(): string {
    // req.userId — the PLATFORM user UUID, published by TenantMiddleware from jwtPayload.user_id.
    //
    // NOT req.user?.sub. Two things were wrong with that: `sub` is the KEYCLOAK id
    // (platform.users.keycloak_user_id, per jwt.payload.ts), so it identifies the wrong row even
    // when present; and under the Fastify adapter Passport's req.user does not reliably reach a
    // Scope.REQUEST provider at all — JwtAuthGuard says exactly that in its own header, which is
    // why it publishes the context to CLS instead. The getter therefore fell through to the
    // literal 'system', and assigned_by is a NOT NULL UUID: every assignment and every maintenance
    // log died with 22P02 invalid input syntax for type uuid.
    const userId = (this.req as Request & { userId?: string }).userId;
    if (!userId) throw new UnauthorizedException('No authenticated user on request');
    return userId;
  }

  async createEquipment(dto: CreateEquipmentDto): Promise<EquipmentRow> {
    // The (tenant_id, equipment_code) unique constraint is a business rule, not an internal fault:
    // reusing a code is something an operator does, and a 500 tells them the system broke rather
    // than that the code is taken. Mirrors master-data.service's isUniqueViolation handling.
    try {
      return await this.createEquipmentRow(dto);
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(`Equipment code ${dto.equipment_code} already exists`);
      }
      throw err;
    }
  }

  private async createEquipmentRow(dto: CreateEquipmentDto): Promise<EquipmentRow> {
    const equipment = await this.repo.createEquipment({
      equipment_id: randomUUID(),
      tenant_id: this.tenantId,
      equipment_code: dto.equipment_code,
      equipment_name: dto.equipment_name,
      equipment_type: dto.equipment_type,
      purchase_date: dto.purchase_date ?? null,
      purchase_cost: dto.purchase_cost ?? null,
      currency_code: dto.currency_code ?? null,
    });
    logger.info({ equipment_id: equipment.equipment_id }, 'equipment created');
    return equipment;
  }

  async listEquipment(filters: { status?: string; type?: string } = {}): Promise<EquipmentRow[]> {
    return this.repo.findAll(filters);
  }

  async getEquipment(id: string): Promise<EquipmentRow> {
    const eq = await this.repo.findById(id);
    if (!eq) throw new NotFoundException(`Equipment ${id} not found`);
    return eq;
  }

  async updateStatus(id: string, status: string): Promise<EquipmentRow> {
    const eq = await this.getEquipment(id);
    const allowed = VALID_TRANSITIONS[eq.status] ?? [];
    if (!allowed.includes(status)) {
      throw new UnprocessableEntityException(`Cannot transition from ${eq.status} → ${status}`);
    }
    return this.repo.updateStatus(id, status);
  }

  async assignToProject(equipmentId: string, dto: AssignEquipmentDto): Promise<AssignmentRow> {
    const eq = await this.getEquipment(equipmentId);
    if (eq.status !== 'AVAILABLE') {
      throw new UnprocessableEntityException(
        `Equipment is ${eq.status} — only AVAILABLE equipment can be assigned`,
      );
    }

    const assignment = await this.repo.createAssignment({
      assignment_id: randomUUID(),
      equipment_id: equipmentId,
      project_id: dto.project_id,
      tenant_id: this.tenantId,
      assigned_by: this.userId,
      notes: dto.notes ?? null,
    });

    await this.repo.updateStatus(equipmentId, 'IN_USE');

    await this.emitEvent('equipment.unit.assigned.v1', {
      equipment_id: equipmentId,
      project_id: dto.project_id,
      assigned_by: this.userId,
    });

    return assignment;
  }

  async returnFromProject(
    equipmentId: string,
    assignmentId: string,
    _dto: ReturnEquipmentDto,
  ): Promise<AssignmentRow> {
    const assignment = await this.repo.returnAssignment(assignmentId);
    await this.repo.updateStatus(equipmentId, 'AVAILABLE');

    await this.emitEvent('equipment.unit.returned.v1', {
      equipment_id: equipmentId,
      project_id: assignment.project_id,
    });

    return assignment;
  }

  async logMaintenance(equipmentId: string, dto: LogMaintenanceDto): Promise<MaintenanceRow> {
    await this.getEquipment(equipmentId);

    const maintenance = await this.repo.createMaintenance({
      maintenance_id: randomUUID(),
      equipment_id: equipmentId,
      tenant_id: this.tenantId,
      maintenance_type: dto.maintenance_type,
      scheduled_at: dto.scheduled_at,
      cost: dto.cost ?? null,
      currency_code: dto.currency_code ?? null,
      performed_by: dto.performed_by ?? null,
      notes: dto.notes ?? null,
    });

    await this.emitEvent('equipment.unit.maintenance_scheduled.v1', {
      equipment_id: equipmentId,
      scheduled_at: dto.scheduled_at,
    });

    return maintenance;
  }

  async recordUtilization(equipmentId: string, dto: RecordUtilizationDto): Promise<void> {
    await this.getEquipment(equipmentId);
    await this.repo.recordUtilization({
      equipment_id: equipmentId,
      tenant_id: this.tenantId,
      project_id: dto.project_id ?? null,
      recorded_at: dto.recorded_at,
      hours_operated: dto.hours_operated ?? null,
      fuel_consumed: dto.fuel_consumed ?? null,
      operator_id: dto.operator_id ?? null,
    });
  }

  async getEquipmentByProject(projectId: string): Promise<EquipmentRow[]> {
    return this.repo.findEquipmentByProject(projectId);
  }

  /**
   * Queue a domain event. The old comment here said "will retry via outbox" — nothing did, because
   * no outbox was wired. This writes to the one that now exists (EventOutboxService).
   */
  private async emitEvent(eventType: string, payload: Record<string, unknown>): Promise<void> {
    await this.outbox.publish({
      event_type: eventType,
      event_version: '1.0',
      tenant_id: this.tenantId,
      actor_id: this.userId,
      correlation_id: randomUUID(),
      occurred_at: new Date().toISOString(),
      payload,
    });
  }
}
